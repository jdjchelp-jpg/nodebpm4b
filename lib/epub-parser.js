/**
 * EPUB Parser Module
 * Parses EPUB files and extracts chapters/text for audiobook generation
 * Inspired by Audiblez but implemented in Node.js for BPM4B integration
 */

const EPub = require('epub2');
const fs = require('fs').promises;
const path = require('path');

/**
 * Parse EPUB file and extract chapters
 * @param {string} epubPath - Path to EPUB file
 * @returns {Promise<Object>} Parsed EPUB data with chapters
 */
async function parseEpub(epubPath) {
    return new Promise((resolve, reject) => {
        const epub = new EPub(epubPath);
        
        epub.on('error', reject);
        
        epub.on('end', async () => {
            try {
                const chapters = [];
                const metadata = {
                    title: epub.metadata.title || 'Unknown',
                    author: epub.metadata.creator || 'Unknown',
                    language: epub.metadata.language || 'en',
                    publisher: epub.metadata.publisher || 'Unknown',
                    description: epub.metadata.description || ''
                };
                
                // Get all chapters
                const spine = epub.spine;
                const toc = epub.toc;
                
                // Extract chapter content
                for (let i = 0; i < spine.contents.length; i++) {
                    const spineItem = spine.contents[i];
                    const chapterId = spineItem.id;
                    const chapterTitle = getChapterTitle(toc, chapterId, i + 1);
                    
                    try {
                        const content = await getChapterContent(epub, spineItem.id);
                        if (content && content.trim().length > 50) {
                            chapters.push({
                                id: chapterId,
                                title: chapterTitle,
                                content: cleanText(content),
                                index: i
                            });
                        }
                    } catch (err) {
                        console.warn(`[EPUB Parser] Failed to extract chapter ${chapterId}: ${err.message}`);
                    }
                }
                
                console.log(`[EPUB Parser] Extracted ${chapters.length} chapters from "${metadata.title}"`);
                
                resolve({
                    metadata,
                    chapters,
                    totalChapters: chapters.length
                });
            } catch (err) {
                reject(err);
            }
        });
        
        epub.parse();
    });
}

/**
 * Get chapter title from TOC or generate default
 */
function getChapterTitle(toc, chapterId, index) {
    // Try to find in TOC
    function findInToc(items) {
        for (const item of items) {
            if (item.id === chapterId) {
                return item.label || item.title;
            }
            if (item.subitems) {
                const found = findInToc(item.subitems);
                if (found) return found;
            }
        }
        return null;
    }
    
    const title = findInToc(toc);
    return title || `Chapter ${index}`;
}

/**
 * Get chapter content from EPUB
 */
function getChapterContent(epub, chapterId) {
    return new Promise((resolve, reject) => {
        epub.getChapter(chapterId, (err, text) => {
            if (err) reject(err);
            else resolve(text);
        });
    });
}

/**
 * Clean text by removing HTML tags and extra whitespace
 */
function cleanText(html) {
    // Remove HTML tags
    let text = html.replace(/<[^>]*>/g, ' ');
    
    // Replace HTML entities
    text = text.replace(/&nbsp;/g, ' ');
    text = text.replace(/&amp;/g, '&');
    text = text.replace(/&lt;/g, '<');
    text = text.replace(/&gt;/g, '>');
    text = text.replace(/&quot;/g, '"');
    text = text.replace(/&#39;/g, "'");
    
    // Remove extra whitespace
    text = text.replace(/\s+/g, ' ');
    text = text.trim();
    
    return text;
}

/**
 * Select specific chapters for conversion
 * @param {Array} chapters - All chapters
 * @param {Array} selectedIndices - Indices of chapters to include
 * @returns {Array} Selected chapters
 */
function selectChapters(chapters, selectedIndices) {
    if (!selectedIndices || selectedIndices.length === 0) {
        return chapters;
    }
    return chapters.filter((_, index) => selectedIndices.includes(index));
}

/**
 * Calculate estimated duration based on character count
 * @param {string} text - Text content
 * @param {number} speed - Speech speed (default 1.0)
 * @returns {number} Estimated duration in seconds
 */
function estimateDuration(text, speed = 1.0) {
    const charsPerSecond = 15 * speed;
    return Math.ceil(text.length / charsPerSecond);
}

/**
 * Get total character count for all chapters
 */
function getTotalCharacterCount(chapters) {
    return chapters.reduce((sum, chapter) => sum + chapter.content.length, 0);
}

module.exports = {
    parseEpub,
    selectChapters,
    estimateDuration,
    getTotalCharacterCount
};
