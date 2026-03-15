/**
 * Express web server for BPM4B
 * Provides web interface and API for MP3 to M4B, M3U8 to MKV,
 * Document to Audiobook, and AAX conversion.
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { convertMp3ToM4b, convertM3U8ToMkv, smartConvert, checkFFmpeg } = require('./core');
const { buildAudiobook, previewChapters } = require('./audiobook-builder');
const { convertAAX, getAAXMetadata, validateActivationBytes } = require('./aax-converter');
const { AVAILABLE_VOICES, AVAILABLE_MODELS } = require('./tts-engine');

const progressClients = new Map();

// Configure multer for audio file uploads
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
        fileSize: 2000 * 1024 * 1024 // 2GB max
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

// Configure multer for document uploads (PDF, DOCX, TXT, EPUB)
const documentUpload = multer({
    storage: storage,
    limits: {
        fileSize: 2000 * 1024 * 1024 // 2GB max for documents
    },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const validExts = ['.pdf', '.docx', '.doc', '.txt', '.epub'];
        if (validExts.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Only PDF, DOCX, TXT, and EPUB files are allowed'), false);
        }
    }
});

// Configure multer for AAX uploads
const aaxUpload = multer({
    storage: storage,
    limits: {
        fileSize: 2000 * 1024 * 1024 // 2GB max for AAX files
    },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext === '.aax' || ext === '.aa') {
            cb(null, true);
        } else {
            cb(new Error('Only AAX and AA files are allowed'), false);
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
            version: '9.0.0'
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
            const isM4B = fileExt === '.m4b' || fileExt === '.m4a' || req.file.mimetype === 'audio/mp4' || req.file.mimetype === 'audio/x-m4a';

            if (!isMp3 && !isM4B) {
                return res.status(400).json({ error: 'Unsupported file type. Only MP3 and M4B/M4A files are allowed.' });
            }

            // Parse chapters if provided
            let chapters = null;
            if (req.body.chapters) {
                try {
                    const chaptersData = JSON.parse(req.body.chapters);
                    if (Array.isArray(chaptersData) && chaptersData.length > 0) {
                        chapters = chaptersData.map(chapter => ({
                            title: chapter.title,
                            // Handle both Frontend (startTime) and Backend (start_time) naming
                            start_time: parseFloat(chapter.start_time || chapter.startTime || 0),
                            end_time: chapter.end_time || chapter.endTime ? parseFloat(chapter.end_time || chapter.endTime) : undefined
                        }));

                        // Sort chapters by start time
                        chapters.sort((a, b) => a.start_time - b.start_time);

                        // Calculate end times if not provided
                        // Keep chapters contiguous; FFmpeg handles adjacent times well
                        for (let i = 0; i < chapters.length; i++) {
                            if (!chapters[i].end_time && i < chapters.length - 1) {
                                const nextStartTime = chapters[i + 1].start_time;
                                chapters[i].end_time = Math.max(chapters[i].start_time + 0.001, nextStartTime);
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
            const outputExt = isMp3 ? 'm4b' : 'mp3';
            const outputFilename = customOutputName.trim() || `${originalName}.${outputExt}`;
            const outputPath = path.join(outputsDir, outputFilename);

            // perform conversion
            const inputType = isMp3 ? 'mp3' : 'm4b';
            const jobId = req.body.jobId || uuidv4();

            await smartConvert({
                inputPath: req.file.path,
                outputPath: outputPath,
                inputType: inputType,
                chapters: chapters,
                audioQuality: audioQuality,
                onProgress: (percent, msg) => {
                    const client = progressClients.get(jobId);
                    if (client) {
                        client.write(`data: ${JSON.stringify({ percent, message: msg })}\n\n`);
                    }
                }
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
            res.json({
                status: 'ok',
                ffmpeg: true,
                engine: 'Kokoro Local',
                version: '9.0.0'
            });
        } catch (error) {
            res.json({
                status: 'error',
                ffmpeg: false,
                error: error.message
            });
        }
    });

    // SSE Progress Endpoint
    app.get('/api/progress/:jobId', (req, res) => {
        const { jobId } = req.params;
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        progressClients.set(jobId, res);

        req.on('close', () => {
            progressClients.delete(jobId);
        });
    });

    // ── Document-to-Audiobook Endpoints ──

    // Preview chapter detection (no TTS, fast)
    app.post('/api/preview-chapters', documentUpload.single('document_file'), async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'No document file provided' });
            }

            const preview = await previewChapters(req.file.path);

            // Cleanup uploaded file
            fs.unlink(req.file.path, err => {
                if (err) console.error('Error deleting uploaded file:', err);
            });

            res.json(preview);
        } catch (error) {
            // Cleanup on error
            if (req.file) {
                fs.unlink(req.file.path, () => { });
            }
            console.error('Error in preview-chapters:', error);
            res.status(500).json({ error: error.message || 'Failed to preview chapters' });
        }
    });

    // Full document-to-audiobook conversion
    app.post('/api/document-to-audiobook', documentUpload.single('document_file'), async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'No document file provided' });
            }

            const voice = req.body.voice || 'af_heart';
            const model = req.body.model || 'kokoro-82m';
            const speed = parseFloat(req.body.speed) || 1.0;
            const audioQuality = req.body.audio_quality || '64k';

            // Determine output filename
            const originalName = path.parse(req.file.originalname).name;
            const customOutputName = req.body.output_name || '';
            const outputFilename = customOutputName.trim() || `${originalName}.m4b`;
            const outputPath = path.join(outputsDir, outputFilename);

            console.log(`Starting audiobook generation: ${req.file.originalname} → ${outputFilename}`);

            // If SSE is requested via jobId, use the progressClients map
            const jobId = req.body.jobId;
            const onProgress = (percent, message) => {
                const client = progressClients.get(jobId);
                if (client) {
                    client.write(`data: ${JSON.stringify({ percent, message })}\n\n`);
                }
                // Also log to console for debugging
                console.log(`  [Progress] ${percent}% - ${message}`);
            };

            try {
                let customChapters = null;
                if (req.body.chapters) {
                    try { customChapters = JSON.parse(req.body.chapters); } catch (e) { }
                }

                const result = await buildAudiobook(req.file.path, outputPath, {
                    voice, model, speed, audioQuality, customChapters,
                    onProgress: onProgress
                });

                // Notify client of completion via SSE if jobId exists
                onProgress(100, 'Audiobook generated successfully!');
                
                // For document-to-audiobook, we usually send the file back directly in standard POST
                // or provide a download link in SSE.
                if (jobId && progressClients.has(jobId)) {
                    const client = progressClients.get(jobId);
                    client.write(`data: ${JSON.stringify({ 
                        percent: 100, 
                        message: 'Complete', 
                        downloadUrl: `/api/download/${path.basename(outputPath)}` 
                    })}\n\n`);
                }

                res.download(outputPath, outputFilename, (err) => {
                    fs.unlink(outputPath, () => { });
                });
            } catch (err) {
                onProgress(0, `Error: ${err.message}`);
                res.status(500).json({ error: err.message });
            } finally {
                fs.unlink(req.file.path, () => { });
            }

            let customChapters = null;
            if (req.body.chapters) {
                try { customChapters = JSON.parse(req.body.chapters); } catch (e) {}
            }

            // Standard (non-SSE) response
            const result = await buildAudiobook(req.file.path, outputPath, {
                voice, model, speed, audioQuality, customChapters,
                onProgress: (stage, detail) => {
                    console.log(`  [${stage}] ${detail}`);
                }
            });

            // Cleanup uploaded file
            fs.unlink(req.file.path, () => { });

            // Send the file
            res.download(outputPath, outputFilename, (err) => {
                fs.unlink(outputPath, () => { });
                if (err && !res.headersSent) {
                    res.status(500).json({ error: 'Error sending file' });
                }
            });

        } catch (error) {
            if (req.file) fs.unlink(req.file.path, () => { });
            console.error('Error in document-to-audiobook:', error);
            res.status(500).json({ error: error.message || 'Audiobook generation failed' });
        }
    });

    // Download endpoint for SSE workflow
    app.get('/api/download/:filename', (req, res) => {
        const filePath = path.join(outputsDir, req.params.filename);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found' });
        }
        res.download(filePath, req.params.filename, (err) => {
            fs.unlink(filePath, () => { });
        });
    });

    // ── AAX Conversion Endpoints ──

    app.post('/api/convert-aax', aaxUpload.single('aax_file'), async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'No AAX file provided' });
            }

            const activationBytes = req.body.activation_bytes;
            if (!activationBytes || !validateActivationBytes(activationBytes)) {
                fs.unlink(req.file.path, () => { });
                return res.status(400).json({
                    error: 'Invalid activation bytes. Must be 8 hexadecimal characters (e.g., "1a2b3c4d").'
                });
            }

            const outputFormat = req.body.output_format || 'm4b';
            const extractCover = req.body.extract_cover === 'true';
            const originalName = path.parse(req.file.originalname).name;
            const customOutputName = req.body.output_name || '';
            const outputFilename = customOutputName.trim() || `${originalName}.${outputFormat}`;
            const outputPath = path.join(outputsDir, outputFilename);

            console.log(`Converting AAX: ${req.file.originalname} → ${outputFilename}`);

            const result = await convertAAX(req.file.path, outputPath, activationBytes, {
                extractCover
            });

            // Cleanup uploaded file
            fs.unlink(req.file.path, () => { });

            // Send the converted file
            res.download(outputPath, outputFilename, (err) => {
                fs.unlink(outputPath, () => { });
                if (result.coverPath) {
                    fs.unlink(result.coverPath, () => { });
                }
                if (err && !res.headersSent) {
                    res.status(500).json({ error: 'Error sending file' });
                }
            });

        } catch (error) {
            if (req.file) fs.unlink(req.file.path, () => { });
            console.error('Error in convert-aax:', error);
            res.status(500).json({ error: error.message || 'AAX conversion failed' });
        }
    });

    // TTS config endpoint (available voices and models)
    app.get('/api/tts-config', (req, res) => {
        res.json({
            voices: AVAILABLE_VOICES,
            models: AVAILABLE_MODELS,
            engine: 'local-kokoro'
        });
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
