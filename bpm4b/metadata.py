"""
Metadata Management Module.
Multi-source metadata aggregation with adapter pattern.
"""

import os
import re
import json
import logging
import unicodedata
from pathlib import Path
from typing import List, Optional, Dict, Any
from dataclasses import dataclass, field
from abc import ABC, abstractmethod
from urllib.parse import quote_plus

logger = logging.getLogger(__name__)


@dataclass
class MetadataResult:
    """Normalized metadata result."""
    title: Optional[str] = None
    author: Optional[str] = None
    narrator: Optional[str] = None
    album: Optional[str] = None
    genre: Optional[str] = None
    description: Optional[str] = None
    publisher: Optional[str] = None
    copyright: Optional[str] = None
    isbn: Optional[str] = None
    cover_url: Optional[str] = None
    confidence: float = 0.0

    def merge(self, other: 'MetadataResult', other_confidence: float = 0.5):
        """Merge with another result, keeping higher confidence values."""
        if other_confidence > self.confidence:
            if other.title:
                self.title = other.title
            if other.author:
                self.author = other.author
            if other.album:
                self.album = other.album
            if other.genre:
                self.genre = other.genre
            if other.description:
                self.description = other.description
            if other.publisher:
                self.publisher = other.publisher
            if other.isbn:
                self.isbn = other.isbn
            if other.cover_url:
                self.cover_url = other.cover_url


class MetadataProvider(ABC):
    """Abstract base class for metadata providers."""

    @abstractmethod
    def fetch(self, title: str, author: Optional[str] = None) -> MetadataResult:
        """Fetch metadata for a book."""
        pass

    def validate(self, result: MetadataResult) -> bool:
        """Validate metadata result."""
        return result.confidence > 0


class AudibleProvider(MetadataProvider):
    """Audible metadata provider."""

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key

    def fetch(self, title: str, author: Optional[str] = None) -> MetadataResult:
        """Fetch metadata from Audible."""
        import urllib.request

        query = f"{title}"
        if author:
            query += f" {author}"

        url = f"https://api.audible.com/search?q={quote_plus(query)}&numResults=1"

        try:
            req = urllib.request.Request(url, headers={
                'User-Agent': 'Mozilla/5.0 (compatible; BPM4B/1.0)'
            })
            with urllib.request.urlopen(req, timeout=10) as response:
                data = json.loads(response.read().decode())

            if data.get('products'):
                product = data['products'][0]
                return MetadataResult(
                    title=product.get('title'),
                    author=product.get('author'),
                    narrator=product.get('narrator'),
                    description=product.get('description'),
                    publisher=product.get('publisher'),
                    cover_url=product.get('image_url'),
                    confidence=0.8
                )
        except Exception as e:
            logger.debug(f"Audible fetch failed: {e}")

        return MetadataResult(confidence=0.1)


class GoogleBooksProvider(MetadataProvider):
    """Google Books metadata provider."""

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key

    def fetch(self, title: str, author: Optional[str] = None) -> MetadataResult:
        """Fetch metadata from Google Books."""
        import urllib.request

        query = f"intitle:{title}"
        if author:
            query += f"+inauthor:{author}"

        url = f"https://www.googleapis.com/books/v1/volumes?q={quote_plus(query)}"
        if self.api_key:
            url += f"&key={self.api_key}"

        try:
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=10) as response:
                data = json.loads(response.read().decode())

            if data.get('items'):
                volume = data['items'][0].get('volumeInfo', {})

                industry_ids = volume.get('industryIdentifiers', [])
                isbn = None
                for id_obj in industry_ids:
                    if id_obj.get('type') in ['ISBN_10', 'ISBN_13']:
                        isbn = id_obj.get('identifier')
                        break

                return MetadataResult(
                    title=volume.get('title'),
                    author=', '.join(volume.get('authors', [])) if volume.get('authors') else None,
                    description=volume.get('description'),
                    publisher=volume.get('publisher'),
                    isbn=isbn,
                    cover_url=volume.get('imageLinks', {}).get('thumbnail'),
                    confidence=0.7
                )
        except Exception as e:
            logger.debug(f"Google Books fetch failed: {e}")

        return MetadataResult(confidence=0.1)


class MusicBrainzProvider(MetadataProvider):
    """MusicBrainz metadata provider."""

    def fetch(self, title: str, author: Optional[str] = None) -> MetadataResult:
        """Fetch metadata from MusicBrainz."""
        import urllib.request

        query = f"release:{title}"
        if author:
            query += f" AND artist:{author}"

        url = f"https://musicbrainz.org/ws/2/release-group/?query={quote_plus(query)}&fmt=json"

        try:
            req = urllib.request.Request(url, headers={
                'User-Agent': 'BPM4B/1.0 ( https://github.com/bpm4b )'
            })
            with urllib.request.urlopen(req, timeout=10) as response:
                data = json.loads(response.read().decode())

            if data.get('list'):
                release = data['list'][0]
                return MetadataResult(
                    title=release.get('title'),
                    author=release.get('artist-credit', [{}])[0].get('name'),
                    confidence=0.6
                )
        except Exception as e:
            logger.debug(f"MusicBrainz fetch failed: {e}")

        return MetadataResult(confidence=0.1)


class MetadataAggregator:
    """Aggregate metadata from multiple providers."""

    def __init__(self, providers: Optional[List[MetadataProvider]] = None):
        self.providers = providers or [
            AudibleProvider(),
            GoogleBooksProvider(),
            MusicBrainzProvider()
        ]

    def aggregate(self, title: str, author: Optional[str] = None) -> MetadataResult:
        """Aggregate metadata from all providers."""
        results = []

        for provider in self.providers:
            try:
                result = provider.fetch(title, author)
                if provider.validate(result):
                    results.append((result, result.confidence))
            except Exception as e:
                logger.warning(f"Provider {provider.__class__.__name__} failed: {e}")

        if not results:
            return MetadataResult(title=title, author=author, confidence=0.3)

        results.sort(key=lambda x: x[1], reverse=True)

        final = MetadataResult(title=title, author=author, confidence=0.3)

        for result, confidence in results:
            final.merge(result, confidence)

        return final


class FolderMetadataParser:
    """Parse metadata from folder structure."""

    FILENAME_PATTERNS = [
        re.compile(r'^(\d+)\s*[-–]\s*(.+)$'),
        re.compile(r'^Chapter\s+(\d+)\s*[-–]\s*(.+)$', re.IGNORECASE),
        re.compile(r'^(\d+)\s+(.+)$'),
        re.compile(r'^(.+)$')
    ]

    DISC_PATTERN = re.compile(r'(cd|disc|disk)\s*(\d+)', re.IGNORECASE)

    def parse_folder(self, folder_path: str) -> Dict[str, Any]:
        """Parse metadata from folder structure."""
        path = Path(folder_path).absolute()
        parts = [p for p in path.parts if not p.startswith('.')]
        
        metadata = {
            'album': path.name,
            'artist': path.parent.name if len(parts) > 1 else "Unknown Artist",
            'disc': None
        }

        # Check for disc pattern in folder name
        disc_match = self.DISC_PATTERN.search(path.name)
        if disc_match:
            metadata['disc'] = disc_match.group(2)
            # If the folder is "Disc 1", the album name is probably the parent
            if path.parent.name and len(parts) > 1:
                metadata['album'] = path.parent.name
                metadata['artist'] = path.parent.parent.name if len(parts) > 2 else "Unknown Artist"

        return metadata

    def parse_filename(self, filename: str) -> Dict[str, Any]:
        """Parse chapter info from filename."""
        stem = Path(filename).stem

        for pattern in self.FILENAME_PATTERNS:
            match = pattern.match(stem)
            if match:
                return {
                    'number': match.group(1) if match.group(1).isdigit() else None,
                    'title': match.group(2) if len(match.groups()) > 1 else match.group(1)
                }

        return {'title': self._sanitize(stem)}

    def _sanitize(self, text: str) -> str:
        """Sanitize text for metadata."""
        text = unicodedata.normalize('NFKC', text)
        text = text.replace('"', "'")
        text = re.sub(r'\s+', ' ', text)
        return text.strip()


class CoverArtManager:
    """Manage cover art fetching and processing."""

    def __init__(self, config: Optional[Any] = None):
        self.config = config

    def fetch_cover(self, url: str) -> Optional[str]:
        """Fetch cover from URL."""
        import urllib.request
        from PIL import Image

        try:
            with urllib.request.urlopen(url, timeout=30) as response:
                image = Image.open(response)
                image.verify()

                with urllib.request.urlopen(url, timeout=30) as response:
                    image = Image.open(response)

                    # AI-style upscaling logic
                    target_size = 1400
                    if max(image.size) < target_size:
                        # Upscale small images
                        image = image.resize((target_size, target_size), Image.LANCZOS)
                        # Add slight sharpening to compensate for blur
                        from PIL import ImageFilter
                        image = image.filter(ImageFilter.UnsharpMask(radius=2, percent=150, threshold=3))
                    elif max(image.size) > 2000:
                        # Downscale very large images
                        image.thumbnail((2000, 2000), Image.LANCZOS)

                    output_path = Path(url).stem + '.jpg'
                    image.convert('RGB').save(output_path, 'JPEG', quality=92, optimize=True)
                    return output_path
        except Exception as e:
            logger.error(f"Cover fetch failed: {e}")

        return None