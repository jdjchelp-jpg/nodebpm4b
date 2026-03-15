/**
 * Core functions shared between the main app and API endpoints.
 * BPM4B - Professional Multimedia Converter v8.0.0
 */

const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const ffmpegPath = require('ffmpeg-static');
const http = require('http');
const https = require('https');

/**
 * Parse time input to seconds.
 *
 * Supports:
 * - Integer/float seconds (e.g., 390, 390.5)
 * - MM:SS format (e.g., "6:30" -> 390)
 * - MM:SS.sss format (e.g., "6:30.5" -> 390.5)
 *
 * @param {number|string} timeInput - Time to parse
 * @returns {number} Time in seconds
 * @throws {Error} If the format is invalid
 */
function parseTimeToSeconds(timeInput) {
  // If it's already a number, return it
  if (typeof timeInput === 'number') {
    return timeInput;
  }

  // If it's a string, try to parse it
  if (typeof timeInput === 'string') {
    const trimmed = timeInput.trim();

    // Check if it's in MM:SS or M:SS or MM:SS.sss format first
    if (trimmed.includes(':')) {
      const parts = trimmed.split(':');
      if (parts.length === 2) {
        const minutes = parseFloat(parts[0]);
        const seconds = parseFloat(parts[1]);
        if (!isNaN(minutes) && !isNaN(seconds)) {
          return minutes * 60 + seconds;
        }
      }
      throw new Error(`Invalid time format: ${timeInput}. Use seconds (e.g., 390) or MM:SS (e.g., "6:30")`);
    }

    // Try parsing as a simple number
    const asNumber = parseFloat(trimmed);
    if (!isNaN(asNumber)) {
      return asNumber;
    }
  }

  throw new Error(`Invalid time format: ${timeInput}. Use seconds (e.g., 390) or MM:SS (e.g., "6:30")`);
}

/**
 * Check if FFmpeg is available
 * @returns {Promise<boolean>}
 */
function checkFFmpeg() {
  return new Promise((resolve, reject) => {
    exec(`"${ffmpegPath}" -version`, (error, stdout, stderr) => {
      if (error) {
        reject(new Error('FFmpeg is not available'));
      } else {
        resolve(true);
      }
    });
  });
}

/**
 * Convert MP3 to M4B with optional chapters using ffmpeg
 * @param {string} mp3Path - Path to input MP3 file
 * @param {string} outputPath - Path to output M4B file
 * @param {Array<{title: string, start_time: number, end_time?: number}>} chapters - Optional chapter markers
 * @param {Object} options - Optional settings
 * @param {string} options.audioQuality - Audio bitrate (e.g., '64k', '128k')
 * @param {Function} options.onProgress - Progress callback (percent, msg)
 * @returns {Promise<boolean>}
 */
async function convertMp3ToM4b(mp3Path, outputPath, chapters = null, options = {}) {
  const { spawn } = require('child_process');
  const audioQuality = options.audioQuality || '64k';
  const onProgress = options.onProgress || (() => { });

  return new Promise(async (resolve, reject) => {
    let chapterFile = null;
    const args = ['-hide_banner', '-loglevel', 'info', '-i', mp3Path];

    try {
      if (chapters && chapters.length > 0) {
        const outputDir = path.dirname(outputPath);
        chapterFile = path.join(outputDir, `chapters_${uuidv4()}.txt`);
        const chapterContent = ';FFMETADATA1\n' + chapters
          .map((chapter) => {
            const startTime = chapter.start_time;
            let endTime = chapter.end_time || (startTime + 0.001);
            if (endTime <= startTime) endTime = startTime + 0.001;
            return `[CHAPTER]\nTIMEBASE=1/1000\nSTART=${Math.floor(startTime * 1000)}\nEND=${Math.floor(endTime * 1000)}\ntitle=${chapter.title}\n\n`;
          }).join('');
        await fs.writeFile(chapterFile, chapterContent);
        args.push('-i', chapterFile, '-map_metadata', '1');
      }

      // Handle codec and bitrate
      if (audioQuality === 'copy') {
        args.push('-c:a', 'copy');
      } else {
        // Ensure it's a valid bitrate string (e.g. 64k, 128k)
        const validQuality = audioQuality.toString().match(/^\d+k$/) ? audioQuality : '128k';
        args.push('-c:a', 'aac', '-b:a', validQuality);
      }
      
      args.push('-y', outputPath);

      const ffmpeg = spawn(ffmpegPath, args);
      let duration = 0;

      let ffmpegErrorLog = '';
      ffmpeg.stderr.on('data', (data) => {
        const line = data.toString();
        ffmpegErrorLog += line;
        
        // Parse duration
        const durMatch = line.match(/Duration: (\d+):(\d+):(\d+)\.(\d+)/);
        if (durMatch) {
          duration = parseInt(durMatch[1]) * 3600 + parseInt(durMatch[2]) * 60 + parseInt(durMatch[3]) + parseInt(durMatch[4]) / 100;
        }

        // Parse time progress
        const timeMatch = line.match(/time=(\d+):(\d+):(\d+)\.(\d+)/);
        if (timeMatch && duration > 0) {
          const currentTime = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseInt(timeMatch[3]) + parseInt(timeMatch[4]) / 100;
          const percent = Math.min(99, (currentTime / duration) * 100);
          onProgress(percent, `Processing: ${Math.round(percent)}% complete`);
        }
      });

      ffmpeg.on('close', async (code) => {
        if (chapterFile) await fs.unlink(chapterFile).catch(() => { });
        if (code === 0) {
          onProgress(100, 'Conversion Complete');
          resolve(true);
        } else {
          console.error('FFmpeg Error Log:\n', ffmpegErrorLog);
          reject(new Error(`FFmpeg exited with code ${code}. Check server logs.`));
        }
      });
    } catch (err) {
      if (chapterFile) await fs.unlink(chapterFile).catch(() => { });
      reject(err);
    }
  });
}

/**
 * Fetch content from a URL (for remote M3U8 files)
 * @param {string} url - URL to fetch
 * @returns {Promise<string>}
 */
async function fetchUrlContent(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const req = protocol.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

/**
 * Parse M3U8 file content and extract stream URLs
 * @param {string} m3u8Path - Path to M3U8 file or URL string
 * @returns {Promise<{masterUrl?: string, segments: string[], baseUrl: string}>}
 */
async function parseM3U8(m3u8Path) {
  let content;

  // Check if it's a URL or local file
  if (m3u8Path.startsWith('http://') || m3u8Path.startsWith('https://')) {
    content = await fetchUrlContent(m3u8Path);
  } else {
    content = await fs.readFile(m3u8Path, 'utf-8');
  }

  const lines = content.split('\n').map(line => line.trim()).filter(line => line);
  const segments = [];
  let masterUrl = null;
  let baseUrl = '';

  // Determine base URL for relative paths
  if (m3u8Path.startsWith('http')) {
    const urlParts = m3u8Path.split('/');
    urlParts.pop();
    baseUrl = urlParts.join('/') + '/';
  } else {
    baseUrl = path.dirname(m3u8Path) + '/';
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip comments and empty lines
    if (line.startsWith('#') || !line) continue;

    // Check for EXT-X-STREAM-INF (master playlist)
    if (lines[i - 1] && lines[i - 1].startsWith('#EXT-X-STREAM-INF')) {
      masterUrl = line;
      continue;
    }

    // Add segment URL
    let segmentUrl = line;
    if (!segmentUrl.startsWith('http') && !segmentUrl.startsWith('/')) {
      segmentUrl = baseUrl + segmentUrl;
    }
    segments.push(segmentUrl);
  }

  return {
    masterUrl,
    segments,
    baseUrl,
    totalSegments: segments.length
  };
}

/**
 * Convert M4B/M4A to MP3 using ffmpeg
 * @param {string} inputPath - Path to input M4B/M4A file
 * @param {string} outputPath - Path to output MP3 file
 * @param {Object} options - Optional settings
 * @param {string} options.audioQuality - Audio bitrate (e.g., '128k', '192k')
 * @param {Function} options.onProgress - Progress callback
 * @returns {Promise<boolean>}
 */
async function convertM4bToMp3(inputPath, outputPath, options = {}) {
  const { spawn } = require('child_process');
  const audioQuality = options.audioQuality || '128k';
  const onProgress = options.onProgress || (() => { });

  return new Promise((resolve, reject) => {
    const args = ['-hide_banner', '-loglevel', 'info', '-i', inputPath, '-c:a', 'libmp3lame', '-b:a', audioQuality, '-y', outputPath];
    const ffmpeg = spawn(ffmpegPath, args);
    let duration = 0;

    ffmpeg.stderr.on('data', (data) => {
      const line = data.toString();
      
      // Parse duration
      const durMatch = line.match(/Duration: (\d+):(\d+):(\d+)\.(\d+)/);
      if (durMatch) {
        duration = parseInt(durMatch[1]) * 3600 + parseInt(durMatch[2]) * 60 + parseInt(durMatch[3]) + parseInt(durMatch[4]) / 100;
      }

      const timeMatch = line.match(/time=(\d+):(\d+):(\d+)\.(\d+)/);
      if (timeMatch && duration > 0) {
        const currentTime = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseInt(timeMatch[3]) + parseInt(timeMatch[4]) / 100;
        const percent = Math.min(99, (currentTime / duration) * 100);
        onProgress(percent, `Converting: ${Math.round(percent)}% complete`);
      }
    });

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        onProgress(100, 'Conversion Complete');
        resolve(true);
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });
  });
}

/**
 * Smart conversion function that handles both MP3 and M3U8
 */
async function smartConvert(params) {
  const { inputPath, outputPath, inputType, chapters, audioQuality, onProgress } = params;

  if (inputType === 'mp3') {
    return await convertMp3ToM4b(inputPath, outputPath, chapters, { audioQuality, onProgress });
  } else if (inputType === 'm4b') {
    return await convertM4bToMp3(inputPath, outputPath, { audioQuality, onProgress });
  } else {
    throw new Error(`Unsupported input type: ${inputType}`);
  }
}

module.exports = {
  parseTimeToSeconds,
  checkFFmpeg,
  convertMp3ToM4b,
  convertM4bToMp3,
  smartConvert,
  fetchUrlContent
};
