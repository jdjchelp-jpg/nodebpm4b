/**
 * Express web server for BPM4B
 * Provides web interface and API for MP3 to M4B conversion
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { convertMp3ToM4b, convertM3U8ToMkv, smartConvert, checkFFmpeg } = require('./core');

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(process.cwd(), 'uploads');
        fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 100 * 1024 * 1024 // 100MB max
    },
    fileFilter: (req, file, cb) => {
        // Accept MP3 and M3U8 files
        const isValidMp3 = file.mimetype === 'audio/mpeg' || file.originalname.endsWith('.mp3');
        const isValidM3U8 = file.mimetype === 'application/x-mpegurl' ||
            file.mimetype === 'audio/mpegurl' ||
            file.originalname.endsWith('.m3u8') ||
            file.originalname.endsWith('.m3u');

        if (isValidMp3 || isValidM3U8) {
            cb(null, true);
        } else {
            cb(new Error('Only MP3 and M3U8 files are allowed'), false);
        }
    }
});

/**
 * Create and configure the Express server
 * @param {Object} options - Server options
 * @param {number} options.port - Port to listen on
 * @param {string} options.host - Host to bind to
 * @param {boolean} options.debug - Enable debug logging
 * @returns {express.Application}
 */
function createServer(options = {}) {
    const {
        port = 5000,
        host = '0.0.0.0',
        debug = false
    } = options;

    const app = express();
    const uploadsDir = path.join(process.cwd(), 'uploads');
    const outputsDir = path.join(process.cwd(), 'outputs');

    // Ensure directories exist
    fs.mkdirSync(uploadsDir, { recursive: true });
    fs.mkdirSync(outputsDir, { recursive: true });

    // Middleware
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(express.static(path.join(__dirname, '..', 'public')));
    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, '..', 'templates'));

    // Logging middleware if debug
    if (debug) {
        app.use((req, res, next) => {
            console.log(`${req.method} ${req.path}`);
            next();
        });
    }

    // Routes

    // Home page
    app.get('/', (req, res) => {
        res.render('index', {
            title: 'BPM4B - Professional Multimedia Converter',
            version: '7.0.0'
        });
    });

    // Universal Conversion API (supports MP3→M4B and M3U8→MKV)
    app.post('/api/convert', upload.single('source_file'), async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'No source file provided' });
            }

            // Determine file type
            const fileExt = path.extname(req.file.originalname).toLowerCase();
            const isMp3 = fileExt === '.mp3' || req.file.mimetype === 'audio/mpeg';
            const isM3U8 = fileExt === '.m3u8' || fileExt === '.m3u' ||
                          req.file.mimetype === 'application/x-mpegurl' ||
                          req.file.mimetype === 'audio/mpegurl';

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

            // Get audio quality setting (default based on type)
            const audioQuality = req.body.audio_quality || (isMp3 ? '64k' : '128k');

            // Determine output filename and type
            const originalName = path.parse(req.file.originalname).name;
            const customOutputName = req.body.output_name || '';
            const outputExt = isMp3 ? 'm4b' : 'mkv';
            const outputFilename = customOutputName.trim() || `${originalName}.${outputExt}`;
            const outputPath = path.join(outputsDir, outputFilename);

            // Perform conversion using smartConvert
            const inputType = isMp3 ? 'mp3' : 'm3u8';
            console.log(`Converting ${req.file.path} (${inputType.toUpperCase()}) to ${outputPath} with quality ${audioQuality}`);
            
            await smartConvert({
                inputPath: req.file.path,
                outputPath: outputPath,
                inputType: inputType,
                chapters: chapters,
                audioQuality: audioQuality
            });

            // Cleanup uploaded file
            fs.unlink(req.file.path, err => {
                if (err) console.error('Error deleting uploaded file:', err);
            });

            // Send the file
            res.download(outputPath, outputFilename, (err) => {
                // Cleanup output file after sending
                fs.unlink(outputPath, unlinkErr => {
                    if (unlinkErr) console.error('Error deleting output file:', unlinkErr);
                });

                if (err) {
                    console.error('Error sending file:', err);
                    res.status(500).json({ error: 'Error sending file' });
                }
            });
        } catch (error) {
            console.error('Error in convert:', error);
            res.status(500).json({ error: error.message || 'Internal server error' });
        }
    });

    // Legacy endpoint for backward compatibility
    app.post('/api/mp3-to-m4b', upload.single('mp3_file'), async (req, res) => {
        // Redirect to new endpoint
        req.body.source_file = req.body.mp3_file || req.files?.mp3_file;
        req.body.output_name = ''; // Let it auto-generate
        // Re-route by calling the new handler logic
        // For simplicity, we'll just return a deprecation message
        res.status(301).json({
            message: 'This endpoint is deprecated. Please use /api/convert',
            new_endpoint: '/api/convert'
        });
    });

    // Health check endpoint
    app.get('/api/health', async (req, res) => {
        try {
            await checkFFmpeg();
            res.json({ status: 'ok', ffmpeg: true, version: '7.0.0' });
        } catch (error) {
            res.json({ status: 'ok', ffmpeg: false, error: error.message });
        }
    });

    // Health check endpoint
    app.get('/api/health', async (req, res) => {
        try {
            await checkFFmpeg();
            res.json({ status: 'ok', ffmpeg: true });
        } catch (error) {
            res.json({ status: 'ok', ffmpeg: false, error: error.message });
        }
    });

    // Error handling middleware
    app.use((err, req, res, next) => {
        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ error: 'File too large. Maximum size is 100MB.' });
            }
            return res.status(400).json({ error: err.message });
        }

        if (err) {
            return res.status(400).json({ error: err.message });
        }

        next();
    });

    // 404 handler
    app.use((req, res) => {
        res.status(404).json({ error: 'Not found' });
    });

    return app;
}

module.exports = {
    createServer,
    checkFFmpeg
};
