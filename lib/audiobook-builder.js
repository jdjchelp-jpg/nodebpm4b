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
 * @param {string} options.apiKey - OpenRouter API key (required)
 * @param {string} options.voice - Voice to use (default: 'alloy')
 * @param {string} options.model - TTS model (default: 'openai/tts-1')
 * @param {number} options.speed - Playback speed (default: 1.0)
 * @param {string} options.audioQuality - M4B audio quality (default: '64k')
 * @param {Function} options.onProgress - Progress callback (stage, detail)
 * @returns {Promise<{outputPath: string, chapters: Array, totalDuration: number}>}
 */
async function buildAudiobook(inputPath, outputPath, options = {}) {
    const {
        apiKey,
        voice = 'alloy',
        model = 'openai/tts-1',
        speed = 1.0,
        audioQuality = '64k',
        onProgress = null
    } = options;

    if (!apiKey) {
        throw new Error('OpenRouter API key is required for audiobook generation');
    }

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
        if (onProgress) onProgress('generating', 'Starting audio generation...');
        const ttsConfig = { apiKey, voice, model, speed };

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

        // ── Stage 4: Concatenate all chapter audio into one MP3 ──
        if (onProgress) onProgress('assembling', 'Combining chapter audio...');
        const allAudioPaths = chapterAudios.map(c => c.audioPath);
        const combinedMp3 = path.join(workDir, 'combined.mp3');
        await concatenateAudioFiles(allAudioPaths, combinedMp3);

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
        await convertMp3ToM4b(combinedMp3, outputPath, chapterMetadata, { audioQuality });

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

    return {
        chapters: chapters.map((ch, i) => ({
            number: ch.number || (i + 1),
            title: ch.title,
            contentLength: ch.content.length,
            wordCount: ch.content.split(/\s+/).length,
            preview: ch.content.substring(0, 200) + (ch.content.length > 200 ? '...' : '')
        })),
        totalCharacters: totalChars,
        estimatedDuration
    };
}

module.exports = {
    buildAudiobook,
    previewChapters
};
