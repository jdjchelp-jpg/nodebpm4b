"""
BPM4B - Professional Multimedia Converter
Consolidated 20 Features Implementation

A complete audiobook processing toolkit with:
- Smart Audio Encoding (libfdk_aac, VBR, gapless playback)
- EBU R128 Loudness Normalization
- Noise and Silence Cleanup
- Recursive Folder Ingestion
- Auto Folder-to-Metadata Mapping
- Multi-Source Metadata Aggregation
- Cover Art Management
- Synopsis and Transcript Embedding
- Dual-Standard Chapter Writing
- Intelligent Auto-Chaptering
- Parallel Processing Pipeline
- Quality Assurance and Integrity Checks
- Web Dashboard and Notifications
- And more...
"""

__version__ = "10.0.0"
__author__ = "JDJCHELP"
__email__ = "JDJCHELP@proton.me"

from .config import Config, AudioConfig, NoiseConfig, ChapterConfig, ProcessingConfig, OutputConfig
from .encoder import AudioEncoder, Chapter, Metadata
from .noise import NoiseReducer, AudioCleaner
from .chapters import ChapterDetector, ChapterGenerator
from .metadata import MetadataProvider, AudibleProvider, GoogleBooksProvider, MusicBrainzProvider
from .metadata import MetadataAggregator, FolderMetadataParser, CoverArtManager
from .pipeline import AudioPipeline, IncrementalCache, WorkerPool, JobManifest, JobResult
from .quality import QualityAssurance, MPEG4Validator, ChecksumGenerator, BitrateVerifier
from .quality import WaveformGenerator, ChapterOverlapDetector
from .main import BPM4B

__all__ = [
    'Config', 'AudioConfig', 'NoiseConfig', 'ChapterConfig', 'ProcessingConfig', 'OutputConfig',
    'AudioEncoder', 'Chapter', 'Metadata',
    'NoiseReducer', 'AudioCleaner',
    'ChapterDetector', 'ChapterGenerator',
    'MetadataProvider', 'AudibleProvider', 'GoogleBooksProvider', 'MusicBrainzProvider',
    'MetadataAggregator', 'FolderMetadataParser', 'CoverArtManager',
    'AudioPipeline', 'IncrementalCache', 'WorkerPool', 'JobManifest', 'JobResult',
    'QualityAssurance', 'MPEG4Validator', 'ChecksumGenerator', 'BitrateVerifier',
    'WaveformGenerator', 'ChapterOverlapDetector',
    'BPM4B'
]