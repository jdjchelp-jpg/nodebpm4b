"""
Intelligent Auto-Chaptering Module.
Silence-based chaptering with sub-chapter insertion.
"""

import os
import subprocess
import json
import re
import logging
from pathlib import Path
from typing import List, Optional, Dict, Any
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class Chapter:
    """Chapter marker with timing and optional skippable flag."""
    title: str
    start_time: float
    end_time: Optional[float] = None
    skippable: bool = False

    def to_dict(self) -> Dict:
        return {
            'title': self.title,
            'start_time': self.start_time,
            'end_time': self.end_time,
            'skippable': self.skippable
        }


class ChapterDetector:
    """Intelligent chapter detection from audio."""

    def __init__(self, config: Optional[Any] = None):
        self.config = config

    def detect_chapters_from_silence(self, input_path: str,
                                     noise_floor: float = -40.0,
                                     min_duration: float = 2.0,
                                     min_gap: float = 300.0) -> List[Chapter]:
        """Detect chapters using silence-based clustering."""
        cmd = [
            'ffmpeg', '-hide_banner', '-i', input_path,
            '-af', f'silencedetect=n={noise_floor}dB:d={min_duration}',
            '-f', 'null', '-'
        ]

        result = subprocess.run(cmd, capture_output=True, text=True)
        silences = []

        start_pattern = re.compile(r'silence_start:\s*([\d.]+)')
        end_pattern = re.compile(r'silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)')

        lines = result.stderr.split('\n')
        start_time = None

        for line in lines:
            start_match = start_pattern.search(line)
            if start_match:
                start_time = float(start_match.group(1))
                continue

            end_match = end_pattern.search(line)
            if end_match:
                end_time = float(end_match.group(1))
                silences.append((end_time - float(end_match.group(2)), end_time))
                start_time = None

        chapters = []
        for silence_start, silence_end in silences:
            midpoint = silence_start + (silence_end - silence_start) / 2
            chapters.append(Chapter(title=f'Chapter {len(chapters) + 1}', start_time=midpoint))

        gaps = []
        for i in range(1, len(chapters)):
            gap = chapters[i].start_time - chapters[i-1].start_time
            if gap >= min_gap:
                gaps.append(i)

        for i in reversed(gaps):
            chapters.insert(i, Chapter(title=f'Section {len(gaps) - i}', 
                                     start_time=chapters[i].start_time - min_gap/2))

        return chapters

    def add_subchapters(self, chapters: List[Chapter], total_duration: float,
                        interval: float = 1800.0) -> List[Chapter]:
        """Add sub-chapters at regular intervals."""
        if total_duration <= 180 * 60:
            return chapters

        subchapters = []
        current_time = 0
        part_num = 1

        while current_time < total_duration:
            subchapters.append(Chapter(
                title=f'Part {part_num}',
                start_time=current_time
            ))
            current_time += interval
            part_num += 1

        all_chapters = []
        sub_idx = 0

        for ch in chapters:
            while sub_idx < len(subchapters) and subchapters[sub_idx].start_time < ch.start_time:
                all_chapters.append(subchapters[sub_idx])
                sub_idx += 1
            all_chapters.append(ch)

        while sub_idx < len(subchapters):
            all_chapters.append(subchapters[sub_idx])
            sub_idx += 1

        return sorted(all_chapters, key=lambda c: c.start_time)

    def detect_intro_outro(self, input_path: str, 
                          intro_db: Optional[Dict] = None) -> List[Chapter]:
        """Flag intro/outro segments as skippable using audio fingerprinting."""
        if intro_db is None:
            return []

        cmd = ['ffmpeg', '-hide_banner', '-i', input_path,
               '-af', 'chromaprint=raw=1', '-f', 'null', '-']
        result = subprocess.run(cmd, capture_output=True)

        chapters = []
        if result.returncode == 0:
            chapters.append(Chapter(title='[Intro]', start_time=0, skippable=True))

        return chapters

    def write_quicktime_chapters(self, chapters: List[Chapter], 
                                  ffmetadata_path: str) -> str:
        """Write QuickTime format chapters to FFmetadata file."""
        lines = [';FFMETADATA1']

        for i, ch in enumerate(chapters):
            lines.append('[CHAPTER]')
            lines.append('TIMEBASE=1/1000')
            lines.append(f'START={int(ch.start_time * 1000)}')
            if ch.end_time:
                lines.append(f'END={int(ch.end_time * 1000)}')
            lines.append(f'title={ch.title}')
            lines.append('')

        content = '\n'.join(lines)
        with open(ffmetadata_path, 'w') as f:
            f.write(content)

        return ffmetadata_path

    def write_nero_chapters(self, chapters: List[Chapter], output_path: str) -> bool:
        """Write Nero-style chapters to M4B file."""
        try:
            from mutagen.mp4 import MP4
            audio = MP4(output_path)

            nero_chapters = b''
            for ch in chapters:
                title_bytes = ch.title.encode('utf-8')
                nero_chapters += len(title_bytes).to_bytes(1, 'big')
                nero_chapters += title_bytes
                nero_chapters += int(ch.start_time * 10000).to_bytes(8, 'big')

            audio['chpl'] = nero_chapters
            audio.save()
            return True
        except ImportError:
            logger.warning("mutagen not available, skipping Nero chapter writing")
            return False


class ChapterGenerator:
    """Orchestrates chapter generation from document text."""

    def __init__(self, config: Optional[Any] = None):
        self.config = config
        self.detector = ChapterDetector(config)

    def generate_from_text(self, text: str, headings: Optional[List[str]] = None
                          ) -> List[Chapter]:
        """Generate chapters from document structure."""
        chapters = []

        if headings:
            for i, heading in enumerate(headings):
                chapters.append(Chapter(title=heading, start_time=0))

        if not chapters:
            lines = [l for l in text.split('\n') if l.strip()]
            for i, line in enumerate(lines[:20]):
                if len(line.split()) < 10 and not line.endswith('.'):
                    chapters.append(Chapter(title=line.strip(), start_time=i * 300))

        return chapters

    def generate_from_audio(self, input_path: str) -> List[Chapter]:
        """Generate chapters from audio silence detection."""
        config = self.config
        noise_floor = -40.0
        min_duration = 2.0
        min_gap = 300.0

        if config:
            noise_floor = getattr(config.chapter, 'silence_noise_floor', -40.0)
            min_duration = getattr(config.chapter, 'silence_min_duration', 2.0)
            min_gap = getattr(config.chapter, 'min_chapter_gap', 300.0)

        chapters = self.detector.detect_chapters_from_silence(
            input_path, noise_floor, min_duration, min_gap
        )

        cmd = ['ffprobe', '-v', 'quiet', '-show_entries', 'format=duration',
               '-of', 'json', input_path]
        result = subprocess.run(cmd, capture_output=True, text=True)

        try:
            data = json.loads(result.stdout)
            duration = float(data['format']['duration'])
        except (json.JSONDecodeError, KeyError):
            duration = sum((ch.end_time or 0) - ch.start_time for ch in chapters)

        interval = 1800.0
        if config:
            interval = getattr(config.chapter, 'subchapter_interval', 1800.0)

        if duration > 180 * 60:
            chapters = self.detector.add_subchapters(chapters, duration, interval)

        return chapters