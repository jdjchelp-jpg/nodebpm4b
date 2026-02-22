# BPM4B - MP3 to M4B Audiobook Converter (Node.js Version)

A Node.js web application for converting MP3 files to M4B audiobook format with chapter support.

**Install and run with:** `npm install -g bpm4b` then `bpm4b`

**Version:** 5.0.0

## Features

- Upload MP3 files through a simple web interface
- Add custom chapter markers with titles and timestamps
- Automatically converts to M4B format (iTunes/Apple Books compatible)
- Uses FFmpeg for high-quality AAC audio (64kbps)
- Simple web interface with real-time progress
- CLI support for command-line usage
- Vercel serverless function support for deployment

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

- Maximum file size for uploads: 100MB
- Temporary files are cleaned up automatically
- M4B output files can be large (typically 0.96-2GB per hour of audio depending on bitrate)
- The default audio bitrate is 64kbps AAC, which provides good quality for speech
- The web interface shows progress during upload but FFmpeg conversion happens server-side without progress updates
- For large files, conversion may take several minutes

## License

MIT

## Original Python Project

This is a Node.js port of the original Python project by Me.
