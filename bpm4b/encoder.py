"""
Smart Audio Encoding Core with libfdk_aac support and advanced features.
"""

import os
import subprocess
import json
import logging
import hashlib
from pathlib import Path
from typing import List, Dict, Optional, Any
from dataclasses import dataclass
import sqlite3

logger = logging.getLogger(__name__)


@dataclass
class Chapter:
    """Chapter marker with timing."""
    title: str
    start_time: float
    end_time: Optional[float] = None

    def to_dict(self) -> Dict:
        return {
            'title': self.title,
            'start_time': self.start_time,
            'end_time': self.end_time
        }


@dataclass
class Metadata:
    """Audio metadata container."""
    title: Optional[str] = None
    artist: Optional[str] = None
    album: Optional[str] = None
    genre: Optional[str] = None
    description: Optional[str] = None
    narrator: Optional[str] = None
    publisher: Optional[str] = None
    copyright: Optional[str] = None


class AudioEncoder:
    """Advanced audio encoder with libfdk_aac support."""

    def __init__(self, config: Optional[Any] = None):
        self.config = config
        self.cache_db = Path.home() / '.bpm4b' / 'cache.db'
        self._init_cache()

    def _init_cache(self):
        """Initialize SQLite cache for incremental processing."""
        self.cache_db.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(self.cache_db))
        conn.execute('''
            CREATE TABLE IF NOT EXISTS file_cache (
                file_hash TEXT PRIMARY KEY,
                output_path TEXT,
                timestamp REAL
            )
        ''')
        conn.commit()
        conn.close()

    def _compute_file_hash(self, path: str) -> str:
        """Compute SHA-256 hash of file."""
        sha256 = hashlib.sha256()
        with open(path, 'rb') as f:
            for chunk in iter(lambda: f.read(8192), b''):
                sha256.update(chunk)
        return sha256.hexdigest()

    def _should_reprocess(self, input_path: str, output_path: str) -> bool:
        """Check if file needs reprocessing using hash cache."""
        if not self.config or not getattr(self.config.processing, 'incremental_processing', False):
            return True
        
        file_hash = self._compute_file_hash(input_path)
        conn = sqlite3.connect(str(self.cache_db))
        cursor = conn.execute(
            'SELECT output_path FROM file_cache WHERE file_hash = ?',
            (file_hash,)
        )
        result = cursor.fetchone()
        conn.close()
        
        if result and result[0] == output_path and os.path.exists(output_path):
            return False
        return True

    def _update_cache(self, input_path: str, output_path: str):
        """Update file hash cache."""
        if not self.config or not getattr(self.config.processing, 'incremental_processing', False):
            return
        
        file_hash = self._compute_file_hash(input_path)
        conn = sqlite3.connect(str(self.cache_db))
        conn.execute(
            'INSERT OR REPLACE INTO file_cache (file_hash, output_path, timestamp) VALUES (?, ?, ?)',
            (file_hash, output_path, os.path.getmtime(input_path))
        )
        conn.commit()
        conn.close()

    def check_encoder_available(self) -> str:
        """Check which AAC encoder is available."""
        try:
            result = subprocess.run(
                ['ffmpeg', '-encoders'],
                capture_output=True, text=True
            )
            if 'libfdk_aac' in result.stdout:
                return 'fdk_aac'
            elif 'aac' in result.stdout:
                return 'native_aac'
            return 'none'
        except Exception:
            return 'none'

    def detect_audio_codec(self, input_path: str) -> Optional[str]:
        """Detect audio codec using ffprobe."""
        try:
            result = subprocess.run(
                ['ffprobe', '-v', 'quiet', '-print_format', 'json',
                 '-show_streams', input_path],
                capture_output=True, text=True
            )
            data = json.loads(result.stdout)
            for stream in data.get('streams', []):
                if stream.get('codec_type') == 'audio':
                    return stream.get('codec_name')
        except Exception as e:
            logger.warning(f"Could not detect codec: {e}")
        return None

    def analyze_loudness(self, input_path: str) -> Dict:
        """Run EBU R128 loudness analysis (Pass 1)."""
        result = subprocess.run(
            ['ffmpeg', '-hide_banner', '-i', input_path,
             '-af', 'loudnorm=print_format=json:measure_perclip=1',
             '-f', 'null', '-'],
            capture_output=True, text=True
        )
        
        for line in result.stderr.split('\n'):
            if line.startswith('{'):
                return json.loads(line)
        return {'input_i': -16.0, 'input_tp': -1.0, 'input_lra': 10.0}

    def convert_to_m4b(self, input_paths: List[str] or str, output_path: str,
                      chapters: Optional[List[Chapter]] = None,
                      metadata: Optional[Metadata] = None,
                      cover_path: Optional[str] = None,
                      normalize: bool = True) -> bool:
        """Convert one or more audio files to M4B with all advanced features."""
        if isinstance(input_paths, str):
            input_paths = [input_paths]

        # Use the first file for hash check if only one file
        if len(input_paths) == 1 and not self._should_reprocess(input_paths[0], output_path):
            logger.info("File unchanged, using cached output")
            return True

        encoder = self.check_encoder_available()
        if encoder == 'none':
            raise RuntimeError("No AAC encoder available")

        # Two-pass loudness normalization
        loudnorm_params = ""
        if normalize:
            try:
                # We use the first file for analysis if it's a single file, 
                # or we might need a more complex strategy for multiple files.
                # For now, let's analyze the first file or a representative one.
                # Ideally we'd analyze a merged stream, but that's expensive.
                analysis = self.analyze_loudness(input_paths[0])
                target_i = getattr(self.config.audio, 'loudness_target', -16.0) if self.config else -16.0
                target_tp = getattr(self.config.audio, 'true_peak', -1.0) if self.config else -1.0
                loudnorm_params = (
                    f"loudnorm=I={target_i}:TP={target_tp}:LRA=11:measured_I={analysis['input_i']}:"
                    f"measured_TP={analysis['input_tp']}:measured_LRA={analysis['input_lra']}:"
                    f"measured_thresh={analysis['input_thresh']}:offset={analysis['target_offset']}:linear=true"
                )
            except Exception as e:
                logger.warning(f"Loudness analysis failed: {e}. Falling back to single-pass.")
                loudnorm_params = f"loudnorm=I=-16:TP=-1.0:LRA=11"

        # Build FFmpeg command
        cmd = ['ffmpeg', '-hide_banner', '-loglevel', 'info']
        input_count = 0

        # Handle multiple inputs
        temp_concat = None
        if len(input_paths) > 1:
            temp_concat = Path(output_path).with_suffix('.concat.txt')
            with open(temp_concat, 'w', encoding='utf-8') as f:
                for p in input_paths:
                    escaped_p = str(Path(p).absolute()).replace("'", "'\\''")
                    f.write(f"file '{escaped_p}'\n")
            cmd.extend(['-f', 'concat', '-safe', '0', '-i', str(temp_concat)])
        else:
            cmd.extend(['-i', input_paths[0]])
        
        audio_input_idx = input_count
        input_count += 1

        # Chapters
        chapter_file = None
        chapter_input_idx = None
        if chapters:
            chapter_file = str(Path(output_path).with_suffix('.chapters.txt'))
            self._write_ffmetadata(chapters, chapter_file)
            cmd.extend(['-i', chapter_file])
            chapter_input_idx = input_count
            input_count += 1
            cmd.extend(['-map_metadata', str(chapter_input_idx)])
        
        # Cover art
        cover_input_idx = None
        if cover_path:
            cmd.extend(['-i', cover_path])
            cover_input_idx = input_count
            input_count += 1

        # Audio settings
        if encoder == 'fdk_aac':
            # VBR mode 1-5 for libfdk_aac
            vbr_val = getattr(self.config.audio, 'vbr', 0) if self.config else 0
            if vbr_val > 0:
                vbr_val = max(1, min(5, vbr_val))  # Clamp to 1-5
                cmd.extend(['-c:a', 'libfdk_aac', '-vbr', str(vbr_val)])
            else:
                bitrate = getattr(self.config.audio, 'bitrate', '64k') if self.config else '64k'
                cmd.extend(['-c:a', 'libfdk_aac', '-b:a', bitrate])
        else:
            bitrate = getattr(self.config.audio, 'bitrate', '64k') if self.config else '64k'
            cmd.extend(['-c:a', 'aac', '-b:a', bitrate])

        # Filters
        filters = []
        if loudnorm_params:
            filters.append(loudnorm_params)
        
        if filters:
            cmd.extend(['-af', ','.join(filters)])

        # Metadata
        if metadata:
            if metadata.title: cmd.extend(['-metadata', f'title={metadata.title}'])
            if metadata.artist: cmd.extend(['-metadata', f'artist={metadata.artist}'])
            if metadata.album: cmd.extend(['-metadata', f'album={metadata.album}'])
            if metadata.genre: cmd.extend(['-metadata', f'genre={metadata.genre}'])

        # Mapping
        cmd.extend(['-map', f'{audio_input_idx}:a'])
        if cover_input_idx is not None:
            cmd.extend(['-map', f'{cover_input_idx}:v', '-disposition:v', 'attached_pic'])

        cmd.extend(['-write_itunes_gapless', '1', '-y', output_path])

        try:
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode == 0:
                if len(input_paths) == 1:
                    self._update_cache(input_paths[0], output_path)
                return True
            else:
                logger.error(f"FFmpeg error: {result.stderr}")
                return False
        finally:
            if temp_concat and temp_concat.exists():
                temp_concat.unlink()
            if chapter_file and os.path.exists(chapter_file):
                os.remove(chapter_file)

    def combine_m4bs(self, input_paths: List[str], output_path: str, 
                     metadata: Optional[Metadata] = None) -> bool:
        """Combine multiple M4B files into one, preserving metadata and chapters."""
        # This is a bit complex because we need to merge chapters with offsets
        all_chapters = []
        current_offset = 0.0
        
        for p in input_paths:
            duration = self._get_duration(p)
            # Try to extract chapters from file
            file_chapters = self._extract_chapters(p)
            if file_chapters:
                for ch in file_chapters:
                    ch.start_time += current_offset
                    if ch.end_time: ch.end_time += current_offset
                    all_chapters.append(ch)
            else:
                # If no chapters, create one for the file
                all_chapters.append(Chapter(title=Path(p).stem, start_time=current_offset))
            
            current_offset += duration

        # Now convert using the combined chapters
        return self.convert_to_m4b(input_paths, output_path, chapters=all_chapters, metadata=metadata)

    def _get_duration(self, path: str) -> float:
        """Get audio duration using ffprobe."""
        cmd = ['ffprobe', '-v', 'quiet', '-show_entries', 'format=duration', '-of', 'json', path]
        result = subprocess.run(cmd, capture_output=True, text=True)
        try:
            data = json.loads(result.stdout)
            return float(data['format']['duration'])
        except:
            return 0.0

    def _extract_chapters(self, path: str) -> List[Chapter]:
        """Extract chapters from an existing file using ffprobe."""
        cmd = ['ffprobe', '-v', 'quiet', '-show_chapters', '-print_format', 'json', path]
        result = subprocess.run(cmd, capture_output=True, text=True)
        chapters = []
        try:
            data = json.loads(result.stdout)
            for ch in data.get('chapters', []):
                chapters.append(Chapter(
                    title=ch.get('tags', {}).get('title', 'Unknown'),
                    start_time=float(ch['start_time']),
                    end_time=float(ch['end_time'])
                ))
        except:
            pass
        return chapters

    def _write_ffmetadata(self, chapters: List[Chapter], path: str):
        """Write FFmetadata file for chapters."""
        with open(path, 'w', encoding='utf-8') as f:
            f.write(';FFMETADATA1\n')
            for ch in chapters:
                f.write(f'[CHAPTER]\nTIMEBASE=1/1000\n')
                f.write(f'START={int(ch.start_time * 1000)}\n')
                if ch.end_time:
                    f.write(f'END={int(ch.end_time * 1000)}\n')
                else:
                    # If no end time, we should ideally set it to the start of the next chapter
                    # but FFmpeg handles it if it's the last one.
                    pass
                f.write(f'title={ch.title}\n\n')

    def _build_fdk_command(self, *args, **kwargs):
        # Deprecated by unified convert_to_m4b
        pass

    def _build_native_command(self, *args, **kwargs):
        # Deprecated by unified convert_to_m4b
        pass