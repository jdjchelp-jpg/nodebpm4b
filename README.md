# BPM4B - Professional Multimedia Converter (v7.0.0)

A professional multimedia processing tool for converting MP3 to M4B and M3U8 to MKV with automatic chapter support.

**Available in two versions:**
- **Python** (Flask): `pip install bpm4b` then `bpm4b`
- **Node.js** (Express): `npm install -g bpm4b` then `bpm4b`

## Installation

### Python Version (Original)
```bash
pip install bpm4b
bpm4b web
```

### Node.js Version
```bash
npm install -g bpm4b
bpm4b web
```

**Or for local development:**
```bash
git clone https://github.com/jdjchelp-jpg/nodebpm4b.git
cd nodebpm4b
npm install
npm start
```

**Update:**
```bash
# Update Python version
pip install --upgrade bpm4b

# Update Node.js version
npm update -g bpm4b
```

## Features

### 🎯 Unified Smart Mode
- Single toggle switch: Conversion Mode vs Chapter Builder Only
- Automatic chapter attachment to MKV/M4B output when conversion mode is ON
- Standalone timestamp generator when mode is OFF

### 📁 File Conversion Section
- **MP3 to M4B**: Convert MP3 files to audiobook format with embedded chapters
- **M3U8 to MKV**: Stream conversion with chapter embedding (NEW in v7)
- Drag-and-drop file upload with visual feedback
- Real-time file validation
- Visual progress bar with status updates

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

### Node.js Version
**No additional prerequisites needed!** FFmpeg is bundled with the Node.js version, so it works out of the box.

### Python Version (Original)
- Python 3.8+
- FFmpeg (required for MP3 to M4B conversion)

### Installing FFmpeg (Python Version Only)

**Windows:**
1. Go to https://www.gyan.dev/ffmpeg/builds/ (recommended Windows builds)
2. Download "ffmpeg-git-full.7z" or "ffmpeg-release-full.7z"
3. Extract the archive using 7-Zip or similar
4. Open the extracted folder, navigate to the `bin` folder
5. Copy the path to the `bin` folder (contains ffmpeg.exe)
6. Add to PATH:
   - Press Win + X, select "System"
   - Click "Advanced system settings"
   - Click "Environment Variables"
   - Under "System variables", find and select "Path", click "Edit"
   - Click "New" and paste the path to the `bin` folder
   - Click OK on all windows
7. Open a new command prompt and verify: `ffmpeg -version`

**macOS:**
```bash
brew install ffmpeg
```

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install ffmpeg
```

**Note:** The Python version requires FFmpeg. The Node.js version includes FFmpeg automatically.

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

### Using Python Module

Alternatively, you can run it as a Python module:

```bash
python -m bpm4b.cli web --port 5000
python -m bpm4b.cli convert input.mp3 output.m4b
```

### Using the CLI (Package Installation)

After installing with `pip install -e .`, use the `bpm4b` command:

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

### Using Python Module

Alternatively, you can run it as a Python module:

```bash
python -m bpm4b.cli web --port 5000
python -m bpm4b.cli convert input.mp3 output.m4b
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
- Uses FFmpeg for high-quality AAC audio (64kbps)

**M3U8 to MKV**: Upload an M3U8 stream file, build chapters, and click "Convert to MKV with Chapters"
- Downloads the HLS stream and converts to MKV container
- Chapters automatically embedded into MKV metadata
- Perfect for preserving chapter markers from streaming sources

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

### POST /api/m3u8-to-mkv
Converts an M3U8 HLS stream to MKV with embedded chapters.

**Form Data:**
- `m3u8_file`: The M3U8 file (can be local file or URL in content)
- `chapters` (optional): JSON array of chapter objects with same format as MP3 endpoint
- `smart_mode` (optional): If "chapters-only", only generates chapter timestamps without conversion

**Response:**
Returns an MKV file as a download with chapters embedded in the container.

### GET /api/health
Health check endpoint. Returns JSON with status and FFmpeg availability.

**Response:**
Returns an M4B file as a download.

## Project Structure

### Python Version
```
.
├── bpm4b/              # Main package directory
│   ├── __init__.py    # Package initialization
│   ├── app.py         # Flask application (for local development)
│   ├── cli.py         # Command-line interface entry point
│   ├── core.py        # Shared core functions
│   ├── api/
│   │   ├── __init__.py
│   │   └── index.py   # Vercel serverless function
│   └── templates/
│       └── index.html # Frontend interface
├── setup.py           # Package installation configuration
├── vercel.json        # Vercel configuration
├── requirements.txt   # Python dependencies
├── uploads/           # Temporary uploaded files (created automatically)
├── outputs/           # Generated files (created automatically)
└── README.md          # This file
```

### Node.js Version
```
.
├── bin/
│   └── bpm4b.js       # CLI entry point
├── lib/
│   ├── core.js        # Core conversion functions
│   └── server.js      # Express web server
├── templates/
│   └── index.ejs      # Frontend template
├── api/
│   └── index.js       # Vercel serverless function
├── examples/          # Usage examples
├── test/              # Unit tests
├── package.json       # NPM package configuration
├── vercel.json        # Vercel configuration
├── uploads/           # Temporary uploaded files (created automatically)
├── outputs/           # Generated files (created automatically)
└── README_NODE.md     # Node.js specific documentation
```

## Notes

- Maximum file size for uploads: 100MB
- Temporary files are cleaned up automatically
- M4B output files can be large (typically 0.96-2GB per hour of audio depending on bitrate)
- The default audio bitrate is 64kbps AAC, which provides good quality for speech

## License

MIT