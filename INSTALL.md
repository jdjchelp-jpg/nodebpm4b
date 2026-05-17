# Installation & Quick Start Guide - BPM4B v12.0.0

## For Users

### Global Installation (Recommended for CLI usage)

```bash
# Clone or download the project
cd nodebpm4b

# Install globally
npm install -g

# Now you can use the bpm4b command anywhere
bpm4b --help
bpm4b web
bpm4b convert input.mp3 output.m4b --chapter "Chapter 1" 0
bpm4b convert stream.m3u8 output.mkv
```

### Local Installation (For development or as a library)

```bash
# Install dependencies
npm install

# Use the CLI
npx bpm4b web
npx bpm4b convert input.mp3 output.m4b

# Or require it in your code
const { convertMp3ToM4b } = require('bpm4b');
```

## For Developers

### Setting up Development Environment

1. **Clone/Download the repository**
   ```bash
   cd nodebpm4b
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Link for global usage (optional)**
   ```bash
   npm link
   ```

4. **Run tests**
   ```bash
   npm test
   ```

5. **Start the web server**
   ```bash
   npm start
   # or
   npm run web
   # or
   node bin/bpm4b.js web
   ```

6. **Open browser**
   Navigate to http://localhost:5000

### Project Structure

```
nodebpm4b/
├── bin/
│   └── bpm4b.js          # CLI entry point (executable)
├── lib/
│   ├── core.js           # Core conversion logic
│   └── server.js         # Express web server
├── templates/
│   └── index.ejs         # Web interface template
├── api/
│   └── index.js          # Vercel serverless function
├── examples/
│   ├── chapters-example.txt  # Example chapter file
│   └── usage-example.js      # Programmatic usage example
├── test/
│   └── basic-test.js     # Unit tests
├── package.json          # NPM configuration
├── vercel.json           # Vercel deployment config
├── README_NODE.md        # Full documentation
└── .gitignore            # Git ignore rules
```

## Prerequisites

### Node.js Version
**Node.js 18+ is required.** Good news! FFmpeg is automatically bundled with the Node.js version. No separate installation needed. Just install the package and it works!

### Python Version
**FFmpeg is required** for MP3 to M4B conversion. Install it first:

- **Windows**: Download from https://www.gyan.dev/ffmpeg/builds/
- **macOS**: `brew install ffmpeg`
- **Ubuntu/Debian**: `sudo apt-get install ffmpeg`

Verify installation:
```bash
ffmpeg -version
```

## Common Issues

### "FFmpeg is not installed or not in PATH"
- Make sure FFmpeg is installed
- Add FFmpeg to your system PATH
- Restart your terminal after installation

### Port already in use
Use a different port:
```bash
bpm4b web --port 8080
```

### Permission denied (global install)
Use sudo or fix npm permissions:
```bash
sudo npm install -g
```

### Module not found after global install
Re-link the package:
```bash
cd nodebpm4b
npm link
```

## Uninstallation

```bash
# If installed globally
npm uninstall -g bpm4b

# If linked for development
cd nodebpm4b
npm unlink
```

## Premium Narration (Abogen)
Abogen is a powerful text-to-speech conversion tool that makes it easy to turn ePub, PDF, text, markdown, or subtitle files into high-quality audio with matching subtitles in seconds. Use it for audiobooks, voiceovers for Instagram, YouTube, TikTok, or any project that needs natural-sounding text-to-speech, using Kokoro-82M.

### Abogen Compatible PyPi Python Versions

#### Windows
Go to espeak-ng latest release download and run the *.msi file.

**OPTION 1: Install using script**
Download the repository
Extract the ZIP file
Run WINDOWS_INSTALL.bat by double-clicking it
This method handles everything automatically - installing all dependencies including CUDA in a self-contained environment without requiring a separate Python installation. (You still need to install espeak-ng.)
*Note: You don't need to install Python separately. The script will install Python automatically.*

**OPTION 2: Install using uv**
First, install uv if you haven't already.
```bash
# For NVIDIA GPUs (CUDA 12.8) - Recommended
uv tool install --python 3.12 abogen[cuda] --extra-index-url https://download.pytorch.org/whl/cu128 --index-strategy unsafe-best-match

# For NVIDIA GPUs (CUDA 12.6) - Older drivers
uv tool install --python 3.12 abogen[cuda126] --extra-index-url https://download.pytorch.org/whl/cu126 --index-strategy unsafe-best-match

# For NVIDIA GPUs (CUDA 13.0) - Newer drivers
uv tool install --python 3.12 abogen[cuda130] --extra-index-url https://download.pytorch.org/whl/cu130 --index-strategy unsafe-best-match

# For AMD GPUs or without GPU - If you have AMD GPU, you need to use Linux for GPU acceleration, because ROCm is not available on Windows.
uv tool install --python 3.12 abogen
```

<details>
<summary>Alternative: Install using pip</summary>

```bash
# Create a virtual environment (optional)
mkdir abogen && cd abogen
python -m venv venv
# CMD
venv\Scripts\activate.bat

# PowerShell
venv\Scripts\activate.ps1

# For NVIDIA GPUs:
# We need to use an older version of PyTorch (2.8.0) until this issue is fixed: https://github.com/pytorch/pytorch/issues/166628
pip install torch==2.8.0+cu128 torchvision==0.23.0+cu128 torchaudio==2.8.0 --index-url https://download.pytorch.org/whl/cu128

# For AMD GPUs:
# Not supported yet, because ROCm is not available on Windows. Use Linux if you have AMD GPU.

# Install abogen
pip install abogen
```
</details>

#### Mac
First, install uv if you haven't already.

```bash
# Install espeak-ng
brew install espeak-ng

# For Silicon Mac (M1, M2 etc.)
uv tool install --python 3.13 abogen --with "kokoro @ git+https://github.com/hexgrad/kokoro.git,numpy<2"

# For Intel Mac
uv tool install --python 3.12 abogen --with "kokoro @ git+https://github.com/hexgrad/kokoro.git,numpy<2"
```

<details>
<summary>Alternative: Install using pip</summary>

```bash
# Install espeak-ng
brew install espeak-ng

# Create a virtual environment (recommended)
mkdir abogen && cd abogen
python3 -m venv venv
source venv/bin/activate

# Install abogen
pip3 install abogen

# For Silicon Mac (M1, M2 etc.)
# After installing abogen, we need to install Kokoro's development version which includes MPS support.
pip3 install git+https://github.com/hexgrad/kokoro.git
```
</details>

---

## Getting Help

- Read the full documentation: [README_NODE.md](README_NODE.md)
- Check the examples in the `examples/` directory
- Run `bpm4b --help` or `bpm4b web --help` for CLI options
