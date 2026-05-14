# BPM4B - Professional Multimedia Suite

A professional multimedia converter for creating audiobooks with high-fidelity TTS, automatic chapter support, and blazing-fast processing.

**Version:** 12.0.0

## Installation

### Node.js (Recommended)
```bash
npm install -g bpm4b
bpm4b
```

### Python (Alternative)
```bash
pip install bpm4b
bpm4b
```

### From GitHub
```bash
git clone https://github.com/yourusername/bpm4b.git
cd bpm4b
npm install
npm start
```

## Features

### 🚀 Performance Optimizations (NEW in v12)
- **5x Faster Processing**: Parallel audio processing with configurable concurrency
- **Smart Concurrency**: Automatically uses all CPU cores (up to 8 workers)
- **Fast Mode**: Optimized FFmpeg flags for maximum speed
- **Multi-threaded Encoding**: Utilizes all available CPU cores for encoding
- **Efficient Memory Usage**: Streamlined processing pipeline

### 🎯 TTS Improvements (NEW in v12)
- **Complete Text Coverage**: 99.8%+ text coverage with chunk overlap
- **Better Chunking**: 6-priority boundary detection system
- **Faster Synthesis**: Up to 8 parallel TTS workers
- **Reduced Overhead**: Optimized garbage collection and memory management
- **Better Truncation Detection**: 50% threshold with detailed logging

### 🎯 Unified Smart Mode
- Single toggle switch: Conversion Mode vs Chapter Builder Only
- Automatic chapter attachment to MKV/M4B output when conversion mode is ON
- Standalone timestamp generator when mode is OFF

### 📁 File Conversion Section
- **MP3 to M4B**: Convert MP3 files to audiobook format with embedded chapters
- **M4B to MP3**: High-fidelity conversion from M4B/M4A containers to MP3 (NEW in v10)
- **Document to Audiobook**: Generate high-quality voiceovers from PDF/Text using Kokoro-82M AI (NEW in v10)
- **Folder to M4B**: Convert entire folders to audiobooks with automatic chapter markers (5x faster)
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

### 🌐 Google Colab Support (NEW in v12)
- **Automatic Detection**: Detects Google Colab environment automatically
- **Network Tunneling**: Built-in support for localtunnel and ngrok
- **Auto-Optimization**: Applies Colab-specific performance optimizations
- **Remote Access**: Exposes localhost to the internet for remote access
- **Easy Setup**: One-click tunneling with automatic URL generation
- **GitHub Integration**: Clone directly from GitHub in Colab
- See `COLAB_USAGE.md` for complete Colab setup guide

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

### Google Colab Usage

For Google Colab environments, BPM4B automatically detects and applies optimizations:

```bash
# Start server with automatic tunneling (auto-enabled in Colab)
bpm4b web --enable-tunnel

# Or specify tunnel service
bpm4b web --enable-tunnel --tunnel-service localtunnel
bpm4b web --enable-tunnel --tunnel-service ngrok
```

See `COLAB_USAGE.md` for a complete Colab setup guide with GitHub download instructions.

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

## Performance Options

### Folder to M4B Optimizations

The folder-to-M4B conversion now supports advanced performance options:

```javascript
// Programmatically with custom options
const { folderToM4b } = require('bpm4b');

await folderToM4b('/path/to/folder', '/path/to/output.m4b', {
  concurrency: 8,           // Number of parallel workers (default: CPU cores, max 8)
  fastMode: true,           // Enable fast encoding optimizations (default: true)
  audioQuality: '128k',     // Audio bitrate (default: '64k')
  metadata: {               // Optional metadata
    title: 'My Audiobook',
    author: 'Author Name',
    genre: 'Audiobook'
  },
  onProgress: (percent, msg) => {
    console.log(`${percent}% - ${msg}`);
  }
});
```

### Performance Benchmarks

- **Sequential Processing**: ~10 minutes for 100 files
- **Parallel Processing (8 workers)**: ~2 minutes for 100 files (5x faster)
- **Fast Mode**: Additional 20-30% speed improvement
- **Combined**: Up to 6-7x faster than previous version
- **TTS Synthesis**: 2-3x faster with 8 parallel workers
- **Text Coverage**: 99.8%+ with chunk overlap

### Colab-Specific Optimizations

When running in Google Colab, the following optimizations are automatically applied:

- **Concurrency**: Uses all available CPU cores
- **Fast Mode**: Enabled by default
- **Audio Quality**: 128k (higher quality for Colab's better hardware)
- **Max Parallel Files**: 16 (increased for Colab's better I/O)

## Contact

For questions, issues, or collaboration:
- **X (Twitter)**: [@jdjchelp](https://x.com/jdjchelp)

## Original Python Project

This is a Node.js port of the original Python project by Me.

## License

MIT


