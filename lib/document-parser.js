/**
 * Document Parser Module
 * Extracts text and structural headings from PDF, DOCX, TXT, and EPUB files.
 * BPM4B - Professional Multimedia Converter
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * Parse a document and extract text + heading structure.
 * @param {string} filePath - Absolute path to the document
 * @returns {Promise<{text: string, headings: Array<{level: number, text: string, position: number}>}>}
 */
async function parseDocument(filePath) {
    const ext = path.extname(filePath).toLowerCase();

    switch (ext) {
        case '.pdf':
            return await parsePDF(filePath);
        case '.docx':
        case '.doc':
            return await parseDOCX(filePath);
        case '.txt':
            return await parseTXT(filePath);
        case '.epub':
            return await parseEPUB(filePath);
        default:
            throw new Error(`Unsupported document format: ${ext}. Supported: .pdf, .docx, .txt, .epub`);
    }
}

/**
 * Extract text from a PDF file.
 * @param {string} filePath
 * @returns {Promise<{text: string, headings: Array}>}
 */
async function parsePDF(filePath) {
    const pdfParse = require('pdf-parse');
    const dataBuffer = await fs.readFile(filePath);
    const data = await pdfParse(dataBuffer);

    const text = data.text || '';

    // Attempt to detect headings from text by looking for common patterns
    const headings = extractHeadingsFromText(text);

    return { text, headings };
}

/**
 * Extract text from a DOCX file using mammoth.
 * Mammoth converts headings to HTML tags, which we parse for structure.
 * @param {string} filePath
 * @returns {Promise<{text: string, headings: Array}>}
 */
async function parseDOCX(filePath) {
    const mammoth = require('mammoth');
    const buffer = await fs.readFile(filePath);

    // Get HTML for heading detection
    const htmlResult = await mammoth.convertToHtml({ buffer });
    const html = htmlResult.value || '';

    // Get raw text
    const textResult = await mammoth.extractRawText({ buffer });
    const text = textResult.value || '';

    // Parse headings from HTML
    const headings = [];
    const headingRegex = /<h([1-6])[^>]*>(.*?)<\/h[1-6]>/gi;
    let match;
    let position = 0;

    while ((match = headingRegex.exec(html)) !== null) {
        const level = parseInt(match[1]);
        const headingText = match[2].replace(/<[^>]+>/g, '').trim(); // Strip inner HTML tags
        if (headingText) {
            // Find position in raw text
            const textPos = text.indexOf(headingText, position);
            headings.push({
                level,
                text: headingText,
                position: textPos >= 0 ? textPos : position
            });
            if (textPos >= 0) position = textPos + headingText.length;
        }
    }

    return { text, headings };
}

/**
 * Read a plain text file.
 * @param {string} filePath
 * @returns {Promise<{text: string, headings: Array}>}
 */
async function parseTXT(filePath) {
    const text = await fs.readFile(filePath, 'utf-8');
    const headings = extractHeadingsFromText(text);
    return { text, headings };
}

/**
 * Parse an EPUB file and extract text + structure.
 * @param {string} filePath
 * @returns {Promise<{text: string, headings: Array}>}
 */
async function parseEPUB(filePath) {
    try {
        const EPub = require('epub2').default || require('epub2');
        const epub = await EPub.createAsync(filePath);

        const chapters = epub.flow || [];
        let fullText = '';
        const headings = [];

        for (const chapter of chapters) {
            try {
                const chapterText = await new Promise((resolve, reject) => {
                    epub.getChapter(chapter.id, (err, text) => {
                        if (err) reject(err);
                        else resolve(text || '');
                    });
                });

                // Strip HTML from chapter content
                const plainText = chapterText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

                if (plainText.length > 0) {
                    // Record the chapter title as a heading
                    if (chapter.title) {
                        headings.push({
                            level: 1,
                            text: chapter.title,
                            position: fullText.length
                        });
                    }

                    fullText += plainText + '\n\n';
                }
            } catch (chapterErr) {
                // Skip unreadable chapters
                console.error(`Warning: Could not read EPUB chapter ${chapter.id}:`, chapterErr.message);
            }
        }

        // If no headings from EPUB TOC, try text-based detection
        if (headings.length === 0) {
            headings.push(...extractHeadingsFromText(fullText));
        }

        return { text: fullText.trim(), headings };
    } catch (err) {
        throw new Error(`Failed to parse EPUB: ${err.message}`);
    }
}

/**
 * Extract headings from plain text by detecting common chapter patterns.
 * Looks for lines like "Chapter 1", "CHAPTER ONE", "Part I", etc.
 * @param {string} text
 * @returns {Array<{level: number, text: string, position: number}>}
 */
function extractHeadingsFromText(text) {
    const headings = [];
    const lines = text.split('\n');
    let charPosition = 0;

    // Patterns for chapter headings (case-insensitive)
    const chapterPatterns = [
        // "Chapter 1" / "Chapter 1:" / "Chapter 1 - Title"
        /^(chapter)\s+(\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)\b[\s:\-–—]*/i,
        // "Part 1" / "Part I" / "Part One"
        /^(part)\s+(\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten)\b[\s:\-–—]*/i,
        // "Book 1" / "Book I"
        /^(book)\s+(\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten)\b[\s:\-–—]*/i,
        // "Section 1"
        /^(section)\s+(\d+|[ivxlcdm]+)\b[\s:\-–—]*/i,
        // "Prologue", "Epilogue", "Introduction", "Preface", "Afterword"
        /^(prologue|epilogue|introduction|preface|foreword|afterword|appendix)\b[\s:\-–—]*/i
    ];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        for (const pattern of chapterPatterns) {
            if (pattern.test(line)) {
                const level = line.toLowerCase().startsWith('part') || line.toLowerCase().startsWith('book') ? 1 : 2;
                headings.push({
                    level,
                    text: line,
                    position: charPosition
                });
                break;
            }
        }

        charPosition += lines[i].length + 1; // +1 for newline
    }

    return headings;
}

/**
 * List supported document formats
 * @returns {string[]}
 */
function getSupportedFormats() {
    return ['.pdf', '.docx', '.doc', '.txt', '.epub'];
}

module.exports = {
    parseDocument,
    extractHeadingsFromText,
    getSupportedFormats
};
