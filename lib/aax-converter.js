/**
 * AAX Converter Module
 * Converts Audible AAX files to M4B or M4A format using ffmpeg,
 * preserving chapters, cover art, and metadata.
 * BPM4B - Professional Multimedia Converter
 */

const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const ffmpegPath = require('ffmpeg-static');

/**
 * Validate activation bytes format (should be 8 hex characters).
 * @param {string} activationBytes
 * @returns {boolean}
 */
function validateActivationBytes(activationBytes) {
    return /^[0-9a-fA-F]{8}$/.test(activationBytes.trim());
}

/**
 * Convert an Audible AAX file to M4B or M4A.
 *
 * Uses ffmpeg with activation_bytes to decrypt and convert.
 * Preserves chapter metadata and cover art.
 *
 * @param {string} inputPath - Path to the AAX file
 * @param {string} outputPath - Path for the output file (.m4b or .m4a)
 * @param {string} activationBytes - 8-character hex activation bytes
 * @param {Object} options
 * @param {boolean} options.extractCover - Extract cover art as separate image (default: false)
 * @param {string} options.coverOutputPath - Path to save cover art (default: alongside output)
 * @returns {Promise<{success: boolean, outputPath: string, coverPath?: string}>}
 */
async function convertAAX(inputPath, outputPath, activationBytes, options = {}) {
    const { extractCover = false, coverOutputPath = null } = options;

    // Validate inputs
    if (!activationBytes || !validateActivationBytes(activationBytes)) {
        throw new Error('Invalid activation bytes. Must be 8 hexadecimal characters (e.g., "1a2b3c4d").');
    }

    const trimmedBytes = activationBytes.trim();

    // Build the ffmpeg command
    // -activation_bytes: decrypt the AAX
    // -c copy: copy streams without re-encoding (preserves quality)
    // -map_metadata 0: preserve all metadata including chapters
    // -map_chapters 0: explicitly map chapters from input
    const cmd = [
        `"${ffmpegPath}"`,
        `-activation_bytes ${trimmedBytes}`,
        `-i "${inputPath}"`,
        '-c copy',
        '-map_metadata 0',
        '-map_chapters 0',
        `-y "${outputPath}"`
    ].join(' ');

    return new Promise((resolve, reject) => {
        exec(cmd, { maxBuffer: 1024 * 1024 * 10 }, async (error, stdout, stderr) => {
            if (error) {
                // Check for common error patterns
                if (stderr && stderr.includes('activation_bytes')) {
                    reject(new Error('Invalid activation bytes. The AAX file could not be decrypted. Please verify your activation bytes.'));
                } else {
                    reject(new Error(`AAX conversion failed: ${stderr || error.message}`));
                }
                return;
            }

            const result = { success: true, outputPath };

            // Optionally extract cover art
            if (extractCover) {
                try {
                    const coverPath = coverOutputPath ||
                        outputPath.replace(/\.[^.]+$/, '_cover.jpg');

                    await extractCoverArt(inputPath, coverPath, trimmedBytes);
                    result.coverPath = coverPath;
                } catch (coverErr) {
                    console.error('Warning: Could not extract cover art:', coverErr.message);
                    // Don't fail the whole conversion for cover art
                }
            }

            resolve(result);
        });
    });
}

/**
 * Extract cover art from an AAX file.
 * @param {string} inputPath - AAX file path
 * @param {string} coverPath - Output cover image path
 * @param {string} activationBytes - Hex activation bytes
 * @returns {Promise<void>}
 */
function extractCoverArt(inputPath, coverPath, activationBytes) {
    return new Promise((resolve, reject) => {
        const cmd = [
            `"${ffmpegPath}"`,
            `-activation_bytes ${activationBytes}`,
            `-i "${inputPath}"`,
            '-an',           // No audio
            '-vcodec copy',  // Copy the embedded image
            `-y "${coverPath}"`
        ].join(' ');

        exec(cmd, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(`Cover art extraction failed: ${stderr || error.message}`));
            } else {
                resolve();
            }
        });
    });
}

/**
 * Get metadata from an AAX file (chapters, duration, title, author).
 * @param {string} inputPath - AAX file path
 * @param {string} activationBytes - Hex activation bytes
 * @returns {Promise<{title: string, author: string, duration: number, chapters: Array}>}
 */
function getAAXMetadata(inputPath, activationBytes) {
    return new Promise((resolve, reject) => {
        if (!validateActivationBytes(activationBytes)) {
            reject(new Error('Invalid activation bytes'));
            return;
        }

        const cmd = [
            `"${ffmpegPath}"`,
            `-activation_bytes ${activationBytes.trim()}`,
            `-i "${inputPath}"`,
            '-hide_banner',
            '-f ffmetadata -'
        ].join(' ');

        exec(cmd, { maxBuffer: 1024 * 1024 * 5 }, (error, stdout, stderr) => {
            // ffmpeg outputs metadata info to stderr even on "error" (since we're not producing output)
            const output = (stdout || '') + (stderr || '');

            const metadata = {
                title: '',
                author: '',
                duration: 0,
                chapters: []
            };

            // Parse title
            const titleMatch = output.match(/title\s*:\s*(.+)/i);
            if (titleMatch) metadata.title = titleMatch[1].trim();

            // Parse artist/author
            const authorMatch = output.match(/artist\s*:\s*(.+)/i);
            if (authorMatch) metadata.author = authorMatch[1].trim();

            // Parse duration
            const durationMatch = output.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/);
            if (durationMatch) {
                metadata.duration = parseInt(durationMatch[1]) * 3600 +
                    parseInt(durationMatch[2]) * 60 +
                    parseInt(durationMatch[3]);
            }

            // Parse chapters
            const chapterRegex = /Chapter #\d+[:.]\d+: start (\d+\.?\d*), end (\d+\.?\d*)/g;
            const titleRegex = /title\s*:\s*(.+)/gi;
            let chapterMatch;
            const chapterStarts = [];

            while ((chapterMatch = chapterRegex.exec(output)) !== null) {
                chapterStarts.push({
                    start: parseFloat(chapterMatch[1]),
                    end: parseFloat(chapterMatch[2])
                });
            }

            // Try to match chapter titles
            let titleIdx = 0;
            const titles = [];
            while ((chapterMatch = titleRegex.exec(output)) !== null) {
                titles.push(chapterMatch[1].trim());
            }

            // Build chapter list
            for (let i = 0; i < chapterStarts.length; i++) {
                metadata.chapters.push({
                    title: titles[i + 1] || `Chapter ${i + 1}`, // +1 because first title is usually the book title
                    start_time: chapterStarts[i].start,
                    end_time: chapterStarts[i].end
                });
            }

            resolve(metadata);
        });
    });
}

module.exports = {
    convertAAX,
    extractCoverArt,
    getAAXMetadata,
    validateActivationBytes
};
