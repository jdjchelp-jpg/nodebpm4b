"""
Configuration management for BPM4B.
Supports YAML config with environment variable interpolation.
"""

import os
import yaml
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any


@dataclass
class AudioConfig:
    """Audio encoding configuration."""
    encoder: str = 'fdk_aac'
    vbr: int = 4
    bitrate: str = '64k'
    sample_rate: int = 44100
    loudness_target: float = -16.0
    true_peak: float = -1.0
    compressor_threshold: float = -18.0
    compressor_ratio: float = 3.0
    compressor_attack: float = 5.0
    compressor_release: float = 50.0


@dataclass
class NoiseConfig:
    """Noise reduction configuration."""
    spectral_reduction: bool = True
    silence_threshold_db: float = -40.0
    silence_min_duration: float = 2.0
    silence_truncate_duration: float = 0.8
    filler_words: List[str] = field(default_factory=lambda: ['uhm', 'uh', 'um', 'er'])


@dataclass
class ChapterConfig:
    """Chapter detection configuration."""
    min_silence_duration: float = 2.0
    silence_noise_floor: float = -40.0
    min_chapter_gap: float = 300.0
    subchapter_interval: float = 1800.0
    naming_template: str = 'Chapter {n}'


@dataclass
class ProcessingConfig:
    """Processing pipeline configuration."""
    max_workers: int = None
    cpu_limit_percent: int = 100
    memory_mapped_scanning: bool = True
    incremental_processing: bool = True
    zero_copy_passthrough: bool = True
    gpu_acceleration: bool = False


@dataclass
class OutputConfig:
    """Output configuration."""
    output_dir: str = './output'
    embed_chapters: bool = True
    embed_cover: bool = True
    embed_transcript: bool = True
    generate_checksum: bool = True
    generate_waveform: bool = True


@dataclass
class Config:
    """Main configuration container."""
    audio: AudioConfig = field(default_factory=AudioConfig)
    noise: NoiseConfig = field(default_factory=NoiseConfig)
    chapter: ChapterConfig = field(default_factory=ChapterConfig)
    processing: ProcessingConfig = field(default_factory=ProcessingConfig)
    output: OutputConfig = field(default_factory=OutputConfig)
    
    @classmethod
    def from_yaml(cls, path: str) -> 'Config':
        """Load configuration from YAML file with env var interpolation."""
        with open(path, 'r') as f:
            content = f.read()
        
        def env_interpolate(match):
            var_name = match.group(1)
            default = match.group(2) if match.group(2) else ''
            return os.environ.get(var_name, default)
        
        import re
        content = re.sub(r'\$\{(\w+)(?::([^}]*))?\}', env_interpolate, content)
        data = yaml.safe_load(content)
        
        return cls.from_dict(data or {})
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Config':
        """Create config from dictionary."""
        return cls(
            audio=AudioConfig(**(data.get('audio', {}))),
            noise=NoiseConfig(**(data.get('noise', {}))),
            chapter=ChapterConfig(**(data.get('chapter', {}))),
            processing=ProcessingConfig(**(data.get('processing', {}))),
            output=OutputConfig(**(data.get('output', {})))
        )
    
    @classmethod
    def load_default(cls) -> 'Config':
        """Load default configuration."""
        config_path = Path.home() / '.bpm4b' / 'config.yaml'
        if config_path.exists():
            return cls.from_yaml(str(config_path))
        return cls()