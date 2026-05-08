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
const { convertMp3ToM4b, convertM3U8ToMkv, smartConvert, checkFFmpeg, detectSilence, audioGlue } = require('./core');
const { buildAudiobook, previewChapters } = require('./audiobook-builder');
const { generateChapterAudio, AVAILABLE_VOICES, AVAILABLE_MODELS } = require('./tts-engine');
const https = require('https');
const ffmpegPath = require('ffmpeg-static');

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
        // Store original filename for chapter naming
        file.originalName = file.originalname;
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
        const isValidM4b = file.originalname.endsWith('.m4b') ||
            file.originalname.endsWith('.m4a') ||
            file.mimetype === 'audio/mp4' ||
            file.mimetype === 'audio/x-m4a';

        if (isValidMp3 || isValidM3U8 || isValidM4b) {
            cb(null, true);
        } else {
            cb(new Error('Only MP3, M4B, M4A, and M3U8 files are allowed'), false);
        }
    }
});

// Configure multer for document uploads (PDF, DOCX, TXT, EPUB)
const documentUpload = multer({
    storage: storage,
    limits: {
        fileSize: 2000 * 1024 * 1024 // 2GB max for documents
    },
        cb(null, true);
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
            version: '11.0.0'
        });
    });

    // Metadata Lookup API (Open Library)
    app.get('/api/metadata/lookup', async (req, res) => {
        const title = req.query.title;
        if (!title) return res.status(400).json({ error: 'Title is required' });

        const url = `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&limit=1`;

        https.get(url, (apiRes) => {
            let data = '';
            apiRes.on('data', (chunk) => data += chunk);
            apiRes.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.docs && json.docs.length > 0) {
                        const book = json.docs[0];
                        const result = {
                            title: book.title,
                            author: book.author_name ? book.author_name[0] : 'Unknown Author',
                            genre: book.subject ? book.subject[0] : 'Audiobook',
                            description: book.first_sentence ? book.first_sentence[0] : '',
                            coverUrl: book.cover_i ? `https://covers.openlibrary.org/b/id/${book.cover_i}-L.jpg` : null
                        };
                        res.json(result);
                    } else {
                        res.json({ error: 'No books found' });
                    }
                } catch (e) {
                    res.status(500).json({ error: 'Failed to parse metadata' });
                }
            });
        }).on('error', (err) => {
            res.status(500).json({ error: 'Metadata service unavailable' });
        });
    });

    // Extract Metadata from M4B/M4A file
    app.post('/api/metadata/extract', upload.single('file'), async (req, res) => {
        try {
            // Check if FFmpeg is available
            try {
                await checkFFmpeg();
            } catch (ffmpegError) {
                return res.status(500).json({
                    error: 'FFmpeg is not installed or not available. Please install FFmpeg to use metadata features. Visit https://ffmpeg.org/download.html for installation instructions.'
                });
            }

            if (!req.file) {
                return res.status(400).json({ error: 'No file provided' });
            }

            const filePath = req.file.path;
            const ext = path.extname(req.file.originalname).toLowerCase();

            if (ext !== '.m4b' && ext !== '.m4a') {
                fs.unlink(filePath, () => { });
                return res.status(400).json({ error: 'Only M4B and M4A files are supported' });
            }

            // Use ffprobe to extract metadata
            const { execSync } = require('child_process');
            let metadata = {};

            try {
                const ffprobeCmd = `ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`;
                const output = execSync(ffprobeCmd, { encoding: 'utf8' });
                const probeData = JSON.parse(output);

                if (probeData.format && probeData.format.tags) {
                    const tags = probeData.format.tags;
                    metadata = {
                        title: tags.title || tags.TITLE || '',
                        author: tags.artist || tags.ARTIST || tags.album_artist || tags.ALBUM_ARTIST || '',
                        genre: tags.genre || tags.GENRE || '',
                        description: tags.comment || tags.COMMENT || tags.description || tags.DESCRIPTION || ''
                    };
                }

                // Extract cover art if present
                if (probeData.streams) {
                    const coverStream = probeData.streams.find(s => s.codec_type === 'video' && s.disposition && s.disposition.attached_pic);
                    if (coverStream) {
                        try {
                            const coverPath = path.join(path.dirname(filePath), `cover_${Date.now()}.jpg`);
                            execSync(`"${ffmpegPath}" -i "${filePath}" -an -vcodec copy "${coverPath}" -y`, { encoding: 'utf8' });
                            const coverData = fs.readFileSync(coverPath);
                            metadata.coverBase64 = `data:image/jpeg;base64,${coverData.toString('base64')}`;
                            fs.unlink(coverPath, () => { });
                        } catch (coverErr) {
                            console.log('Could not extract cover art:', coverErr.message);
                        }
                    }
                }
            } catch (probeErr) {
                console.error('ffprobe error:', probeErr.message);
                return res.status(500).json({ error: 'Failed to extract metadata from file' });
            }

            // Clean up uploaded file
            fs.unlink(filePath, () => { });

            res.json(metadata);
        } catch (error) {
            console.error('Metadata extraction error:', error);
            if (req.file) {
                fs.unlink(req.file.path, () => { });
            }
            res.status(500).json({ error: 'Failed to extract metadata' });
        }
    });

    // Apply Metadata to M4B/M4A file
    app.post('/api/metadata/apply', upload.single('file'), async (req, res) => {
        try {
            // Check if FFmpeg is available
            try {
                await checkFFmpeg();
            } catch (ffmpegError) {
                return res.status(500).json({
                    error: 'FFmpeg is not installed or not available. Please install FFmpeg to use metadata editing features. Visit https://ffmpeg.org/download.html for installation instructions.'
                });
            }

            if (!req.file) {
                return res.status(400).json({ error: 'No file provided' });
            }

            const filePath = req.file.path;
            const ext = path.extname(req.file.originalname).toLowerCase();

            if (ext !== '.m4b' && ext !== '.m4a') {
                fs.unlink(filePath, () => { });
                return res.status(400).json({ error: 'Only M4B and M4A files are supported' });
            }

            // Verify input file exists
            if (!fs.existsSync(filePath)) {
                return res.status(400).json({ error: 'Input file not found' });
            }

            // Parse metadata
            let metadata = {};
            if (req.body.metadata) {
                try {
                    metadata = JSON.parse(req.body.metadata);
                } catch (e) {
                    return res.status(400).json({ error: 'Invalid metadata format' });
                }
            }

            // Generate output filename
            const outputFilename = (metadata.title || 'updated_metadata').replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.m4b';
            const outputPath = path.join(outputsDir, outputFilename);

            // Build ffmpeg command to apply metadata
            const { execSync } = require('child_process');
            let ffmpegCmd = `"${ffmpegPath}" -i "${filePath}" -c copy`;

            // Add metadata tags
            if (metadata.title) ffmpegCmd += ` -metadata title="${metadata.title}"`;
            if (metadata.author) ffmpegCmd += ` -metadata artist="${metadata.author}"`;
            if (metadata.genre) ffmpegCmd += ` -metadata genre="${metadata.genre}"`;
            if (metadata.description) ffmpegCmd += ` -metadata comment="${metadata.description}"`;

            // Handle cover art if provided
            let coverPath = null;
            if (req.body.cover_base64) {
                try {
                    const coverData = req.body.cover_base64.replace(/^data:image\/\w+;base64,/, '');
                    coverPath = path.join(outputsDir, `cover_${Date.now()}.jpg`);
                    fs.writeFileSync(coverPath, Buffer.from(coverData, 'base64'));
                    ffmpegCmd += ` -i "${coverPath}" -map 0 -map 1 -c copy -disposition:v:1 attached_pic`;
                } catch (coverErr) {
                    console.error('Cover art processing error:', coverErr.message);
                }
            }

            ffmpegCmd += ` "${outputPath}" -y`;

            try {
                execSync(ffmpegCmd, { encoding: 'utf8', stdio: 'pipe' });

                // Verify output file was created
                if (!fs.existsSync(outputPath)) {
                    throw new Error('Output file was not created');
                }
            } catch (ffmpegErr) {
                console.error('FFmpeg error:', ffmpegErr.message);
                console.error('FFmpeg command:', ffmpegCmd);
                // Clean up files
                fs.unlink(filePath, () => { });
                if (coverPath) fs.unlink(coverPath, () => { });
                return res.status(500).json({ error: 'Failed to apply metadata to file: ' + ffmpegErr.message });
            }

            // Clean up uploaded file and cover
            fs.unlink(filePath, () => { });
            if (coverPath) fs.unlink(coverPath, () => { });

            res.json({
                success: true,
                downloadUrl: `/api/download/${outputFilename}`,
                filename: outputFilename
            });
        } catch (error) {
            console.error('Metadata apply error:', error);
            if (req.file) {
                fs.unlink(req.file.path, () => { });
            }
            res.status(500).json({ error: 'Failed to apply metadata: ' + error.message });
        }
    });

    // Audio Format Conversion API
    app.post('/api/convert-audio', upload.single('file'), async (req, res) => {
        try {
            // Check if FFmpeg is available
            try {
                await checkFFmpeg();
            } catch (ffmpegError) {
                return res.status(500).json({
                    error: 'FFmpeg is not installed or not available. Please install FFmpeg to use audio conversion features. Visit https://ffmpeg.org/download.html for installation instructions.'
                });
            }

            if (!req.file) {
                return res.status(400).json({ error: 'No file provided' });
            }

            const filePath = req.file.path;
            const targetFormat = req.body.target_format;
            const quality = req.body.quality || '256k';
            const jobId = req.body.job_id;

            if (!targetFormat) {
                fs.unlink(filePath, () => { });
                return res.status(400).json({ error: 'Target format is required' });
            }

            const validFormats = ['mp3', 'wav', 'flac', 'aac', 'ogg', 'alac'];
            if (!validFormats.includes(targetFormat)) {
                fs.unlink(filePath, () => { });
                return res.status(400).json({ error: 'Invalid target format' });
            }

            // Verify input file exists
            if (!fs.existsSync(filePath)) {
                return res.status(400).json({ error: 'Input file not found' });
            }

            // Generate output filename
            const baseName = path.basename(req.file.originalname, path.extname(req.file.originalname));
            const outputFilename = `${baseName}_converted.${targetFormat}`;
            const outputPath = path.join(outputsDir, outputFilename);

            // Build ffmpeg command based on target format
            let ffmpegCmd = `"${ffmpegPath}" -i "${filePath}"`;

            switch (targetFormat) {
                case 'mp3':
                    ffmpegCmd += ` -codec:a libmp3lame -b:a ${quality}`;
                    break;
                case 'wav':
                    ffmpegCmd += ` -codec:a pcm_s16le`;
                    break;
                case 'flac':
                    if (quality === 'lossless') {
                        ffmpegCmd += ` -codec:a flac`;
                    } else {
                        ffmpegCmd += ` -codec:a flac -compression_level 8`;
                    }
                    break;
                case 'aac':
                    ffmpegCmd += ` -codec:a aac -b:a ${quality}`;
                    break;
                case 'ogg':
                    ffmpegCmd += ` -codec:a libvorbis -b:a ${quality}`;
                    break;
                case 'alac':
                    ffmpegCmd += ` -codec:a alac`;
                    break;
            }

            ffmpegCmd += ` "${outputPath}" -y`;

            // Send progress updates via SSE if jobId provided
            if (jobId && progressClients.has(jobId)) {
                const client = progressClients.get(jobId);
                client.write(`data: ${JSON.stringify({ progress: 10, status: 'Converting audio...' })}\n\n`);
            }

            try {
                const { execSync } = require('child_process');
                execSync(ffmpegCmd, { encoding: 'utf8', stdio: 'pipe' });

                // Verify output file was created
                if (!fs.existsSync(outputPath)) {
                    throw new Error('Output file was not created');
                }

                if (jobId && progressClients.has(jobId)) {
                    const client = progressClients.get(jobId);
                    client.write(`data: ${JSON.stringify({ progress: 100, status: 'Conversion complete!' })}\n\n`);
                    client.end();
                    progressClients.delete(jobId);
                }
            } catch (ffmpegErr) {
                console.error('FFmpeg error:', ffmpegErr.message);
                console.error('FFmpeg command:', ffmpegCmd);
                if (jobId && progressClients.has(jobId)) {
                    const client = progressClients.get(jobId);
                    client.write(`data: ${JSON.stringify({ error: 'Conversion failed: ' + ffmpegErr.message })}\n\n`);
                    client.end();
                    progressClients.delete(jobId);
                }
                fs.unlink(filePath, () => { });
                return res.status(500).json({ error: 'Failed to convert audio file: ' + ffmpegErr.message });
            }

            // Clean up uploaded file
            fs.unlink(filePath, () => { });

            res.json({
                success: true,
                downloadUrl: `/api/download/${outputFilename}`,
                filename: outputFilename
            });
        } catch (error) {
            console.error('Audio conversion error:', error);
            if (req.file) {
                fs.unlink(req.file.path, () => { });
            }
            res.status(500).json({ error: 'Failed to convert audio: ' + error.message });
        }
    });

    // Detect Silence API
    app.post('/api/detect-silence', upload.single('audio_file'), async (req, res) => {
        try {
            if (!req.file) return res.status(400).json({ error: 'No audio file provided' });

            const noise = parseFloat(req.body.noise) || -30;
            const duration = parseFloat(req.body.duration) || 2.0;

            const silences = await detectSilence(req.file.path, { noise, duration });

            // Cleanup
            fs.unlink(req.file.path, () => { });

            res.json({ silences });
        } catch (error) {
            if (req.file) fs.unlink(req.file.path, () => { });
            res.status(500).json({ error: error.message });
        }
    });

    // Batch Merge API
    app.post('/api/batch-merge', upload.array('audio_files'), async (req, res) => {
        try {
            if (!req.files || req.files.length < 2) {
                return res.status(400).json({ error: 'At least two audio files are required' });
            }

            // Pass original filenames to audioGlue for chapter naming
            const inputPaths = req.files.map(f => {
                // Store original filename as a property on the path string
                const pathWithOriginalName = f.path;
                pathWithOriginalName.originalName = f.originalname;
                return pathWithOriginalName;
            });
            const jobId = req.body.jobId || uuidv4();

            // Parse metadata
            let metadata = null;
            if (req.body.metadata) {
                try { metadata = JSON.parse(req.body.metadata); } catch (e) { }
            }

            // Handle cover art
            let coverPath = null;
            let tempCoverPath = null;
            if (req.body.cover_base64) {
                const base64Data = req.body.cover_base64.replace(/^data:image\/\w+;base64,/, '');
                tempCoverPath = path.join(uploadsDir, `cover_${uuidv4()}.jpg`);
                fs.writeFileSync(tempCoverPath, base64Data, 'base64');
                coverPath = tempCoverPath;
            }

            const outputFilename = (metadata ? metadata.title : 'merged_audiobook').replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.mp3';
            const outputPath = path.join(outputsDir, outputFilename);

            await audioGlue(inputPaths, outputPath, {
                metadata,
                coverPath,
                onProgress: (percent, msg) => {
                    const client = progressClients.get(jobId);
                    if (client) {
                        client.write(`data: ${JSON.stringify({ percent, message: msg })}\n\n`);
                    }
                }
            });

            // Cleanup
            inputPaths.forEach(p => fs.unlink(p, () => { }));
            if (tempCoverPath) fs.unlink(tempCoverPath, () => { });

            // Send completion message via SSE
            const client = progressClients.get(jobId);
            if (client) {
                client.write(`data: ${JSON.stringify({
                    percent: 100,
                    message: `Batch merge completed! File: ${outputFilename}`,
                    downloadUrl: `/api/download/${outputFilename}`
                })}\n\n`);
            }

            // Return success response with download URL
            res.json({
                success: true,
                message: `Batch merge completed! File: ${outputFilename}`,
                filename: outputFilename,
                downloadUrl: `/api/download/${outputFilename}`
            });
        } catch (error) {
            if (req.files) req.files.forEach(f => fs.unlink(f.path, () => { }));
            res.status(500).json({ error: error.message });
        }
    });


    // Chapter Preview API
    app.post('/api/preview-chapter', upload.none(), async (req, res) => {
        try {
            const { text, voice, model, speed, multiVoice, dialogueVoice } = req.body;
            if (!text) return res.status(400).json({ error: 'No text provided' });

            // Limit preview to first 500 characters for speed
            const previewText = text.substring(0, 500);

            const audioBuffer = await generateChapterAudio(previewText, tempDir, {
                voice: voice || 'af_heart',
                model: model || 'kokoro-82m',
                speed: parseFloat(speed) || 1.0,
                multiVoice: multiVoice === 'true',
                dialogueVoice: dialogueVoice || null
            });

            // generateChapterAudio returns { audioPath, durationSeconds }
            const fileBuffer = fs.readFileSync(audioBuffer.audioPath);
            fs.unlink(audioBuffer.audioPath, () => { });

            res.set('Content-Type', 'audio/wav');
            res.send(fileBuffer);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Universal Conversion API (supports MP3→M4B and M3U8→MKV)
    app.post('/api/convert', upload.fields([
        { name: 'source_file', maxCount: 1 },
        { name: 'cover_file', maxCount: 1 }
    ]), async (req, res) => {
        try {
            const sourceFile = req.files['source_file'] ? req.files['source_file'][0] : null;
            const coverFile = req.files['cover_file'] ? req.files['cover_file'][0] : null;

            if (!sourceFile) {
                return res.status(400).json({ error: 'No source file provided' });
            }

            // Determine file type
            const fileExt = path.extname(sourceFile.originalname).toLowerCase();
            const isMp3 = fileExt === '.mp3' || sourceFile.mimetype === 'audio/mpeg';
            const isM4B = fileExt === '.m4b' || fileExt === '.m4a' || sourceFile.mimetype === 'audio/mp4' || sourceFile.mimetype === 'audio/x-m4a';

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

            // Parse metadata if provided
            let metadata = null;
            if (req.body.metadata) {
                try { metadata = JSON.parse(req.body.metadata); } catch (e) { }
            }

            // Handle cover art (from file or base64)
            let coverPath = coverFile ? coverFile.path : null;
            let tempCoverPath = null;

            if (!coverPath && req.body.cover_base64) {
                const base64Data = req.body.cover_base64.replace(/^data:image\/\w+;base64,/, '');
                tempCoverPath = path.join(uploadsDir, `cover_${uuidv4()}.jpg`);
                fs.writeFileSync(tempCoverPath, base64Data, 'base64');
                coverPath = tempCoverPath;
            }

            // Get audio quality setting (default based on type)
            const audioQuality = req.body.audio_quality || (isMp3 ? '64k' : '128k');

            // Determine output filename and type
            const originalName = path.parse(sourceFile.originalname).name;
            const customOutputName = req.body.output_name || '';
            const outputExt = isMp3 ? 'm4b' : 'mp3';
            const outputFilename = customOutputName.trim() || `${originalName}.${outputExt}`;
            const outputPath = path.join(outputsDir, outputFilename);

            // perform conversion
            const inputType = isMp3 ? 'mp3' : 'm4b';
            const jobId = req.body.jobId || uuidv4();

            await smartConvert({
                inputPath: sourceFile.path,
                outputPath: outputPath,
                inputType: inputType,
                chapters: chapters,
                metadata: metadata,
                coverPath: coverPath,
                audioQuality: audioQuality,
                onProgress: (percent, msg) => {
                    const client = progressClients.get(jobId);
                    if (client) {
                        client.write(`data: ${JSON.stringify({ percent, message: msg })}\n\n`);
                    }
                }
            });

            // Cleanup uploaded files
            fs.unlink(sourceFile.path, () => { });
            if (coverFile) fs.unlink(coverFile.path, () => { });
            if (tempCoverPath) fs.unlink(tempCoverPath, () => { });

            // Send completion message via SSE
            const client = progressClients.get(jobId);
            if (client) {
                client.write(`data: ${JSON.stringify({
                    percent: 100,
                    message: `Conversion completed! File: ${outputFilename}`,
                    downloadUrl: `/api/download/${outputFilename}`
                })}\n\n`);
            }

            // Return success response with download URL
            res.json({
                success: true,
                message: `Conversion completed! File: ${outputFilename}`,
                filename: outputFilename,
                downloadUrl: `/api/download/${outputFilename}`
            });
        } catch (error) {
            console.error('Error in convert:', error);
            res.status(500).json({ error: error.message || 'Internal server error' });
        }
    });

    // Voice Cloning API (via Kokoclone)
    app.post('/api/clone-voice', upload.fields([
        { name: 'reference_audio', maxCount: 1 },
        { name: 'source_audio', maxCount: 1 }
    ]), async (req, res) => {
        try {
            const refFile = req.files['reference_audio'] ? req.files['reference_audio'][0] : null;
            const srcFile = req.files['source_audio'] ? req.files['source_audio'][0] : null;
            const { text, mode, jobId } = req.body;

            if (!refFile) {
                return res.status(400).json({ error: 'No reference audio provided' });
            }

            const isConvertMode = mode === 'convert';
            if (isConvertMode && !srcFile) {
                if (refFile) fs.unlink(refFile.path, () => { });
                return res.status(400).json({ error: 'Audio conversion mode requires source audio' });
            }
            if (!isConvertMode && (!text || text.trim() === '')) {
                if (refFile) fs.unlink(refFile.path, () => { });
                return res.status(400).json({ error: 'TTS mode requires text input' });
            }

            // Immediately acknowledge the request for long-running process
            res.json({ success: true, jobId: jobId, message: 'Voice cloning started...' });

            const outputFilename = `cloned_voice_${Date.now()}.wav`;
            const outputPath = path.join(outputsDir, outputFilename);
            const kokocloneDir = path.join(process.cwd(), 'kokoclone');
            const pythonExe = process.platform === 'win32'
                ? path.join(kokocloneDir, '.venv', 'Scripts', 'python.exe')
                : path.join(kokocloneDir, '.venv', 'bin', 'python');

            const args = ['cli.py', '--ref', refFile.path, '--out', outputPath];
            if (isConvertMode) {
                args.push('--mode', 'convert', '--source', srcFile.path);
            } else {
                args.push('--mode', 'tts', '--text', text, '--lang', req.body.lang || 'en');
            }

            const { spawn } = require('child_process');
            console.log(`Spawning kokoclone: ${pythonExe} ${args.join(' ')}`);
            const child = spawn(pythonExe, args, { cwd: kokocloneDir });

            const sendProgress = (msg) => {
                const client = progressClients.get(jobId);
                if (client) {
                    // Send 50% continuously to keep UI animating since Python doesn't emit precise percents
                    client.write(`data: ${JSON.stringify({ percent: 50, message: msg.replace(/\n/g, ' ') })}\n\n`);
                }
            };

            child.stdout.on('data', (data) => {
                const line = data.toString().trim();
                if (line) sendProgress(`Kokoclone: ${line}`);
            });

            child.stderr.on('data', (data) => {
                const line = data.toString().trim();
                if (line) sendProgress(line);
            });

            child.on('close', (code) => {
                // Cleanup incoming files
                fs.unlink(refFile.path, () => { });
                if (srcFile) fs.unlink(srcFile.path, () => { });

                const client = progressClients.get(jobId);
                if (code === 0 && fs.existsSync(outputPath)) {
                    if (client) {
                        client.write(`data: ${JSON.stringify({
                            percent: 100,
                            message: `Voice cloning successful! File: ${outputFilename}`,
                            downloadUrl: `/api/download/${outputFilename}`
                        })}\n\n`);
                    }
                } else {
                    if (client) {
                        client.write(`data: ${JSON.stringify({ percent: 0, message: 'Error: Python process failed with code ' + code })}\n\n`);
                    }
                }
            });

        } catch (error) {
            console.error('Error in clone-voice:', error);
            if (!res.headersSent) {
                res.status(500).json({ error: error.message });
            }
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
                version: '11.0.0'
            });
        } catch (error) {
            res.json({
                status: 'error',
                ffmpeg: false,
                error: error.message
            });
        }
    });

    // Voices API
    app.get('/api/voices', (req, res) => {
        res.json({ voices: AVAILABLE_VOICES, models: AVAILABLE_MODELS });
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
            const docFile = req.file;
            const coverFile = null; // Cover is usually sent via cover_base64

            if (!docFile) {
                return res.status(400).json({ error: 'No document file provided' });
            }

            const audioQuality = req.body.audio_quality || '64k';
            const voice = req.body.voice || 'af_heart';
            const dialogueVoice = req.body.dialogue_voice || null;
            const multiVoice = req.body.multi_voice === 'true';
            const model = req.body.model || 'kokoro-82m';
            const speed = parseFloat(req.body.speed) || 1.0;
            const announceChapters = req.body.announce_chapters === 'true';

            // Determine output filename
            const originalName = path.parse(docFile.originalname).name;
            const customOutputName = req.body.output_name || '';
            const outputFilename = customOutputName.trim() || `${originalName}.m4b`;
            const outputPath = path.join(outputsDir, outputFilename);

            console.log(`Starting audiobook generation: ${docFile.originalname} → ${outputFilename}`);

            // Parse metadata
            let metadata = null;
            if (req.body.metadata) {
                try { metadata = JSON.parse(req.body.metadata); } catch (e) { }
            }

            // Handle cover art
            let coverPath = coverFile ? coverFile.path : null;
            let tempCoverPath = null;
            if (!coverPath && req.body.cover_base64) {
                const base64Data = req.body.cover_base64.replace(/^data:image\/\w+;base64,/, '');
                tempCoverPath = path.join(uploadsDir, `cover_${uuidv4()}.jpg`);
                fs.writeFileSync(tempCoverPath, base64Data, 'base64');
                coverPath = tempCoverPath;
            }

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

                // Run generation asynchronously to prevent request timeout
                buildAudiobook(docFile.path, outputPath, {
                    voice, model, speed, audioQuality, customChapters,
                    metadata, coverPath,
                    multiVoice, dialogueVoice,
                    announceChapters,
                    onProgress: onProgress
                }).then(() => {
                    // Notify client of completion via SSE
                    const client = progressClients.get(jobId);
                    if (client) {
                        client.write(`data: ${JSON.stringify({
                            percent: 100,
                            message: `Audiobook generated successfully! File: ${outputFilename}`,
                            downloadUrl: `/api/download/${outputFilename}`
                        })}\n\n`);
                    }
                    console.log(`Audiobook generation completed: ${outputFilename}`);
                }).catch(err => {
                    onProgress(0, `Error: ${err.message}`);
                    console.error('Audiobook generation error:', err);
                }).finally(() => {
                    // Cleanup uploaded original document
                    if (docFile) fs.unlink(docFile.path, () => { });
                });

                // Immediately return success so the frontend fetch doesn't timeout
                return res.json({
                    success: true,
                    jobId: jobId,
                    message: 'Audiobook generation started. Please wait...'
                });
            } catch (err) {
                onProgress(0, `Error: ${err.message}`);
                if (docFile) fs.unlink(docFile.path, () => { });
                return res.status(500).json({ error: err.message });
            }


        } catch (error) {
            if (docFile) fs.unlink(docFile.path, () => { });
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
            // Don't delete file after download - allow multiple downloads
            // fs.unlink(filePath, () => { });
        });
    });

    // Cleanup endpoint to delete old files
    app.post('/api/cleanup', (req, res) => {
        try {
            const files = fs.readdirSync(outputsDir);
            let deletedCount = 0;
            files.forEach(file => {
                const filePath = path.join(outputsDir, file);
                const stats = fs.statSync(filePath);
                const fileAge = Date.now() - stats.mtimeMs;
                // Delete files older than 1 hour
                if (fileAge > 60 * 60 * 1000) {
                    fs.unlinkSync(filePath);
                    deletedCount++;
                }
            });
            res.json({ success: true, message: `Deleted ${deletedCount} old files` });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Cleanup uploads directory
    app.post('/api/cleanup-uploads', (req, res) => {
        try {
            const files = fs.readdirSync(uploadsDir);
            let deletedCount = 0;
            files.forEach(file => {
                const filePath = path.join(uploadsDir, file);
                const stats = fs.statSync(filePath);
                const fileAge = Date.now() - stats.mtimeMs;
                // Delete files older than 1 hour
                if (fileAge > 60 * 60 * 1000) {
                    fs.unlinkSync(filePath);
                    deletedCount++;
                }
            });
            res.json({ success: true, message: `Deleted ${deletedCount} old files from uploads` });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
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

            // Send completion message via SSE
            const jobId = req.body.jobId;
            const client = progressClients.get(jobId);
            if (client) {
                client.write(`data: ${JSON.stringify({
                    percent: 100,
                    message: `AAX conversion completed! File: ${outputFilename}`,
                    downloadUrl: `/api/download/${outputFilename}`
                })}\n\n`);
            }

            // Return success response with download URL
            res.json({
                success: true,
                message: `AAX conversion completed! File: ${outputFilename}`,
                filename: outputFilename,
                downloadUrl: `/api/download/${outputFilename}`
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
