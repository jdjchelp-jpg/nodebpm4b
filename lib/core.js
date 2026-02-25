/**
 * Core functions shared between the main app and API endpoints.
 * BPM4B - Professional Multimedia Converter v7.0.0
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
 * @returns {Promise<boolean>}
 */
async function convertMp3ToM4b(mp3Path, outputPath, chapters = null, options = {}) {
  const audioQuality = options.audioQuality || '64k';

  return new Promise((resolve, reject) => {
    // Build ffmpeg command using bundled ffmpeg binary
    const cmd = [ffmpegPath, '-i', mp3Path, '-c:a', 'aac', '-b:a', audioQuality];

    // Add chapter metadata if provided
    if (chapters && chapters.length > 0) {
      // Create a chapter file for ffmpeg
      const outputDir = path.dirname(outputPath);
      const chapterFile = path.join(outputDir, `chapters_${uuidv4()}.txt`);

      const chapterContent = ';FFMETADATA1\n' + chapters
        .map((chapter, i) => {
          const startTime = chapter.start_time;
          const endTime = i < chapters.length - 1 ? chapter.end_time : null;

          let content = `[CHAPTER]\nTIMEBASE=1/1000\nSTART=${Math.floor(startTime * 1000)}\n`;
          if (endTime) {
            content += `END=${Math.floor(endTime * 1000)}\n`;
          }
          content += `title=${chapter.title}\n\n`;
          return content;
        })
        .join('');

      fs.writeFile(chapterFile, chapterContent)
        .then(() => {
          cmd.push('-i', chapterFile, '-map_metadata', '1');
          cmd.push(outputPath);

          // Run ffmpeg
          exec(cmd.join(' '), (error, stdout, stderr) => {
            // Cleanup chapter file
            fs.unlink(chapterFile).catch(() => { });

            if (error) {
              reject(new Error(`FFmpeg error: ${stderr || error.message}`));
            } else {
              resolve(true);
            }
          });
        })
        .catch(reject);
    } else {
      cmd.push(outputPath);

      // Run ffmpeg without chapters
      exec(cmd.join(' '), (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`FFmpeg error: ${stderr || error.message}`));
        } else {
          resolve(true);
        }
      });
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
 * Convert M3U8 stream to MKV with optional embedded chapters
 * @param {string} m3u8Path - Path to M3U8 file or URL
 * @param {string} outputPath - Path to output MKV file
 * @param {Array<{title: string, start_time: number, end_time?: number}>} chapters - Optional chapter markers
 * @param {Object} options - Optional settings
 * @param {string} options.audioQuality - Audio bitrate (e.g., '64k', '128k', '192k')
 * @returns {Promise<boolean>}
 */
async function convertM3U8ToMkv(m3u8Path, outputPath, chapters = null, options = {}) {
  const audioQuality = options.audioQuality || '128k';

  return new Promise((resolve, reject) => {
    // Build ffmpeg command - ffmpeg can directly handle M3U8 playlists
    const cmd = [ffmpegPath, '-i', m3u8Path];

    // Add codec settings for MKV
    cmd.push('-c:v', 'copy'); // Copy video codec (no re-encode)
    cmd.push('-c:a', 'aac');  // Encode audio to AAC
    cmd.push('-b:a', audioQuality); // Audio bitrate for MKV

    // Add chapter metadata if provided
    if (chapters && chapters.length > 0) {
      const outputDir = path.dirname(outputPath);
      const chapterFile = path.join(outputDir, `chapters_${uuidv4()}.txt`);

      const chapterContent = ';FFMETADATA1\n' + chapters
        .map((chapter, i) => {
          const startTime = chapter.start_time;
          const endTime = i < chapters.length - 1 ? chapter.end_time : null;

          let content = `[CHAPTER]\nTIMEBASE=1/1000\nSTART=${Math.floor(startTime * 1000)}\n`;
          if (endTime) {
            content += `END=${Math.floor(endTime * 1000)}\n`;
          }
          content += `title=${chapter.title}\n\n`;
          return content;
        })
        .join('');

      fs.writeFile(chapterFile, chapterContent)
        .then(() => {
          cmd.push('-i', chapterFile);
          cmd.push('-map_metadata', '1');
          cmd.push('-c', 'copy'); // Copy all streams including chapters
          cmd.push(outputPath);

          // Run ffmpeg
          exec(cmd.join(' '), (error, stdout, stderr) => {
            // Cleanup chapter file
            fs.unlink(chapterFile).catch(() => { });

            if (error) {
              reject(new Error(`FFmpeg error: ${stderr || error.message}`));
            } else {
              resolve(true);
            }
          });
        })
        .catch(reject);
    } else {
      cmd.push('-c', 'copy');
      cmd.push(outputPath);

      // Run ffmpeg without chapters
      exec(cmd.join(' '), (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`FFmpeg error: ${stderr || error.message}`));
        } else {
          resolve(true);
        }
      });
    }
  });
}

/**
 * Smart conversion function that handles both MP3 and M3U8
 * @param {Object} params - Conversion parameters
 * @param {string} params.inputPath - Input file path or URL
 * @param {string} params.outputPath - Output file path
 * @param {string} params.inputType - 'mp3' or 'm3u8'
 * @param {Array} params.chapters - Optional chapters
 * @param {string} params.audioQuality - Audio bitrate (e.g., '64k', '128k')
 * @returns {Promise<boolean>}
 */
async function smartConvert(params) {
  const { inputPath, outputPath, inputType, chapters, audioQuality = '128k' } = params;

  if (inputType === 'mp3') {
    // Use existing MP3 to M4B conversion
    return await convertMp3ToM4b(inputPath, outputPath, chapters, { audioQuality });
  } else if (inputType === 'm3u8') {
    // Use new M3U8 to MKV conversion
    return await convertM3U8ToMkv(inputPath, outputPath, chapters, { audioQuality });
  } else {
    throw new Error(`Unsupported input type: ${inputType}`);
  }
}

module.exports = {
  parseTimeToSeconds,
  checkFFmpeg,
  convertMp3ToM4b,
  parseM3U8,
  convertM3U8ToMkv,
  smartConvert,
  fetchUrlContent
};
