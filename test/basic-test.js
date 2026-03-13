/**
 * Tests for bpm4b module
 * Tests parseTimeToSeconds, chapter detection, and number conversion
 */

const { parseTimeToSeconds } = require('../lib/core');
const { detectChapters, normalizeNumbersInText, parseChapterNumber, romanToInt } = require('../lib/chapter-detector');
const { extractHeadingsFromText } = require('../lib/document-parser');
const { splitTextIntoChunks } = require('../lib/tts-engine');
const { validateActivationBytes } = require('../lib/aax-converter');

function runTests() {
    console.log('Running bpm4b tests...\n');

    let passed = 0;
    let failed = 0;

    function assert(condition, testName) {
        if (condition) {
            console.log(`  \u2713 ${testName}`);
            passed++;
        } else {
            console.log(`  \u2717 ${testName}`);
            failed++;
        }
    }

    // ── parseTimeToSeconds tests ──
    console.log('\n--- parseTimeToSeconds ---');
    const timeTests = [
        { input: 0, expected: 0 },
        { input: 390, expected: 390 },
        { input: 390.5, expected: 390.5 },
        { input: '390', expected: 390 },
        { input: '390.5', expected: 390.5 },
        { input: '6:30', expected: 390 },
        { input: '6:30.5', expected: 390.5 },
        { input: '0:00', expected: 0 },
        { input: '1:00', expected: 60 },
        { input: '10:30', expected: 630 },
        { input: '100:00', expected: 6000 },
    ];

    timeTests.forEach(test => {
        try {
            const result = parseTimeToSeconds(test.input);
            assert(result === test.expected, `parseTimeToSeconds(${JSON.stringify(test.input)}) = ${result}`);
        } catch (error) {
            assert(false, `parseTimeToSeconds(${JSON.stringify(test.input)}) threw: ${error.message}`);
        }
    });

    // Invalid time inputs
    const invalidTimeTests = ['invalid', 'abc:def', '10:', ':30'];
    invalidTimeTests.forEach(input => {
        try {
            parseTimeToSeconds(input);
            assert(false, `parseTimeToSeconds(${JSON.stringify(input)}) should throw`);
        } catch (error) {
            assert(true, `parseTimeToSeconds(${JSON.stringify(input)}) correctly throws`);
        }
    });

    // ── Chapter Detection tests ──
    console.log('\n--- Chapter Detection ---');

    // Test basic "Chapter X" pattern
    const text1 = `Chapter 1\nThe Beginning\nThis is the start of the story.\n\nChapter 2\nThe Middle\nThis is the middle.\n\nChapter 3\nThe End\nThis is the end.`;
    const chapters1 = detectChapters(text1);
    assert(chapters1.length === 3, `Detected 3 chapters from "Chapter X" pattern (got ${chapters1.length})`);
    assert(chapters1[0].number === 1, `First chapter number is 1`);
    assert(chapters1[1].number === 2, `Second chapter number is 2`);

    // Test "Chapter One" word form
    const text2 = `Chapter One\nIntroduction\nWelcome.\n\nChapter Two\nDetails\nMore content.`;
    const chapters2 = detectChapters(text2);
    assert(chapters2.length === 2, `Detected 2 chapters from "Chapter One" pattern (got ${chapters2.length})`);
    assert(chapters2[0].number === 1, `"Chapter One" -> number 1`);
    assert(chapters2[1].number === 2, `"Chapter Two" -> number 2`);

    // Test with headings provided
    const text3 = 'Welcome to the book.\n\nThis is the prologue.\n\nHere begins the real story.';
    const headings3 = [
        { level: 1, text: 'Prologue', position: 0 },
        { level: 1, text: 'Chapter 1', position: 32 }
    ];
    const chapters3 = detectChapters(text3, headings3);
    assert(chapters3.length === 2, `Detected 2 chapters from headings (got ${chapters3.length})`);

    // Test Prologue/Epilogue detection
    const text4 = `Prologue\nSome intro text.\n\nEpilogue\nSome ending text.`;
    const chapters4 = detectChapters(text4);
    assert(chapters4.length === 2, `Detected Prologue and Epilogue (got ${chapters4.length})`);

    // ── Number to Words tests ──
    console.log('\n--- Number to Words ---');

    const normalized1 = normalizeNumbersInText('She was 7 years old');
    assert(normalized1.includes('seven'), `"7" converted to "seven": "${normalized1}"`);

    const normalized2 = normalizeNumbersInText('There were 42 cats');
    assert(normalized2.includes('forty'), `"42" converted to word form: "${normalized2}"`);

    const normalized3 = normalizeNumbersInText('Page 1 of 100');
    assert(!normalized3.match(/\b\d+\b/), `All standalone numbers converted: "${normalized3}"`);

    // ── Roman Numeral tests ──
    console.log('\n--- Roman Numerals ---');
    assert(romanToInt('I') === 1, 'I = 1');
    assert(romanToInt('IV') === 4, 'IV = 4');
    assert(romanToInt('IX') === 9, 'IX = 9');
    assert(romanToInt('XIV') === 14, 'XIV = 14');
    assert(romanToInt('XLII') === 42, 'XLII = 42');

    // ── parseChapterNumber tests ──
    console.log('\n--- parseChapterNumber ---');
    assert(parseChapterNumber('1') === 1, '"1" -> 1');
    assert(parseChapterNumber('one') === 1, '"one" -> 1');
    assert(parseChapterNumber('ten') === 10, '"ten" -> 10');
    assert(parseChapterNumber('III') === 3, '"III" -> 3');
    assert(parseChapterNumber('iv') === 4, '"iv" -> 4');

    // ── Heading extraction from text ──
    console.log('\n--- Heading Extraction ---');
    const sampleText = `Some preamble text.\n\nChapter 1 - The Call\nIt was a dark night.\n\nChapter 2\nAnother day.\n\nPart 1\nThe first part.`;
    const headings = extractHeadingsFromText(sampleText);
    assert(headings.length >= 3, `Found at least 3 headings from text (got ${headings.length})`);

    // ── Text chunking tests ──
    console.log('\n--- Text Chunking ---');
    const shortText = 'Hello world.';
    const shortChunks = splitTextIntoChunks(shortText, 100);
    assert(shortChunks.length === 1, `Short text = 1 chunk (got ${shortChunks.length})`);

    const longText = 'This is a sentence. '.repeat(250);
    const longChunks = splitTextIntoChunks(longText, 500);
    assert(longChunks.length > 1, `Long text split into ${longChunks.length} chunks`);
    assert(longChunks.every(c => c.length <= 500), 'All chunks <= max length');

    // ── Activation bytes validation ──
    console.log('\n--- Activation Bytes ---');
    assert(validateActivationBytes('1a2b3c4d') === true, '"1a2b3c4d" is valid');
    assert(validateActivationBytes('AABBCCDD') === true, '"AABBCCDD" is valid');
    assert(validateActivationBytes('12345678') === true, '"12345678" is valid');
    assert(validateActivationBytes('1234567') === false, '"1234567" (7 chars) is invalid');
    assert(validateActivationBytes('1234567g') === false, '"1234567g" (non-hex) is invalid');
    assert(validateActivationBytes('') === false, 'Empty string is invalid');

    // ── Summary ──
    console.log(`\n${'─'.repeat(40)}`);
    console.log(`Tests: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
    console.log(`${'─'.repeat(40)}\n`);

    if (failed > 0) {
        process.exit(1);
    }
}

runTests();
