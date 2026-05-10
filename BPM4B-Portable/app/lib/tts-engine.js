/**
 * TTS Engine Module (OpenRouter API)
 * Generates speech audio from text using the OpenRouter API.
 * BPM4B - Professional Multimedia Converter
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

// Local Kokoro Engine — now powered by worker thread pool
// Lazy loaded to reduce startup memory
let poolInstance = null;

async function getPool() {
    if (!poolInstance) {
        const { getPool: _getPool } = await import('./tts-pool.js');
        poolInstance = await _getPool();
    }
    return poolInstance;
}

let modelInstance = null;
const MAX_CHUNK_LENGTH = 25000; // Increased to 25000 characters per chunk for better performance with fewer chunks

/**
 * Active cancellation tokens keyed by jobId.
 */
const cancellationTokens = new Map();

function cancelJob(jobId) { cancellationTokens.set(jobId, true); }
function isJobCancelled(jobId) { return cancellationTokens.get(jobId) === true; }
function clearJobToken(jobId) { cancellationTokens.delete(jobId); }

/**
 * Default TTS configuration
 */
const DEFAULT_CONFIG = {
    model: 'kokoro-82m',
    voice: 'af_heart',
    speed: 1.0,
    // Memory optimization settings
    optimize_for_memory: true,
    batch_size: 1, // Process one chunk at a time to reduce memory
    cleanup_after_chunk: true // Free memory after each chunk
};

/**
 * Available voices (OpenAI + Kokoro-82M)
 */
const AVAILABLE_VOICES = [
    // American English 🇺🇸 (lang_code='a')
    { id: 'af_heart', name: 'Heart (F) ❤️ [Grade A]', lang: '🇺🇸', traits: '🚺❤️', grade: 'A' },
    { id: 'af_alloy', name: 'Alloy (F) [Grade C]', lang: '🇺🇸', traits: '🚺', grade: 'C' },
    { id: 'af_aoede', name: 'Aoede (F) [Grade C+]', lang: '🇺🇸', traits: '🚺', grade: 'C+' },
    { id: 'af_bella', name: 'Bella (F) 🔥 [Grade A-]', lang: '🇺🇸', traits: '🚺🔥', grade: 'A-' },
    { id: 'af_jessica', name: 'Jessica (F) [Grade D]', lang: '🇺🇸', traits: '🚺', grade: 'D' },
    { id: 'af_kore', name: 'Kore (F) [Grade C+]', lang: '🇺🇸', traits: '🚺', grade: 'C+' },
    { id: 'af_nicole', name: 'Nicole (F) 🎧 [Grade B-]', lang: '🇺🇸', traits: '🚺🎧', grade: 'B-' },
    { id: 'af_nova', name: 'Nova (F) [Grade C]', lang: '🇺🇸', traits: '🚺', grade: 'C' },
    { id: 'af_river', name: 'River (F) [Grade D]', lang: '🇺🇸', traits: '🚺', grade: 'D' },
    { id: 'af_sarah', name: 'Sarah (F) [Grade C+]', lang: '🇺🇸', traits: '🚺', grade: 'C+' },
    { id: 'af_sky', name: 'Sky (F) [Grade C-]', lang: '🇺🇸', traits: '🚺', grade: 'C-' },
    { id: 'am_adam', name: 'Adam (M) [Grade F+]', lang: '🇺🇸', traits: '🚹', grade: 'F+' },
    { id: 'am_echo', name: 'Echo (M) [Grade D]', lang: '🇺🇸', traits: '🚹', grade: 'D' },
    { id: 'am_eric', name: 'Eric (M) [Grade D]', lang: '🇺🇸', traits: '🚹', grade: 'D' },
    { id: 'am_fenrir', name: 'Fenrir (M) [Grade C+]', lang: '🇺🇸', traits: '🚹', grade: 'C+' },
    { id: 'am_liam', name: 'Liam (M) [Grade D]', lang: '🇺🇸', traits: '🚹', grade: 'D' },
    { id: 'am_michael', name: 'Michael (M) [Grade C+]', lang: '🇺🇸', traits: '🚹', grade: 'C+' },
    { id: 'am_onyx', name: 'Onyx (M) [Grade D]', lang: '🇺🇸', traits: '🚹', grade: 'D' },
    { id: 'am_puck', name: 'Puck (M) [Grade C+]', lang: '🇺🇸', traits: '🚹', grade: 'C+' },
    { id: 'am_santa', name: 'Santa (M) [Grade D-]', lang: '🇺🇸', traits: '🚹', grade: 'D-' },

    // British English 🇬🇧 (lang_code='b')
    { id: 'bf_alice', name: 'Alice (F) [Grade D]', lang: '🇬🇧', traits: '🚺', grade: 'D' },
    { id: 'bf_emma', name: 'Emma (F) [Grade B-]', lang: '🇬🇧', traits: '🚺', grade: 'B-' },
    { id: 'bf_isabella', name: 'Isabella (F) [Grade C]', lang: '🇬🇧', traits: '🚺', grade: 'C' },
    { id: 'bf_lily', name: 'Lily (F) [Grade D]', lang: '🇬🇧', traits: '🚺', grade: 'D' },
    { id: 'bm_daniel', name: 'Daniel (M) [Grade D]', lang: '🇬🇧', traits: '🚹', grade: 'D' },
    { id: 'bm_fable', name: 'Fable (M) [Grade C]', lang: '🇬🇧', traits: '🚹', grade: 'C' },
    { id: 'bm_george', name: 'George (M) [Grade C]', lang: '🇬🇧', traits: '🚹', grade: 'C' },
    { id: 'bm_lewis', name: 'Lewis (M) [Grade D+]', lang: '🇬🇧', traits: '🚹', grade: 'D+' },

    // Japanese 🇯🇵 (lang_code='j')
    { id: 'jf_alpha', name: 'Alpha (F) [Grade C+]', lang: '🇯🇵', traits: '🚺', grade: 'C+' },
    { id: 'jf_gongitsune', name: 'Gongitsune (F) [Grade C]', lang: '🇯🇵', traits: '🚺', grade: 'C' },
    { id: 'jf_nezumi', name: 'Nezumi (F) [Grade C-]', lang: '🇯🇵', traits: '🚺', grade: 'C-' },
    { id: 'jf_tebukuro', name: 'Tebukuro (F) [Grade C]', lang: '🇯🇵', traits: '🚺', grade: 'C' },
    { id: 'jm_kumo', name: 'Kumo (M) [Grade C-]', lang: '🇯🇵', traits: '🚹', grade: 'C-' },

    // Mandarin Chinese 🇨🇳 (lang_code='z')
    { id: 'zf_xiaobei', name: 'Xiaobei (F) [Grade D]', lang: '🇨🇳', traits: '🚺', grade: 'D' },
    { id: 'zf_xiaoni', name: 'Xiaoni (F) [Grade D]', lang: '🇨🇳', traits: '🚺', grade: 'D' },
    { id: 'zf_xiaoxiao', name: 'Xiaoxiao (F) [Grade D]', lang: '🇨🇳', traits: '🚺', grade: 'D' },
    { id: 'zf_xiaoyi', name: 'Xiaoyi (F) [Grade D]', lang: '🇨🇳', traits: '🚺', grade: 'D' },
    { id: 'zm_yunjian', name: 'Yunjian (M) [Grade D]', lang: '🇨🇳', traits: '🚹', grade: 'D' },
    { id: 'zm_yunxi', name: 'Yunxi (M) [Grade D]', lang: '🇨🇳', traits: '🚹', grade: 'D' },
    { id: 'zm_yunxia', name: 'Yunxia (M) [Grade D]', lang: '🇨🇳', traits: '🚹', grade: 'D' },
    { id: 'zm_yunyang', name: 'Yunyang (M) [Grade D]', lang: '🇨🇳', traits: '🚹', grade: 'D' },

    // Spanish 🇪🇸 (lang_code='e')
    { id: 'ef_dora', name: 'Dora (F)', lang: '🇪🇸', traits: '🚺' },
    { id: 'em_alex', name: 'Alex (M)', lang: '🇪🇸', traits: '🚹' },
    { id: 'em_santa', name: 'Santa (M)', lang: '🇪🇸', traits: '🚹' },

    // French 🇫🇷 (lang_code='f')
    { id: 'ff_siwis', name: 'Siwis (F) [Grade B-]', lang: '🇫🇷', traits: '🚺', grade: 'B-' },

    // Hindi 🇮🇳 (lang_code='h')
    { id: 'hf_alpha', name: 'Alpha (F) [Grade C]', lang: '🇮🇳', traits: '🚺', grade: 'C' },
    { id: 'hf_beta', name: 'Beta (F) [Grade C]', lang: '🇮🇳', traits: '🚺', grade: 'C' },
    { id: 'hm_omega', name: 'Omega (M) [Grade C]', lang: '🇮🇳', traits: '🚹', grade: 'C' },
    { id: 'hm_psi', name: 'Psi (M) [Grade C]', lang: '🇮🇳', traits: '🚹', grade: 'C' },

    // Italian 🇮🇹 (lang_code='i')
    { id: 'if_sara', name: 'Sara (F) [Grade C]', lang: '🇮🇹', traits: '🚺', grade: 'C' },
    { id: 'im_nicola', name: 'Nicola (M) [Grade C]', lang: '🇮🇹', traits: '🚹', grade: 'C' },

    // Brazilian Portuguese 🇧🇷 (lang_code='p')
    { id: 'pf_dora', name: 'Dora (F)', lang: '🇧🇷', traits: '🚺' },
    { id: 'pm_alex', name: 'Alex (M)', lang: '🇧🇷', traits: '🚹' },
    { id: 'pm_santa', name: 'Santa (M)', lang: '🇧🇷', traits: '🚹' }
];

/**
 * Available TTS models via OpenRouter
 */
const AVAILABLE_MODELS = [
    { id: 'kokoro-82m', name: 'Kokoro-82M (Local)', description: 'High-quality local TTS engine' }
];

/**
 * Split text into chunks at sentence boundaries, each ≤ maxLength characters.
 * @param {string} text
 * @param {number} maxLength
 * @returns {string[]}
 */
/**
 * Split a large block of text into smaller chunks for the TTS engine.
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
 * Split text into fragments of (Narrator, Dialogue, Narrator...) based on quotes.
 * @param {string} text
 * @returns {Array<{text: string, isDialogue: boolean}>}
 */
function splitTextByQuotes(text) {
    const fragments = [];
    const quoteRegex = /"([^"]+)"|'([^']+)'/g; // Basic regex for double or single quotes

    let lastIndex = 0;
    let match;

    while ((match = quoteRegex.exec(text)) !== null) {
        // Add preceding narrative text
        if (match.index > lastIndex) {
            fragments.push({
                text: text.substring(lastIndex, match.index),
                isDialogue: false
            });
        }

        // Add dialogue text (the content inside quotes)
        fragments.push({
            text: match[1] || match[2],
            isDialogue: true
        });

        lastIndex = quoteRegex.lastIndex;
    }

    // Add remaining narrative text
    if (lastIndex < text.length) {
        fragments.push({
            text: text.substring(lastIndex),
            isDialogue: false
        });
    }

    return fragments.filter(f => f.text.trim().length > 0);
}

/**
 * Synthesize text using the worker thread pool.
 * Returns a WAV Buffer.
 */
async function ttsLocal(text, config) {
    const pool = await getPool();
    return pool.synthesize(text, config.voice || DEFAULT_CONFIG.voice, config.speed || DEFAULT_CONFIG.speed);
}

/**
 * Generate audio for a single chapter.
 * Submits ALL chunks to the worker pool simultaneously — no artificial batch limit.
 */
async function generateChapterAudio(chapterText, outputDir, config, onProgress = null, jobId = null, chapterIndex = 0) {
    const chapterId = chapterIndex + 1; // Use sequential numbering

    let allChunks; // Array of { text, voice }

    if (config.multiVoice && config.dialogueVoice) {
        const fragments = splitTextByQuotes(chapterText);
        allChunks = fragments.flatMap(fragment => {
            const voice = fragment.isDialogue ? config.dialogueVoice : config.voice;
            return splitTextIntoChunks(fragment.text).map(text => ({ text, voice }));
        });
    } else {
        allChunks = splitTextIntoChunks(chapterText).map(text => ({ text, voice: config.voice }));
    }

    if (jobId && isJobCancelled(jobId)) throw new Error('CANCELLED');

    // Submit ALL chunks to the pool at once — the pool queues and distributes across workers
    let completedChunks = 0;
    const promises = allChunks.map((chunk, i) =>
        ttsLocal(chunk.text, { ...config, voice: chunk.voice })
            .then(buf => {
                completedChunks++;
                if (onProgress) onProgress(completedChunks, allChunks.length, i);
                return buf;
            })
    );

    const audioBuffers = await Promise.all(promises);

    if (jobId && isJobCancelled(jobId)) throw new Error('CANCELLED');

    // Write results in order
    const chunkPaths = [];
    for (let i = 0; i < audioBuffers.length; i++) {
        const chunkPath = path.join(outputDir, `tts_chunk_${chapterId}_${i}.wav`);
        await fs.writeFile(chunkPath, audioBuffers[i]);
        chunkPaths.push(chunkPath);
    }

    if (chunkPaths.length === 1) {
        const finalPath = path.join(outputDir, `chapter_${chapterId}.wav`);
        await fs.rename(chunkPaths[0], finalPath);
        const duration = await getAudioDuration(finalPath);
        return { audioPath: finalPath, durationSeconds: duration };
    }

    const finalPath = path.join(outputDir, `chapter_${chapterId}.wav`);
    await concatenateAudioFiles(chunkPaths, finalPath);
    for (const p of chunkPaths) await fs.unlink(p).catch(() => { });

    const duration = await getAudioDuration(finalPath);
    return { audioPath: finalPath, durationSeconds: duration };
}

/**
 * Generate audio for ALL chapters — chapters run sequentially, chunks run in parallel.
 * Safe: only 2 model instances in RAM at any time.
 */
async function generateAllChapterAudio(chapters, outputDir, config, onProgress = null, jobId = null) {
    await fs.mkdir(outputDir, { recursive: true });

    // Warm up the pool before starting
    await getPool();

    const results = [];
    for (let i = 0; i < chapters.length; i++) {
        if (jobId && isJobCancelled(jobId)) {
            clearJobToken(jobId);
            throw new Error('CANCELLED');
        }

        const chapter = chapters[i];
        if (onProgress) onProgress(i, chapters.length, `Generating: ${chapter.title}`);

        const { audioPath, durationSeconds } = await generateChapterAudio(
            chapter.content,
            outputDir,
            config,
            (completedChunks, totalChunks, chunkIdx) => {
                if (onProgress) onProgress(i, chapters.length, `Chapter "${chapter.title}" - chunk ${completedChunks}/${totalChunks}`, completedChunks, totalChunks);
            },
            jobId,
            i // Pass chapter index for sequential naming
        );

        results.push({
            chapterTitle: chapter.title,
            chapterNumber: chapter.number,
            audioPath,
            durationSeconds
        });
    }

    clearJobToken(jobId);
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
                // Use -c copy to perfectly concatenate the raw PCM WAV chunks from Kokoro without re-encoding
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
    // ffprobe is typically alongside ffmpeg - use full path
    const ffprobePath = ffmpegPath.replace(/ffmpeg(\.exe)?$/, 'ffprobe$1');

    return new Promise((resolve, reject) => {
        // Try ffprobe first with full path
        const ffprobeCmd = `"${ffprobePath}" -v quiet -print_format json -show_format -show_streams "${audioPath}"`;
        
        exec(ffprobeCmd, (error, stdout, stderr) => {
            if (!error && stdout) {
                try {
                    const data = JSON.parse(stdout);
                    if (data.format && data.format.duration) {
                        resolve(parseFloat(data.format.duration));
                        return;
                    }
                } catch (e) {
                    // Fall through to ffmpeg method
                }
            }
            
            // Fallback: Use ffmpeg to get duration
            const ffmpegCmd = `"${ffmpegPath}" -i "${audioPath}" -hide_banner 2>&1`;
            exec(ffmpegCmd, (error, stdout, stderr) => {
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
    });
}

module.exports = {
    generateChapterAudio,
    generateAllChapterAudio,
    splitTextIntoChunks,
    concatenateAudioFiles,
    getAudioDuration,
    cancelJob,
    isJobCancelled,
    clearJobToken,
    AVAILABLE_VOICES,
    AVAILABLE_MODELS,
    DEFAULT_CONFIG
};
