/**
 * Core functions shared between the main app and API endpoints.
 * BPM4B - MP3 to M4B Audiobook Converter
 */

const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const ffmpegPath = require('ffmpeg-static');

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
 * @returns {Promise<boolean>}
 */
async function convertMp3ToM4b(mp3Path, outputPath, chapters = null) {
  return new Promise((resolve, reject) => {
    // Build ffmpeg command using bundled ffmpeg binary
    const cmd = [ffmpegPath, '-i', mp3Path, '-c:a', 'aac', '-b:a', '64k'];

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

module.exports = {
  parseTimeToSeconds,
  checkFFmpeg,
  convertMp3ToM4b
};
