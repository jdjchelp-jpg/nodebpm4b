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
const MAX_CHUNK_LENGTH = 1000; // Reddit recommended: 500-1000 chars for local stability

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

        // Fall back to last word boundary (guarantee no word cutting)
        if (splitIndex <= 0) {
            const space = searchRange.lastIndexOf(' ');
            if (space > 0) {
                splitIndex = space + 1;
            } else {
                // No space found at all - scan backward from maxLength to find any word boundary
                let foundSplit = false;
                for (let i = maxLength - 1; i >= 0; i--) {
                    const ch = searchRange[i];
                    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
                        splitIndex = i + 1;
                        foundSplit = true;
                        break;
                    }
                }
                // Absolute last resort: split at maxLength (this should be extremely rare)
                if (!foundSplit) {
                    // Try to at least not cut a word by scanning backward for any non-letter boundary
                    for (let i = maxLength - 1; i >= 0; i--) {
                        const ch = searchRange[i];
                        const isLetterOrDigit = /\p{L}/u.test(ch) || /[0-9]/.test(ch);
                        if (!isLetterOrDigit && ch !== '-' && ch !== "'") {
                            // Found a non-word-character boundary
                            splitIndex = i + 1;
                            foundSplit = true;
                            break;
                        }
                    }
                    if (!foundSplit) {
                        splitIndex = maxLength;
                    }
                }
            }
        }

        chunks.push(remaining.substring(0, splitIndex));
        remaining = remaining.substring(splitIndex);
    }

    return chunks.filter(c => c.length > 0).map(c => c.trim()).filter(c => c.length > 0);
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
 * Generate audio for a single chapter with automatic re-chunking on truncation.
 * Submits ALL chunks to the worker pool simultaneously — no artificial batch limit.
 */
async function generateChapterAudio(chapterText, outputDir, config, onProgress = null, jobId = null, chapterIndex = 0) {
    const chapterId = chapterIndex + 1; // Use sequential numbering

    let allChunks; // Array of { text, voice }
    let chunkSize = MAX_CHUNK_LENGTH;
    let retryCount = 0;
    const MAX_RETRIES = 5;
    const MIN_CHUNK_SIZE = 20;

    while (retryCount < MAX_RETRIES) {
        if (config.multiVoice && config.dialogueVoice) {
            const fragments = splitTextByQuotes(chapterText);
            allChunks = fragments.flatMap(fragment => {
                const voice = fragment.isDialogue ? config.dialogueVoice : config.voice;
                return splitTextIntoChunks(fragment.text, chunkSize).map(text => ({ text: text.trim(), voice }));
            }).filter(chunk => chunk.text.length > 0);
        } else {
            allChunks = splitTextIntoChunks(chapterText, chunkSize).map(text => ({ text: text.trim(), voice: config.voice })).filter(chunk => chunk.text.length > 0);
        }

        console.log(`[TTS Engine] Chapter ${chapterId}: Split into ${allChunks.length} chunks (max ${chunkSize} chars each)`);

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

        // Check for truncated chunks (indicates model limitation)
        const expectedCharsPerSecond = 15;
        let hasTruncation = false;
        for (let i = 0; i < audioBuffers.length; i++) {
            const pcmSize = audioBuffers[i].length - 44;
            const actualDuration = pcmSize / 2 / 24000;
            const expectedDuration = allChunks[i].text.length / expectedCharsPerSecond;
            // If more than 40% truncated (less than 60% of expected), re-chunk with smaller size
            if (actualDuration < expectedDuration * 0.6) {
                console.warn(`[TTS Engine] Chunk ${i+1} truncated! Expected ~${expectedDuration.toFixed(1)}s, got ${actualDuration.toFixed(1)}s (${allChunks[i].text.length} chars, ${(actualDuration/expectedDuration*100).toFixed(0)}% of expected)`);
                hasTruncation = true;
            }
        }

        if (!hasTruncation) {
            // No truncation, proceed with concatenation
            const finalPath = path.join(outputDir, `chapter_${chapterId}.wav`);
            
            if (audioBuffers.length === 1) {
                // Single chunk - just write it
                await fs.writeFile(finalPath, audioBuffers[0]);
            } else {
                // Multiple chunks - concatenate raw audio for gapless output
                const chunkSizes = audioBuffers.map((buf, i) => {
                    const pcmSize = buf.length - 44;
                    const duration = pcmSize / 2 / 24000; // 16-bit samples at 24kHz
                    return `Chunk ${i+1}: ${duration.toFixed(2)}s (${pcmSize} bytes PCM)`;
                });
                console.log(`[TTS Engine] Chapter ${chapterId} - Concatenating ${audioBuffers.length} chunks gaplessly:`);
                chunkSizes.forEach(s => console.log(`  ${s}`));
                await concatenateWavBuffers(audioBuffers, finalPath);
            }

            const duration = await getAudioDuration(finalPath);
            return { audioPath: finalPath, durationSeconds: duration };
        }

        // Truncation detected - reduce chunk size and retry
        retryCount++;
        chunkSize = Math.max(MIN_CHUNK_SIZE, Math.floor(chunkSize / 2));
        console.warn(`[TTS Engine] Truncation detected! Reducing chunk size to ${chunkSize} chars and retrying (attempt ${retryCount}/${MAX_RETRIES})`);
        
        // If chunk size already at minimum and still truncated, it's a model issue - throw with helpful message
        if (chunkSize <= MIN_CHUNK_SIZE) {
            throw new Error(`[TTS Engine] Model persistently truncates even at ${MIN_CHUNK_SIZE} chars. This may indicate a model or memory issue. Try a different voice or restart the server.`);
        }
    }

    throw new Error(`[TTS Engine] Failed to generate audio after ${MAX_RETRIES} retries due to persistent truncation`);
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
 * Trim leading/trailing silence from 16-bit PCM audio buffer.
 * Uses a low threshold to preserve soft speech (quiet words, whispers).
 * Also requires minimum silence duration (10ms) before trimming to avoid cutting into speech.
 * @param {Buffer} pcmData - Raw PCM data (16-bit samples at 24kHz)
 * @param {number} threshold - Silence amplitude threshold (default: 15, very conservative)
 * @returns {Buffer} Trimmed PCM data
 */
function trimSilence(pcmData, threshold = 15) {
    if (pcmData.length < 4) return pcmData;
    
    const sampleRate = 24000;
    const minSilenceSamples = Math.floor(sampleRate * 0.01); // 10ms minimum silence to trim
    
    // Find leading non-silent point
    let start = 0;
    let silentCount = 0;
    for (let i = 0; i < pcmData.length; i += 2) {
        const sample = Math.abs(pcmData.readInt16LE(i));
        if (sample <= threshold) {
            silentCount++;
            if (silentCount >= minSilenceSamples) {
                // We've found sustained silence, start trimming
                start = i + 2;
            }
        } else {
            // Found audio - reset
            if (silentCount >= minSilenceSamples) {
                break; // We've already trimmed the sustained silence
            }
            silentCount = 0;
            start = i;
        }
    }
    
    // Find trailing non-silent point
    let end = pcmData.length;
    silentCount = 0;
    for (let i = pcmData.length - 2; i >= 0; i -= 2) {
        const sample = Math.abs(pcmData.readInt16LE(i));
        if (sample <= threshold) {
            silentCount++;
            if (silentCount >= minSilenceSamples) {
                end = i;
            }
        } else {
            if (silentCount >= minSilenceSamples) {
                break;
            }
            silentCount = 0;
            end = i + 2;
        }
    }
    
    if (start >= end) {
        // All silence or very quiet - return minimal buffer
        return pcmData.slice(0, Math.min(1000, pcmData.length));
    }
    
    return pcmData.slice(start, end);
}

/**
 * Concatenate multiple WAV buffers into a single WAV file.
 * Strips headers, trims silence, and writes one clean header for gapless audio.
 * @param {Buffer[]} audioBuffers - Array of WAV buffers
 * @param {string} outputPath
 * @returns {Promise<void>}
 */
async function concatenateWavBuffers(audioBuffers, outputPath) {
    const HEADER_SIZE = 44;
    const sampleRate = 24000;
    const numChannels = 1;
    const bitsPerSample = 16;
    
    // Calculate total PCM data size (excluding headers)
    let totalPcmSize = 0;
    const pcmBuffers = [];
    
    for (let i = 0; i < audioBuffers.length; i++) {
        const buf = audioBuffers[i];
        if (buf.length > HEADER_SIZE) {
            let pcmData = buf.slice(HEADER_SIZE);
            // DISABLED: Silence trimming was cutting quiet speech
            // pcmData = trimSilence(pcmData, 15);
            pcmBuffers.push(pcmData);
            totalPcmSize += pcmData.length;
        }
    }
    
    // Create output buffer with single header + all PCM data
    const outputBuffer = Buffer.alloc(HEADER_SIZE + totalPcmSize);
    
    // Write WAV header
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    
    outputBuffer.write('RIFF', 0);
    outputBuffer.writeUInt32LE(36 + totalPcmSize, 4);
    outputBuffer.write('WAVE', 8);
    outputBuffer.write('fmt ', 12);
    outputBuffer.writeUInt32LE(16, 16);
    outputBuffer.writeUInt16LE(1, 20); // PCM format
    outputBuffer.writeUInt16LE(numChannels, 22);
    outputBuffer.writeUInt32LE(sampleRate, 24);
    outputBuffer.writeUInt32LE(byteRate, 28);
    outputBuffer.writeUInt16LE(blockAlign, 32);
    outputBuffer.writeUInt16LE(bitsPerSample, 34);
    outputBuffer.write('data', 36);
    outputBuffer.writeUInt32LE(totalPcmSize, 40);
    
    // Concatenate all PCM data
    let offset = HEADER_SIZE;
    for (const pcm of pcmBuffers) {
        pcm.copy(outputBuffer, offset);
        offset += pcm.length;
    }
    
    await fs.writeFile(outputPath, outputBuffer);
}

/**
 * Concatenate multiple audio files using ffmpeg (for chapter-level concatenation).
 * @param {string[]} inputPaths
 * @param {string} outputPath
 * @returns {Promise<void>}
 */
function concatenateAudioFiles(inputPaths, outputPath) {
    const { exec } = require('child_process');
    const ffmpegPath = require('ffmpeg-static');

    return new Promise((resolve, reject) => {
        const concatListPath = outputPath + '.list.txt';
        const concatContent = inputPaths.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n');

        fs.writeFile(concatListPath, concatContent)
            .then(() => {
                const cmd = `"${ffmpegPath}" -f concat -safe 0 -i "${concatListPath}" -c:a pcm_s16le -y "${outputPath}"`;
                exec(cmd, (error, stdout, stderr) => {
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
async function getAudioDuration(audioPath) {
    const { exec } = require('child_process');
    const ffmpegPath = require('ffmpeg-static');
    // ffprobe is typically alongside ffmpeg - use full path
    const ffprobePath = ffmpegPath.replace(/ffmpeg(\.exe)?$/, 'ffprobe$1');

    // Try ffprobe first with full path
    try {
        const { stdout } = await new Promise((resolve, reject) => {
            exec(`"${ffprobePath}" -v quiet -print_format json -show_format -show_streams "${audioPath}"`, (error, stdout, stderr) => {
                if (error) reject(error);
                else resolve({ stdout });
            });
        });

        if (stdout) {
            try {
                const data = JSON.parse(stdout);
                if (data.format && data.format.duration) {
                    return parseFloat(data.format.duration);
                }
            } catch (e) {
                // Fall through to fallback
            }
        }
    } catch (e) {
        // Fall through to fallback
    }

    // Fallback: Use ffmpeg to get duration from stderr output
    try {
        const { stderr } = await new Promise((resolve, reject) => {
            exec(`"${ffmpegPath}" -i "${audioPath}" -hide_banner 2>&1`, (error, stdout, stderr) => {
                resolve({ stderr });
            });
        });

        const output = stderr;
        const durationMatch = output.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/);

        if (durationMatch) {
            const hours = parseInt(durationMatch[1]);
            const minutes = parseInt(durationMatch[2]);
            const seconds = parseInt(durationMatch[3]);
            const ms = parseInt(durationMatch[4]);
            return hours * 3600 + minutes * 60 + seconds + ms / 100;
        }
    } catch (e) {
        // Fall through to final fallback
    }

    // Final fallback: estimate based on file size for WAV files
    // WAV formula: duration = fileSize / (sampleRate * numChannels * bytesPerSample)
    try {
        const stats = await fs.stat(audioPath);
        if (stats && stats.size > 44) {
            // Read sample rate from WAV header (bytes 24-27) - only read header portion for efficiency
            const headerBuffer = await fs.readFile(audioPath, { flag: 'r' });
            const sampleRate = headerBuffer.readUInt32LE(24);
            const numChannels = headerBuffer.readUInt16LE(22);
            const bitsPerSample = headerBuffer.readUInt16LE(34);
            const bytesPerSample = bitsPerSample / 8;
            const dataSize = stats.size - 44; // WAV header is 44 bytes
            const estimatedDuration = dataSize / (sampleRate * numChannels * bytesPerSample);
            if (estimatedDuration > 0 && isFinite(estimatedDuration)) {
                return estimatedDuration;
            }
        }
    } catch (e) {
        // Fall through to last resort
    }

    return 0;
}

module.exports = {
    generateChapterAudio,
    generateAllChapterAudio,
    splitTextIntoChunks,
    concatenateWavBuffers,
    concatenateAudioFiles,
    getAudioDuration,
    cancelJob,
    isJobCancelled,
    clearJobToken,
    AVAILABLE_VOICES,
    AVAILABLE_MODELS,
    DEFAULT_CONFIG
};
