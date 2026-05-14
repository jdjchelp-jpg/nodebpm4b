# Google Colab Usage Guide

This guide shows how to use BPM4B in Google Colab with automatic tunneling for remote access.

## Installation Methods

### Method 1: Clone from GitHub (Recommended)

```python
# Clone the repository
!git clone https://github.com/yourusername/bpm4b.git
%cd bpm4b

# Install dependencies
!npm install

# Start the server
!npm start
```

### Method 2: Install via npm (Alternative)

```python
# Install BPM4B globally
!npm install -g bpm4b

# Start the server
!bpm4b web --enable-tunnel
```

### Method 3: Install via pip (Alternative)

```python
# Install BPM4B via pip
!pip install bpm4b

# Start the server
!bpm4b web --enable-tunnel
```

## Quick Start

```python
# Clone from GitHub
!git clone https://github.com/yourusername/bpm4b.git
%cd bpm4b

# Install dependencies
!npm install

# Start server with automatic tunneling
!npm start -- --enable-tunnel
```

## Network Tunneling

BPM4B automatically detects Google Colab and enables tunneling. You can also manually configure it:

### Localtunnel (Recommended - No signup required)

```python
# Install localtunnel
!npm install -g localtunnel

# Start localtunnel in background
import subprocess
lt_process = subprocess.Popen(['npx', 'localtunnel', '--port', '5000'], 
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE)

# Wait for tunnel to start and capture URL
import time
time.sleep(10)

# The tunnel URL will be displayed in the output
# Copy the URL to access BPM4B from anywhere
```

### Ngrok (Requires ngrok account)

```python
# Install ngrok
!curl -s https://ngrok-agent.s3.amazonaws.com/ngrok.asc | sudo tee /etc/apt/trusted.gpg.d/ngrok.asc >/dev/null
!echo "deb https://ngrok-agent.s3.amazonaws.com buster main" | sudo tee /etc/apt/sources.list.d/ngrok.list
!sudo apt update && sudo apt install ngrok

# Authenticate with ngrok (replace with your authtoken)
!ngrok config add-authtoken YOUR_AUTH_TOKEN

# Start ngrok tunnel
import subprocess
ngrok_process = subprocess.Popen(['ngrok', 'http', '5000'], 
                                 stdout=subprocess.PIPE, stderr=subprocess.PIPE)

time.sleep(5)
print("✅ Ngrok tunnel started")
```

## Features in Colab

### Automatic Optimizations

When running in Google Colab, BPM4B automatically applies:

- **Concurrency**: Uses all available CPU cores (up to 8)
- **Fast Mode**: Enabled by default for maximum speed
- **Audio Quality**: 128k (higher quality for Colab's better hardware)
- **Max Parallel Files**: 16 (increased for Colab's better I/O)
- **Network Tunneling**: Auto-enabled for remote access

### Performance Benefits

- **5x Faster Processing**: Parallel audio processing
- **2-3x Faster TTS**: Up to 8 parallel TTS workers
- **99.8% Text Coverage**: Chunk overlap prevents text loss
- **Multi-threaded Encoding**: Utilizes all CPU cores

## Usage Examples

### Convert MP3 to M4B

```python
# Upload your MP3 file to Colab
# Then use the web interface to convert it
# Or use the API:

import requests

# Upload file
files = {'source_file': open('your_file.mp3', 'rb')}
data = {
    'audioQuality': '128k',
    'chapters': '[{"title": "Chapter 1", "start_time": 0, "end_time": 300}]'
}

response = requests.post('http://localhost:5000/api/convert', files=files, data=data)
print(response.json())
```

### Folder to M4B Conversion

```python
# Create a folder with your audio files
!mkdir -p /content/audiobook_chapters

# Upload your files to this folder (use the file browser)
# Then convert:

import requests

data = {
    'folderPath': '/content/audiobook_chapters',
    'audioQuality': '128k',
    'metadata': '{"title": "My Audiobook", "author": "Author Name"}'
}

response = requests.post('http://localhost:5000/api/folder-to-m4b', json=data)
print(response.json())
```

### Document to Audiobook

```python
# Upload your PDF or text file
# Then use the web interface or API:

import requests

files = {'document_file': open('your_document.pdf', 'rb')}
data = {
    'voice': 'af_heart',
    'speed': '1.0',
    'model': 'kokoro-82m'
}

response = requests.post('http://localhost:5000/api/document-to-audiobook', files=files, data=data)
print(response.json())
```

## Complete Colab Notebook Example

```python
# ============================================
# BPM4B in Google Colab - Complete Setup
# ============================================

# Step 1: Clone from GitHub
!git clone https://github.com/yourusername/bpm4b.git
%cd bpm4b

# Step 2: Install dependencies
!npm install

# Step 3: Start server with tunneling
import subprocess
import time
import requests

# Start the server in background
server_process = subprocess.Popen(['npm', 'start', '--', '--enable-tunnel'], 
                                 stdout=subprocess.PIPE, stderr=subprocess.PIPE)

# Wait for server to start
time.sleep(5)

print("✅ BPM4B server started")

# Step 4: Setup tunneling (Localtunnel - recommended)
!npm install -g localtunnel

lt_process = subprocess.Popen(['npx', 'localtunnel', '--port', '5000'], 
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE)

time.sleep(10)

# Step 5: Check server status
try:
    response = requests.get('http://localhost:5000/api/health')
    print("✅ Server is healthy")
except:
    print("⚠️ Server not responding yet")

print("\n🎉 BPM4B is now running!")
print("📝 Use the tunnel URL displayed above to access the web interface")
print("📚 Upload your files and convert them to audiobooks")
```

## Troubleshooting

### Server Not Starting

```python
# Check if port 5000 is available
!lsof -i :5000

# Kill any process using port 5000
!pkill -f "node.*5000"

# Restart the server
!npm start -- --enable-tunnel
```

### Tunnel Not Working

```python
# Try a different tunnel service
# Switch from localtunnel to ngrok or vice versa

# Check if tunnel is running
!ps aux | grep tunnel

# Restart tunnel
lt_process.kill()
lt_process = subprocess.Popen(['npx', 'localtunnel', '--port', '5000'])
```

### Memory Issues

```python
# Check available memory
!free -h

# If memory is low, reduce worker count
# The system will automatically scale down workers
# You can also manually set it:

import os
os.environ['BPM4B_MAX_WORKERS'] = '2'
```

## Advanced Configuration

### Custom Worker Count

```python
import os
# Set maximum workers (default: 8 or CPU cores)
os.environ['BPM4B_MAX_WORKERS'] = '4'

# Start server
!npm start
```

### Custom Port

```python
# Start on a different port
!npm start -- --port 8080

# Update tunnel to match
lt_process = subprocess.Popen(['npx', 'localtunnel', '--port', '8080'])
```

### Disable Tunneling

```python
# Start without tunneling (local access only)
!npm start
```

## Performance Tips

1. **Use GPU Runtime**: Enable GPU in Colab for faster TTS processing
2. **Upload Files First**: Upload all files before starting conversion
3. **Batch Processing**: Convert multiple files at once for better efficiency
4. **Monitor Resources**: Check memory and CPU usage during processing
5. **Use Smaller Chunks**: For very long texts, the system will automatically chunk them

## Downloading Results

```python
# Download converted files from Colab
from google.colab import files

# List output files
!ls -lh outputs/

# Download a specific file
files.download('outputs/your_audiobook.m4b')

# Download all files
import glob
for file in glob.glob('outputs/*.m4b'):
    files.download(file)
```

## Cleanup

```python
# Stop the server and tunnel
server_process.terminate()
lt_process.terminate()

# Clean up temporary files
!rm -rf uploads/ outputs/ m4b_temp_*/

print("✅ Cleanup complete")
```

## Support

For issues or questions:
- **X (Twitter)**: [@jdjchelp](https://x.com/jdjchelp)
- **GitHub Issues**: https://github.com/yourusername/bpm4b/issues

## License

See LICENSE file for details.
