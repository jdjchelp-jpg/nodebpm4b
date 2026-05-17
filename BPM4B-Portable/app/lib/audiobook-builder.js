/**
 * Audiobook Builder Module
 * Orchestrates the full document-to-audiobook pipeline:
 *   1. Parse document → 2. Detect chapters → 3. Generate TTS audio → 4. Assemble M4B
 * BPM4B - Professional Multimedia Converter
 */

const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
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
 * @param {Object} options.metadata - Optional metadata {title, author, genre}
 * @param {string} options.coverPath - Optional path to cover image
 * @param {boolean} options.multiVoice - Enable multi-voice dialogue (default: false)
 * @param {string} options.dialogueVoice - Voice for dialogue (default: null)
 * @param {Function} options.onProgress - Progress callback (stage, detail)
 * @returns {Promise<{outputPath: string, chapters: Array, totalDuration: number}>}
 */
async function buildAudiobook(inputPath, outputPath, options = {}) {
    const {
        voice = 'af_heart',
        model = 'kokoro-82m',
        speed = 1.0,
        audioQuality = '64k',
        metadata = null,
        coverPath = null,
        multiVoice = false,
        dialogueVoice = null,
        onProgress = null
    } = options;

    const workDir = path.join(path.dirname(inputPath), `audiobook_work_${crypto.randomUUID()}`);
    await fs.mkdir(workDir, { recursive: true });

    try {
        // ── Stage 1: Parse document (Weight: 5%) ──
        if (onProgress) onProgress(5, 'Extracting text from document...');
        const { text, headings } = await parseDocument(inputPath);

        if (!text || text.trim().length === 0) {
            throw new Error('No text content could be extracted from the document');
        }

        // ── Stage 2: Detect chapters (Weight: 5%) ──
        if (onProgress) onProgress(10, 'Detecting chapter boundaries...');
        let chapters = detectChapters(text, headings);

        // Map to custom chapters from UI if provided
        if (options.customChapters && Array.isArray(options.customChapters)) {
            const mappedChapters = [];
            for (const custom of options.customChapters) {
                // Find matching original chapter by index if available, else by title structure
                let origChapter = chapters[custom.originalIndex];
                if (!origChapter) origChapter = chapters.find(c => c.title === custom.title) || chapters[0];
                if (origChapter) {
                    mappedChapters.push({
                        ...origChapter,
                        title: custom.title || origChapter.title,
                        number: custom.number || origChapter.number
                    });
                }
            }
            if (mappedChapters.length > 0) {
                chapters = mappedChapters;
            }
        }

        if (onProgress) onProgress(15, `Found ${chapters.length} chapter(s). Initializing TTS...`);

        // Prepare final chapters for encoding, adding announcements if requested
        const finalChapters = [];
        for (let i = 0; i < chapters.length; i++) {
            const ch = chapters[i];
            let processedContent = ch.content;
            
            if (options.announceChapters) {
                const type = ch.type || 'Chapter';
                const announcement = ch.number 
                    ? `${type} ${ch.number}. ${ch.title}. ` 
                    : `${ch.title}. `;
                
                // Check if the chapter title is already at the beginning of the content
                let contentToUse = ch.content;
                
                // Only remove title if it's an exact match at the very beginning followed by whitespace
                // Be very conservative to avoid cutting off actual content
                const titleWithSpace = new RegExp(`^${ch.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+`, 'i');
                const titleWithPeriod = new RegExp(`^${ch.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.\\s+`, 'i');
                
                if (titleWithSpace.test(ch.content)) {
                    contentToUse = ch.content.replace(titleWithSpace, '').trim();
                } else if (titleWithPeriod.test(ch.content)) {
                    contentToUse = ch.content.replace(titleWithPeriod, '').trim();
                }
                
                processedContent = announcement + contentToUse;
            }
            
            finalChapters.push({
                ...ch,
                content: processedContent
            });
        }

        const ttsConfig = { voice, model, speed, multiVoice, dialogueVoice };

        const chapterAudios = await generateAllChapterAudio(
            finalChapters,
            workDir,
            ttsConfig,
            (chapterIdx, totalChapters, detail, completedChunks = 0, totalChunks = 1) => {
                if (onProgress) {
                    // Stage 3 weight: 15% to 85% (Total 70%)
                    const chapterProgress = chapterIdx / totalChapters;
                    const chunkProgress = (completedChunks / totalChunks) * (1 / totalChapters);
                    const subPercent = Math.min(85, 15 + Math.round((chapterProgress + chunkProgress) * 70));
                    onProgress(subPercent, `Chapter ${chapterIdx + 1}/${totalChapters}: ${detail}`);
                }
            }
        );

        // ── Stage 4: Concatenate all chapter audio into one WAV (Weight: 5%) ──
        if (onProgress) onProgress(85, 'Combining chapter audio...');

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

        const allAudioPaths = chapterAudios.map(c => c.audioPath);
        const combinedWav = path.join(workDir, 'combined.wav');
        await concatenateAudioFiles(allAudioPaths, combinedWav);

        // ── Stage 6: Convert to final M4B using ffmpeg (Weight: 5%) ──
        if (onProgress) onProgress(95, 'Creating final M4B with embedded chapters and metadata...');
        await convertMp3ToM4b(combinedWav, outputPath, chapterMetadata, {
            audioQuality,
            metadata,
            coverPath,
            onProgress: (percent, msg) => {
                // percent here is 0-100 for just this stage, cap at 99% so frontend doesn't close connection early
                const finalPercent = Math.min(99, 95 + Math.round((percent / 100) * 5));
                if (onProgress) onProgress(finalPercent, msg);
            }
        });

        if (onProgress) onProgress(100, 'Audiobook generation complete!');

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
 * @param {Function} onProgress - Progress callback (stage, detail)
 * @returns {Promise<{chapters: Array, totalCharacters: number, estimatedDuration: string}>}
 */
async function previewChapters(inputPath, onProgress = null) {
    const { text, headings } = await parseDocument(inputPath);

    if (!text || text.trim().length === 0) {
        throw new Error('No text content could be extracted from document');
    }

    const chapters = detectChapters(text, headings, onProgress);

    const totalChars = chapters.reduce((sum, ch) => sum + ch.content.length, 0);
    // Rough estimate: ~150 words per minute, ~5 chars per word = ~750 chars per minute
    const estimatedMinutes = Math.ceil(totalChars / 750);
    const hours = Math.floor(estimatedMinutes / 60);
    const mins = estimatedMinutes % 60;
    const estimatedDuration = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

    // Generation time estimates (Abogen benchmarks)
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
            type: ch.type || 'Chapter',
            contentLength: ch.content.length,
            wordCount: ch.content.split(/\s+/).length,
            content: ch.content, // Include full content for word-to-word verification
            preview: ch.content.substring(0, 500) + (ch.content.length > 500 ? '...' : ''),
            endPreview: ch.content.length > 500 ? '...' + ch.content.substring(ch.content.length - 500) : ''
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
