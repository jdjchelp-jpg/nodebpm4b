# MP3 to M4B Audiobook Converter (bpm4b)

A web application for converting MP3 files to M4B audiobook format with chapter support.

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

### MP3 to M4B Converter
- Upload MP3 files
- Add custom chapter markers with titles and timestamps
- Automatically converts to M4B format (iTunes/Apple Books compatible)
- Uses FFmpeg for high-quality AAC audio (64kbps)
- Simple web interface

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

**MP3 to M4B**: Upload an MP3 file, optionally add chapter markers, and click "Convert to M4B"
- Automatically converts to M4B format (iTunes/Apple Books compatible)
- Add custom chapter titles and timestamps
- Uses FFmpeg for high-quality AAC audio (64kbps)

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