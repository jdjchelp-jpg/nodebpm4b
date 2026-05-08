"""
Main entry point for BPM4B.
Orchestrates all 20 consolidated features.
"""

import os
import sys
import argparse
import logging
from pathlib import Path
from typing import Optional

from .config import Config
from .encoder import AudioEncoder, Chapter, Metadata
from .noise import NoiseReducer, AudioCleaner
from .chapters import ChapterDetector, ChapterGenerator
from .metadata import MetadataAggregator, FolderMetadataParser, CoverArtManager
from .pipeline import AudioPipeline, IncrementalCache
from .quality import QualityAssurance, MPEG4Validator

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class BPM4B:
    """Main BPM4B application with all 20 features."""
    
    def __init__(self, config: Optional[Config] = None):
        self.config = config or Config.load_default()
        self.encoder = AudioEncoder(self.config)
        self.noise_reducer = NoiseReducer(self.config)
        self.chapter_generator = ChapterGenerator(self.config)
        self.metadata_aggregator = MetadataAggregator()
        self.folder_parser = FolderMetadataParser()
        self.cover_manager = CoverArtManager(self.config)
        self.pipeline = AudioPipeline(self.config)
        self.quality_assurance = QualityAssurance(self.config)
    
    def process_folder(self, input_dir: str, output_file: str,
                       range_spec: Optional[str] = None,
                       chapter_titles: Optional[List[str]] = None) -> bool:
        """Process a folder of audio files into M4B."""
        input_path = Path(input_dir)
        audio_files = sorted([
            str(p) for p in input_path.rglob('*') 
            if p.suffix.lower() in ['.mp3', '.m4a', '.wav', '.flac', '.aac']
            and not any(part.startswith('.') for part in p.parts)
        ])
        
        if range_spec:
            try:
                start, end = map(int, range_spec.split('-'))
                audio_files = audio_files[start-1:end]
            except Exception:
                pass
        
        if not audio_files:
            raise ValueError("No audio files found in input directory")
        
        metadata_dict = self.folder_parser.parse_folder(input_dir)
        
        # Create chapters where each file is a chapter
        chapters = []
        current_time = 0.0
        for i, p in enumerate(audio_files):
            duration = self.encoder._get_duration(p)
            
            # Use custom title if provided, otherwise parse from filename
            if chapter_titles and i < len(chapter_titles):
                title = chapter_titles[i]
            else:
                title = self.folder_parser.parse_filename(p)['title']
                
            chapters.append(Chapter(title=title, start_time=current_time, end_time=current_time + duration))
            current_time += duration
        
        return self.encoder.convert_to_m4b(
            audio_files,
            output_file,
            chapters,
            Metadata(**metadata_dict)
        )

    def combine_m4bs(self, input_files: List[str], output_file: str,
                    metadata: Optional[dict] = None) -> bool:
        """Combine multiple M4B files into one."""
        meta = Metadata(**metadata) if metadata else None
        return self.encoder.combine_m4bs(input_files, output_file, meta)
    
    def clean_audio(self, input_path: str, output_path: str) -> bool:
        """Apply noise reduction and cleanup."""
        cleaner = AudioCleaner(self.noise_reducer)
        cleaner.config = self.config
        return cleaner.clean_audio(input_path, output_path)
    
    def detect_chapters(self, input_path: str) -> list:
        """Auto-detect chapters from audio."""
        return self.chapter_generator.generate_from_audio(input_path)
    
    def enrich_metadata(self, title: str, author: Optional[str] = None) -> dict:
        """Fetch metadata from multiple sources."""
        result = self.metadata_aggregator.aggregate(title, author)
        return {
            'title': result.title,
            'author': result.author,
            'narrator': result.narrator,
            'description': result.description,
            'cover_url': result.cover_url
        }
    
    def verify_quality(self, output_path: str) -> dict:
        """Run quality assurance checks."""
        return self.quality_assurance.run_all_checks(output_path, output_path)
    
    def generate_checksum(self, input_path: str) -> str:
        """Generate SHA-256 checksum."""
        from .quality import ChecksumGenerator
        return ChecksumGenerator.generate(input_path)


def main():
    parser = argparse.ArgumentParser(description='BPM4B - Professional Audiobook Converter')
    subparsers = parser.add_subparsers(dest='command', help='Commands')
    
    process_parser = subparsers.add_parser('process', help='Process folder to M4B')
    process_parser.add_argument('input_dir', help='Input directory with audio files')
    process_parser.add_argument('output_file', help='Output M4B file path')
    process_parser.add_argument('--range', help='Process range (e.g., 1-5)')
    
    clean_parser = subparsers.add_parser('clean', help='Clean audio file')
    clean_parser.add_argument('input', help='Input audio file')
    clean_parser.add_argument('output', help='Output audio file')
    
    chapter_parser = subparsers.add_parser('chapters', help='Detect chapters')
    chapter_parser.add_argument('input', help='Input audio file')
    
    meta_parser = subparsers.add_parser('metadata', help='Fetch metadata')
    meta_parser.add_argument('title')
    meta_parser.add_argument('--author')
    
    verify_parser = subparsers.add_parser('verify', help='Verify quality')
    verify_parser.add_argument('output', help='Output M4B file')
    
    checksum_parser = subparsers.add_parser('checksum', help='Generate checksum')
    checksum_parser.add_argument('input', help='Input file')
    
    args = parser.parse_args()
    
    bpm4b = BPM4B()
    
    if args.command == 'process':
        bpm4b.process_folder(args.input_dir, args.output_file, args.range)
    elif args.command == 'clean':
        bpm4b.clean_audio(args.input, args.output)
    elif args.command == 'chapters':
        print(bpm4b.detect_chapters(args.input))
    elif args.command == 'metadata':
        print(bpm4b.enrich_metadata(args.title, args.author))
    elif args.command == 'verify':
        print(bpm4b.verify_quality(args.output))
    elif args.command == 'checksum':
        print(bpm4b.generate_checksum(args.input))
    else:
        parser.print_help()


if __name__ == '__main__':
    main()