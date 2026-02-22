/**
 * Basic test for bpm4b module (without FFmpeg)
 * Tests the parseTimeToSeconds function
 */

const { parseTimeToSeconds } = require('../lib/core');

function runTests() {
    console.log('Running basic tests for bpm4b...\n');

    let passed = 0;
    let failed = 0;

    // Test cases
    const tests = [
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

    tests.forEach(test => {
        try {
            const result = parseTimeToSeconds(test.input);
            if (result === test.expected) {
                console.log(`✓ parseTimeToSeconds(${JSON.stringify(test.input)}) = ${result}`);
                passed++;
            } else {
                console.log(`✗ parseTimeToSeconds(${JSON.stringify(test.input)}) = ${result}, expected ${test.expected}`);
                failed++;
            }
        } catch (error) {
            console.log(`✗ parseTimeToSeconds(${JSON.stringify(test.input)}) threw: ${error.message}`);
            failed++;
        }
    });

    // Test invalid inputs
    const invalidTests = [
      'invalid',
      'abc:def',
      '10:',
      ':30'
    ];

    console.log('\nTesting invalid inputs (should throw errors):');
    invalidTests.forEach(input => {
        try {
            parseTimeToSeconds(input);
            console.log(`✗ parseTimeToSeconds(${JSON.stringify(input)}) should have thrown but didn't`);
            failed++;
        } catch (error) {
            console.log(`✓ parseTimeToSeconds(${JSON.stringify(input)}) correctly threw error`);
            passed++;
        }
    });

    console.log(`\n─────────────────────────────`);
    console.log(`Tests: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
    console.log(`─────────────────────────────\n`);

    if (failed > 0) {
        process.exit(1);
    }
}

runTests();
