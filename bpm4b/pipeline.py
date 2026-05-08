"""
Parallel and Optimized Processing Pipeline.
Concurrent processing with progress tracking.
"""

import os
import subprocess
import json
import logging
import hashlib
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
from typing import List, Optional, Dict, Any
from dataclasses import dataclass
import sqlite3
import mmap

logger = logging.getLogger(__name__)


@dataclass
class JobManifest:
    """Serialized job description for worker processes."""
    input_paths: List[str]
    output_path: str
    chapters: Optional[List[Dict]] = None
    metadata: Optional[Dict] = None
    cover_path: Optional[str] = None
    config: Optional[Dict] = None


@dataclass
class JobResult:
    """Result from a job execution."""
    success: bool
    output_path: Optional[str]
    error: Optional[str] = None
    duration_seconds: float = 0.0
    file_size: int = 0


class IncrementalCache:
    """SQLite-based cache for incremental processing."""

    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path or str(Path.home() / '.bpm4b' / 'cache.db')
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _init_db(self):
        conn = sqlite3.connect(self.db_path)
        conn.execute('''
            CREATE TABLE IF NOT EXISTS file_cache (
                file_hash TEXT PRIMARY KEY,
                output_path TEXT,
                timestamp REAL
            )
        ''')
        conn.commit()
        conn.close()

    def _compute_hash(self, path: str) -> str:
        sha256 = hashlib.sha256()
        with open(path, 'rb') as f:
            for chunk in iter(lambda: f.read(8192), b''):
                sha256.update(chunk)
        return sha256.hexdigest()

    def needs_processing(self, input_path: str, output_path: str) -> bool:
        file_hash = self._compute_hash(input_path)
        conn = sqlite3.connect(self.db_path)
        cursor = conn.execute(
            'SELECT output_path FROM file_cache WHERE file_hash = ?',
            (file_hash,)
        )
        result = cursor.fetchone()
        conn.close()

        if result and os.path.exists(output_path):
            return False
        return True

    def mark_complete(self, input_path: str, output_path: str):
        file_hash = self._compute_hash(input_path)
        conn = sqlite3.connect(self.db_path)
        conn.execute(
            'INSERT OR REPLACE INTO file_cache (file_hash, output_path, timestamp) VALUES (?, ?, ?)',
            (file_hash, output_path, os.path.getmtime(input_path))
        )
        conn.commit()
        conn.close()


class SilenceScanner:
    """Memory-mapped silence detection for large files."""

    SILENCE_PATTERNS = [b'\x00\x00\x00\x00']

    def scan_file(self, input_path: str, chunk_size: int = 1024 * 1024) -> List[Dict]:
        silences = []
        try:
            with open(input_path, 'rb') as f:
                mm = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)
                pos = 0
                while pos < len(mm) - 4:
                    chunk = mm[pos:pos + chunk_size]
                    for pattern in self.SILENCE_PATTERNS:
                        idx = chunk.find(pattern)
                        if idx >= 0:
                            silences.append({'position': pos + idx, 'length': len(pattern)})
                    pos += chunk_size
                mm.close()
        except Exception as e:
            logger.error(f"Memory-mapped scan failed: {e}")

        return silences


class WorkerPool:
    """Manage parallel job execution."""

    def __init__(self, max_workers: Optional[int] = None, cpu_limit: int = 100):
        if max_workers is None:
            cpu_count = os.cpu_count() or 1
            max_workers = max(1, int(cpu_count * cpu_limit / 100) - 1)
        self.max_workers = max_workers
        self.executor = None

    def __enter__(self):
        self.executor = ProcessPoolExecutor(max_workers=self.max_workers)
        return self

    def __exit__(self, *args):
        if self.executor:
            self.executor.shutdown()

    def submit_job(self, manifest: JobManifest) -> Any:
        return self.executor.submit(process_single_job, manifest)


def process_single_job(manifest: JobManifest) -> JobResult:
    """Process a single job (runs in worker process)."""
    import time
    start_time = time.time()

    try:
        from bpm4b.encoder import AudioEncoder, Chapter, Metadata

        encoder = AudioEncoder()

        chapters = None
        if manifest.chapters:
            chapters = [Chapter(**ch) for ch in manifest.chapters]

        metadata = None
        if manifest.metadata:
            metadata = Metadata(**manifest.metadata)

        success = encoder.convert_to_m4b(
            manifest.input_paths,
            manifest.output_path,
            chapters,
            metadata,
            manifest.cover_path
        )

        return JobResult(
            success=success,
            output_path=manifest.output_path if success else None,
            duration_seconds=time.time() - start_time,
            file_size=os.path.getsize(manifest.output_path) if success else 0
        )
    except Exception as e:
        return JobResult(
            success=False,
            output_path=None,
            error=str(e),
            duration_seconds=time.time() - start_time
        )


class AudioPipeline:
    """Main processing pipeline orchestrator."""

    def __init__(self, config: Optional[Any] = None):
        self.config = config
        self.cache = IncrementalCache()
        self.scanner = SilenceScanner()
        self.worker_pool: Optional[WorkerPool] = None

    def detect_zero_copy(self, input_path: str) -> bool:
        """Check if zero-copy passthrough is possible."""
        try:
            result = subprocess.run(
                ['ffprobe', '-v', 'quiet', '-print_format', 'json',
                 '-show_streams', input_path],
                capture_output=True, text=True
            )
            data = json.loads(result.stdout)
            for stream in data.get('streams', []):
                if stream.get('codec_type') == 'audio':
                    codec = stream.get('codec_name', '')
                    if codec in ['aac', 'mp4a']:
                        return True
        except Exception:
            pass
        return False

    def run(self, input_paths: List[str], output_path: str,
            chapters: Optional[List[Dict]] = None,
            metadata: Optional[Dict] = None,
            cover_path: Optional[str] = None) -> JobResult:
        """Execute the full processing pipeline."""
        manifest = JobManifest(
            input_paths=input_paths,
            output_path=output_path,
            chapters=chapters,
            metadata=metadata,
            cover_path=cover_path,
            config=vars(self.config) if self.config else None
        )

        return process_single_job(manifest)