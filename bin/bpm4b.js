#!/usr/bin/env node

/**
 * BPM4B - Professional Multimedia Converter v8.0.0
 * Command-line interface for converting MP3 to M4B, M3U8 to MKV,
 * Documents to Audiobooks, and AAX to M4B/M4A
 */

const { Command } = require('commander');
const path = require('path');
const fs = require('fs');
const { smartConvert, checkFFmpeg, parseTimeToSeconds } = require('../lib/core');

const program = new Command();

program
  .name('bpm4b')
  .description('Professional Multimedia Converter - MP3 to M4B, M3U8 to MKV, Document to Audiobook, AAX Converter')
  .version('8.0.0');

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
║          BPM4B Professional Converter v8.0.0                 ║
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

// Convert command (supports MP3->M4B and M3U8->MKV)
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

      console.log(`\u2713 Conversion complete: ${output}`);
    } catch (error) {
      console.error('Error during conversion:', error.message);
      process.exit(1);
    }
  });

// Audiobook command (Document -> M4B via TTS)
program
  .command('audiobook')
  .description('Convert a document (PDF/DOCX/TXT/EPUB) to an audiobook (M4B) using TTS')
  .argument('<input>', 'Input document file path')
  .argument('<output>', 'Output M4B file path')
  .requiredOption('--api-key <key>', 'OpenRouter API key')
  .option('--voice <voice>', 'TTS voice (alloy, echo, fable, onyx, nova, shimmer)', 'alloy')
  .option('--model <model>', 'TTS model (openai/tts-1, openai/tts-1-hd)', 'openai/tts-1')
  .option('--speed <speed>', 'Speech speed (0.25 - 4.0)', '1.0')
  .option('--quality <bitrate>', 'Audio quality for M4B (e.g., 64k, 128k)', '64k')
  .option('--preview', 'Preview detected chapters without generating audio', false)
  .action(async (input, output, options) => {
    try {
      if (!fs.existsSync(input)) {
        console.error(`Error: Input file '${input}' not found`);
        process.exit(1);
      }

      const ext = path.extname(input).toLowerCase();
      const validExts = ['.pdf', '.docx', '.doc', '.txt', '.epub'];
      if (!validExts.includes(ext)) {
        console.error(`Error: Unsupported file type. Supported: ${validExts.join(', ')}`);
        process.exit(1);
      }

      try {
        await checkFFmpeg();
      } catch (error) {
        console.error('Error: FFmpeg is not available');
        process.exit(1);
      }

      if (options.preview) {
        const { previewChapters } = require('../lib/audiobook-builder');
        console.log(`\nAnalyzing document: ${input}\n`);
        const preview = await previewChapters(input);
        console.log(`Detected ${preview.chapters.length} chapter(s):`);
        console.log(`Estimated duration: ${preview.estimatedDuration}\n`);
        preview.chapters.forEach((ch, i) => {
          console.log(`  ${i + 1}. ${ch.title} (${ch.wordCount} words)`);
          console.log(`     Preview: ${ch.preview.substring(0, 80)}...`);
        });
        console.log(`\nTotal characters: ${preview.totalCharacters.toLocaleString()}`);
        return;
      }

      const { buildAudiobook } = require('../lib/audiobook-builder');
      const outputDir = path.dirname(output);
      if (outputDir) fs.mkdirSync(outputDir, { recursive: true });

      console.log(`\nGenerating audiobook: ${input} -> ${output}`);
      console.log(`  Voice: ${options.voice} | Model: ${options.model} | Speed: ${options.speed}\n`);

      const result = await buildAudiobook(input, output, {
        apiKey: options.apiKey,
        voice: options.voice,
        model: options.model,
        speed: parseFloat(options.speed),
        audioQuality: options.quality,
        onProgress: (stage, detail) => {
          console.log(`  [${stage}] ${detail}`);
        }
      });

      console.log(`\n\u2713 Audiobook created: ${output}`);
      console.log(`  Chapters: ${result.chapters.length}`);
      console.log(`  Duration: ${Math.floor(result.totalDuration / 60)}m ${Math.floor(result.totalDuration % 60)}s`);
    } catch (error) {
      console.error('Error during audiobook generation:', error.message);
      process.exit(1);
    }
  });

// AAX Conversion command
program
  .command('convert-aax')
  .description('Convert Audible AAX to M4B/M4A (preserves chapters and cover art)')
  .argument('<input>', 'Input AAX file path')
  .argument('<output>', 'Output file path (.m4b or .m4a)')
  .requiredOption('--activation-bytes <hex>', '8-character hex activation bytes for your Audible account')
  .option('--extract-cover', 'Extract cover art as a separate image', false)
  .action(async (input, output, options) => {
    try {
      if (!fs.existsSync(input)) {
        console.error(`Error: Input file '${input}' not found`);
        process.exit(1);
      }

      const ext = path.extname(input).toLowerCase();
      if (ext !== '.aax' && ext !== '.aa') {
        console.error('Error: Input must be an AAX or AA file');
        process.exit(1);
      }

      try {
        await checkFFmpeg();
      } catch (error) {
        console.error('Error: FFmpeg is not available');
        process.exit(1);
      }

      const { convertAAX } = require('../lib/aax-converter');
      const outputDir = path.dirname(output);
      if (outputDir) fs.mkdirSync(outputDir, { recursive: true });

      console.log(`\nConverting AAX: ${input} -> ${output}`);

      const result = await convertAAX(input, output, options.activationBytes, {
        extractCover: options.extractCover
      });

      console.log(`\u2713 Conversion complete: ${output}`);
      if (result.coverPath) {
        console.log(`\u2713 Cover art extracted: ${result.coverPath}`);
      }
    } catch (error) {
      console.error('Error during AAX conversion:', error.message);
      process.exit(1);
    }
  });

// Parse command line arguments
program.parse();
