/**
 * Vercel Serverless Function for MP3 to M4B conversion
 */

const { promises: fs } = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { convertMp3ToM4b, checkFFmpeg } = require('../lib/core');

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
        // Check for file in request
        if (!req.body || !req.files || !req.files.mp3_file) {
            return res.status(400).json({ error: 'No MP3 file provided' });
        }

        const mp3File = req.files.mp3_file;

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

        // Create temporary directories
        const tmpDir = path.join('/tmp');
        const uploadDir = path.join(tmpDir, 'uploads');
        const outputDir = path.join(tmpDir, 'outputs');

        await fs.mkdir(uploadDir, { recursive: true });
        await fs.mkdir(outputDir, { recursive: true });

        // Save uploaded file
        const mp3Filename = `${uuidv4()}.mp3`;
        const mp3Path = path.join(uploadDir, mp3Filename);
        await fs.writeFile(mp3Path, mp3File.data);

        // Create output filename
        const originalName = path.parse(mp3File.name).name;
        const outputFilename = `${originalName}.m4b`;
        const outputPath = path.join(outputDir, outputFilename);

        // Convert to M4B
        console.log(`Converting ${mp3Path} to ${outputPath}`);
        await convertMp3ToM4b(mp3Path, outputPath, chapters);

        // Cleanup uploaded file
        await fs.unlink(mp3Path);

        // Read output file
        const fileBuffer = await fs.readFile(outputPath);

        // Cleanup output file
        await fs.unlink(outputPath);

        // Set response headers
        res.setHeader('Content-Type', 'audio/x-m4b');
        res.setHeader('Content-Disposition', `attachment; filename="${outputFilename}"`);
        res.setHeader('Content-Length', fileBuffer.length);

        // Send file
        res.status(200).send(fileBuffer);

    } catch (error) {
        console.error('Error in serverless function:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
};
