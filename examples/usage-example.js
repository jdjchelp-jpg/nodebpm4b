/**
 * Example: Using bpm4b programmatically
 * 
 * This example demonstrates how to use the bpm4b library in your own Node.js code.
 */

const { convertMp3ToM4b, parseTimeToSeconds, checkFFmpeg } = require('../lib/core');

async function runExample() {
    try {
        // Check if FFmpeg is available
        console.log('Checking FFmpeg...');
        await checkFFmpeg();
        console.log('✓ FFmpeg is available\n');

        // Example 1: Parse time strings
        console.log('Example 1: Parsing time formats');
        console.log('  "6:30" ->', parseTimeToSeconds('6:30'), 'seconds');
        console.log('  390 ->', parseTimeToSeconds(390), 'seconds');
        console.log('  "1:30.5" ->', parseTimeToSeconds('1:30.5'), 'seconds\n');

        // Example 2: Convert MP3 to M4B with chapters
        console.log('Example 2: Converting MP3 to M4B');
        console.log('  Input: input.mp3');
        console.log('  Output: output.m4b');
        console.log('  Chapters:');
        console.log('    - "Introduction" at 0 seconds');
        console.log('    - "Chapter 1" at 5 minutes');
        console.log('    - "Chapter 2" at 30 minutes\n');

        // Uncomment to run actual conversion:
        // await convertMp3ToM4b('input.mp3', 'output.m4b', [
        //   { title: 'Introduction', start_time: 0 },
        //   { title: 'Chapter 1', start_time: 300 }, // 5 minutes
        //   { title: 'Chapter 2', start_time: 1800 } // 30 minutes
        // ]);
        // console.log('✓ Conversion complete!');

    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    runExample();
}

module.exports = { runExample };
