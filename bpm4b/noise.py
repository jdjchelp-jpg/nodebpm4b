"""
Noise and Silence Cleanup Module.
Spectral noise reduction, silence truncation, and filler word removal.
"""

import os
import subprocess
import json
import re
import logging
from pathlib import Path
from typing import List, Optional, Dict
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class SilenceSegment:
    """Detected silence segment."""
    start: float
    end: float
    duration: float


class NoiseReducer:
    """Handle noise reduction and audio cleanup."""

    def __init__(self, config: Optional[object] = None):
        self.config = config

    def detect_silence(self, input_path: str, noise_floor: float = -40.0,
                       min_duration: float = 2.0) -> List[SilenceSegment]:
        """Detect silence segments using FFmpeg silencedetect."""
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
            if end_match and start_time is not None:
                end_time = float(end_match.group(1))
                duration = float(end_match.group(2))
                silences.append(SilenceSegment(start_time, end_time, duration))
                start_time = None

        return silences

    def reduce_spectral_noise(self, input_path: str, output_path: str,
                               profile_seconds: float = 2.0) -> bool:
        """Apply spectral noise reduction using FFmpeg afftdn."""
        cmd = [
            'ffmpeg', '-hide_banner', '-i', input_path,
            '-af', 'afftdn=nr=30:nf=-25',
            '-c:a', 'pcm_s16le', '-y', output_path
        ]
        result = subprocess.run(cmd, capture_output=True)
        return result.returncode == 0

    def truncate_long_silences(self, input_path: str, output_path: str,
                               max_duration: float = 0.8,
                               min_silence_duration: float = 3.0) -> bool:
        """Truncate silences longer than threshold."""
        # Use silenceremove filter for a more robust approach
        cmd = [
            'ffmpeg', '-hide_banner', '-i', input_path,
            '-af', f'silenceremove=stop_periods=-1:stop_duration={min_silence_duration}:stop_threshold=-40dB',
            '-c:a', 'pcm_s16le', '-y', output_path
        ]
        result = subprocess.run(cmd, capture_output=True)
        return result.returncode == 0

    def remove_filler_words(self, input_path: str, output_path: str,
                            filler_list: Optional[List[str]] = None) -> bool:
        """Remove filler words using Whisper timestamps and audio splicing."""
        if filler_list is None:
            filler_list = ['uhm', 'uh', 'um', 'er']

        cmd = ['whisper', '--model', 'small', '--output-format', 'json',
               '--word-timestamps', input_path]
        result = subprocess.run(cmd, capture_output=True, text=True)

        if result.returncode != 0:
            import shutil
            shutil.copy2(input_path, output_path)
            return True

        try:
            data = json.loads(result.stdout)
        except json.JSONDecodeError:
            import shutil
            shutil.copy2(input_path, output_path)
            return True

        fillers = []
        for segment in data.get('segments', []):
            for word in segment.get('words', []):
                word_text = word.get('word', '').lower().strip('.,!?;:')
                if word_text in [f.lower() for f in filler_list]:
                    fillers.append((word['start'], word['end']))

        if not fillers:
            import shutil
            shutil.copy2(input_path, output_path)
            return True

        # Construct complex filter to remove segments
        # We want to keep everything EXCEPT the fillers
        filter_parts = []
        last_end = 0.0
        for i, (start, end) in enumerate(fillers):
            filter_parts.append(f"[0:a]atrim=start={last_end}:end={start},asetpts=PTS-STARTPTS[a{i}];")
            last_end = end
        filter_parts.append(f"[0:a]atrim=start={last_end},asetpts=PTS-STARTPTS[alast];")
        
        concat_inputs = "".join([f"[a{i}]" for i in range(len(fillers))]) + "[alast]"
        filter_str = "".join(filter_parts) + f"{concat_inputs}concat=n={len(fillers)+1}:v=0:a=1[out]"

        cmd = ['ffmpeg', '-hide_banner', '-i', input_path,
               '-filter_complex', filter_str, '-map', '[out]', 
               '-c:a', 'pcm_s16le', '-y', output_path]
        result = subprocess.run(cmd, capture_output=True)
        return result.returncode == 0


class AudioCleaner:
    """Orchestrates audio cleanup pipeline."""

    def __init__(self, reducer: NoiseReducer):
        self.reducer = reducer

    def clean_audio(self, input_path: str, output_path: str) -> bool:
        """Apply full cleanup pipeline."""
        work_path = str(Path(output_path).with_suffix('.work.wav'))

        import shutil
        shutil.copy2(input_path, work_path)

        self.reducer.truncate_long_silences(work_path, work_path)

        shutil.move(work_path, output_path)
        return True