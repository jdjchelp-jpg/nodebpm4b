# BPM4B - Professional Multimedia Suite (Node.js Version)

A Node.js web application for converting MP3 to M4B, M4B to MP3, and generating AI Audiobooks with high-fidelity TTS and automatic chapter support.

**Install and run with:** `npm install -g bpm4b` then `bpm4b`

**Version:** 10.0.0

## Features

### 🎯 Unified Smart Mode
- Single toggle switch: Conversion Mode vs Chapter Builder Only
- Automatic chapter attachment to MKV/M4B output when conversion mode is ON
- Standalone timestamp generator when mode is OFF

### 📁 File Conversion Section
- **MP3 to M4B**: Convert MP3 files to audiobook format with embedded chapters
- **M4B to MP3**: High-fidelity conversion from M4B/M4A containers to MP3 (NEW in v10)
- **Document to Audiobook**: Generate high-quality voiceovers from PDF/Text using Kokoro-82M AI (NEW in v10)
- Drag-and-drop file upload with visual feedback
- Real-time progress monitoring with SSE (Server-Sent Events)
- Visual progress bar and live terminal logging

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

- Node.js 14+

**Good news!** FFmpeg is now automatically bundled with bpm4b. No separate FFmpeg installation needed. Just install the package and it works out of the box on:


## Installation

### Global Installation (CLI)

```bash
# Clone or download the project
cd bpm4b

# Install globally
npm install -g

# Or link for development
npm link
```

### Local Installation

```bash
npm install
```

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
- Add custom chapter titles and timestamps
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
bpm4b convert book.mp3 book.m4b \
  --chapter "Prologue" 0 \
  --chapter "Chapter 1" 300 \
  --chapter "Chapter 2" 1800

# Multiple chapters with MM:SS format
bpm4b convert book.mp3 book.m4b \
 --chapter "Prologue" "0:00" \
 --chapter "Chapter 1" "5:00" \
 --chapter "Chapter 2" "30:00"

# Mixed formats (seconds and MM:SS)
bpm4b convert book.mp3 book.m4b \
 --chapter "Intro" 0 \
 --chapter "Chapter 1" "6:30" \
 --chapter "Chapter 2" 3600
```

Chapter start times accept:
- Seconds as integer (e.g., `390`)
- Minutes:seconds format (e.g., `"6:30"` or `"6:30.5"` for fractional seconds)

### Using npm scripts

```bash
# Start web interface
npm start
npm run web

# Convert from command line
npm run convert -- input.mp3 output.m4b
```

### Using the Module Programmatically

```javascript
const { convertMp3ToM4b } = require('bpm4b');

async function convert() {
  try {
    await convertMp3ToM4b('input.mp3', 'output.m4b', [
      { title: 'Chapter 1', start_time: 0 },
      { title: 'Chapter 2', start_time: 3600 }
    ]);
    console.log('Conversion complete!');
  } catch (error) {
    console.error('Error:', error.message);
  }
}
```

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

**Response:**
Returns the generated audio file as a download.

### GET /api/health

Health check endpoint. Returns JSON with status and FFmpeg availability.

## Project Structure

```
.
├── bin/
│   └── bpm4b.js          # CLI entry point
├── lib/
│   ├── core.js           # Core conversion functions
│   └── server.js         # Express web server
├── templates/
│   └── index.ejs         # Frontend template
├── api/
│   └── index.js          # Vercel serverless function
├── package.json          # NPM package configuration
├── vercel.json           # Vercel deployment config
├── uploads/              # Temporary uploaded files (created automatically)
├── outputs/              # Generated files (created automatically)
└── README_NODE.md        # This file
```

## Deploying to Vercel

1. Push your code to a GitHub repository
2. Import the project in Vercel
3. Vercel will automatically detect the `vercel.json` configuration
4. Deploy!

**Important:** Vercel's serverless functions have a maximum execution time (10 seconds on Hobby, 60 seconds on Pro). Large audio files may exceed this limit. For production use with large files, consider:
- Using a dedicated server with `bpm4b web`
- Increasing timeout in Vercel Pro
- Processing smaller files

## Notes

- Maximum file size for uploads: 2GB
- SSE (Server-Sent Events) used for real-time progress updates
- Kokoro AI engine runs locally (no API keys or external costs)
- M4B output files can be large (typically 0.96-2GB per hour of audio depending on bitrate)
- Optimized for high-speed conversion on Windows/macOS/Linux
- The web interface shows accurate real-time progress thanks to FFmpeg spawn integration

## Contact

For questions, issues, or collaboration:
- **X (Twitter)**: [@jdjchelp](https://x.com/jdjchelp)

## Original Python Project

This is a Node.js port of the original Python project by Me.

## License

MIT


