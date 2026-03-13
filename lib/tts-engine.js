/**
 * TTS Engine Module (OpenRouter API)
 * Generates speech audio from text using the OpenRouter API.
 * BPM4B - Professional Multimedia Converter
 */

const https = require('https');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/audio/speech';
const MAX_CHUNK_LENGTH = 4000; // Characters per TTS request

/**
 * Default TTS configuration
 */
const DEFAULT_CONFIG = {
    model: 'openai/tts-1',
    voice: 'alloy',
    speed: 1.0,
    response_format: 'mp3'
};

/**
 * Available voices (OpenAI TTS via OpenRouter)
 */
const AVAILABLE_VOICES = [
    { id: 'alloy', name: 'Alloy', description: 'Neutral and balanced' },
    { id: 'echo', name: 'Echo', description: 'Warm and engaging' },
    { id: 'fable', name: 'Fable', description: 'Expressive and dynamic' },
    { id: 'onyx', name: 'Onyx', description: 'Deep and authoritative' },
    { id: 'nova', name: 'Nova', description: 'Friendly and upbeat' },
    { id: 'shimmer', name: 'Shimmer', description: 'Soft and clear' }
];

/**
 * Available TTS models via OpenRouter
 */
const AVAILABLE_MODELS = [
    { id: 'openai/tts-1', name: 'OpenAI TTS-1', description: 'Standard quality, faster' },
    { id: 'openai/tts-1-hd', name: 'OpenAI TTS-1 HD', description: 'High definition, slower' }
];

/**
 * Split text into chunks at sentence boundaries, each ≤ maxLength characters.
 * @param {string} text
 * @param {number} maxLength
 * @returns {string[]}
 */
function splitTextIntoChunks(text, maxLength = MAX_CHUNK_LENGTH) {
    if (text.length <= maxLength) return [text];

    const chunks = [];
    let remaining = text;

    while (remaining.length > 0) {
        if (remaining.length <= maxLength) {
            chunks.push(remaining);
            break;
        }

        // Find the last sentence boundary within maxLength
        let splitIndex = -1;
        const searchRange = remaining.substring(0, maxLength);

        // Try splitting at sentence endings (. ! ?)
        const sentenceEnds = ['. ', '! ', '? ', '.\n', '!\n', '?\n'];
        for (const end of sentenceEnds) {
            const lastIdx = searchRange.lastIndexOf(end);
            if (lastIdx > splitIndex) {
                splitIndex = lastIdx + end.length;
            }
        }

        // Fall back to paragraph break
        if (splitIndex <= 0) {
            const paraBreak = searchRange.lastIndexOf('\n\n');
            if (paraBreak > 0) splitIndex = paraBreak + 2;
        }

        // Fall back to newline
        if (splitIndex <= 0) {
            const newline = searchRange.lastIndexOf('\n');
            if (newline > 0) splitIndex = newline + 1;
        }

        // Fall back to space
        if (splitIndex <= 0) {
            const space = searchRange.lastIndexOf(' ');
            if (space > 0) splitIndex = space + 1;
        }

        // Last resort: hard split
        if (splitIndex <= 0) {
            splitIndex = maxLength;
        }

        chunks.push(remaining.substring(0, splitIndex).trim());
        remaining = remaining.substring(splitIndex).trim();
    }

    return chunks.filter(c => c.length > 0);
}

/**
 * Make a TTS API request to OpenRouter.
 * @param {string} text - Text to convert to speech
 * @param {Object} config - TTS config (apiKey, model, voice, speed, response_format)
 * @returns {Promise<Buffer>} - Audio data buffer
 */
function ttsRequest(text, config) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify({
            model: config.model || DEFAULT_CONFIG.model,
            input: text,
            voice: config.voice || DEFAULT_CONFIG.voice,
            speed: config.speed || DEFAULT_CONFIG.speed,
            response_format: config.response_format || DEFAULT_CONFIG.response_format
        });

        const url = new URL(OPENROUTER_API_URL);

        const options = {
            hostname: url.hostname,
            port: 443,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`,
                'HTTP-Referer': 'https://bpm4b.app',
                'X-Title': 'BPM4B Audiobook Generator',
                'Content-Length': Buffer.byteLength(payload)
            }
        };

        const req = https.request(options, (res) => {
            const chunks = [];

            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                const buffer = Buffer.concat(chunks);

                if (res.statusCode !== 200) {
                    // Try to parse error response
                    let errorMsg;
                    try {
                        const errorBody = JSON.parse(buffer.toString());
                        errorMsg = errorBody.error?.message || errorBody.error || `HTTP ${res.statusCode}`;
                    } catch {
                        errorMsg = `HTTP ${res.statusCode}: ${buffer.toString().substring(0, 200)}`;
                    }
                    reject(new Error(`OpenRouter TTS API error: ${errorMsg}`));
                    return;
                }

                resolve(buffer);
            });
        });

        req.on('error', (err) => {
            reject(new Error(`TTS request failed: ${err.message}`));
        });

        req.setTimeout(120000, () => {
            req.destroy();
            reject(new Error('TTS request timed out (120s)'));
        });

        req.write(payload);
        req.end();
    });
}

/**
 * Generate audio for a single chapter.
 * Splits long chapters into chunks, sends each to TTS API, and concatenates.
 * @param {string} chapterText - The chapter text
 * @param {string} outputDir - Directory to save temporary audio files
 * @param {Object} config - TTS config including apiKey
 * @param {Function} onProgress - Progress callback (chunkIndex, totalChunks)
 * @returns {Promise<{audioPath: string, durationSeconds: number}>}
 */
async function generateChapterAudio(chapterText, outputDir, config, onProgress = null) {
    const chunks = splitTextIntoChunks(chapterText);
    const chunkAudioPaths = [];
    const chapterId = uuidv4();

    for (let i = 0; i < chunks.length; i++) {
        if (onProgress) onProgress(i, chunks.length);

        const audioBuffer = await ttsRequest(chunks[i], config);
        const chunkPath = path.join(outputDir, `tts_chunk_${chapterId}_${i}.mp3`);
        await fs.writeFile(chunkPath, audioBuffer);
        chunkAudioPaths.push(chunkPath);
    }

    // If only one chunk, just return it
    if (chunkAudioPaths.length === 1) {
        const finalPath = path.join(outputDir, `chapter_${chapterId}.mp3`);
        await fs.rename(chunkAudioPaths[0], finalPath);
        const duration = await getAudioDuration(finalPath);
        return { audioPath: finalPath, durationSeconds: duration };
    }

    // Concatenate multiple chunks using ffmpeg
    const finalPath = path.join(outputDir, `chapter_${chapterId}.mp3`);
    await concatenateAudioFiles(chunkAudioPaths, finalPath);

    // Cleanup chunk files
    for (const chunkPath of chunkAudioPaths) {
        await fs.unlink(chunkPath).catch(() => { });
    }

    const duration = await getAudioDuration(finalPath);
    return { audioPath: finalPath, durationSeconds: duration };
}

/**
 * Generate audio for all chapters.
 * @param {Array<{number: number, title: string, content: string}>} chapters
 * @param {string} outputDir
 * @param {Object} config - Must include apiKey
 * @param {Function} onProgress - (chapterIndex, totalChapters, status)
 * @returns {Promise<Array<{chapterTitle: string, audioPath: string, durationSeconds: number}>>}
 */
async function generateAllChapterAudio(chapters, outputDir, config, onProgress = null) {
    const results = [];

    await fs.mkdir(outputDir, { recursive: true });

    for (let i = 0; i < chapters.length; i++) {
        const chapter = chapters[i];

        if (onProgress) {
            onProgress(i, chapters.length, `Generating audio for: ${chapter.title}`);
        }

        const { audioPath, durationSeconds } = await generateChapterAudio(
            chapter.content,
            outputDir,
            config,
            (chunkIdx, totalChunks) => {
                if (onProgress) {
                    onProgress(i, chapters.length, `Chapter "${chapter.title}" - chunk ${chunkIdx + 1}/${totalChunks}`);
                }
            }
        );

        results.push({
            chapterTitle: chapter.title,
            chapterNumber: chapter.number,
            audioPath,
            durationSeconds
        });
    }

    return results;
}

/**
 * Concatenate multiple audio files using ffmpeg.
 * @param {string[]} inputPaths
 * @param {string} outputPath
 * @returns {Promise<void>}
 */
function concatenateAudioFiles(inputPaths, outputPath) {
    const { exec } = require('child_process');
    const ffmpegPath = require('ffmpeg-static');

    return new Promise((resolve, reject) => {
        // Create concat file list
        const concatListPath = outputPath + '.list.txt';
        const concatContent = inputPaths.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n');

        fs.writeFile(concatListPath, concatContent)
            .then(() => {
                const cmd = `"${ffmpegPath}" -f concat -safe 0 -i "${concatListPath}" -c copy "${outputPath}" -y`;

                exec(cmd, (error, stdout, stderr) => {
                    // Cleanup list file
                    fs.unlink(concatListPath).catch(() => { });

                    if (error) {
                        reject(new Error(`Audio concatenation failed: ${stderr || error.message}`));
                    } else {
                        resolve();
                    }
                });
            })
            .catch(reject);
    });
}

/**
 * Get audio duration using ffprobe.
 * @param {string} audioPath
 * @returns {Promise<number>} Duration in seconds
 */
function getAudioDuration(audioPath) {
    const { exec } = require('child_process');
    const ffmpegPath = require('ffmpeg-static');
    // ffprobe is typically alongside ffmpeg
    const ffprobePath = ffmpegPath.replace(/ffmpeg(\.exe)?$/, 'ffprobe$1');

    return new Promise((resolve, reject) => {
        // Try ffprobe first, fall back to ffmpeg
        const cmd = `"${ffmpegPath}" -i "${audioPath}" -hide_banner 2>&1`;

        exec(cmd, (error, stdout, stderr) => {
            const output = stdout + stderr;
            const durationMatch = output.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/);

            if (durationMatch) {
                const hours = parseInt(durationMatch[1]);
                const minutes = parseInt(durationMatch[2]);
                const seconds = parseInt(durationMatch[3]);
                const ms = parseInt(durationMatch[4]);
                resolve(hours * 3600 + minutes * 60 + seconds + ms / 100);
            } else {
                // If we can't determine duration, estimate based on text length
                // (~150 words per minute, ~5 chars per word)
                resolve(0);
            }
        });
    });
}

module.exports = {
    generateChapterAudio,
    generateAllChapterAudio,
    splitTextIntoChunks,
    concatenateAudioFiles,
    getAudioDuration,
    AVAILABLE_VOICES,
    AVAILABLE_MODELS,
    DEFAULT_CONFIG
};
