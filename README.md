
<div align="center">

<img src="https://img.shields.io/badge/BPM4B-v12-black?style=for-the-badge&logo=npm&logoColor=white" alt="BPM4B"/>

# BPM4B

### Professional Multimedia Processing Suite

Convert MP3 ↔ M4B · Generate AI Audiobooks · Process Documents to Audio

<br/>

[![MIT License](https://img.shields.io/badge/License-MIT-22c55e?style=flat-square)](https://choosealicense.com/licenses/mit/)
![NPM Version](https://img.shields.io/npm/v/bpm4b?style=flat-square&color=cb3837&logo=npm)
![PyPI Version](https://img.shields.io/pypi/v/bpm4b?style=flat-square&color=3776ab&logo=python&logoColor=white)
![Node](https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=node.js&logoColor=white)
![FFmpeg](https://img.shields.io/badge/FFmpeg-bundled-007808?style=flat-square&logo=ffmpeg)

<br/>

```bash
npm install bpm4b
# Node.js

pip install bpm4b
# Python
```

</div>

---

# What's New

| Version | Feature                                                                                           |
| ------- | ------------------------------------------------------------------------------------------------- |
| **v12** | ⚡ 5x faster processing · EPUB to Audiobook · 50+ doc formats · Google Colab · 99.8%+ TTS coverage OCR Pdfs but will be introduced in v13 |
| **v11** | ✍️ Interactive Pro Editor · Neural Narration Studio · Multi-voice dialogue                        |
| **v10** | 📚 M4B → MP3 · Document to Audiobook · Audio Format Converter                                     |

---

# Installation

## npm

```bash
npm install bpm4b
cd bpm4b
```

## PyPI

```bash
pip install bpm4b
cd bpm4b
```

## Global CLI

```bash
npm install -g bpm4b

# Development
npm link
```

## Update

```bash
npm update -g bpm4b
```

---

# Premium Narration (Abogen)

Abogen is the recommended TTS engine powered by Kokoro-82M.

<details>
<summary><b>Windows</b></summary>

## Install espeak-ng

[https://github.com/espeak-ng/espeak-ng/releases](https://github.com/espeak-ng/espeak-ng/releases)

---

## Option 1 — Install using uv (Recommended)

```bash
# NVIDIA CUDA 12.8 — recommended
uv tool install --python 3.12 abogen[cuda] \
  --extra-index-url https://download.pytorch.org/whl/cu128 \
  --index-strategy unsafe-best-match

# NVIDIA CUDA 12.6 — older drivers
uv tool install --python 3.12 abogen[cuda126] \
  --extra-index-url https://download.pytorch.org/whl/cu126 \
  --index-strategy unsafe-best-match

# NVIDIA CUDA 13.0 — newer drivers
uv tool install --python 3.12 abogen[cuda130] \
  --extra-index-url https://download.pytorch.org/whl/cu130 \
  --index-strategy unsafe-best-match

# CPU only / AMD on Windows
uv tool install --python 3.12 abogen
```

---

<details>
<summary><b>Option 2 — Install using pip</b></summary>

```bash
mkdir abogen
cd abogen

python -m venv venv

# CMD
venv\Scripts\activate.bat

# PowerShell
venv\Scripts\activate.ps1

# NVIDIA GPUs
pip install torch==2.8.0+cu128 torchvision==0.23.0+cu128 torchaudio==2.8.0 \
  --index-url https://download.pytorch.org/whl/cu128
```

</details>

> For more install methods, see `INSTALL.md`

</details>

---

<details>
<summary><b>macOS</b></summary>

```bash
brew install espeak-ng

# Apple Silicon
uv tool install --python 3.13 abogen \
  --with "kokoro @ git+https://github.com/hexgrad/kokoro.git,numpy<2"

# Intel
uv tool install --python 3.12 abogen \
  --with "kokoro @ git+https://github.com/hexgrad/kokoro.git,numpy<2"
```

> For additional setup methods including `pip`, see `INSTALL.md`

</details>

---

# Usage

## Web Interface

```bash
bpm4b web

# Custom port
bpm4b web --port 8080

# Custom host
bpm4b web --host 127.0.0.1 --debug
```

Default URL:

```txt
http://localhost:5000
```

---

# Google Colab

```bash
# Auto-detect tunnel
bpm4b web --enable-tunnel

# LocalTunnel
bpm4b web --enable-tunnel --tunnel-service localtunnel

# ngrok
bpm4b web --enable-tunnel --tunnel-service ngrok
```

> See `COLAB_USAGE.md` for the full Colab setup guide.

---

# CLI — MP3 to M4B

## Basic

```bash
bpm4b convert input.mp3 output.m4b
```

## Chapters (Seconds)

```bash
bpm4b convert book.mp3 book.m4b \
  --chapter "Prologue" 0 \
  --chapter "Chapter 1" 300 \
  --chapter "Chapter 2" 1800
```

## Chapters (MM:SS)

```bash
bpm4b convert book.mp3 book.m4b \
  --chapter "Prologue" "0:00" \
  --chapter "Chapter 1" "5:00" \
  --chapter "Chapter 2" "30:00"
```

## Mixed Formats

```bash
bpm4b convert book.mp3 book.m4b \
  --chapter "Intro" 0 \
  --chapter "Chapter 1" "6:30" \
  --chapter "Chapter 2" 3600
```

## Help

```bash
bpm4b --help
bpm4b web --help
bpm4b convert --help
```

> Chapter timestamps accept:
>
> * Integers (`seconds`)
> * `"MM:SS"`
> * `"MM:SS.f"`

---

# npm Scripts

```bash
npm start

npm run web

npm run convert -- input.mp3 output.m4b
```

---

# Programmatic Usage (Node.js)

```javascript
const { convertMp3ToM4b } = require('bpm4b');

await convertMp3ToM4b(
  'input.mp3',
  'output.m4b',
  [
    {
      title: 'Chapter 1',
      start_time: 0
    },
    {
      title: 'Chapter 2',
      start_time: 3600
    }
  ]
);
```

---

# Features

## ✍️ Interactive Pro Editor (v11)

* Full text viewer for editing chapter content
* Manual manifest controls
* Merge chapters instantly
* Rename titles
* Exclude segments with one click
* Dual boundary verification
* Universal document support:

  * PDF
  * EPUB
  * DOCX
  * TXT
  * Markdown
  * More

---

## 🎙️ Neural Narration Studio (v11)

* Automatic chapter announcements
* Multi-voice dialogue generation
* Narrative vs dialogue voice separation
* Powered by Kokoro-82M

---

## ⚡ Performance (v12)

Parallel audio processing with configurable concurrency.

| Method               | 100 Files   |
| -------------------- | ----------- |
| Sequential           | ~10 min     |
| Parallel (8 workers) | ~2 min      |
| Fast Mode + Parallel | ~1.5 min    |
| TTS Synthesis        | 2–3x faster |
| Text Coverage        | 99.8%+      |

---

# 🎙️ EPUB to Audiobook (v12)

## Abogen Engine (Default)

```bash
curl -X POST http://localhost:5000/api/epub-to-audiobook \
  -F "document_file=@book.epub" \
  -F "voice=default" \
  -F "language=en" \
  -F "speed=1.0"
```

## BPM4B Engine

```bash
curl -X POST http://localhost:5000/api/epub-to-audiobook \
  -F "document_file=@book.epub" \
  -F "voice=af_sky" \
  -F "language=en" \
  -F "speed=1.0" \
  -F "engine=bpm4b"
```

---

# Engine Comparison

| Feature          | Abogen         | BPM4B               |
| ---------------- | -------------- | ------------------- |
| Stability        | ✅ Reliable     | ⚠️ Inconsistent     |
| Speed            | Standard       | ⚡ Faster            |
| Auto-install     | ✅ Yes          | —                   |
| Parallel workers | —              | ✅ Up to 8           |
| Voices           | 50+ Kokoro Voices | 50+ Kokoro Voices   |
| Memory Usage     | Standard       | Lower               |
| Recommended      | ✅ Yes          | Speed-critical only |

> BPM4B engine may be faster for large files but can produce inconsistent results.
> Abogen is recommended for reliability.

---

# Supported Languages & Voices

| Language              | Voices |
| --------------------- | ------ |
| 🇺🇸 American English | 20     |
| 🇬🇧 British English  | 8      |
| 🇨🇳 Chinese          | 8      |
| 🇯🇵 Japanese         | 5      |
| 🇮🇳 Hindi            | 4      |
| 🇧🇷 Portuguese       | 3      |
| 🇪🇸 Spanish          | 3      |
| 🇮🇹 Italian          | 2      |
| 🇫🇷 French           | 1      |

Playback speed range:

```txt
0.5x → 2.0x
```

---

# 📄 Document to EPUB (v12)

```bash
curl -X POST http://localhost:5000/api/document-to-epub \
  -F "document_file=@document.pdf" \
  -F "title=My Book" \
  -F "author=Author Name" \
  -F "language=en"
```

---

<details>
<summary><b>Supported Formats (50+)</b></summary>

## Documents

* PDF
* DOCX
* DOC
* DOCM
* DOT
* DOTX
* ODT
* ODM
* OTT
* ABW
* WPD

## Text

* TXT
* TEXT
* ASC
* ANSI
* LOG
* ME
* MD
* MARKDOWN
* RTF
* CSV

## Web

* HTML
* HTM
* XHTML
* XHT
* XML

## Academic

* TEX
* BIB

</details>

---

<details>
<summary><b>Chapter Detection Patterns (15+)</b></summary>

* Chapter 1
* CHAPTER I
* Part 1
* Book 1
* Volume 1
* Markdown headers (`##`, `###`)
* HTML headings (`h1`, `h2`, `h3`)
* Roman numerals (`I`, `II`, `III`)
* Numbered lists (`1. Title`)

</details>

---

# 🗂️ File Conversion

| Feature                | Description                         | Since |
| ---------------------- | ----------------------------------- | ----- |
| MP3 → M4B              | Embedded chapters                   | v1    |
| M4B → MP3              | High-fidelity extraction            | v10   |
| Document → Audiobook   | PDF/Text via Kokoro-82M             | v10   |
| Audio Format Converter | MP3/WAV/FLAC/AAC/OGG/ALAC           | v10   |
| Folder → M4B           | Batch conversion with auto chapters | v10   |
| EPUB → Audiobook       | Multi-language dual-engine support  | v12   |

---

# Audio Format Converter

Supported conversions:

* MP3 ↔ WAV
* FLAC → MP3
* AAC → OGG
* OGG → WAV
* ALAC → FLAC

Supported quality:

* 128k
* 192k
* 256k
* 320k
* Lossless

---

# 🎨 Theme System (v11)

25+ themes with real-time switching.

## Included Themes

* Dark
* Light
* Matrix
* Cyberpunk
* Dracula
* Monokai
* Vaporwave
* Emerald Forest
* Purple Galaxy
* Sunset Orange
* Blue Ocean
* Cherry Blossom
* Golden Hour
* Midnight Depth
* Royal Velvet
* Arctic Frost
* Volcanic Ash
* Coffee House
* Leafy Greens
* Ocean Breeze
* Lavender Dream
* Steel City
* Ruby Red
* Solarized Light
* High Contrast

---

# 📝 Metadata Editor

* Edit title
* Edit author
* Edit genre
* Edit description
* Auto-fill from Open Library
* Upload and embed cover art
* One-click apply + download

---

# 🎤 Voice Cloning — KokoClone

* Upload a 3–10 second voice sample
* Synthesize text
* Re-voice existing audio
* Multi-language support:

  * English
  * Hindi
  * French
  * Japanese
  * Chinese
  * Italian
  * Portuguese
  * Spanish

Powered by:

* Kokoro-ONNX
* Kanade voice conversion

---

# 🔀 Batch Merge — Audio Glue

* Upload multiple MP3s
* Merge sequentially
* Add metadata
* Add cover art
* Download a single combined file

---

# ⏱️ Automatic Chapter Builder

* Enter title + duration
* Automatic timestamp generation
* HH:MM:SS support
* Batch import/export
* Real-time preview
* Minutes or seconds toggle

---

# 🌐 Google Colab Defaults (v12)

| Setting            | Value         |
| ------------------ | ------------- |
| Concurrency        | All CPU cores |
| Fast Mode          | Enabled       |
| Audio Quality      | 128k          |
| Max Parallel Files | 16            |

---

# ⚙️ UI & Settings

* 25+ real-time themes
* Glassmorphism design
* Drag-and-drop upload
* SSE progress bars
* Live terminal logs
* Copy-to-clipboard commands
* FFmpeg command preview

---

# Web Interface Guide

| Tool            | Usage                                  |
| --------------- | -------------------------------------- |
| MP3 → M4B       | Upload MP3 and add chapters            |
| M4B → MP3       | Convert M4B/M4A to MP3                 |
| Audiobook Gen   | Upload PDF/Text and generate narration |
| Metadata Editor | Edit metadata and embed covers         |
| KokoClone       | Voice cloning and synthesis            |
| Audio Glue      | Merge multiple MP3 files               |

---

# Advanced — Folder to M4B

```javascript
const { folderToM4b } = require('bpm4b');

await folderToM4b(
  '/path/to/folder',
  '/path/to/output.m4b',
  {
    concurrency: 8,
    fastMode: true,
    audioQuality: '128k',

    metadata: {
      title: 'My Audiobook',
      author: 'Author Name',
      genre: 'Audiobook'
    },

    onProgress: (percent, msg) => {
      console.log(`${percent}% - ${msg}`);
    }
  }
);
```

---

# API Reference

## `POST /api/mp3-to-m4b`

| Field      | Type | Description            |
| ---------- | ---- | ---------------------- |
| `mp3_file` | file | Input MP3              |
| `chapters` | JSON | Optional chapter array |

Example:

```json
[
  {
    "title": "Chapter 1",
    "start_time": 0
  },
  {
    "title": "Chapter 2",
    "start_time": "6:30"
  },
  {
    "title": "Chapter 3",
    "start_time": 3600
  }
]
```

---

## `POST /api/convert`

| Field           | Type   | Description       |
| --------------- | ------ | ----------------- |
| `source_file`   | file   | MP3 or M4B        |
| `output_name`   | string | Custom filename   |
| `audio_quality` | string | Bitrate           |
| `chapters`      | JSON   | Optional chapters |

---

## `POST /api/generate-audiobook`

| Field         | Type   | Description     |
| ------------- | ------ | --------------- |
| `doc_file`    | file   | PDF or Text     |
| `voice`       | string | Kokoro voice    |
| `output_name` | string | Output filename |

---

## `POST /api/epub-to-audiobook`

| Field           | Type   | Description         |
| --------------- | ------ | ------------------- |
| `document_file` | file   | EPUB file           |
| `voice`         | string | Voice name          |
| `language`      | string | Language code       |
| `speed`         | float  | 0.5–2.0             |
| `engine`        | string | `abogen` or `bpm4b` |

---

## `POST /api/document-to-epub`

| Field           | Type   | Description        |
| --------------- | ------ | ------------------ |
| `document_file` | file   | Supported document |
| `title`         | string | Book title         |
| `author`        | string | Author             |
| `language`      | string | Language code      |

---

## `POST /api/metadata/extract`

| Field  | Type | Description    |
| ------ | ---- | -------------- |
| `file` | file | M4B/M4A source |

Example response:

```json
{
  "title": "Book Title",
  "author": "Author Name",
  "genre": "Fiction",
  "description": "Book description...",
  "coverBase64": "data:image/jpeg;base64,..."
}
```

---

## `POST /api/metadata/apply`

| Field          | Type   | Description          |
| -------------- | ------ | -------------------- |
| `file`         | file   | M4B/M4A source       |
| `metadata`     | JSON   | Metadata object      |
| `cover_base64` | string | Optional cover image |

---

## `POST /api/convert-audio`

| Field           | Type   | Description               |
| --------------- | ------ | ------------------------- |
| `file`          | file   | Audio source              |
| `target_format` | string | mp3/wav/flac/aac/ogg/alac |
| `quality`       | string | Bitrate or lossless       |
| `job_id`        | string | Optional SSE job ID       |

---

## `GET /api/health`

Returns:

* Service health status
* FFmpeg availability

---

# Project Structure

```txt
bpm4b/
├── bin/
│   └── bpm4b.js
├── lib/
│   ├── core.js
│   ├── server.js
│   ├── audiobook-builder.js
│   └── chapter-detector.js
├── templates/
│   └── index.ejs
├── api/
│   └── index.js
├── uploads/
├── outputs/
├── vercel.json
└── package.json
```

---

# Deploying to Vercel

1. Push project to GitHub
2. Import into Vercel
3. Deploy

> `vercel.json` is auto-detected.

### Important

Serverless functions may time out:

* Hobby: 10s
* Pro: 60s

For large files:

* Use `bpm4b web`
* Deploy on a dedicated server
* Or upgrade Vercel plan

---

# Notes

* Max upload size: **2GB**
* Real-time SSE progress tracking
* Kokoro AI runs locally
* No API keys required
* No external costs
* FFmpeg bundled
* Windows / macOS / Linux support

Typical M4B output size:

```txt
0.96GB – 2GB per hour
```

Depends on bitrate.

---

# Contact

## X (Twitter)

[@jdjchelp](https://x.com/jdjchelp)

---

# License

[MIT License](https://choosealicense.com/licenses/mit/)


