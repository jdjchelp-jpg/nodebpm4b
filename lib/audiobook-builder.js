/**
 * Audiobook Builder Module
 * Orchestrates the full document-to-audiobook pipeline:
 *   1. Parse document → 2. Detect chapters → 3. Generate TTS audio → 4. Assemble M4B
 * BPM4B - Professional Multimedia Converter
 */

const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const { parseDocument } = require('./document-parser');
const { detectChapters } = require('./chapter-detector');
const { generateAllChapterAudio, concatenateAudioFiles } = require('./tts-engine');
const { convertMp3ToM4b } = require('./core');

/**
 * Build an audiobook from a document file.
 *
 * @param {string} inputPath - Path to the source document (PDF/DOCX/TXT/EPUB)
 * @param {string} outputPath - Path for the output M4B file
 * @param {Object} options
 * @param {string} options.voice - Voice to use (default: 'af_heart')
 * @param {string} options.model - TTS model (default: 'kokoro-82m')
 * @param {number} options.speed - Playback speed (default: 1.0)
 * @param {string} options.audioQuality - M4B audio quality (default: '64k')
 * @param {Function} options.onProgress - Progress callback (stage, detail)
 * @returns {Promise<{outputPath: string, chapters: Array, totalDuration: number}>}
 */
async function buildAudiobook(inputPath, outputPath, options = {}) {
    const {
        voice = 'af_heart',
        model = 'kokoro-82m',
        speed = 1.0,
        audioQuality = '64k',
        onProgress = null
    } = options;

    const workDir = path.join(path.dirname(inputPath), `audiobook_work_${uuidv4()}`);
    await fs.mkdir(workDir, { recursive: true });

    try {
        // ── Stage 1: Parse document ──
        if (onProgress) onProgress('parsing', 'Extracting text from document...');
        const { text, headings } = await parseDocument(inputPath);

        if (!text || text.trim().length === 0) {
            throw new Error('No text content could be extracted from the document');
        }

        // ── Stage 2: Detect chapters ──
        if (onProgress) onProgress('detecting', 'Detecting chapter boundaries...');
        const chapters = detectChapters(text, headings);

        if (onProgress) onProgress('detected', `Found ${chapters.length} chapter(s)`);

        // ── Stage 3: Generate TTS audio for each chapter ──
        if (onProgress) onProgress('generating', 'Starting local audio generation...');
        const ttsConfig = { voice, model, speed };

        const chapterAudios = await generateAllChapterAudio(
            chapters,
            workDir,
            ttsConfig,
            (chapterIdx, totalChapters, detail) => {
                if (onProgress) {
                    onProgress('generating', `Chapter ${chapterIdx + 1}/${totalChapters}: ${detail}`);
                }
            }
        );

        // ── Stage 4: Concatenate all chapter audio into one WAV ──
        if (onProgress) onProgress('assembling', 'Combining chapter audio...');
        const allAudioPaths = chapterAudios.map(c => c.audioPath);
        const combinedWav = path.join(workDir, 'combined.wav');
        await concatenateAudioFiles(allAudioPaths, combinedWav);

        // ── Stage 5: Build chapter metadata with timestamps ──
        let cumulativeTime = 0;
        const chapterMetadata = chapterAudios.map((audio, i) => {
            const chapter = {
                title: audio.chapterTitle,
                start_time: cumulativeTime,
                end_time: cumulativeTime + audio.durationSeconds
            };
            cumulativeTime += audio.durationSeconds;
            return chapter;
        });

        // ── Stage 6: Convert to M4B with chapters ──
        if (onProgress) onProgress('converting', 'Creating M4B with embedded chapters...');
        await convertMp3ToM4b(combinedWav, outputPath, chapterMetadata, { audioQuality });

        if (onProgress) onProgress('complete', 'Audiobook generation complete!');

        return {
            outputPath,
            chapters: chapterMetadata,
            totalDuration: cumulativeTime
        };
    } finally {
        // ── Cleanup work directory ──
        try {
            const files = await fs.readdir(workDir);
            for (const file of files) {
                await fs.unlink(path.join(workDir, file)).catch(() => { });
            }
            await fs.rmdir(workDir).catch(() => { });
        } catch (e) {
            console.error('Warning: could not clean up work directory:', e.message);
        }
    }
}

/**
 * Preview chapter detection without generating audio.
 * Useful for the UI to show detected chapters before committing to TTS.
 * @param {string} inputPath - Path to the document
 * @returns {Promise<{chapters: Array, totalCharacters: number, estimatedDuration: string}>}
 */
async function previewChapters(inputPath) {
    const { text, headings } = await parseDocument(inputPath);

    if (!text || text.trim().length === 0) {
        throw new Error('No text content could be extracted from the document');
    }

    const chapters = detectChapters(text, headings);

    const totalChars = chapters.reduce((sum, ch) => sum + ch.content.length, 0);
    // Rough estimate: ~150 words per minute, ~5 chars per word = ~750 chars per minute
    const estimatedMinutes = Math.ceil(totalChars / 750);
    const hours = Math.floor(estimatedMinutes / 60);
    const mins = estimatedMinutes % 60;
    const estimatedDuration = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

    // Generation time estimates (Audiblez benchmarks)
    // GPU: ~600 chars/s, CPU: ~60 chars/s
    const genTimeSecondsGPU = Math.ceil(totalChars / 600);
    const genTimeSecondsCPU = Math.ceil(totalChars / 60);

    const formatTime = (s) => {
        if (s < 60) return `${s}s`;
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return sec > 0 ? `${m}m ${sec}s` : `${m}m`;
    };

    return {
        chapters: chapters.map((ch, i) => ({
            number: ch.number || (i + 1),
            title: ch.title,
            contentLength: ch.content.length,
            wordCount: ch.content.split(/\s+/).length,
            preview: ch.content.substring(0, 200) + (ch.content.length > 200 ? '...' : '')
        })),
        totalCharacters: totalChars,
        estimatedDuration,
        generationTimeLimit: {
            gpu: formatTime(genTimeSecondsGPU),
            cpu: formatTime(genTimeSecondsCPU)
        }
    };
}

module.exports = {
    buildAudiobook,
    previewChapters
};
