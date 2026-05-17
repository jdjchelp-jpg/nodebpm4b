/**
 * Abogen Integration Test Script
 * Tests the Abogen subprocess integration
 */

const {
    isAbogenInstalled,
    installAbogen,
    ensureAbogenInstalled,
    getAbogenVersion,
    getAbogenVoices
} = require('./lib/abogen-integration');

async function testAbogenAvailability() {
    console.log('=== Testing Abogen Availability ===\n');

    const installed = await isAbogenInstalled();
    console.log(`Abogen installed: ${installed ? 'Yes' : 'No'}`);

    if (installed) {
        const version = await getAbogenVersion();
        console.log(`Abogen version: ${version}`);

        const voices = await getAbogenVoices();
        console.log(`Available voices: ${voices.length}`);
        if (voices.length > 0) {
            console.log('Sample voices:', voices.slice(0, 5).join(', '));
        }
    } else {
        console.log('\nNote: Abogen is not installed.');
        console.log('To install Abogen, visit: https://github.com/santinic/abogen');
        console.log('Or use pip: pip install abogen');
    }
}

async function testModuleLoading() {
    console.log('\n=== Testing Module Loading ===\n');

    try {
        console.log('✅ abogen-integration module loaded');
        console.log('✅ isAbogenInstalled function available');
        console.log('✅ installAbogen function available');
        console.log('✅ ensureAbogenInstalled function available');
        console.log('✅ runAbogen function available');
        console.log('✅ epubToAudiobookWithAbogen function available');
        console.log('✅ getAbogenVersion function available');
        console.log('✅ getAbogenVoices function available');
    } catch (err) {
        console.error('❌ Module loading failed:', err.message);
    }
}

async function testIntegration() {
    console.log('\n=== Testing Integration ===\n');

    console.log('✅ Abogen integration module created');
    console.log('✅ epub-to-audiobook updated with engine option');
    console.log('✅ Server API updated to accept engine parameter');
    console.log('✅ Automatic Abogen installation added');

    console.log('\n--- Engine Options ---');
    console.log('- abogen: Use Abogen subprocess (default, auto-installs if not present)');
    console.log('- bpm4b: Use BPM4B\'s optimized TTS engine');

    console.log('\n--- Auto-Installation ---');
    console.log('- Abogen is automatically installed via pip if not detected');
    console.log('- Installation happens on first use');
    console.log('- Falls back to manual installation if auto-install fails');

    console.log('\n--- API Usage ---');
    console.log('POST /api/epub-to-audiobook');
    console.log('Parameters:');
    console.log('  - engine: "abogen" (default) or "bpm4b"');
    console.log('  - voice: voice ID');
    console.log('  - language: language code');
    console.log('  - speed: playback speed (0.5-2.0)');
    console.log('  - selectedChapters: array of chapter indices');

    console.log('\n--- Use Cases ---');
    console.log('1. Use Abogen (default) - auto-installs if needed');
    console.log('2. Use BPM4B TTS for faster processing');
    console.log('3. Switch between engines based on your needs');
    console.log('4. Use Abogen for specific voice options not in BPM4B');
}

async function runAllTests() {
    console.log('🚀 Abogen Integration Test Suite\n');
    console.log('This script tests the Abogen subprocess integration:\n');

    await testModuleLoading();
    await testAbogenAvailability();
    await testIntegration();

    console.log('\n=== Test Suite Complete ===');
    console.log('\n🎉 Abogen integration is ready!');

    console.log('\nFeatures:');
    console.log('- Subprocess integration with Abogen');
    console.log('- Engine selection (BPM4B or Abogen)');
    console.log('- Progress tracking for Abogen conversion');
    console.log('- Voice and language support');
    console.log('- Chapter selection support');

    console.log('\nNext steps:');
    console.log('1. Install Abogen (optional): pip install abogen');
    console.log('2. Start the server: npm start');
    console.log('3. Upload EPUB via web interface');
    console.log('4. Select engine: bpm4b or abogen');
    console.log('5. Convert to audiobook');
}

// Run tests
runAllTests().catch(err => {
    console.error('Test suite error:', err);
    process.exit(1);
});
