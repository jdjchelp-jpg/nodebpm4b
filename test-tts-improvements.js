/**
 * TTS Improvements Test Script
 * Tests the new TTS optimizations for speed and complete text coverage
 */

const { splitTextIntoChunks } = require('./lib/tts-engine');
const path = require('path');
const fs = require('fs').promises;

async function testTextChunking() {
  console.log('=== Testing Text Chunking ===\n');
  
  // Test with various text samples
  const testTexts = [
    {
      name: 'Short text',
      text: 'This is a short text that should fit in one chunk.'
    },
    {
      name: 'Medium text',
      text: 'This is a medium length text. It has multiple sentences. Each sentence should be handled properly. The chunking algorithm should split at sentence boundaries. This ensures natural speech patterns are maintained.'
    },
    {
      name: 'Long text',
      text: 'This is a much longer text that needs to be split into multiple chunks. It contains many sentences. Each sentence should be split at appropriate boundaries. The algorithm should prioritize sentence endings. Then it should look for paragraph breaks. After that, it should try word boundaries. Finally, it should use punctuation boundaries. This ensures that no words are cut in the middle. The overlap feature should prevent any text from being lost at chunk boundaries. This is important for complete text coverage. The validation should warn if any text is missing. Testing with various lengths helps ensure robustness.'
    },
    {
      name: 'Text with paragraphs',
      text: 'First paragraph with some text.\n\nSecond paragraph with more text.\n\nThird paragraph to test paragraph splitting.'
    },
    {
      name: 'Text with punctuation',
      text: 'First sentence, with a comma. Second sentence; with a semicolon. Third sentence: with a colon. Fourth sentence! With exclamation. Fifth sentence? With question mark.'
    }
  ];
  
  for (const test of testTexts) {
    console.log(`\n--- Testing: ${test.name} ---`);
    console.log(`Original length: ${test.text.length} chars`);
    
    const chunks = splitTextIntoChunks(test.text, 500);
    console.log(`Chunks created: ${chunks.length}`);
    
    const totalChunkedLength = chunks.join('').length;
    const coveragePercent = (totalChunkedLength / test.text.length) * 100;
    console.log(`Coverage: ${totalChunkedLength}/${test.text.length} chars (${coveragePercent.toFixed(1)}%)`);
    
    if (coveragePercent < 95) {
      console.warn(`⚠️  WARNING: Low coverage (${coveragePercent.toFixed(1)}%)`);
    } else {
      console.log(`✅ Good coverage (${coveragePercent.toFixed(1)}%)`);
    }
    
    // Show chunk sizes
    chunks.forEach((chunk, i) => {
      console.log(`  Chunk ${i + 1}: ${chunk.length} chars - "${chunk.substring(0, 50)}${chunk.length > 50 ? '...' : ''}"`);
    });
  }
}

async function testChunkOverlap() {
  console.log('\n=== Testing Chunk Overlap ===\n');
  
  const longText = 'Word '.repeat(100); // 500 chars
  console.log(`Testing with ${longText.length} character text`);
  
  const chunks = splitTextIntoChunks(longText, 200);
  console.log(`Created ${chunks.length} chunks with max length 200`);
  
  // Check for overlap
  for (let i = 0; i < chunks.length - 1; i++) {
    const currentEnd = chunks[i].slice(-20);
    const nextStart = chunks[i + 1].slice(0, 20);
    console.log(`Chunk ${i + 1} end: "${currentEnd}"`);
    console.log(`Chunk ${i + 2} start: "${nextStart}"`);
  }
}

async function testPerformance() {
  console.log('\n=== Testing Performance ===\n');
  
  const largeText = 'This is a test sentence. '.repeat(100); // ~2500 chars
  console.log(`Testing with ${largeText.length} character text`);
  
  const iterations = 10;
  const times = [];
  
  for (let i = 0; i < iterations; i++) {
    const start = Date.now();
    const chunks = splitTextIntoChunks(largeText, 500);
    const duration = Date.now() - start;
    times.push(duration);
    console.log(`Iteration ${i + 1}: ${duration}ms, ${chunks.length} chunks`);
  }
  
  const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  
  console.log(`\nPerformance Summary:`);
  console.log(`  Average: ${avgTime.toFixed(2)}ms`);
  console.log(`  Min: ${minTime}ms`);
  console.log(`  Max: ${maxTime}ms`);
  console.log(`  Throughput: ${(largeText.length / avgTime).toFixed(0)} chars/ms`);
}

async function testEdgeCases() {
  console.log('\n=== Testing Edge Cases ===\n');
  
  const edgeCases = [
    {
      name: 'Empty string',
      text: ''
    },
    {
      name: 'Single character',
      text: 'A'
    },
    {
      name: 'No spaces',
      text: 'ThisTextHasNoSpacesItShouldStillSplit'
    },
    {
      name: 'Only spaces',
      text: '     '
    },
    {
      name: 'Mixed whitespace',
      text: 'Text\nwith\tvarious   whitespace'
    }
  ];
  
  for (const test of edgeCases) {
    console.log(`\n--- Testing: ${test.name} ---`);
    console.log(`Input: "${test.text}" (${test.text.length} chars)`);
    
    try {
      const chunks = splitTextIntoChunks(test.text, 500);
      console.log(`Chunks: ${chunks.length}`);
      if (chunks.length > 0) {
        chunks.forEach((chunk, i) => {
          console.log(`  Chunk ${i + 1}: "${chunk}" (${chunk.length} chars)`);
        });
      }
    } catch (err) {
      console.error(`Error: ${err.message}`);
    }
  }
}

async function runAllTests() {
  console.log('🚀 TTS Improvements Test Suite\n');
  console.log('This script tests the new TTS optimizations:\n');
  console.log('- Improved text chunking with overlap');
  console.log('- Better boundary detection');
  console.log('- Text coverage validation');
  console.log('- Performance improvements\n');
  
  await testTextChunking();
  await testChunkOverlap();
  await testPerformance();
  await testEdgeCases();
  
  console.log('\n=== Test Suite Complete ===');
  console.log('\nKey Improvements:');
  console.log('- Smaller chunk size (500 chars) for better stability');
  console.log('- Chunk overlap (20 chars) to prevent text loss');
  console.log('- Better boundary detection (6 priority levels)');
  console.log('- Text coverage validation (warns if < 95%)');
  console.log('- More lenient truncation detection (50% threshold)');
  console.log('- Increased worker pool (up to 8 workers)');
  console.log('- Reduced GC overhead (only on error)');
}

// Run tests
runAllTests().catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});
