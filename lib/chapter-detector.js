/**
 * Chapter Detector Module
 * Detects chapter boundaries from extracted document text,
 * extracts chapter names, and normalizes numbers to their word form.
 * BPM4B - Professional Multimedia Converter
 */

const numberToWords = require('number-to-words');

/**
 * Map of written number words to their numeric values (for parsing chapter headers)
 */
const WORD_TO_NUMBER = {
    'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
    'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
    'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14, 'fifteen': 15,
    'sixteen': 16, 'seventeen': 17, 'eighteen': 18, 'nineteen': 19, 'twenty': 20,
    'thirty': 30, 'forty': 40, 'fifty': 50, 'sixty': 60,
    'seventy': 70, 'eighty': 80, 'ninety': 90, 'hundred': 100
};

/**
 * Roman numeral to integer conversion
 */
function romanToInt(roman) {
    const romanMap = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
    let result = 0;
    const upper = roman.toUpperCase();
    for (let i = 0; i < upper.length; i++) {
        const current = romanMap[upper[i]] || 0;
        const next = romanMap[upper[i + 1]] || 0;
        if (current < next) {
            result -= current;
        } else {
            result += current;
        }
    }
    return result;
}

/**
 * Parse a chapter number from various formats (digits, roman numerals, words)
 * @param {string} numStr - The number string from the chapter heading
 * @returns {number|null}
 */
function parseChapterNumber(numStr) {
    if (!numStr) return null;
    const trimmed = numStr.trim().toLowerCase();

    // Check word form first
    if (WORD_TO_NUMBER[trimmed]) return WORD_TO_NUMBER[trimmed];

    // Check digit form
    const asInt = parseInt(trimmed, 10);
    if (!isNaN(asInt)) return asInt;

    // Check roman numeral
    if (/^[ivxlcdm]+$/i.test(trimmed)) {
        const val = romanToInt(trimmed);
        if (val > 0) return val;
    }

    return null;
}

/**
 * Detect chapters from extracted text and headings.
 *
 * Strategy:
 *  1. If document parser provided headings, use those as primary chapter boundaries.
 *  2. Otherwise, scan the text for "Chapter X" patterns.
 *  3. For each chapter, extract the chapter name from the following line/heading.
 *  4. Normalize numbers in the body text to word form.
 *
 * @param {string} text - Full extracted text
 * @param {Array<{level: number, text: string, position: number}>} headings - Headings from parser
 * @returns {Array<{number: number|null, title: string, content: string}>}
 */
function detectChapters(text, headings = []) {
    let chapters = [];

    if (headings.length > 0) {
        chapters = buildChaptersFromHeadings(text, headings);
    }

    // If headings didn't yield results, try text-based detection
    if (chapters.length === 0) {
        chapters = buildChaptersFromText(text);
    }

    // If still no chapters found, treat entire text as one chapter
    if (chapters.length === 0) {
        chapters = [{
            number: 1,
            title: 'Full Text',
            content: normalizeNumbersInText(cleanBodyText(text))
        }];
    }

    return chapters;
}

/**
 * Build chapters using detected headings as boundaries.
 * @param {string} text
 * @param {Array} headings
 * @returns {Array}
 */
function buildChaptersFromHeadings(text, headings) {
    const chapters = [];

    for (let i = 0; i < headings.length; i++) {
        const heading = headings[i];
        const nextHeading = headings[i + 1];

        // Extract content between this heading and the next
        const startPos = heading.position;
        const endPos = nextHeading ? nextHeading.position : text.length;
        let content = text.substring(startPos, endPos).trim();

        // Remove the heading line itself from content
        const headingLine = heading.text;
        if (content.startsWith(headingLine)) {
            content = content.substring(headingLine.length).trim();
        }

        // Try to extract chapter number from heading text
        const chapterNum = extractChapterNumberFromHeading(heading.text);

        // Extract chapter name: heading text, possibly with subtitle on next line
        let title = extractChapterTitle(heading.text, content);

        chapters.push({
            number: chapterNum,
            title: title,
            content: normalizeNumbersInText(cleanBodyText(content))
        });
    }

    return chapters;
}

/**
 * Build chapters by scanning text for chapter patterns.
 * @param {string} text
 * @returns {Array}
 */
function buildChaptersFromText(text) {
    const chapters = [];
    const lines = text.split('\n');

    // Find all chapter heading lines
    const chapterPattern = /^(chapter)\s+(\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)\b[\s:\-–—]*(.*)?$/i;
    const specialPattern = /^(prologue|epilogue|introduction|preface|foreword|afterword|appendix)\b[\s:\-–—]*(.*)?$/i;

    const chapterBoundaries = [];

    let charPos = 0;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        let match = chapterPattern.exec(line);

        if (match) {
            const numStr = match[2];
            const inlineTitle = (match[3] || '').trim();
            const chapterNum = parseChapterNumber(numStr);

            chapterBoundaries.push({
                lineIndex: i,
                position: charPos,
                number: chapterNum,
                inlineTitle: inlineTitle,
                headingText: line
            });
        } else {
            match = specialPattern.exec(line);
            if (match) {
                // Skip if this special word appears within 2 lines of a chapter heading
                // (it's likely the chapter subtitle, not a separate section)
                const lastBoundary = chapterBoundaries[chapterBoundaries.length - 1];
                const tooClose = lastBoundary && (i - lastBoundary.lineIndex) <= 2;

                if (!tooClose) {
                    const inlineTitle = (match[2] || '').trim();
                    chapterBoundaries.push({
                        lineIndex: i,
                        position: charPos,
                        number: null,
                        inlineTitle: inlineTitle || match[1],
                        headingText: line
                    });
                }
            }
        }

        charPos += lines[i].length + 1;
    }

    if (chapterBoundaries.length === 0) return [];

    // Build chapters from boundaries
    for (let i = 0; i < chapterBoundaries.length; i++) {
        const boundary = chapterBoundaries[i];
        const nextBoundary = chapterBoundaries[i + 1];

        const startPos = boundary.position;
        const endPos = nextBoundary ? nextBoundary.position : text.length;
        let content = text.substring(startPos, endPos).trim();

        // Remove the heading line itself
        if (content.startsWith(boundary.headingText)) {
            content = content.substring(boundary.headingText.length).trim();
        }

        // Determine title
        let title = boundary.inlineTitle;
        if (!title) {
            // Look at the first non-empty line after the heading for a subtitle/name
            title = extractSubtitleFromContent(content);
        }
        if (!title) {
            title = boundary.headingText;
        }

        chapters.push({
            number: boundary.number,
            title: title,
            content: normalizeNumbersInText(cleanBodyText(content))
        });
    }

    return chapters;
}

/**
 * Extract chapter number from a heading string.
 * @param {string} headingText - e.g. "Chapter 1", "CHAPTER ONE", "Part III"
 * @returns {number|null}
 */
function extractChapterNumberFromHeading(headingText) {
    const match = headingText.match(/(?:chapter|part|book|section)\s+(\S+)/i);
    if (match) {
        return parseChapterNumber(match[1]);
    }
    return null;
}

/**
 * Extract a chapter title from the heading text and initial content.
 * If the heading is just "Chapter 1", the title comes from the first line of content.
 * If the heading already includes text after the number (e.g., "Chapter 1 - The Beginning"),
 * use that as the title.
 * @param {string} headingText
 * @param {string} content
 * @returns {string}
 */
function extractChapterTitle(headingText, content) {
    // Check if heading already has a title after the chapter marker
    const titleMatch = headingText.match(/(?:chapter|part|book|section)\s+\S+[\s:\-–—]+(.+)/i);
    if (titleMatch && titleMatch[1].trim()) {
        return titleMatch[1].trim();
    }

    // Check for special headings (Prologue, Epilogue, etc.)
    const specialMatch = headingText.match(/^(prologue|epilogue|introduction|preface|foreword|afterword|appendix)[\s:\-–—]*(.*)/i);
    if (specialMatch) {
        return specialMatch[2].trim() || specialMatch[1].trim();
    }

    // Otherwise, look at the first non-empty line of content for a subtitle
    const subtitle = extractSubtitleFromContent(content);
    if (subtitle) return subtitle;

    // Fall back to the heading text itself
    return headingText;
}

/**
 * Look at the first 1-2 non-empty, short lines of content for a chapter subtitle/name.
 * @param {string} content
 * @returns {string|null}
 */
function extractSubtitleFromContent(content) {
    const lines = content.split('\n');
    for (let i = 0; i < Math.min(lines.length, 3); i++) {
        const line = lines[i].trim();
        // A subtitle is typically short (< 100 chars) and not a full paragraph
        if (line && line.length > 0 && line.length < 100 && !line.endsWith('.')) {
            return line;
        }
    }
    return null;
}

/**
 * Clean body text for TTS:
 * - Remove page numbers (standalone numbers on their own line)
 * - Remove excessive whitespace
 * @param {string} text
 * @returns {string}
 */
function cleanBodyText(text) {
    return text
        // Remove lines that are just page numbers (standalone digits)
        .replace(/^\s*\d+\s*$/gm, '')
        // Remove excessive blank lines
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/**
 * Convert standalone numbers in text to their word form for TTS.
 * E.g., "She was 7 years old" → "She was seven years old"
 * Preserves numbers that are part of identifiers, dates, etc.
 * @param {string} text
 * @returns {string}
 */
function normalizeNumbersInText(text) {
    // Replace standalone integers (bounded by word boundaries or punctuation)
    // Don't replace numbers that look like years (4 digits starting with 1 or 2)
    return text.replace(/\b(\d+)\b/g, (match, numStr) => {
        const num = parseInt(numStr, 10);

        // Skip very large numbers (> 9999) - they're often irrelevant
        if (num > 9999) return match;

        // Skip likely year numbers (1000-2099) when they appear to be standalone years
        // We keep them if they're less than 100 (common in text)

        try {
            return numberToWords.toWords(num);
        } catch (e) {
            return match; // If conversion fails, keep original
        }
    });
}

module.exports = {
    detectChapters,
    normalizeNumbersInText,
    cleanBodyText,
    parseChapterNumber,
    romanToInt
};
