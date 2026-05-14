/**
 * Performance Test Script
 * Tests the new parallel processing and fast mode optimizations
 */

const { folderToM4b, convertMp3ToM4b } = require('./lib/core');
const path = require('path');
const fs = require('fs').promises;

async function testParallelProcessing() {
  console.log('=== Testing Parallel Processing ===\n');
  
  // Create a test folder with dummy files (or use existing test files)
  const testFolder = path.join(__dirname, 'test-audio-files');
  const outputFile = path.join(__dirname, 'test-output.m4b');
  
  try {
    await fs.mkdir(testFolder, { recursive: true });
    
    // Check if test files exist
    const files = await fs.readdir(testFolder);
    if (files.length === 0) {
      console.log('No test files found. Skipping folder test.');
      console.log('To test: Place audio files in test-audio-files/ directory');
      return;
    }
    
    console.log(`Found ${files.length} test files`);
    
    // Test with different concurrency levels
    const concurrencyLevels = [1, 2, 4, 8];
    
    for (const concurrency of concurrencyLevels) {
      console.log(`\n--- Testing with concurrency: ${concurrency} ---`);
      const startTime = Date.now();
      
      try {
        await folderToM4b(testFolder, outputFile, {
          concurrency,
          fastMode: true,
          audioQuality: '64k',
          onProgress: (percent, msg) => {
            if (percent % 20 === 0) {
              console.log(`  Progress: ${percent}% - ${msg}`);
            }
          }
        });
        
        const duration = (Date.now() - startTime) / 1000;
        console.log(`✅ Completed in ${duration.toFixed(2)}s with concurrency ${concurrency}`);
        
        // Clean up output
        await fs.unlink(outputFile).catch(() => {});
      } catch (err) {
        console.error(`❌ Failed with concurrency ${concurrency}:`, err.message);
      }
    }
    
  } catch (err) {
    console.error('Test setup error:', err.message);
  }
}

async function testFastMode() {
  console.log('\n=== Testing Fast Mode ===\n');
  
  // Use existing test.mp3 if available
  const inputFile = path.join(__dirname, 'test.mp3');
  const outputFile = path.join(__dirname, 'test-fast.m4b');
  
  try {
    if (!await fs.access(inputFile).then(() => true).catch(() => false)) {
      console.log('No test.mp3 found. Skipping fast mode test.');
      return;
    }
    
    // Test with fast mode enabled
    console.log('--- Testing with fastMode: true ---');
    const startTime1 = Date.now();
    
    await convertMp3ToM4b(inputFile, outputFile, {
      fastMode: true,
      audioQuality: '64k',
      onProgress: (percent, msg) => {
        if (percent % 25 === 0) {
          console.log(`  Progress: ${percent}% - ${msg}`);
        }
      }
    });
    
    const duration1 = (Date.now() - startTime1) / 1000;
    console.log(`✅ Fast mode completed in ${duration1.toFixed(2)}s`);
    
    await fs.unlink(outputFile).catch(() => {});
    
    // Test with fast mode disabled
    console.log('\n--- Testing with fastMode: false ---');
    const startTime2 = Date.now();
    
    await convertMp3ToM4b(inputFile, outputFile, {
      fastMode: false,
      audioQuality: '64k',
      onProgress: (percent, msg) => {
        if (percent % 25 === 0) {
          console.log(`  Progress: ${percent}% - ${msg}`);
        }
      }
    });
    
    const duration2 = (Date.now() - startTime2) / 1000;
    console.log(`✅ Normal mode completed in ${duration2.toFixed(2)}s`);
    
    const speedup = (duration2 / duration1).toFixed(2);
    console.log(`\n📊 Fast mode speedup: ${speedup}x`);
    
    await fs.unlink(outputFile).catch(() => {});
    
  } catch (err) {
    console.error('Fast mode test error:', err.message);
  }
}

async function testColabDetection() {
  console.log('\n=== Testing Colab Detection ===\n');
  
  const { isColabEnvironment, setupColabOptimizations } = require('./lib/colab-support');
  
  const isColab = isColabEnvironment();
  console.log(`Colab environment detected: ${isColab}`);
  
  const config = setupColabOptimizations();
  console.log('Colab config:', JSON.stringify(config, null, 2));
}

async function runAllTests() {
  console.log('🚀 BPM4B Performance Test Suite\n');
  console.log('This script tests the new performance optimizations:\n');
  console.log('- Parallel processing with configurable concurrency');
  console.log('- Fast mode FFmpeg optimizations');
  console.log('- Colab environment detection\n');
  
  await testColabDetection();
  await testFastMode();
  await testParallelProcessing();
  
  console.log('\n=== Test Suite Complete ===');
  console.log('\nNote: For accurate performance benchmarks, use larger audio files');
  console.log('and run multiple iterations to average the results.');
}

// Run tests
runAllTests().catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});
