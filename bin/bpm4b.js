#!/usr/bin/env node

/**
 * BPM4B - Professional Multimedia Converter v7.0.0
 * Command-line interface for converting MP3 to M4B and M3U8 to MKV
 */

const { Command } = require('commander');
const path = require('path');
const fs = require('fs');
const { smartConvert, checkFFmpeg, parseTimeToSeconds } = require('../lib/core');

const program = new Command();

program
  .name('bpm4b')
  .description('Professional Multimedia Converter - MP3 to M4B and M3U8 to MKV')
  .version('7.0.0');

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
║          BPM4B Professional Converter v7.0.0                 ║
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

// Convert command (supports MP3→M4B and M3U8→MKV)
program
  .command('convert')
  .description('Convert audio files from command line (auto-detects format)')
  .argument('<input>', 'Input file path (MP3 or M3U8)')
  .argument('<output>', 'Output file path (M4B for MP3, MKV for M3U8)')
  .option('--chapter <title:start_time>', 'Add chapter marker (can be used multiple times)')
  .option('--quality <bitrate>', 'Audio quality (e.g., 64k, 128k, 192k)', (isMp3) => isMp3 ? '64k' : '128k')
  .action(async (input, output, options) => {
    try {
      // Check if input file exists
      if (!fs.existsSync(input)) {
        console.error(`Error: Input file '${input}' not found`);
        process.exit(1);
      }

      // Determine file type from extension
      const ext = path.extname(input).toLowerCase();
      const isMp3 = ext === '.mp3';
      const isM3U8 = ext === '.m3u8' || ext === '.m3u';

      if (!isMp3 && !isM3U8) {
        console.error('Error: Unsupported file type. Supported: .mp3, .m3u8, .m3u');
        process.exit(1);
      }

      // Ensure output directory exists
      const outputDir = path.dirname(output);
      if (outputDir) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Check FFmpeg (bundled)
      try {
        await checkFFmpeg();
      } catch (error) {
        console.error('Error: FFmpeg is not available');
        console.error('The bundled FFmpeg binary could not be loaded.');
        console.error('Please reinstall the package or report this issue.');
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

      const fileType = isMp3 ? 'MP3' : 'M3U8';
      const quality = options.quality || (isMp3 ? '64k' : '128k');
      console.log(`Converting ${fileType}: ${input} -> ${output} (quality: ${quality})`);

      await smartConvert({
        inputPath: input,
        outputPath: output,
        inputType: isMp3 ? 'mp3' : 'm3u8',
        chapters: chapters,
        audioQuality: quality
      });

      console.log(`✓ Conversion complete: ${output}`);
    } catch (error) {
      console.error('Error during conversion:', error.message);
      process.exit(1);
    }
  });

// Parse command line arguments
program.parse();
