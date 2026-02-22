/**
 * Express web server for BPM4B
 * Provides web interface and API for MP3 to M4B conversion
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { convertMp3ToM4b, checkFFmpeg } = require('./core');

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
        // Accept only MP3 files
        if (file.mimetype === 'audio/mpeg' || file.originalname.endsWith('.mp3')) {
            cb(null, true);
        } else {
            cb(new Error('Only MP3 files are allowed'), false);
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
            title: 'MP3 to M4B Converter',
            version: '2.0.0'
        });
    });

    // API: Convert MP3 to M4B
    app.post('/api/mp3-to-m4b', upload.single('mp3_file'), async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'No MP3 file provided' });
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

            // Create output filename
            const originalName = path.parse(req.file.originalname).name;
            const outputFilename = `${originalName}.m4b`;
            const outputPath = path.join(outputsDir, outputFilename);

            // Convert to M4B
            console.log(`Converting ${req.file.path} to ${outputPath}`);
            await convertMp3ToM4b(req.file.path, outputPath, chapters);

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
            console.error('Error in mp3_to_m4b:', error);
            res.status(500).json({ error: error.message || 'Internal server error' });
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
