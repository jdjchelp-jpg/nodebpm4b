[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](https://choosealicense.com/licenses/mit/) ![NPM Version](https://img.shields.io/npm/v/bpm4b)
![PyPI - Version](https://img.shields.io/pypi/v/bpm4b)

# BPM4B

A professional multimedia processing suite for converting MP3 to M4B, M4B to MP3, and generating AI Audiobooks with high-fidelity TTS and interactive chapter editing.

## Installation

Install bpm4b with npm

```bash
  npm install bpm4b
  cd bpm4b
```

Install bpm4b with pypi

```bash
  pip install bpm4b
  cd bpm4b
```

**Update:**
```bash
# Update Node.js version
npm update -g bpm4b
```

## Features

### ✍️ Interactive Pro Editor (v11)
- **Full Text Viewer (Word-to-Word)**: Review and edit chapter content before generation.
- **Manual Manifest Control**: Merge chapters, rename titles, and exclude segments with one click.
- **Dual Boundary Verification**: Preview the exact start and end snippets of every chapter card.
- **Universal Document Engine**: Support for ANY text-based file (PDF, EPUB, DOCX, TXT, MD, etc.).

### 🎙️ Neural Narration Studio (v11)
- **Professional Chapter Announcements**: Automatically injects "Chapter X: [Title]" or "Episode X" audio headers.
- **Multi-Voice Dialogue**: Differentiate narrative text from dialogue using unique neural voices.
- **Kokoro-82M High Fidelity**: Powered by local, high-speed neural TTS for human-like narration.

### 📝 Metadata Editor
- **Edit M4B Metadata**: Upload an M4B file and edit its metadata (title, author, genre, description)
- **Auto-Fill from Open Library**: Search for book titles and automatically fetch metadata
- **Cover Art Management**: Upload and embed cover art into your audiobook files
- **Apply Changes**: One-click button to apply metadata changes directly to your M4B file
- **Download Updated File**: Automatically download the M4B file with updated metadata
- **Requires FFmpeg**: FFmpeg is bundled with the Node version

### 📁 File Conversion Section
- **MP3 to M4B**: Convert MP3 files to audiobook format with embedded chapters
- **M4B to MP3**: High-fidelity conversion from M4B/M4A containers to MP3 (NEW in v10)
- **Document to Audiobook**: Generate high-quality voiceovers from PDF/Text using Kokoro-82M AI (NEW in v10)
- **Audio Format Converter**: Convert between multiple audio formats (NEW in v10)
  - MP3 ↔ WAV (bidirectional)
  - FLAC → MP3
  - AAC → OGG
  - OGG → WAV
  - ALAC → FLAC
  - Adjustable quality settings (128k, 192k, 256k, 320k, lossless)
- Drag-and-drop file upload for all tools
- Real-time progress monitoring with SSE (Server-Sent Events)
- Visual progress bar and live terminal logging

### 🎨 Theme System
- **25+ Color Themes**: Choose from a variety of beautiful color schemes
- **Dark Mode**: Original dark theme for low-light environments
- **Classic**: Clean light theme for traditional look
- **Specialty Themes**: Matrix, Cyberpunk, Dracula, Monokai, Vaporwave, and more
- **Custom Themes**: Emerald Forest, Purple Galaxy, Sunset Orange, Blue Ocean, Cherry Blossom, Golden Hour, Midnight Depth, Royal Velvet, Arctic Frost, Volcanic Ash, Coffee House, Leafy Greens, Ocean Breeze, Lavender Dream, Steel City, Ruby Red, Solarized Light, High Contrast
- **Persistent Selection**: Theme choice saved to localStorage
- **Real-time Switching**: Change themes instantly without page reload

### ⏱ Automatic Chapter Builder
- **Always enabled** - core functionality
- Enter chapter title and duration (minutes or seconds toggle)
- System automatically:
  - Converts input to proper format
  - Accumulates duration to cumulative total
  - Calculates next chapter start timestamp
  - Generates proper HH:MM:SS format
- No manual math required - all timestamps auto-generate
- Batch import/export chapter lists
- Real-time preview updates

### ⚙ Settings Panel
- Dark / Light mode toggle
- Modern toggle switches (not checkboxes)
- Glassmorphism card design
- Smooth animations and transitions
- Responsive layout optimized for desktop

### 🚀 Performance Improvements
- Faster parsing with optimized algorithms
- Non-blocking UI with background conversion
- Proper error handling and validation
- File size validation before processing
- Automatic cleanup of temporary files

### 📋 Professional Features
- Copy-to-clipboard buttons for generated commands
- Real-time updating preview panel
- FFmpeg command preview (self-service mode)
- Export chapters to .txt format
- Modern, clean, professional SaaS-like interface

## Prerequisites

**No additional prerequisites needed!** Node.js 18+ is required. FFmpeg is bundled with the Node.js version, so it works out of the box.

## Usage

### Web Interface

Start the web server and open your browser to http://localhost:5000:

```bash
# Start the server
bpm4b web

# Or with custom options
bpm4b web --port 8080
bpm4b web --host 127.0.0.1 --debug
```

The web interface allows you to:
- Upload MP3 files through a simple form
- Add custom chapter markers with titles and timestamps
- Download the converted M4B audiobook

### Command Line (No Web Interface)

Convert MP3 to M4B directly from the terminal:

```bash
# Basic conversion
bpm4b convert input.mp3 output.m4b

# With chapter markers
bpm4b convert input.mp3 output.m4b --chapter "Introduction" 0
bpm4b convert input.mp3 output.m4b --chapter "Chapter 1" 3600 --chapter "Chapter 2" 7200

# Multiple chapters
bpm4b convert book.mp3 book.m4b \\
  --chapter "Prologue" 0 \\
  --chapter "Chapter 1" 300 \\
  --chapter "Chapter 2" 1800

# Multiple chapters with MM:SS format
bpm4b convert book.mp3 book.m4b \\
 --chapter "Prologue" "0:00" \\
 --chapter "Chapter 1" "5:00" \\
 --chapter "Chapter 2" "30:00"

# Mixed formats (seconds and MM:SS)
bpm4b convert book.mp3 book.m4b \\
 --chapter "Intro" 0 \\
 --chapter "Chapter 1" "6:30" \\
 --chapter "Chapter 2" 3600
```

Chapter start times accept:
- Seconds as integer (e.g., `390`)
- Minutes:seconds format (e.g., `"6:30"` or `"6:30.5"` for fractional seconds)

### Using the CLI

After installing with `npm install -g bpm4b`, use the `bpm4b` command:

```bash
# Start web interface
bpm4b web

# Web interface with options
bpm4b web --port 8080
bpm4b web --host 127.0.0.1 --debug

# Convert MP3 to M4B directly
bpm4b convert input.mp3 output.m4b
bpm4b convert input.mp3 output.m4b --chapter "Chapter 1" 0

# Show help
bpm4b --help
bpm4b web --help
bpm4b convert --help
```

### Using the Traditional Method

If you installed dependencies only (without the package):

```bash
python app.py
```

Then open your browser and navigate to:
```
http://localhost:5000
```

### Using the Tool

Once the server is running:

**MP3 to M4B**: Upload an MP3 file, add chapters using the automatic chapter builder, and click "Convert to M4B"
- Automatically converts to M4B format (iTunes/Apple Books compatible)
- Chapters automatically embedded with titles and timestamps
- Uses FFmpeg for high-quality AAC audio (64kbps - 256kbps)

**M4B to MP3**: Upload an M4B/M4A file and convert it to a standard MP3
- High-fidelity conversion using the libmp3lame encoder
- Perfect for playback on legacy devices or sharing

**Audiobook Gen**: Upload a PDF or Text document to generate a full audiobook
- Powered by Kokoro-82M Local TTS engine
- High-quality, human-like voice synthesis
- Automatic chapter detection and manifest generation

**Metadata Editor**: Edit metadata on existing M4B/M4A files
- Upload an M4B file to load its current metadata
- Edit title, author, genre, and description fields
- Use "Auto-Fill" to fetch metadata from Open Library by title
- Upload and embed cover art
- Click "Apply Metadata to M4B" to save changes and download the updated file

**Voice Cloning (KokoClone)**: Generate speech in a cloned voice
- Upload a 3-10 second reference voice sample
- Enter text to synthesize or upload source audio
- Select language (English, Hindi, French, Japanese, Chinese, Italian, Portuguese, Spanish)
- Generate cloned speech or re-voice existing audio recordings
- Powered by Kokoro-ONNX and Kanade voice conversion models

**Batch Merge (Audio Glue)**: Combine multiple audio files into one
- Upload multiple MP3 files to merge them sequentially
- Add metadata (title, author, genre, description) to the merged file
- Upload and embed cover art
- Download the merged audio file
- Perfect for combining chapter files or creating compilations

## API Endpoints

### POST /api/mp3-to-m4b
Converts an MP3 file to M4B with optional chapters.

**Form Data:**
- `mp3_file`: The MP3 file to convert
- `chapters` (optional): JSON array of chapter objects. `start_time` accepts seconds (number) or MM:SS format (string):
```json
[
  {"title": "Chapter 1", "start_time": 0},
  {"title": "Chapter 2", "start_time": "6:30"},
  {"title": "Chapter 3", "start_time": 3600}
]
```

### POST /api/convert
Converts MP3 to M4B or M4B to MP3.

**Form Data:**
- `source_file`: The file to convert
- `output_name`: Custom filename
- `audio_quality`: Bitrate (e.g., '128k', '256k')
- `chapters` (optional): JSON array of chapter objects.

### POST /api/generate-audiobook
Generates an audiobook from a document.

**Form Data:**
- `doc_file`: The PDF or Text file
- `voice`: Selection from available Kokoro voices
- `output_name`: Custom filename

### POST /api/metadata/extract
Extracts metadata from an M4B/M4A file.

**Form Data:**
- `file`: The M4B/M4A file to extract metadata from

**Response:**
```json
{
  "title": "Book Title",
  "author": "Author Name",
  "genre": "Fiction",
  "description": "Book description...",
  "coverBase64": "data:image/jpeg;base64,..."
}
```

### POST /api/metadata/apply
Applies metadata to an M4B/M4A file.

**Form Data:**
- `file`: The M4B/M4A file to update
- `metadata`: JSON object with metadata fields:
```json
{
  "title": "New Title",
  "author": "New Author",
  "genre": "New Genre",
  "description": "New description..."
}
```
- `cover_base64` (optional): Base64-encoded cover art image

**Response:**
```json
{
  "success": true,
  "downloadUrl": "/api/download/updated_metadata.m4b",
  "filename": "updated_metadata.m4b"
}
```

### POST /api/convert-audio
Converts audio files between different formats.

**Form Data:**
- `file`: The audio file to convert
- `target_format`: Target format (mp3, wav, flac, aac, ogg, alac)
- `quality`: Audio quality/bitrate (128k, 192k, 256k, 320k, lossless)
- `job_id` (optional): Job ID for SSE progress updates

**Supported Conversions:**
- MP3 ↔ WAV (bidirectional)
- FLAC → MP3
- AAC → OGG
- OGG → WAV
- ALAC → FLAC

**Response:**
```json
{
  "success": true,
  "downloadUrl": "/api/download/converted_file.mp3",
  "filename": "converted_file.mp3"
}
```

### GET /api/health
Health check endpoint. Returns JSON with status and FFmpeg availability.

**Response:**
Returns an M4B file as a download.

## Project Structure

```
.
├── bin/
│   └── bpm4b.js       # CLI entry point
├── lib/
│   ├── core.js        # Core conversion functions
│   ├── server.js      # Express web server
│   ├── audiobook-builder.js # TTS Narration Logic
│   └── chapter-detector.js # Regex Chapter Parsing
├── templates/
│   └── index.ejs      # Frontend dashboard
├── api/
│   └── index.js       # Vercel serverless function
├── package.json       # NPM package configuration
├── uploads/           # Temporary uploaded files
└── outputs/           # Generated files
```


## Notes

- Maximum file size for uploads: 2GB
- SSE (Server-Sent Events) used for real-time progress updates
- Kokoro AI engine runs locally (no API keys or external costs)
- M4B output files can be large (typically 0.96-2GB per hour of audio depending on bitrate)
- Optimized for high-speed conversion on Windows/macOS/Linuxion:
- **X (Twitter)**: [@jdjchelp](https://x.com/jdjchelp)

## License

MIT