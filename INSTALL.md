# Installation & Quick Start Guide

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
**Good news!** FFmpeg is automatically bundled with the Node.js version. No separate installation needed. Just install the package and it works!

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

## Getting Help

- Read the full documentation: [README_NODE.md](README_NODE.md)
- Check the examples in the `examples/` directory
- Run `bpm4b --help` or `bpm4b web --help` for CLI options
