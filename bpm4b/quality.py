"""
Quality Assurance and Integrity Checks Module.
MPEG-4 atom validation, checksum generation, bitrate verification.
"""

import os
import subprocess
import struct
import logging
import hashlib
from pathlib import Path
from typing import List, Optional, Tuple, Dict, Any
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class AtomInfo:
    """MPEG-4 atom information."""
    name: str
    size: int
    children: List['AtomInfo'] = None


class MPEG4Validator:
    """Validate MPEG-4 container structure."""

    REQUIRED_ATOMS = ['ftyp', 'moov', 'mdat']

    def __init__(self, file_path: str):
        self.file_path = file_path
        self.atoms = []

    def parse_atoms(self) -> List[AtomInfo]:
        """Parse top-level atoms from MP4 file."""
        atoms = []

        with open(self.file_path, 'rb') as f:
            while True:
                header = f.read(8)
                if len(header) < 8:
                    break

                size = struct.unpack('>I', header[:4])[0]
                name = header[4:8].decode('latin-1')

                if size == 1:
                    large_size = f.read(8)
                    size = struct.unpack('>Q', large_size)[0]
                elif size == 0:
                    size = os.path.getsize(self.file_path) - f.tell() + 8

                atoms.append(AtomInfo(name=name, size=size))

                if name in ['moov', 'trak', 'mdia', 'minf', 'stbl']:
                    if size > 8:
                        f.read(size - 8)
                else:
                    f.seek(size - 8, 1)

                if size <= 8:
                    break

        self.atoms = atoms
        return atoms

    def validate_structure(self) -> Tuple[bool, List[str]]:
        """Validate MP4 structure for streaming compatibility."""
        errors = []

        self.parse_atoms()

        atom_names = [a.name for a in self.atoms]

        for required in self.REQUIRED_ATOMS:
            if required not in atom_names:
                errors.append(f"Missing required atom: {required}")

        if 'moov' in atom_names and 'mdat' in atom_names:
            with open(self.file_path, 'rb') as f:
                f.seek(0)
                header = f.read(8)
                if len(header) >= 8:
                    first_atom = header[4:8].decode('latin-1')
                    if first_atom == 'mdat':
                        errors.append("mdat appears before moov - not streamable")

        total_size = sum(a.size for a in self.atoms)
        file_size = os.path.getsize(self.file_path)

        if total_size != file_size:
            errors.append(f"Atom sizes ({total_size}) don't match file size ({file_size})")

        return len(errors) == 0, errors


class ChecksumGenerator:
    """Generate SHA-256 checksums for files."""

    @staticmethod
    def generate(input_path: str) -> str:
        """Generate SHA-256 checksum."""
        sha256 = hashlib.sha256()
        with open(input_path, 'rb') as f:
            for chunk in iter(lambda: f.read(8192), b''):
                sha256.update(chunk)
        return sha256.hexdigest()

    def write_checksum_file(self, input_path: str, output_path: Optional[str] = None) -> str:
        """Generate and write checksum to sidecar file."""
        checksum = self.generate(input_path)

        if output_path is None:
            output_path = input_path + '.sha256'

        with open(output_path, 'w') as f:
            f.write(f"{checksum}  {os.path.basename(input_path)}\n")

        return output_path


class BitrateVerifier:
    """Verify output bitrate matches target."""

    @staticmethod
    def get_bitrate(input_path: str) -> float:
        """Get measured bitrate using ffprobe."""
        result = subprocess.run(
            ['ffprobe', '-v', 'quiet', '-print_format', 'json',
             '-show_streams', input_path],
            capture_output=True, text=True
        )

        data = json.loads(result.stdout)
        for stream in data.get('streams', []):
            if stream.get('codec_type') == 'audio':
                return float(stream.get('bit_rate', 0))

        return 0.0

    @staticmethod
    def verify(input_path: str, target_bitrate: float, tolerance: float = 0.05) -> Tuple[bool, str]:
        """Verify bitrate is within tolerance."""
        measured = BitrateVerifier.get_bitrate(input_path)
        deviation = abs(measured - target_bitrate) / target_bitrate if target_bitrate else 0

        if deviation > tolerance:
            return False, f"Bitrate deviation {deviation*100:.1f}% exceeds {tolerance*100}% tolerance"

        return True, f"Bitrate {measured/1000:.1f}kbps within tolerance"


class WaveformGenerator:
    """Generate waveform preview images."""

    @staticmethod
    def generate(input_path: str, output_path: Optional[str] = None) -> str:
        """Generate waveform PNG using FFmpeg."""
        if output_path is None:
            output_path = str(Path(input_path).with_suffix('.png'))

        result = subprocess.run(
            ['ffmpeg', '-hide_banner', '-i', input_path,
             '-filter_complex', 'showwavespic=s=1920x120:colors=blue',
             '-frames:v', '1', '-y', output_path],
            capture_output=True
        )

        return output_path if os.path.exists(output_path) else None


class ChapterOverlapDetector:
    """Detect overlapping or too-close chapter markers."""

    @staticmethod
    def check(chapters: List[Dict]) -> List[Dict]:
        """Check for chapter overlap issues."""
        issues = []

        for i in range(1, len(chapters)):
            gap = chapters[i].get('start_time', 0) - chapters[i-1].get('end_time', 0)
            if gap < 10:
                issues.append({
                    'type': 'overlap',
                    'chapter_1': i - 1,
                    'chapter_2': i,
                    'gap_seconds': gap
                })

        return issues


class QualityAssurance:
    """Main QA orchestrator."""

    def __init__(self, config: Optional[Any] = None):
        self.config = config

    def run_all_checks(self, input_path: str, output_path: str) -> Dict:
        """Run all quality checks."""
        results = {
            'valid_structure': True,
            'checksum': None,
            'bitrate_ok': True,
            'waveform': None,
            'issues': []
        }

        validator = MPEG4Validator(output_path)
        valid, errors = validator.validate_structure()
        results['valid_structure'] = valid
        results['issues'].extend(errors)

        checksum_gen = ChecksumGenerator()
        results['checksum'] = checksum_gen.generate(output_path)
        checksum_gen.write_checksum_file(output_path)

        results['waveform'] = WaveformGenerator.generate(output_path)

        return results