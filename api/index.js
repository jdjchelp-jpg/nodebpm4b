/**
 * Vercel Serverless Function for BPM4B v7.0.0
 * Supports MP3→M4B and M3U8→MKV conversions
 */

const { promises: fs } = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { smartConvert, checkFFmpeg } = require('../lib/core');

// Vercel serverless function handler
module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS, POST');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    try {
        // Check for file in request - support both mp3_file and source_file
        const fileField = req.files?.mp3_file || req.files?.source_file;
        if (!req.body || !fileField) {
            return res.status(400).json({ error: 'No source file provided' });
        }

        const uploadedFile = fileField;

        // Determine file type
        const fileExt = path.extname(uploadedFile.name).toLowerCase();
        const isMp3 = fileExt === '.mp3' || uploadedFile.mimetype === 'audio/mpeg';
        const isM3U8 = fileExt === '.m3u8' || fileExt === '.m3u' ||
                      uploadedFile.mimetype === 'application/x-mpegurl' ||
                      uploadedFile.mimetype === 'audio/mpegurl';

        if (!isMp3 && !isM3U8) {
            return res.status(400).json({ error: 'Unsupported file type. Only MP3 and M3U8 files are allowed.' });
        }

        // Parse chapters if provided
        let chapters = null;
        if (req.body.chapters) {
            try {
                const chaptersData = JSON.parse(req.body.chapters);
                if (Array.isArray(chaptersData) && chaptersData.length > 0) {
                    chapters = chaptersData.map(chapter => ({
                        title: chapter.title,
                        start_time: parseFloat(chapter.start_time) || chapter.start_time,
                        end_time: chapter.end_time ? parseFloat(chapter.end_time) || chapter.end_time : undefined
                    }));

                    // Sort chapters by start time
                    chapters.sort((a, b) => a.start_time - b.start_time);

                    // Calculate end times if not provided
                    for (let i = 0; i < chapters.length; i++) {
                        if (!chapters[i].end_time && i < chapters.length - 1) {
                            chapters[i].end_time = chapters[i + 1].start_time;
                        }
                    }
                }
            } catch (error) {
                console.error('Error parsing chapters:', error.message);
                chapters = null;
            }
        }

        // Get audio quality setting
        const inputType = isMp3 ? 'mp3' : 'm3u8';
        const audioQuality = req.body.audio_quality || (isMp3 ? '64k' : '128k');

        // Create temporary directories
        const tmpDir = path.join('/tmp');
        const uploadDir = path.join(tmpDir, 'uploads');
        const outputDir = path.join(tmpDir, 'outputs');

        await fs.mkdir(uploadDir, { recursive: true });
        await fs.mkdir(outputDir, { recursive: true });

        // Save uploaded file
        const fileExtActual = isMp3 ? '.mp3' : (isM3U8 ? '.m3u8' : '.bin');
        const inputFilename = `${uuidv4()}${fileExtActual}`;
        const inputPath = path.join(uploadDir, inputFilename);
        await fs.writeFile(inputPath, uploadedFile.data);

        // Create output filename
        const originalName = path.parse(uploadedFile.name).name;
        const outputExt = isMp3 ? 'm4b' : 'mkv';
        const customOutputName = req.body.output_name || '';
        const outputFilename = customOutputName.trim() || `${originalName}.${outputExt}`;
        const outputPath = path.join(outputDir, outputFilename);

        // Convert using smartConvert
        console.log(`Converting ${inputPath} (${inputType.toUpperCase()}) to ${outputPath}`);
        await smartConvert({
            inputPath: inputPath,
            outputPath: outputPath,
            inputType: inputType,
            chapters: chapters,
            audioQuality: audioQuality
        });

        // Cleanup uploaded file
        await fs.unlink(inputPath);

        // Read output file
        const fileBuffer = await fs.readFile(outputPath);

        // Cleanup output file
        await fs.unlink(outputPath);

        // Set response headers based on output type
        const contentType = isMp3 ? 'audio/x-m4b' : 'video/x-matroska';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${outputFilename}"`);
        res.setHeader('Content-Length', fileBuffer.length);

        // Send file
        res.status(200).send(fileBuffer);

    } catch (error) {
        console.error('Error in serverless function:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
};
