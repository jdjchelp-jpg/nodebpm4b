#!/usr/bin/env node

/**
 * BPM4B - MP3 to M4B Audiobook Converter
 * Command-line interface for converting MP3 files to M4B format
 */

const { Command } = require('commander');
const path = require('path');
const fs = require('fs');
const { convertMp3ToM4b, checkFFmpeg } = require('../lib/core');

const program = new Command();

program
  .name('bpm4b')
  .description('MP3 to M4B Audiobook Converter')
  .version('3.0.0');

// Web command
program
  .command('web')
  .description('Start the web interface')
  .option('--host <host>', 'Host to bind to', '0.0.0.0')
  .option('--port <port>', 'Port to bind to', '5000')
  .option('--debug', 'Enable debug mode', false)
  .action(async (options) => {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║              MP3 to M4B Converter v3.0.0                      ║
║                                                               ║
║  Web interface starting...                                    ║
║  URL: http://${options.host !== '0.0.0.0' ? options.host : 'localhost'}:${options.port}                    ║
║  Debug mode: ${options.debug ? 'ON' : 'OFF'}                                   ║
╚═══════════════════════════════════════════════════════════════╝
    `);

    try {
      // Dynamic import to avoid loading server unless needed
      const { createServer } = require('../lib/server');
      const server = await createServer({
        port: options.port,
        host: options.host,
        debug: options.debug
      });

      server.listen(options.port, options.host, () => {
        console.log(`Server is running at http://${options.host === '0.0.0.0' ? 'localhost' : options.host}:${options.port}/`);
        console.log('Press Ctrl+C to stop the server');
      });

      // Handle graceful shutdown
      process.on('SIGINT', () => {
        console.log('\n\nServer stopped. Goodbye!');
        process.exit(0);
      });

      process.on('SIGTERM', () => {
        console.log('\n\nServer stopped. Goodbye!');
        process.exit(0);
      });
    } catch (error) {
      console.error('Error starting server:', error.message);
      process.exit(1);
    }
  });

// Convert command
program
  .command('convert')
  .description('Convert MP3 to M4B from command line')
  .argument('<input>', 'Input MP3 file path')
  .argument('<output>', 'Output M4B file path')
  .option('--chapter <title:start_time>', 'Add chapter marker (can be used multiple times)')
  .action(async (input, output, options) => {
    try {
      // Check if input file exists
      if (!fs.existsSync(input)) {
        console.error(`Error: Input file '${input}' not found`);
        process.exit(1);
      }

      // Ensure output directory exists
      const outputDir = path.dirname(output);
      if (outputDir) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Check FFmpeg
      try {
        await checkFFmpeg();
      } catch (error) {
        console.error('Error: FFmpeg is not installed or not in PATH');
        console.error('Install FFmpeg: https://ffmpeg.org/download.html');
        process.exit(1);
      }

      // Parse chapters if provided
      let chapters = null;
      if (options.chapter) {
        chapters = options.chapter.map(chapterStr => {
          const [title, startTime] = chapterStr.split(':');
          if (!title || !startTime) {
            throw new Error(`Invalid chapter format: ${chapterStr}. Use "Title:StartTime"`);
          }
          return {
            title: title,
            start_time: parseTimeToSeconds(startTime)
          };
        });
      }

      console.log(`Converting: ${input} -> ${output}`);

      await convertMp3ToM4b(input, output, chapters);

      console.log(`✓ Conversion complete: ${output}`);
    } catch (error) {
      console.error('Error during conversion:', error.message);
      process.exit(1);
    }
  });

// Parse time helper (duplicate from core for CLI usage)
function parseTimeToSeconds(timeInput) {
  if (typeof timeInput === 'number') {
    return timeInput;
  }

  if (typeof timeInput === 'string') {
    const trimmed = timeInput.trim();

    // Check if it's in MM:SS or M:SS or MM:SS.sss format first
    if (trimmed.includes(':')) {
      const parts = trimmed.split(':');
      if (parts.length === 2) {
        const minutes = parseFloat(parts[0]);
        const seconds = parseFloat(parts[1]);
        if (!isNaN(minutes) && !isNaN(seconds)) {
          return minutes * 60 + seconds;
        }
      }
      throw new Error(`Invalid time format: ${timeInput}. Use seconds (e.g., 390) or MM:SS (e.g., "6:30")`);
    }

    // Try parsing as a simple number
    const asNumber = parseFloat(trimmed);
    if (!isNaN(asNumber)) {
      return asNumber;
    }
  }

  throw new Error(`Invalid time format: ${timeInput}. Use seconds (e.g., 390) or MM:SS (e.g., "6:30")`);
}

// Parse command line arguments
program.parse();
