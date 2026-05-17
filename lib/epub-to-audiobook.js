/**
 * EPUB to Audiobook Converter
 * Integrates EPUB parsing with BPM4B's optimized TTS engine or Abogen
 * Inspired by Abogen but using BPM4B's faster TTS implementation
 * Also supports using Abogen as a subprocess for audiobook generation
 */

const { parseEpub, selectChapters, estimateDuration, getTotalCharacterCount } = require('./epub-parser');
const { autoSelectVoice, getVoiceListByLanguage } = require('./multi-language-voices');
const { generateChapterAudio } = require('./tts-engine');
const { convertToM4b } = require('./core');
const { epubToAudiobookWithAbogen, ensureAbogenInstalled } = require('./abogen-integration');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

/**
 * Convert EPUB to audiobook
 * @param {string} epubPath - Path to EPUB file
 * @param {string} outputPath - Output M4B file path
 * @param {Object} options - Conversion options
 * @returns {Promise<Object>} Conversion result
 */
async function epubToAudiobook(epubPath, outputPath, options = {}) {
    const {
        voice = null,
        language = null,
        speed = 1.0,
        selectedChapters = null,
        audioQuality = '128k',
        onProgress = null,
        jobId = null,
        engine = 'abogen' // 'bpm4b' or 'abogen' (default: abogen)
    } = options;

    console.log(`[EPUB to Audiobook] Starting conversion of "${epubPath}"`);
    console.log(`[EPUB to Audiobook] Using engine: ${engine}`);

    // If Abogen is selected, use it
    if (engine === 'abogen') {
        console.log(`[EPUB to Audiobook] Using Abogen subprocess`);
        
        // Ensure Abogen is installed (auto-install if not)
        if (onProgress) onProgress('Checking Abogen installation...', 0, 100);
        const abogenInstalled = await ensureAbogenInstalled();
        
        if (!abogenInstalled) {
            throw new Error('Failed to install Abogen automatically. Please install it manually with: pip install abogen');
        }

        // Parse EPUB for metadata
        if (onProgress) onProgress('Parsing EPUB...', 5, 100);
        const epubData = await parseEpub(epubPath);
        
        console.log(`[EPUB to Audiobook] Parsed: "${epubData.metadata.title}" by ${epubData.metadata.author}`);

        // Select chapters
        let chapters = epubData.chapters;
        if (selectedChapters && selectedChapters.length > 0) {
            chapters = selectChapters(epubData.chapters, selectedChapters);
            console.log(`[EPUB to Audiobook] Selected ${chapters.length} chapters for conversion`);
        }

        // Auto-select voice based on EPUB language
        const targetLanguage = language || epubData.metadata.language || 'en-US';
        const targetVoice = voice || autoSelectVoice(targetLanguage);
        
        console.log(`[EPUB to Audiobook] Using voice: ${targetVoice} (${targetLanguage})`);

        // Run Abogen
        if (onProgress) onProgress('Running Abogen...', 10, 100);
        
        const result = await epubToAudiobookWithAbogen(epubPath, outputPath, {
            voice: targetVoice,
            speed: speed,
            language: targetLanguage,
            chapters: selectedChapters,
            customPath: options.customPath,
            onProgress: (progress) => {
                if (onProgress) {
                    onProgress(`Abogen progress: ${progress}%`, 10 + (progress * 0.9), 100);
                }
            }
        });

        if (onProgress) onProgress('Conversion complete!', 100, 100);

        return {
            success: true,
            outputPath,
            metadata: epubData.metadata,
            engine: 'abogen',
            voice: targetVoice,
            language: targetLanguage
        };
    }

    // Otherwise use BPM4B TTS engine (default)
    console.log(`[EPUB to Audiobook] Using BPM4B TTS engine`);

    // Parse EPUB
    if (onProgress) onProgress('Parsing EPUB...', 0, 100);
    const epubData = await parseEpub(epubPath);
    
    console.log(`[EPUB to Audiobook] Parsed: "${epubData.metadata.title}" by ${epubData.metadata.author}`);
    console.log(`[EPUB to Audiobook] Language: ${epubData.metadata.language}, Chapters: ${epubData.totalChapters}`);

    // Select chapters
    let chapters = epubData.chapters;
    if (selectedChapters && selectedChapters.length > 0) {
        chapters = selectChapters(epubData.chapters, selectedChapters);
        console.log(`[EPUB to Audiobook] Selected ${chapters.length} chapters for conversion`);
    }

    // Auto-select voice based on EPUB language
    const targetLanguage = language || epubData.metadata.language || 'en-US';
    const targetVoice = voice || autoSelectVoice(targetLanguage);
    
    console.log(`[EPUB to Audiobook] Using voice: ${targetVoice} (${targetLanguage})`);

    // Create temporary directory for chapter audio
    const tempDir = path.join(os.tmpdir(), `epub_audiobook_${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    try {
        // Generate audio for each chapter
        const chapterAudioFiles = [];
        const totalChapters = chapters.length;
        const totalChars = getTotalCharacterCount(chapters);
        let processedChars = 0;

        for (let i = 0; i < totalChapters; i++) {
            const chapter = chapters[i];
            const progress = Math.round((i / totalChapters) * 100);
            
            if (onProgress) {
                onProgress(`Processing chapter ${i + 1}/${totalChapters}: "${chapter.title}"`, progress, 100);
            }

            console.log(`[EPUB to Audiobook] Chapter ${i + 1}/${totalChapters}: "${chapter.title}" (${chapter.content.length} chars)`);

            const audioResult = await generateChapterAudio(
                chapter.content,
                tempDir,
                {
                    voice: targetVoice,
                    speed: speed,
                    multiVoice: false
                },
                (completed, total) => {
                    const chapterProgress = Math.round((completed / total) * 100);
                    if (onProgress) {
                        onProgress(
                            `Chapter ${i + 1}/${totalChapters}: "${chapter.title}" - ${completed}/${total} chunks`,
                            progress + (chapterProgress / totalChapters),
                            100
                        );
                    }
                },
                jobId,
                i
            );

            chapterAudioFiles.push({
                path: audioResult.audioPath,
                title: chapter.title,
                duration: audioResult.durationSeconds
            });

            processedChars += chapter.content.length;
            console.log(`[EPUB to Audiobook] Chapter ${i + 1} complete: ${audioResult.durationSeconds.toFixed(2)}s audio`);
        }

        if (onProgress) onProgress('Combining chapters into M4B...', 95, 100);

        // Combine chapter audio files into M4B
        console.log(`[EPUB to Audiobook] Combining ${chapterAudioFiles.length} chapters into M4B`);
        
        const chaptersMetadata = chapterAudioFiles.map((file, index) => ({
            title: file.title,
            start_time: chapterAudioFiles.slice(0, index).reduce((sum, f) => sum + f.duration, 0),
            end_time: chapterAudioFiles.slice(0, index + 1).reduce((sum, f) => sum + f.duration, 0)
        }));

        // Use folderToM4b logic for combining
        const { folderToM4b } = require('./core');
        await folderToM4b(
            tempDir,
            outputPath,
            {
                audioQuality: audioQuality,
                metadata: {
                    title: epubData.metadata.title,
                    author: epubData.metadata.author,
                    language: epubData.metadata.language
                },
                chapters: chaptersMetadata,
                fastMode: true
            }
        );

        if (onProgress) onProgress('Conversion complete!', 100, 100);

        console.log(`[EPUB to Audiobook] Conversion complete: "${outputPath}"`);

        return {
            success: true,
            outputPath,
            metadata: epubData.metadata,
            chapters: chaptersMetadata,
            totalDuration: chaptersMetadata[chaptersMetadata.length - 1].end_time,
            voice: targetVoice,
            language: targetLanguage,
            engine: 'bpm4b'
        };

    } finally {
        // Cleanup temporary directory
        try {
            await fs.rm(tempDir, { recursive: true, force: true });
            console.log(`[EPUB to Audiobook] Cleaned up temporary directory`);
        } catch (err) {
            console.warn(`[EPUB to Audiobook] Failed to cleanup temp directory: ${err.message}`);
        }
    }
}

/**
 * Get EPUB metadata without converting
 */
async function getEpubMetadata(epubPath) {
    const epubData = await parseEpub(epubPath);
    return {
        title: epubData.metadata.title,
        author: epubData.metadata.author,
        language: epubData.metadata.language,
        publisher: epubData.metadata.publisher,
        description: epubData.metadata.description,
        totalChapters: epubData.totalChapters,
        chapters: epubData.chapters.map(ch => ({
            id: ch.id,
            title: ch.title,
            contentLength: ch.content.length,
            estimatedDuration: estimateDuration(ch.content)
        }))
    };
}

/**
 * Get available voices for EPUB conversion
 */
function getAvailableVoices() {
    return getVoiceListByLanguage();
}

module.exports = {
    epubToAudiobook,
    getEpubMetadata,
    getAvailableVoices
};
