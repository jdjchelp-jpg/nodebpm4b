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
 * @param {Object} options.metadata - Optional metadata {title, author, genre}
 * @param {string} options.coverPath - Optional path to cover image
 * @param {Function} options.onProgress - Progress callback (percent, msg)
 * @returns {Promise<boolean>}
 */
async function convertMp3ToM4b(mp3Path, outputPath, chapters = null, options = {}) {
  const { spawn } = require('child_process');
  const audioQuality = options.audioQuality || '64k';
  const onProgress = options.onProgress || (() => { });

  return new Promise(async (resolve, reject) => {
    let chapterFile = null;
    const args = ['-hide_banner', '-loglevel', 'verbose', '-i', mp3Path];

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

      // Add cover art as an input if provided
      if (options.coverPath) {
        args.push('-i', options.coverPath);
      }

      // Map audio from first input
      args.push('-map', '0:a');

      // If cover art provided, map it as attached picture
      if (options.coverPath) {
        // Determine cover input index: if chapters were added, cover is input 2; otherwise input 1
        const coverInputIndex = (chapters && chapters.length > 0) ? 2 : 1;
        args.push('-map', `${coverInputIndex}:v`, '-c:v', 'copy', '-disposition:v:0', 'attached_pic');
      }

      // Add general metadata
      if (options.metadata) {
        if (options.metadata.title) args.push('-metadata', `title=${options.metadata.title}`);
        if (options.metadata.author) args.push('-metadata', `artist=${options.metadata.author}`);
        if (options.metadata.genre) args.push('-metadata', `genre=${options.metadata.genre}`);
        if (options.metadata.description) args.push('-metadata', `comment=${options.metadata.description}`);
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

      // Handle stdout to prevent deadlock
      ffmpeg.stdout.on('data', () => { });

      // Handle process errors
      ffmpeg.on('error', (err) => {
        console.error('FFmpeg process error:', err);
        reject(new Error(`FFmpeg process error: ${err.message}`));
      });

      // Set a timeout to prevent hanging
      const timeout = setTimeout(() => {
        ffmpeg.kill('SIGTERM');
        reject(new Error('FFmpeg process timed out after 5 minutes'));
      }, 5 * 60 * 1000);

      ffmpeg.on('close', async (code) => {
        clearTimeout(timeout);
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
    const args = ['-hide_banner', '-loglevel', 'verbose', '-i', inputPath, '-c:a', 'libmp3lame', '-b:a', audioQuality, '-y', outputPath];
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

    // Handle stdout to prevent deadlock
    ffmpeg.stdout.on('data', () => { });

    // Handle process errors
    ffmpeg.on('error', (err) => {
      console.error('FFmpeg process error:', err);
      reject(new Error(`FFmpeg process error: ${err.message}`));
    });

    // Set a timeout to prevent hanging
    const timeout = setTimeout(() => {
      ffmpeg.kill('SIGTERM');
      reject(new Error('FFmpeg process timed out after 5 minutes'));
    }, 5 * 60 * 1000);

    ffmpeg.on('close', (code) => {
      clearTimeout(timeout);
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

/**
 * Detect silence in an audio file using FFmpeg
 * @param {string} inputPath
 * @param {Object} options
 * @param {number} options.noise - Noise threshold in dB (default: -30)
 * @param {number} options.duration - Minimum silence duration in seconds (default: 2.0)
 * @returns {Promise<Array<{start: number, end: number, duration: number}>>}
 */
async function detectSilence(inputPath, options = {}) {
  const noise = options.noise || -30;
  const duration = options.duration || 2.0;

  return new Promise((resolve, reject) => {
    const args = [
      '-hide_banner',
      '-i', inputPath,
      '-af', `silencedetect=n=${noise}dB:d=${duration}`,
      '-f', 'null',
      '-'
    ];

    exec(`"${ffmpegPath}" ${args.join(' ')}`, (error, stdout, stderr) => {
      // FFmpeg outputs silencedetect info to stderr
      const output = stderr;
      const silences = [];

      const startRegex = /silence_start: (\d+(\.\d+)?)/g;
      const endRegex = /silence_end: (\d+(\.\d+)?)/g;
      const durationRegex = /silence_duration: (\d+(\.\d+)?)/g;

      let startMatch;
      while ((startMatch = startRegex.exec(output)) !== null) {
        const endMatch = endRegex.exec(output);
        const durMatch = durationRegex.exec(output);

        if (endMatch) {
          silences.push({
            start: parseFloat(startMatch[1]),
            end: parseFloat(endMatch[1]),
            duration: durMatch ? parseFloat(durMatch[1]) : (parseFloat(endMatch[1]) - parseFloat(startMatch[1]))
          });
        }
      }

      resolve(silences);
    });
  });
}

/**
 * Get duration of an audio file in seconds
 * @param {string} inputPath
 * @returns {Promise<number>}
 */
async function getAudioDuration(inputPath) {
  return new Promise((resolve, reject) => {
    const args = ['-hide_banner', '-i', inputPath, '-f', 'null', '-'];
    exec(`"${ffmpegPath}" ${args.join(' ')}`, (error, stdout, stderr) => {
      const match = stderr.match(/Duration: (\d+):(\d+):(\d+)\.(\d+)/);
      if (match) {
        const duration = parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]) + parseInt(match[4]) / 100;
        resolve(duration);
      } else {
        reject(new Error('Could not parse duration'));
      }
    });
  });
}

/**
 * Merge multiple audio files into a single M4B with chapters
 * @param {Array<string>} inputPaths
 * @param {string} outputPath
 * @param {Object} options
 */
async function audioGlue(inputPaths, outputPath, options = {}) {
  const { metadata, coverPath, onProgress } = options;
  const tempDir = path.dirname(outputPath);
  const concatFile = path.join(tempDir, `concat_${uuidv4()}.txt`);

  try {
    // 1. Calculate chapters and create concat file
    let cumulativeTime = 0;
    const chapters = [];
    let concatContent = '';

    for (let i = 0; i < inputPaths.length; i++) {
      if (onProgress) onProgress(Math.round((i / inputPaths.length) * 20), `Preparing file ${i + 1}/${inputPaths.length}...`);

      const duration = await getAudioDuration(inputPaths[i]);
      // Use original filename if available, otherwise use the basename
      const fileName = inputPaths[i].originalName || path.basename(inputPaths[i], path.extname(inputPaths[i]));

      chapters.push({
        title: fileName.replace(/[_-]/g, ' '),
        start_time: cumulativeTime,
        end_time: cumulativeTime + duration
      });

      // FFmpeg concat demuxer requires escaped paths
      // Convert backslashes to forward slashes for Windows compatibility
      const normalizedPath = inputPaths[i].replace(/\\/g, '/');
      const escapedPath = normalizedPath.replace(/'/g, "'\\''");
      concatContent += `file '${escapedPath}'\n`;
      cumulativeTime += duration;
    }

    await fs.writeFile(concatFile, concatContent);

    // 2. Perform merge using convertMp3ToM4b with the concat file as source
    // But convertMp3ToM4b uses -i source, so we need to tweak it or use a custom command
    // Actually, we can just call convertMp3ToM4b but we need a source that FFmpeg understands
    // Let's implement a specialized version or use a temp merged WAV.
    // Concating to WAV first is safest for different bitrates/encodings.

    const mergedWav = path.join(tempDir, `merged_${uuidv4()}.wav`);
    if (onProgress) onProgress(25, 'Merging audio streams...');

    await new Promise((resolve, reject) => {
      // Always re-encode to ensure compatibility across different input formats
      const args = ['-f', 'concat', '-safe', '0', '-i', concatFile, '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2', mergedWav];
      const ffmpeg = exec(`"${ffmpegPath}" ${args.join(' ')}`, (err) => {
        if (err) {
          reject(new Error(`Audio concatenation failed: ${err.message}`));
        } else {
          resolve();
        }
      });
    });

    if (onProgress) onProgress(75, 'Encoding final MP3...');

    // Convert merged WAV to MP3
    await new Promise((resolve, reject) => {
      const args = ['-i', mergedWav, '-c:a', 'libmp3lame', '-b:a', '128k', '-ar', '44100', '-ac', '2', outputPath];
      const ffmpeg = exec(`"${ffmpegPath}" ${args.join(' ')}`, (err) => {
        if (err) {
          reject(new Error(`MP3 encoding failed: ${err.message}`));
        } else {
          resolve();
        }
      });
    });

    // Cleanup
    await fs.unlink(concatFile).catch(() => { });
    await fs.unlink(mergedWav).catch(() => { });

    return true;
  } catch (err) {
    await fs.unlink(concatFile).catch(() => { });
    throw err;
  }
}

module.exports = {
  parseTimeToSeconds,
  checkFFmpeg,
  convertMp3ToM4b,
  convertM4bToMp3,
  smartConvert,
  detectSilence,
  audioGlue,
  getAudioDuration,
  fetchUrlContent
};
