/**
 * Document to EPUB Converter
 * Converts PDF, DOCX, TXT, MD, RTF, ODT, HTML, and more to EPUB format
 * Allows users to convert documents for use with Abogen or other EPUB tools
 */

const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const JSZip = require('jszip');
const fs = require('fs').promises;
const fss = require('fs'); // sync ops
const path = require('path');

// Optional marked dependency for Markdown parsing
let marked = null;
try {
    marked = require('marked');
} catch (e) {
    console.log('[Document to EPUB] marked not installed, Markdown parsing will be limited');
}

async function ocrPdfToText(pdfPath) {
    console.log(`[PDF to EPUB] Starting OCR on "${pdfPath}"... This may take a while.`);
    let tesseract, pdfImgConvert;
    try {
        tesseract = require('tesseract.js');
        pdfImgConvert = require('pdf-img-convert');
    } catch (err) {
        throw new Error('OCR dependencies (tesseract.js, pdf-img-convert) are not installed. Please run: npm install tesseract.js pdf-img-convert');
    }

    // Convert PDF to an array of PNG buffers (scale 2.0 for better OCR accuracy)
    const imgBuffers = await pdfImgConvert.convert(pdfPath, { scale: 2.0 });
    console.log(`[PDF to EPUB] PDF converted to ${imgBuffers.length} images for OCR.`);

    let extractedText = '';
    
    // Process pages sequentially to avoid overwhelming memory, though parallel is possible
    const worker = await tesseract.createWorker('eng');
    
    for (let i = 0; i < imgBuffers.length; i++) {
        console.log(`[PDF to EPUB] OCR scanning page ${i + 1}/${imgBuffers.length}...`);
        const { data: { text } } = await worker.recognize(imgBuffers[i]);
        extractedText += text + '\n\n';
    }
    
    await worker.terminate();
    console.log(`[PDF to EPUB] OCR completed successfully.`);
    return extractedText;
}

/**
 * Convert PDF to EPUB
 * @param {string} pdfPath - Path to PDF file
 * @param {string} outputPath - Output EPUB file path
 * @param {Object} metadata - Optional metadata (title, author, etc.)
 * @returns {Promise<Object>} Conversion result
 */
async function pdfToEpub(pdfPath, outputPath, metadata = {}) {
    console.log(`[PDF to EPUB] Converting "${pdfPath}" to EPUB (OCR mode: ${metadata.useOcr ? 'ON' : 'OFF'})`);
    
    let text = '';
    
    if (metadata.useOcr) {
        text = await ocrPdfToText(pdfPath);
    } else {
        // Parse PDF normally
        const dataBuffer = await fs.readFile(pdfPath);
        const pdfData = await pdfParse(dataBuffer);
        text = pdfData.text;
        
        // Auto-fallback to OCR if PDF is completely empty (scanned image)
        if (!text || text.trim().length < 50) {
            console.log(`[PDF to EPUB] Standard parsing yielded no text. Auto-falling back to OCR mode.`);
            text = await ocrPdfToText(pdfPath);
        }
    }
    
    text = cleanBoilerplate(text);
    
    const title = metadata.title || path.basename(pdfPath, '.pdf');
    const author = metadata.author || 'Unknown';
    
    // Split text into chapters (by paragraphs or sections)
    const chapters = splitTextIntoChapters(text);
    
    // Create EPUB
    await createEpubFromChapters(chapters, outputPath, {
        title,
        author,
        language: metadata.language || 'en',
        genre: metadata.genre || null,
        description: metadata.description || null
    });
    
    console.log(`[PDF to EPUB] Conversion complete: "${outputPath}"`);
    
    return {
        success: true,
        outputPath,
        metadata: {
            title,
            author,
            totalChapters: chapters.length,
            totalPages: chapters.length // We don't have accurate pages for OCR
        }
    };
}

/**
 * Convert DOCX to EPUB
 * @param {string} docxPath - Path to DOCX file
 * @param {string} outputPath - Output EPUB file path
 * @param {Object} metadata - Optional metadata (title, author, etc.)
 * @returns {Promise<Object>} Conversion result
 */
async function docxToEpub(docxPath, outputPath, metadata = {}) {
    console.log(`[DOCX to EPUB] Converting "${docxPath}" to EPUB`);
    
    // Parse DOCX
    const result = await mammoth.extractRawText({ path: docxPath });
    const text = result.value;
    
    const title = metadata.title || path.basename(docxPath, '.docx');
    const author = metadata.author || 'Unknown';
    
    // Split text into chapters
    const chapters = splitTextIntoChapters(text);
    
    // Create EPUB
    await createEpubFromChapters(chapters, outputPath, {
        title,
        author,
        language: metadata.language || 'en',
        genre: metadata.genre || null,
        description: metadata.description || null
    });
    
    console.log(`[DOCX to EPUB] Conversion complete: "${outputPath}"`);
    
    return {
        success: true,
        outputPath,
        metadata: {
            title,
            author,
            totalChapters: chapters.length
        }
    };
}

/**
 * Convert TXT to EPUB
 * @param {string} txtPath - Path to TXT file
 * @param {string} outputPath - Output EPUB file path
 * @param {Object} metadata - Optional metadata (title, author, etc.)
 * @returns {Promise<Object>} Conversion result
 */
async function txtToEpub(txtPath, outputPath, metadata = {}) {
    console.log(`[TXT to EPUB] Converting "${txtPath}" to EPUB`);
    
    // Read TXT with encoding detection
    const text = await readTextFile(txtPath);
    
    const title = metadata.title || path.basename(txtPath, path.extname(txtPath));
    const author = metadata.author || 'Unknown';
    
    // Split text into chapters
    const chapters = splitTextIntoChapters(text);
    
    // Create EPUB
    await createEpubFromChapters(chapters, outputPath, {
        title,
        author,
        language: metadata.language || 'en',
        genre: metadata.genre || null,
        description: metadata.description || null
    });
    
    console.log(`[TXT to EPUB] Conversion complete: "${outputPath}"`);
    
    return {
        success: true,
        outputPath,
        metadata: {
            title,
            author,
            totalChapters: chapters.length
        }
    };
}

/**
 * Convert Markdown to EPUB
 * @param {string} mdPath - Path to MD file
 * @param {string} outputPath - Output EPUB file path
 * @param {Object} metadata - Optional metadata (title, author, etc.)
 * @returns {Promise<Object>} Conversion result
 */
async function mdToEpub(mdPath, outputPath, metadata = {}) {
    console.log(`[MD to EPUB] Converting "${mdPath}" to EPUB`);
    
    // Read Markdown
    const text = await readTextFile(mdPath);
    
    const title = metadata.title || path.basename(mdPath, '.md');
    const author = metadata.author || 'Unknown';
    
    // Split text into chapters (Markdown headers become chapters)
    const chapters = splitMarkdownIntoChapters(text);
    
    // Create EPUB
    await createEpubFromChapters(chapters, outputPath, {
        title,
        author,
        language: metadata.language || 'en'
    });
    
    console.log(`[MD to EPUB] Conversion complete: "${outputPath}"`);
    
    return {
        success: true,
        outputPath,
        metadata: {
            title,
            author,
            totalChapters: chapters.length
        }
    };
}

/**
 * Convert HTML to EPUB
 * @param {string} htmlPath - Path to HTML file
 * @param {string} outputPath - Output EPUB file path
 * @param {Object} metadata - Optional metadata (title, author, etc.)
 * @returns {Promise<Object>} Conversion result
 */
async function htmlToEpub(htmlPath, outputPath, metadata = {}) {
    console.log(`[HTML to EPUB] Converting "${htmlPath}" to EPUB`);
    
    // Read HTML
    const text = await readTextFile(htmlPath);
    
    // Extract text from HTML
    const plainText = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    
    const title = metadata.title || path.basename(htmlPath, '.html');
    const author = metadata.author || 'Unknown';
    
    // Split text into chapters
    const chapters = splitHtmlIntoChapters(text);
    
    // Create EPUB
    await createEpubFromChapters(chapters, outputPath, {
        title,
        author,
        language: metadata.language || 'en'
    });
    
    console.log(`[HTML to EPUB] Conversion complete: "${outputPath}"`);
    
    return {
        success: true,
        outputPath,
        metadata: {
            title,
            author,
            totalChapters: chapters.length
        }
    };
}

/**
 * Convert RTF to EPUB
 * @param {string} rtfPath - Path to RTF file
 * @param {string} outputPath - Output EPUB file path
 * @param {Object} metadata - Optional metadata (title, author, etc.)
 * @returns {Promise<Object>} Conversion result
 */
async function rtfToEpub(rtfPath, outputPath, metadata = {}) {
    console.log(`[RTF to EPUB] Converting "${rtfPath}" to EPUB`);
    
    // Read RTF and extract text (basic RTF parsing)
    const text = await readTextFile(rtfPath);
    const plainText = extractTextFromRtf(text);
    
    const title = metadata.title || path.basename(rtfPath, '.rtf');
    const author = metadata.author || 'Unknown';
    
    // Split text into chapters
    const chapters = splitTextIntoChapters(plainText);
    
    // Create EPUB
    await createEpubFromChapters(chapters, outputPath, {
        title,
        author,
        language: metadata.language || 'en'
    });
    
    console.log(`[RTF to EPUB] Conversion complete: "${outputPath}"`);
    
    return {
        success: true,
        outputPath,
        metadata: {
            title,
            author,
            totalChapters: chapters.length
        }
    };
}

/**
 * Convert XML to EPUB
 * @param {string} xmlPath - Path to XML file
 * @param {string} outputPath - Output EPUB file path
 * @param {Object} metadata - Optional metadata (title, author, etc.)
 * @returns {Promise<Object>} Conversion result
 */
async function xmlToEpub(xmlPath, outputPath, metadata = {}) {
    console.log(`[XML to EPUB] Converting "${xmlPath}" to EPUB`);
    
    // Read XML and extract text
    const text = await readTextFile(xmlPath);
    const plainText = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    
    const title = metadata.title || path.basename(xmlPath, '.xml');
    const author = metadata.author || 'Unknown';
    
    // Split text into chapters
    const chapters = splitTextIntoChapters(plainText);
    
    // Create EPUB
    await createEpubFromChapters(chapters, outputPath, {
        title,
        author,
        language: metadata.language || 'en'
    });
    
    console.log(`[XML to EPUB] Conversion complete: "${outputPath}"`);
    
    return {
        success: true,
        outputPath,
        metadata: {
            title,
            author,
            totalChapters: chapters.length
        }
    };
}

/**
 * Convert TeX to EPUB
 * @param {string} texPath - Path to TeX file
 * @param {string} outputPath - Output EPUB file path
 * @param {Object} metadata - Optional metadata (title, author, etc.)
 * @returns {Promise<Object>} Conversion result
 */
async function texToEpub(texPath, outputPath, metadata = {}) {
    console.log(`[TeX to EPUB] Converting "${texPath}" to EPUB`);
    
    // Read TeX and extract text (basic TeX parsing)
    const text = await readTextFile(texPath);
    const plainText = extractTextFromTex(text);
    
    const title = metadata.title || path.basename(texPath, '.tex');
    const author = metadata.author || 'Unknown';
    
    // Split text into chapters
    const chapters = splitTextIntoChapters(plainText);
    
    // Create EPUB
    await createEpubFromChapters(chapters, outputPath, {
        title,
        author,
        language: metadata.language || 'en'
    });
    
    console.log(`[TeX to EPUB] Conversion complete: "${outputPath}"`);
    
    return {
        success: true,
        outputPath,
        metadata: {
            title,
            author,
            totalChapters: chapters.length
        }
    };
}

/**
 * Convert CSV to EPUB
 * @param {string} csvPath - Path to CSV file
 * @param {string} outputPath - Output EPUB file path
 * @param {Object} metadata - Optional metadata (title, author, etc.)
 * @returns {Promise<Object>} Conversion result
 */
async function csvToEpub(csvPath, outputPath, metadata = {}) {
    console.log(`[CSV to EPUB] Converting "${csvPath}" to EPUB`);
    
    // Read CSV
    const text = await readTextFile(csvPath);
    const lines = text.split('\n');
    
    // Convert CSV to readable text
    const readableText = lines.map(line => {
        const cells = line.split(',');
        return cells.join(' | ');
    }).join('\n\n');
    
    const title = metadata.title || path.basename(csvPath, '.csv');
    const author = metadata.author || 'Unknown';
    
    // Split text into chapters (each row could be a chapter)
    const chapters = splitTextIntoChapters(readableText);
    
    // Create EPUB
    await createEpubFromChapters(chapters, outputPath, {
        title,
        author,
        language: metadata.language || 'en'
    });
    
    console.log(`[CSV to EPUB] Conversion complete: "${outputPath}"`);
    
    return {
        success: true,
        outputPath,
        metadata: {
            title,
            author,
            totalChapters: chapters.length
        }
    };
}

/**
 * Convert ODT to EPUB
 * @param {string} odtPath - Path to ODT file
 * @param {string} outputPath - Output EPUB file path
 * @param {Object} metadata - Optional metadata (title, author, etc.)
 * @returns {Promise<Object>} Conversion result
 */
async function odtToEpub(odtPath, outputPath, metadata = {}) {
    console.log(`[ODT to EPUB] Converting "${odtPath}" to EPUB`);
    
    // ODT is a ZIP file containing XML - use mammoth which can handle it
    const result = await mammoth.extractRawText({ path: odtPath });
    const text = result.value;
    
    const title = metadata.title || path.basename(odtPath, '.odt');
    const author = metadata.author || 'Unknown';
    
    // Split text into chapters
    const chapters = splitTextIntoChapters(text);
    
    // Create EPUB
    await createEpubFromChapters(chapters, outputPath, {
        title,
        author,
        language: metadata.language || 'en'
    });
    
    console.log(`[ODT to EPUB] Conversion complete: "${outputPath}"`);
    
    return {
        success: true,
        outputPath,
        metadata: {
            title,
            author,
            totalChapters: chapters.length
        }
    };
}

/**
 * Convert ABW to EPUB
 * @param {string} abwPath - Path to ABW file
 * @param {string} outputPath - Output EPUB file path
 * @param {Object} metadata - Optional metadata (title, author, etc.)
 * @returns {Promise<Object>} Conversion result
 */
async function abwToEpub(abwPath, outputPath, metadata = {}) {
    console.log(`[ABW to EPUB] Converting "${abwPath}" to EPUB`);
    
    // ABW is XML-based - extract text
    const text = await readTextFile(abwPath);
    const plainText = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    
    const title = metadata.title || path.basename(abwPath, '.abw');
    const author = metadata.author || 'Unknown';
    
    // Split text into chapters
    const chapters = splitTextIntoChapters(plainText);
    
    // Create EPUB
    await createEpubFromChapters(chapters, outputPath, {
        title,
        author,
        language: metadata.language || 'en'
    });
    
    console.log(`[ABW to EPUB] Conversion complete: "${outputPath}"`);
    
    return {
        success: true,
        outputPath,
        metadata: {
            title,
            author,
            totalChapters: chapters.length
        }
    };
}

/**
 * Convert WPD to EPUB
 * @param {string} wpdPath - Path to WPD file
 * @param {string} outputPath - Output EPUB file path
 * @param {Object} metadata - Optional metadata (title, author, etc.)
 * @returns {Promise<Object>} Conversion result
 */
async function wpdToEpub(wpdPath, outputPath, metadata = {}) {
    console.log(`[WPD to EPUB] Converting "${wpdPath}" to EPUB`);
    
    // WPD (WordPerfect) - try mammoth as fallback, otherwise treat as binary
    try {
        const result = await mammoth.extractRawText({ path: wpdPath });
        const text = result.value;
        
        const title = metadata.title || path.basename(wpdPath, '.wpd');
        const author = metadata.author || 'Unknown';
        
        const chapters = splitTextIntoChapters(text);
        
        await createEpubFromChapters(chapters, outputPath, {
            title,
            author,
            language: metadata.language || 'en'
        });
        
        console.log(`[WPD to EPUB] Conversion complete: "${outputPath}"`);
        
        return {
            success: true,
            outputPath,
            metadata: {
                title,
                author,
                totalChapters: chapters.length
            }
        };
    } catch (err) {
        throw new Error(`WPD conversion not fully supported. Error: ${err.message}`);
    }
}

/**
 * Split text into chapters based on structure.
 * Uses 4 strategies in priority order:
 *   1. Explicit chapter/part/section keywords (Chapter 1, CHAPTER I, Part 2…)
 *   2. Heuristic heading detection — short isolated lines that look like titles
 *   3. Large-block fallback — only if strategies 1+2 yield 0 chapters
 *   4. Single-chapter last resort
 */
function splitTextIntoChapters(text) {
    // ── Strategy 1: Keyword-based split ──────────────────────────────────────
    // Patterns that include the heading text so we can label chapters properly
    const keywordPatterns = [
        // Numbered: "Chapter 1", "Chapter One", "CHAPTER 1", etc.
        /^((?:CHAPTER|Chapter)\s+(?:\d+|[IVXLCDM]+|[Oo]ne|[Tt]wo|[Tt]hree|[Ff]our|[Ff]ive|[Ss]ix|[Ss]even|[Ee]ight|[Nn]ine|[Tt]en|[Ee]leven|[Tt]welve|[Tt]hirteen|[Ff]ourteen|[Ff]ifteen|[Ss]ixteen|[Ss]eventeen|[Ee]ighteen|[Nn]ineteen|[Tt]wenty)(?:.*)?)\s*$/gim,
        /^((?:PART|Part)\s+(?:\d+|[IVXLCDM]+|[Oo]ne|[Tt]wo|[Tt]hree|[Ff]our|[Ff]ive|[Ss]ix|[Ss]even|[Ee]ight|[Nn]ine|[Tt]en)(?:.*)?)\s*$/gim,
        /^((?:SECTION|Section)\s+\d+(?:.*)?)\s*$/gim,
        /^((?:BOOK|Book)\s+(?:\d+|[IVXLCDM]+)(?:.*)?)\s*$/gim,
        /^((?:EPISODE|Episode|ACT|Act)\s+(?:\d+|[IVXLCDM]+)(?:.*)?)\s*$/gim,
    ];

    for (const pattern of keywordPatterns) {
        const result = _splitByPattern(text, pattern);
        if (result.length >= 2) {
            console.log(`[Document to EPUB] Strategy 1 (keyword): ${result.length} chapters`);
            return result;
        }
    }

    // ── Strategy 2: Heuristic heading detection ───────────────────────────────
    // Find lines that are "heading-like":
    //   • Standalone (surrounded by blank lines or at start/end)
    //   • Short (≤ 80 chars)
    //   • Not a sentence (doesn't end with . ? ! ; , mid-word)
    //   • Repeating structure (at least 2 such headings found)
    const headingResult = _splitByHeuristicHeadings(text);
    if (headingResult.length >= 2) {
        console.log(`[Document to EPUB] Strategy 2 (heuristic headings): ${headingResult.length} chapters`);
        return headingResult;
    }

    // ── Strategy 3: Large-block paragraph fallback ────────────────────────────
    // Estimate a reasonable chapter size: total_length / 10 (max 30 000 chars, min 3 000)
    const totalLen = text.length;
    const targetChapterSize = Math.min(30000, Math.max(3000, Math.floor(totalLen / 10)));
    const blockResult = _splitByBlockSize(text, targetChapterSize);
    if (blockResult.length >= 1) {
        console.log(`[Document to EPUB] Strategy 3 (block ${targetChapterSize} chars): ${blockResult.length} chapters`);
        return blockResult;
    }

    // ── Strategy 4: Single chapter ────────────────────────────────────────────
    console.log('[Document to EPUB] Strategy 4: single chapter');
    return [{ title: 'Chapter 1', content: text }];
}

/**
 * Split text by a regex pattern that matches the full heading line.
 * The pattern must have one capture group (the heading text).
 */
function _splitByPattern(text, pattern) {
    const chapters = [];
    const lines = text.split('\n');
    let currentTitle = null;
    let currentContent = [];

    for (const line of lines) {
        pattern.lastIndex = 0;
        const m = pattern.exec(line.trim());
        if (m) {
            // Save previous chapter
            if (currentContent.join('\n').trim().length > 80) {
                chapters.push({
                    title: currentTitle || `Chapter ${chapters.length + 1}`,
                    content: currentContent.join('\n').trim()
                });
            }
            currentTitle = m[1].trim();
            currentContent = [];
        } else {
            currentContent.push(line);
        }
    }

    // Push last chapter
    if (currentContent.join('\n').trim().length > 80) {
        chapters.push({
            title: currentTitle || `Chapter ${chapters.length + 1}`,
            content: currentContent.join('\n').trim()
        });
    }

    return chapters;
}

/**
 * Detect chapter boundaries using heading heuristics:
 * A line is a heading candidate if it is:
 *   - 1–80 characters long (trimmed)
 *   - Surrounded by blank lines (or at start of text)
 *   - Does NOT end with a sentence-ending punctuation that suggests body text
 *   - Is not a pure number (page numbers)
 *   - Contains at least 2 alphabetic characters
 */
function _splitByHeuristicHeadings(text) {
    const paragraphs = text.split(/\n{2,}/);
    const headingIndices = [];

    for (let i = 0; i < paragraphs.length; i++) {
        const para = paragraphs[i].trim();
        if (!para) continue;

        const lines = para.split('\n').map(l => l.trim()).filter(Boolean);
        // A heading paragraph has exactly 1-3 short lines
        if (lines.length > 3) continue;

        const mainLine = lines[0];
        if (mainLine.length === 0 || mainLine.length > 80) continue;

        // Must have at least 2 alpha chars (not a page number)
        if ((mainLine.match(/[a-zA-Z]/g) || []).length < 2) continue;

        // Should not end like body text
        if (/[,;]$/.test(mainLine)) continue;

        // Should not be a long sentence (word count > 10 and ends in .)
        const wordCount = mainLine.split(/\s+/).length;
        if (wordCount > 10 && /\.$/.test(mainLine)) continue;

        // Bonus: all-caps or starts with a number or contains "chapter/part"
        const isStrongHeading =
            /^[A-Z0-9\s\-:'"!]+$/.test(mainLine) ||
            /^(chapter|part|section|prologue|epilogue|introduction|foreword|preface|afterword|appendix|interlude|conclusion)/i.test(mainLine) ||
            /^\d+[\.\s]/.test(mainLine);

        // Weak headings (title case, short) are also included
        const isTitleCase = /^[A-Z]/.test(mainLine) && wordCount <= 8;

        if (isStrongHeading || isTitleCase) {
            headingIndices.push({ index: i, title: mainLine, lines });
        }
    }

    // Need at least 2 headings and a reasonable minimum spacing between them
    if (headingIndices.length < 2) return [];

    // Build chapters from heading indices
    const chapters = [];
    for (let h = 0; h < headingIndices.length; h++) {
        const startIdx = headingIndices[h].index + 1;
        const endIdx = h + 1 < headingIndices.length
            ? headingIndices[h + 1].index
            : paragraphs.length;

        const content = paragraphs.slice(startIdx, endIdx).join('\n\n').trim();
        if (content.length > 80) {
            chapters.push({
                title: headingIndices[h].title,
                content
            });
        }
    }

    // If there's content before the first heading, prepend it
    if (headingIndices[0].index > 0) {
        const preContent = paragraphs.slice(0, headingIndices[0].index).join('\n\n').trim();
        if (preContent.length > 100) {
            chapters.unshift({ title: 'Introduction', content: preContent });
        }
    }

    return chapters;
}

/**
 * Fallback: split into blocks of approximately targetSize chars,
 * breaking at paragraph boundaries.
 */
function _splitByBlockSize(text, targetSize) {
    const chapters = [];
    const paragraphs = text.split(/\n\n+/);
    let current = '';
    let index = 1;

    for (const para of paragraphs) {
        if (current.length > 0 && current.length + para.length > targetSize) {
            chapters.push({ title: `Chapter ${index}`, content: current.trim() });
            index++;
            current = para;
        } else {
            current += (current ? '\n\n' : '') + para;
        }
    }
    if (current.trim()) {
        chapters.push({ title: `Chapter ${index}`, content: current.trim() });
    }
    return chapters;
}

/**
 * Removes common front-matter boilerplate like copyright info, ISBN, publishers, etc.
 */
function cleanBoilerplate(text) {
    let clean = text;

    // Remove single line common boilerplates
    const patterns = [
        /^\s*©.*$/gm,
        /^\s*Copyright.*$/gim,
        /^\s*All rights reserved.*$/gim,
        /^\s*ISBN[\s\-0-9X]+.*$/gim,
        /^\s*First published.*$/gim,
        /^\s*Published by.*$/gim,
        /^\s*Printed (in|by).*$/gim,
        /^\s*Associated companies, branches.*$/gim,
        /^\s*No part of this publication may be reproduced.*$/gim,
        /^\s*system, or transmitted in any form.*$/gim,
        /^\s*photocopying, recording, or otherwise.*$/gim,
        /^\s*without the prior permission of the Copyright.*$/gim,
        /^\s*owner\.\s*$/gim,
        /^\s*and Colchester\s*$/gim,
        /^\s*.*\.indd\s*\d+\/\d+\/\d+\s+\d+:\d+:\d+\s+[AP]M\s*$/gim,
        /^\s*\d{1,3}[a-zA-Z][^\n]*?\d{1,4}\s*$/gim,
        /^\s*(CONTENTS|TABLE OF CONTENTS|NOTES)\s*$/gim,
        /^\s*\d+\s*$/gim
    ];

    for (const p of patterns) {
        clean = clean.replace(p, '');
    }

    // Clean up excessive blank lines created by removal
    clean = clean.replace(/\n\s*\n/g, '\n\n');

    return clean.trim();
}

/**
 * Split Markdown into chapters based on headers
 */
function splitMarkdownIntoChapters(markdown) {
    const chapters = [];
    const lines = markdown.split('\n');
    let currentChapter = { title: 'Chapter 1', content: '' };
    let chapterIndex = 1;
    
    for (const line of lines) {
        // Check for header (## or ### for chapters)
        const headerMatch = line.match(/^(#{2,3})\s+(.+)$/);
        if (headerMatch) {
            // Save previous chapter
            if (currentChapter.content.trim()) {
                chapters.push({
                    title: currentChapter.title,
                    content: currentChapter.content.trim()
                });
            }
            // Start new chapter
            chapterIndex++;
            currentChapter = {
                title: headerMatch[2].trim(),
                content: ''
            };
        } else {
            currentChapter.content += line + '\n';
        }
    }
    
    // Add final chapter
    if (currentChapter.content.trim()) {
        chapters.push({
            title: currentChapter.title,
            content: currentChapter.content.trim()
        });
    }
    
    // Fallback if no headers found
    if (chapters.length === 0) {
        return splitTextIntoChapters(markdown);
    }
    
    console.log(`[Document to EPUB] Markdown split into ${chapters.length} chapters`);
    return chapters;
}

/**
 * Split HTML into chapters based on headings
 */
function splitHtmlIntoChapters(html) {
    const chapters = [];
    
    // Extract heading and content pairs
    const headingPattern = /<h([1-3])[^>]*>(.*?)<\/h\1>/gi;
    const headings = [];
    let match;
    
    while ((match = headingPattern.exec(html)) !== null) {
        headings.push({
            level: parseInt(match[1]),
            title: match[2].replace(/<[^>]*>/g, '').trim(),
            position: match.index
        });
    }
    
    if (headings.length >= 2) {
        for (let i = 0; i < headings.length; i++) {
            const start = headings[i].position;
            const end = i < headings.length - 1 ? headings[i + 1].position : html.length;
            const content = html.substring(start, end);
            
            // Extract text content
            const textContent = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
            
            if (textContent.length > 100) {
                chapters.push({
                    title: headings[i].title,
                    content: textContent
                });
            }
        }
    } else {
        // Fallback to plain text splitting
        const plainText = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        return splitTextIntoChapters(plainText);
    }
    
    console.log(`[Document to EPUB] HTML split into ${chapters.length} chapters`);
    return chapters;
}

/**
 * Read text file with encoding detection
 */
async function readTextFile(filePath) {
    try {
        // Try UTF-8 first
        const buffer = await fs.readFile(filePath);
        const text = buffer.toString('utf-8');
        
        // Check for encoding issues (replacement characters)
        if (text.includes('\uFFFD')) {
            // Try Latin-1
            try {
                return buffer.toString('latin1');
            } catch (e) {
                return text;
            }
        }
        
        return text;
    } catch (err) {
        throw new Error(`Failed to read file: ${err.message}`);
    }
}

/**
 * Extract text from RTF (basic implementation)
 */
function extractTextFromRtf(rtf) {
    // Remove RTF control words and formatting
    let text = rtf
        .replace(/\\[a-zA-Z]+\d*/g, '') // Remove control words
        .replace(/\\[^a-zA-Z]/g, '') // Remove other control sequences
        .replace(/[{}]/g, '') // Remove braces
        .replace(/\\u\d+\?/g, ' ') // Handle Unicode
        .replace(/\\'[0-9a-fA-F]{2}/g, ' ') // Handle hex characters
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();
    
    return text;
}

/**
 * Extract text from TeX (basic implementation)
 */
function extractTextFromTex(tex) {
    // Remove TeX commands and formatting
    let text = tex
        .replace(/\\[a-zA-Z]+\{[^}]*\}/g, '') // Remove commands with arguments
        .replace(/\\[a-zA-Z]+/g, '') // Remove simple commands
        .replace(/[{}]/g, '') // Remove braces
        .replace(/\\%/g, '%') // Handle escaped percent
        .replace(/\\_/g, '_') // Handle escaped underscore
        .replace(/\\&/g, '&') // Handle escaped ampersand
        .replace(/\\#/g, '#') // Handle escaped hash
        .replace(/\\$/g, '$') // Handle escaped dollar
        .replace(/\$/g, '') // Remove math mode delimiters
        .replace(/%.*/g, '') // Remove comments
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();
    
    return text;
}

/**
 * Create EPUB from chapters using JSZip (no external epub library needed)
 * Generates a valid EPUB 3.0 / EPUB 2.0.1-compatible file
 */
async function createEpubFromChapters(chapters, outputPath, metadata) {
    const zip = new JSZip();

    const title       = metadata.title       || 'Untitled';
    const author      = metadata.author      || 'Unknown';
    const language    = metadata.language    || 'en';
    const genre       = metadata.genre       || '';
    const description = metadata.description || '';
    const bookId      = `bpm4b-${Date.now()}`;

    // ── mimetype (must be first, uncompressed) ──
    zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

    // ── META-INF/container.xml ──
    zip.folder('META-INF').file('container.xml',
`<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);

    const oebps = zip.folder('OEBPS');

    // ── Chapter XHTML files ──
    const chapterManifestItems = [];
    const chapterSpineItems    = [];

    chapters.forEach((chapter, i) => {
        const id       = `chapter_${i}`;
        const filename = `${id}.xhtml`;
        const safeTitle = (chapter.title || `Chapter ${i + 1}`)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        // Convert plain text content to XHTML paragraphs
        const paragraphs = (chapter.content || '')
            .split(/\n{2,}/)
            .filter(p => p.trim().length > 0)
            .map(p => `    <p>${p.trim()
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\n/g, '<br/>')}</p>`)
            .join('\n');

        const xhtml =
`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${language}">
<head>
  <meta http-equiv="Content-Type" content="application/xhtml+xml; charset=UTF-8"/>
  <title>${safeTitle}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <h2>${safeTitle}</h2>
${paragraphs}
</body>
</html>`;

        oebps.file(filename, xhtml);
        chapterManifestItems.push(`    <item id="${id}" href="${filename}" media-type="application/xhtml+xml"/>`);
        chapterSpineItems.push(`    <itemref idref="${id}"/>`);
    });

    // ── CSS stylesheet ──
    oebps.file('style.css',
`body { font-family: Georgia, serif; margin: 2em; line-height: 1.6; }
h2 { font-size: 1.4em; margin-bottom: 1em; }
p { margin-bottom: 0.8em; text-align: justify; }`);

    // ── Table of Contents (toc.ncx) ──
    const navPoints = chapters.map((ch, i) => {
        const safeTitle = (ch.title || `Chapter ${i + 1}`)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return `  <navPoint id="chapter_${i}" playOrder="${i + 1}">
    <navLabel><text>${safeTitle}</text></navLabel>
    <content src="chapter_${i}.xhtml"/>
  </navPoint>`;
    }).join('\n');

    oebps.file('toc.ncx',
`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${bookId}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${title.replace(/&/g, '&amp;')}</text></docTitle>
  <navMap>
${navPoints}
  </navMap>
</ncx>`);

    // ── content.opf (package document) ──
    const genreTag       = genre       ? `\n    <dc:subject>${genre.replace(/&/g, '&amp;')}</dc:subject>` : '';
    const descriptionTag = description ? `\n    <dc:description>${description.replace(/&/g, '&amp;')}</dc:description>` : '';

    oebps.file('content.opf',
`<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="BookID">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:title>${title.replace(/&/g, '&amp;')}</dc:title>
    <dc:creator opf:role="aut">${author.replace(/&/g, '&amp;')}</dc:creator>
    <dc:language>${language}</dc:language>
    <dc:identifier id="BookID" opf:scheme="UUID">${bookId}</dc:identifier>${genreTag}${descriptionTag}
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="stylesheet" href="style.css" media-type="text/css"/>
${chapterManifestItems.join('\n')}
  </manifest>
  <spine toc="ncx">
${chapterSpineItems.join('\n')}
  </spine>
</package>`);

    // ── Write the ZIP to disk ──
    const zipBuffer = await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
        mimeType: 'application/epub+zip'
    });

    await fs.writeFile(outputPath, zipBuffer);
    console.log(`[Document to EPUB] EPUB written: ${outputPath}`);
}

/**
 * Auto-detect document type and convert to EPUB
 */
async function documentToEpub(docPath, outputPath, metadata = {}) {
    const ext = path.extname(docPath).toLowerCase();
    
    switch (ext) {
        // PDF
        case '.pdf':
            return await pdfToEpub(docPath, outputPath, metadata);
        
        // Word documents
        case '.docx':
        case '.doc':
        case '.docm':
        case '.dot':
        case '.dotx':
            return await docxToEpub(docPath, outputPath, metadata);
        
        // Plain text variants
        case '.txt':
        case '.text':
        case '.asc':
        case '.ansi':
        case '.log':
        case '.me':
        case '.0':
        case '.1st':
        case '.600':
        case '.602':
        case '.info':
            return await txtToEpub(docPath, outputPath, metadata);
        
        // Markdown
        case '.md':
        case '.markdown':
            return await mdToEpub(docPath, outputPath, metadata);
        
        // HTML variants
        case '.html':
        case '.htm':
        case '.xhtml':
        case '.xht':
            return await htmlToEpub(docPath, outputPath, metadata);
        
        // XML
        case '.xml':
            return await xmlToEpub(docPath, outputPath, metadata);
        
        // RTF
        case '.rtf':
            return await rtfToEpub(docPath, outputPath, metadata);
        
        // TeX
        case '.tex':
        case '.bib':
            return await texToEpub(docPath, outputPath, metadata);
        
        // CSV
        case '.csv':
            return await csvToEpub(docPath, outputPath, metadata);
        
        // OpenDocument (ODT, ODM, OTT)
        case '.odt':
        case '.odm':
        case '.ott':
            return await odtToEpub(docPath, outputPath, metadata);
        
        // AbiWord
        case '.abw':
            return await abwToEpub(docPath, outputPath, metadata);
        
        // WordPerfect
        case '.wpd':
            return await wpdToEpub(docPath, outputPath, metadata);
        
        // EPUB (Healing/Optimization)
        case '.epub':
            console.log(`[EPUB Healing] Optimizing existing EPUB: ${docPath}`);
            try {
                const { parseEpub } = require('./epub-parser');
                const epubData = await parseEpub(docPath);
                return await createEpubFromChapters(epubData.chapters, outputPath, {
                    title: metadata.title || epubData.metadata.title,
                    author: metadata.author || epubData.metadata.author,
                    language: metadata.language || epubData.metadata.language
                });
            } catch (err) {
                console.warn(`[EPUB Healing] Direct parse failed, attempting raw extraction: ${err.message}`);
                // Fallback: treat as zip and find content? No, just throw error if even parseEpub fails
                throw new Error(`Failed to heal EPUB: ${err.message}`);
            }

        default:
            throw new Error(`Unsupported document format: ${ext}. Supported formats: PDF, EPUB (Healing), DOCX, DOC, DOCM, DOT, DOTX, TXT, TEXT, ASC, ANSI, LOG, ME, MD, HTML, HTM, XHTML, XHT, XML, RTF, TEX, BIB, CSV, ODT, ODM, OTT, ABW, WPD`);
    }
}

module.exports = {
    pdfToEpub,
    docxToEpub,
    txtToEpub,
    mdToEpub,
    htmlToEpub,
    rtfToEpub,
    xmlToEpub,
    texToEpub,
    csvToEpub,
    odtToEpub,
    abwToEpub,
    wpdToEpub,
    documentToEpub,
    splitTextIntoChapters,
    splitMarkdownIntoChapters,
    splitHtmlIntoChapters
};
