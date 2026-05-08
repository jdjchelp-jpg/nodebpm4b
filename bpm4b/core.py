"""
Core functions shared between the main app and Vercel API.
Integrates advanced audio processing with 20 consolidated features.
"""

import os
import uuid
import subprocess
import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any

logger = logging.getLogger(__name__)

try:
    from .config import Config
    from .encoder import AudioEncoder, Chapter, Metadata
    from .chapters import ChapterGenerator
    from .noise import NoiseReducer
    from .metadata import MetadataAggregator
    from .quality import QualityAssurance, ChecksumGenerator
    MODULES_AVAILABLE = True
except ImportError:
    MODULES_AVAILABLE = False


def parse_time_to_seconds(time_input):
    """
    Parse time input to seconds.
    
    Supports:
    - Integer/float seconds (e.g., 390, 390.5)
    - MM:SS format (e.g., "6:30" -> 390)
    - MM:SS.sss format (e.g., "6:30.5" -> 390.5)
    
    Returns:
        float: Time in seconds
    
    Raises:
        ValueError: If the format is invalid
    """
    if isinstance(time_input, (int, float)):
        return float(time_input)
    
    if isinstance(time_input, str):
        try:
            return float(time_input)
        except ValueError:
            pass
        
        parts = time_input.strip().split(':')
        if len(parts) == 2:
            try:
                minutes = float(parts[0])
                seconds = float(parts[1])
                return minutes * 60 + seconds
            except ValueError:
                pass
    
    raise ValueError(f"Invalid time format: {time_input}. Use seconds (e.g., 390) or MM:SS (e.g., '6:30')")


def convert_mp3_to_m4b(mp3_path, output_path, chapters=None, metadata=None, cover_path=None):
    """Convert MP3 to M4B with optional chapters using ffmpeg"""
    try:
        cmd = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-i', mp3_path, '-c:a', 'aac', '-b:a', '64k']
        
        if chapters:
            chapter_file = os.path.join(os.path.dirname(output_path), f'chapters_{uuid.uuid4()}.txt')
            with open(chapter_file, 'w') as f:
                f.write(';FFMETADATA1\n')
                for i, chapter in enumerate(chapters):
                    start_time = chapter['start_time']
                    end_time = chapter.get('end_time') if i < len(chapters) - 1 else None
                    
                    f.write(f'[CHAPTER]\n')
                    f.write(f'TIMEBASE=1/1000\n')
                    f.write(f'START={int(start_time * 1000)}\n')
                    if end_time:
                        f.write(f'END={int(end_time * 1000)}\n')
                    f.write(f'title={chapter["title"]}\n\n')
            
            cmd.extend(['-i', chapter_file, '-map_metadata', '1'])
        
        if cover_path:
            cmd.extend(['-i', cover_path])
        
        if metadata:
            if metadata.get('title'):
                cmd.extend(['-metadata', f'title={metadata["title"]}'])
            if metadata.get('author'):
                cmd.extend(['-metadata', f'artist={metadata["author"]}'])
            if metadata.get('album'):
                cmd.extend(['-metadata', f'album={metadata["album"]}'])
        
        cmd.extend(['-y', output_path])
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode != 0:
            raise Exception(f"FFmpeg error: {result.stderr}")
        
        return True

    except Exception as e:
        logger.error(f"Error in convert_mp3_to_m4b: {e}")
        raise


def detect_silence(input_path, noise=-30, duration=2.0):
    """Detect silence in audio file."""
    cmd = [
        'ffmpeg', '-hide_banner', '-i', input_path,
        '-af', f'silencedetect=n={noise}dB:d={duration}',
        '-f', 'null', '-'
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    silences = []
    import re
    lines = result.stderr.split('\n')
    start_time = None
    
    for line in lines:
        start_match = re.search(r'silence_start:\s*([\d.]+)', line)
        if start_match:
            start_time = float(start_match.group(1))
            continue
        
        end_match = re.search(r'silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)', line)
        if end_match and start_time is not None:
            end_time = float(end_match.group(1))
            silences.append({'start': start_time, 'end': end_time})
            start_time = None
    
    return silences


def get_audio_duration(input_path):
    """Get audio duration in seconds."""
    cmd = ['ffprobe', '-v', 'quiet', '-show_entries', 'format=duration',
           '-of', 'json', input_path]
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    try:
        data = json.loads(result.stdout)
        return float(data['format']['duration'])
    except (json.JSONDecodeError, KeyError):
        return 0.0


def detect_chapters_smart(input_path, min_gap=300.0):
    """Intelligently detect chapters from silence."""
    silences = detect_silence(input_path, noise=-40, duration=2.0)
    
    chapters = []
    for start, end in [(s['start'], s['end']) for s in silences]:
        chapters.append({'title': f'Chapter {len(chapters)+1}', 'start_time': start})
    
    return chapters


def run_loudness_analysis(input_path):
    """Run EBU R128 loudness analysis."""
    cmd = [
        'ffmpeg', '-hide_banner', '-i', input_path,
        '-af', 'loudnorm=print_format=json:measure_perclip=1',
        '-f', 'null', '-'
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    for line in result.stderr.split('\n'):
        if line.startswith('{'):
            return json.loads(line)
    return {}


def write_m4b_tags(output_path, metadata, cover_path=None, chapters=None):
    """Write iTunes-compatible tags to M4B."""
    try:
        from mutagen.mp4 import MP4
        
        audio = MP4(output_path)
        
        if metadata.get('title'):
            audio['\xa9nam'] = metadata['title']
        if metadata.get('artist'):
            audio['\xa9ART'] = metadata['artist']
        if metadata.get('album'):
            audio['\xa9alb'] = metadata['album']
        if metadata.get('genre'):
            audio['\xa9gen'] = metadata['genre']
        if metadata.get('description'):
            audio['desc'] = metadata['description'][:255]
        
        if cover_path and os.path.exists(cover_path):
            with open(cover_path, 'rb') as f:
                audio['covr'] = [f.read()]
        
        audio.save()
        return True
    except ImportError:
        logger.warning("mutagen not available for tag writing")
        return False


def generate_checksum(input_path, output_path=None):
    """Generate SHA-256 checksum."""
    import hashlib
    sha256 = hashlib.sha256()
    with open(input_path, 'rb') as f:
        for chunk in iter(lambda: f.read(8192), b''):
            sha256.update(chunk)
    
    return sha256.hexdigest()


def write_checksum_sidecar(input_path):
    """Write checksum to sidecar file."""
    checksum = generate_checksum(input_path)
    with open(input_path + '.sha256', 'w') as f:
        f.write(f"{checksum}  {os.path.basename(input_path)}\n")
    return checksum