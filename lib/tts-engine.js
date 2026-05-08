/**
 * TTS Engine Module (OpenRouter API)
 * Generates speech audio from text using the OpenRouter API.
 * BPM4B - Professional Multimedia Converter
 */

const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Local Kokoro Engine
let Kokoro;
try {
    Kokoro = require('kokoro-js').KokoroTTS;
} catch (e) {
    console.warn('Warning: kokoro-js not found, local TTS will not work.');
}

let modelInstance = null;
const MAX_CHUNK_LENGTH = 1000; // Efficient chunk size for local CPU synthesis

/**
 * Default TTS configuration
 */
const DEFAULT_CONFIG = {
    model: 'kokoro-82m',
    voice: 'af_heart',
    speed: 1.0
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
 * Initialize the Kokoro model.
 */
async function initModel() {
    if (!Kokoro) throw new Error('Kokoro-js is not installed.');
    if (modelInstance) return modelInstance;

    try {
        console.log('Initializing Kokoro Local TTS (First run downloads weights)...');
        modelInstance = await Kokoro.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
            dtype: "fp32", // Adjust based on user hardware if needed
        });
        return modelInstance;
    } catch (error) {
        console.error('Failed to initialize Kokoro-82M:', error);
        throw new Error('Failed to initialize Kokoro-82M. Please ensure kokoro-js is correctly installed and dependencies are met.');
    }
}

/**
 * Generate audio buffer using local Kokoro.
 */
async function ttsLocal(text, config) {
    const model = await initModel();
    let voice = config.voice || DEFAULT_CONFIG.voice;

    const result = await model.generate(text, {
        voice,
        speed: config.speed || DEFAULT_CONFIG.speed
    });

    // Kokoro-js returns { audio: Float32Array, sampling_rate: number }
    return createWavBuffer(result.audio, result.sampling_rate);
}

/**
 * Helper to wrap raw audio in a WAV container.
 */
function createWavBuffer(audioArray, sampleRate) {
    const numChannels = 1;
    const bytesPerSample = 2; // 16-bit PCM
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = audioArray.length * bytesPerSample;
    const buffer = Buffer.alloc(44 + dataSize);

    // RIFF header
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8);

    // fmt chunk
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20); // PCM
    buffer.writeUInt16LE(numChannels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(byteRate, 28);
    buffer.writeUInt16LE(blockAlign, 32);
    buffer.writeUInt16LE(16, 34); // Bits per sample

    // data chunk
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);

    // Write samples
    for (let i = 0; i < audioArray.length; i++) {
        const sample = Math.max(-1, Math.min(1, audioArray[i]));
        const val = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        buffer.writeInt16LE(Math.floor(val), 44 + i * 2);
    }

    return buffer;
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
    const chapterId = uuidv4();
    const chunkAudioPaths = [];

    if (config.multiVoice && config.dialogueVoice) {
        // Multi-voice logic
        const fragments = splitTextByQuotes(chapterText);

        for (let i = 0; i < fragments.length; i++) {
            if (onProgress) onProgress(i, fragments.length);

            const fragment = fragments[i];
            const voice = fragment.isDialogue ? config.dialogueVoice : config.voice;

            // Still need to chunk very long fragments
            const subChunks = splitTextIntoChunks(fragment.text);
            for (let j = 0; j < subChunks.length; j++) {
                const audioBuffer = await ttsLocal(subChunks[j], { ...config, voice });
                const chunkPath = path.join(outputDir, `tts_chunk_${chapterId}_f${i}_c${j}.wav`);
                await fs.writeFile(chunkPath, audioBuffer);
                chunkAudioPaths.push(chunkPath);
            }
        }
    } else {
        // Standard single voice logic
        const chunks = splitTextIntoChunks(chapterText);
        for (let i = 0; i < chunks.length; i++) {
            if (onProgress) onProgress(i, chunks.length);

            const audioBuffer = await ttsLocal(chunks[i], config);
            const chunkPath = path.join(outputDir, `tts_chunk_${chapterId}_${i}.wav`);
            await fs.writeFile(chunkPath, audioBuffer);
            chunkAudioPaths.push(chunkPath);
        }
    }

    // If only one chunk, just return it
    if (chunkAudioPaths.length === 1) {
        const finalPath = path.join(outputDir, `chapter_${chapterId}.wav`);
        await fs.rename(chunkAudioPaths[0], finalPath);
        const duration = await getAudioDuration(finalPath);
        return { audioPath: finalPath, durationSeconds: duration };
    }

    // Concatenate multiple chunks using ffmpeg
    const finalPath = path.join(outputDir, `chapter_${chapterId}.wav`);
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
                // Always re-encode to ensure compatibility across different input formats
                const cmd = `"${ffmpegPath}" -f concat -safe 0 -i "${concatListPath}" -c:a aac -b:a 128k -ar 44100 -ac 2 "${outputPath}" -y`;

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
