/**
 * Express web server for BPM4B
 * Provides web interface and API for MP3 to M4B, M3U8 to MKV,
 * Document to Audiobook, and AAX conversion.
 */

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { 
    convertMp3ToM4b, 
    convertM3U8ToMkv, 
    smartConvert, 
    convertToM4b,
    checkFFmpeg,
} = require('./core');
const { 
    buildAudiobook, 
    previewChapters 
} = require('./audiobook-builder');
const { 
    cancelJob,
    AVAILABLE_VOICES,
    AVAILABLE_MODELS
} = require('./tts-engine');
const { 
    isColabEnvironment, 
    startTunnel,
    setupColabOptimizations,
    getColabServerConfig
} = require('./colab-support');
const { 
    epubToAudiobook, 
    getEpubMetadata, 
    getAvailableVoices 
} = require('./epub-to-audiobook');
const { 
    documentToEpub, 
    pdfToEpub, 
    docxToEpub, 
    txtToEpub 
} = require('./document-to-epub');
const {
    isAbogenInstalled,
    getAbogenVoices,
    getAbogenVersion
} = require('./abogen-integration');
// Lazy load AI engine to reduce startup memory
let aiEngine = null;
async function getAIEngine() {
    if (!aiEngine) {
        aiEngine = await import('./ai-engine.js');
    }
    return aiEngine;
}
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
        const uniqueName = `${crypto.randomUUID()}${path.extname(file.originalname)}`;
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
        // Accept ALL audio and video formats
        const ext = path.extname(file.originalname).toLowerCase();
        const supportedMediaExts = [
            '.mp3', '.wav', '.flac', '.aac', '.ogg', '.opus', '.aiff', '.wma',
            '.m4a', '.m4b', '.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v',
            '.3gp', '.amr', '.au', '.snd', '.m3u8', '.m3u'
        ];
        const isSupported = supportedMediaExts.includes(ext) ||
            file.mimetype.startsWith('audio/') ||
            file.mimetype.startsWith('video/');

        if (isSupported) {
            cb(null, true);
        } else {
            cb(new Error('Unsupported file format. Supported: MP3, WAV, FLAC, AAC, OGG, OPUS, M4A, M4B, MP4, MKV, AVI, MOV, WEBM, and more'), false);
        }
    }
});

// Configure multer for document uploads (all formats supported by document-to-epub)
const documentUpload = multer({
    storage: storage,
    limits: {
        fileSize: 2000 * 1024 * 1024 // 2GB max for documents
    },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const validExts = [
            '.pdf', '.epub',
            '.docx', '.doc', '.docm', '.dot', '.dotx',
            '.txt', '.text', '.asc', '.ansi', '.log', '.me', '.info',
            '.md', '.markdown',
            '.html', '.htm', '.xhtml', '.xht',
            '.xml', '.rtf', '.tex', '.bib', '.csv',
            '.odt', '.odm', '.ott', '.abw', '.wpd'
        ];
        if (validExts.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Unsupported document format'), false);
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
 * @param {boolean} options.enableTunnel - Enable automatic tunneling for Colab
 * @param {string} options.tunnelService - Preferred tunnel service ('localtunnel' or 'ngrok')
 * @returns {express.Application}
 */
function createServer(options = {}) {
    // Apply Colab optimizations if in Colab environment
    const colabConfig = setupColabOptimizations();
    const serverOptions = getColabServerConfig(options);
    
    const {
        port = 5000,
        host = '0.0.0.0',
        debug = false,
        enableTunnel = false,
        tunnelService = null
    } = serverOptions;

    const app = express();
    const uploadsDir = path.join(process.cwd(), 'uploads');
    const outputsDir = path.join(process.cwd(), 'outputs');

    // Ensure directories exist
    fs.mkdirSync(uploadsDir, { recursive: true });
    fs.mkdirSync(outputsDir, { recursive: true });

    // Log Colab detection
    if (colabConfig.isColab) {
        console.log('[Server] Running in Google Colab environment');
        console.log('[Server] Colab optimizations enabled:', colabConfig.optimizations);
    }

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
            version: '12.0.0'
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

            // Choose the best AAC encoder if target is aac
            let audioCodec = 'copy';
            let extraArgs = [];

            switch (targetFormat) {
                case 'mp3':
                    audioCodec = 'libmp3lame';
                    extraArgs = ['-b:a', quality];
                    break;
                case 'wav':
                    audioCodec = 'pcm_s16le';
                    break;
                case 'flac':
                    audioCodec = 'flac';
                    if (quality !== 'lossless') extraArgs = ['-compression_level', '8'];
                    break;
                case 'aac':
                    // Use helper for best AAC
                    const { getBestAacEncoder } = require('./core');
                    audioCodec = await getBestAacEncoder();
                    if (audioCodec === 'libfdk_aac') {
                        extraArgs = ['-vbr', '4'];
                    } else {
                        extraArgs = ['-b:a', quality];
                    }
                    break;
                case 'ogg':
                    audioCodec = 'libvorbis';
                    extraArgs = ['-b:a', quality];
                    break;
                case 'alac':
                    audioCodec = 'alac';
                    break;
            }

            const args = [
                '-hide_banner',
                '-i', filePath,
                '-c:a', audioCodec,
                ...extraArgs,
                '-y', outputPath
            ];

            if (jobId) {
                sendProgressToClient(jobId, { progress: 5, status: `Starting conversion to ${targetFormat}...` });
            }

            const { spawn } = require('child_process');
            const ffmpeg = spawn(ffmpegPath, args);

            let ffmpegLog = '';
            ffmpeg.stderr.on('data', (data) => {
                ffmpegLog += data.toString();
                // Simple progress heuristic
                if (jobId) {
                    sendProgressToClient(jobId, { progress: 50, status: 'Converting...' });
                }
            });

            ffmpeg.on('close', (code) => {
                fs.unlink(filePath, () => { });
                if (code === 0) {
                    if (jobId) {
                        sendProgressToClient(jobId, { progress: 100, status: 'Complete' });
                    }
                    res.json({
                        success: true,
                        downloadUrl: `/api/download/${outputFilename}`,
                        filename: outputFilename
                    });
                } else {
                    console.error('FFmpeg Conversion Failed:', ffmpegLog);
                    res.status(500).json({ error: `Conversion failed with code ${code}` });
                }
            });

            ffmpeg.on('error', (err) => {
                fs.unlink(filePath, () => { });
                res.status(500).json({ error: 'FFmpeg spawn error: ' + err.message });
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
                const p = new String(f.path);
                p.originalName = f.originalname;
                return p;
            });
            const jobId = req.body.jobId || crypto.randomUUID();

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
                tempCoverPath = path.join(uploadsDir, `cover_${crypto.randomUUID()}.jpg`);
                fs.writeFileSync(tempCoverPath, base64Data, 'base64');
                coverPath = tempCoverPath;
            }

            const outputFilename = (metadata ? metadata.title : 'merged_audiobook').replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.mp3';
            const outputPath = path.join(outputsDir, outputFilename);

            const normalize = req.body.normalize === 'true' || req.body.normalize === true;
            await audioGlue(inputPaths, outputPath, {
                metadata,
                coverPath,
                normalize,
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


    // Scan Local Folder API
    app.post('/api/scan-folder', async (req, res) => {
        try {
            const { folderPath } = req.body;
            if (!folderPath) return res.status(400).json({ error: 'Folder path is required' });

            if (!fs.existsSync(folderPath)) {
                return res.status(404).json({ error: 'Folder not found' });
            }

            const supportedExts = [
                '.mp3', '.wav', '.flac', '.aac', '.ogg', '.opus', '.aiff', '.wma',
                '.m4a', '.m4b', '.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v',
                '.3gp', '.amr', '.au', '.snd'
            ];
            const files = fs.readdirSync(folderPath);
            const mediaFiles = files
                .filter(f => supportedExts.includes(path.extname(f).toLowerCase()))
                .map(f => {
                    const fullPath = path.join(folderPath, f);
                    const stats = fs.statSync(fullPath);
                    return {
                        name: f,
                        path: fullPath,
                        size: stats.size,
                        ext: path.extname(f).toLowerCase()
                    };
                });

            // Sort files naturally (1, 2, 10 instead of 1, 10, 2)
            mediaFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

            res.json({ files: mediaFiles });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Batch Merge Local API
    app.post('/api/batch-merge-local', async (req, res) => {
        try {
            const { filePaths, metadata, cover_base64, jobId } = req.body;
            if (!filePaths || filePaths.length < 2) {
                return res.status(400).json({ error: 'At least two audio files are required' });
            }

            // Verify all files exist
            for (const p of filePaths) {
                if (!fs.existsSync(p)) {
                    return res.status(400).json({ error: `File not found: ${p}` });
                }
            }

            // Handle cover art
            let coverPath = null;
            let tempCoverPath = null;
            if (cover_base64) {
                const base64Data = cover_base64.replace(/^data:image\/\w+;base64,/, '');
                tempCoverPath = path.join(uploadsDir, `cover_${crypto.randomUUID()}.jpg`);
                fs.writeFileSync(tempCoverPath, base64Data, 'base64');
                coverPath = tempCoverPath;
            }

            const outputFilename = (metadata ? metadata.title : 'merged_audiobook').replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.mp3';
            const outputPath = path.join(outputsDir, outputFilename);

            // Important: audioGlue expects path objects with originalName for chapters
            const inputPaths = filePaths.map(p => {
                const s = new String(p);
                s.originalName = path.basename(p);
                return s;
            });

            const normalize = req.body.normalize === 'true' || req.body.normalize === true;
            await audioGlue(inputPaths, outputPath, {
                metadata,
                coverPath,
                normalize,
                onProgress: (percent, msg) => {
                    const client = progressClients.get(jobId);
                    if (client) {
                        client.write(`data: ${JSON.stringify({ percent, message: msg })}\n\n`);
                    }
                }
            });

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

            res.json({
                success: true,
                message: `Batch merge completed! File: ${outputFilename}`,
                filename: outputFilename,
                downloadUrl: `/api/download/${outputFilename}`
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Cancel an active generation job
    app.post('/api/cancel-job', (req, res) => {
        const { jobId } = req.body;
        if (!jobId) return res.status(400).json({ error: 'Missing jobId' });
        cancelJob(jobId);
        console.log(`[BPM4B] Cancellation requested for job: ${jobId}`);
        res.json({ success: true, message: 'Cancellation signal sent' });
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

    // Universal Media-to-M4B Conversion API — supports ALL audio + video formats
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
            const videoExts = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v', '.3gp'];
            const isVideo = videoExts.includes(fileExt) || sourceFile.mimetype.startsWith('video/');
            const isM4B = fileExt === '.m4b' || fileExt === '.m4a' || sourceFile.mimetype === 'audio/mp4';

            // Parse chapters if provided
            let chapters = null;
            if (req.body.chapters) {
                try {
                    const chaptersData = JSON.parse(req.body.chapters);
                    if (Array.isArray(chaptersData) && chaptersData.length > 0) {
                        chapters = chaptersData.map(chapter => ({
                            title: chapter.title,
                            start_time: parseFloat(chapter.start_time || chapter.startTime || 0),
                            end_time: chapter.end_time || chapter.endTime ? parseFloat(chapter.end_time || chapter.endTime) : undefined
                        }));

                        chapters.sort((a, b) => a.start_time - b.start_time);

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
                tempCoverPath = path.join(uploadsDir, `cover_${crypto.randomUUID()}.jpg`);
                fs.writeFileSync(tempCoverPath, base64Data, 'base64');
                coverPath = tempCoverPath;
            }

            // Get audio quality setting
            const audioQuality = req.body.audio_quality || '64k';

            // Determine output filename
            const originalName = path.parse(sourceFile.originalname).name;
            const customOutputName = req.body.output_name || '';
            const outputFilename = customOutputName.trim() || `${originalName}.m4b`;
            const outputPath = path.join(outputsDir, outputFilename);

            // Perform conversion using the universal convertToM4b
            const jobId = req.body.jobId || crypto.randomUUID();

            await convertToM4b(sourceFile.path, outputPath, chapters, {
                audioQuality,
                metadata,
                coverPath,
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
            const child = spawn(pythonExe, args, { cwd: kokocloneDir });

            const sendProgress = (msg) => {
                const client = progressClients.get(jobId);
                if (client) {
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
                if (refFile) fs.unlink(refFile.path, () => { });
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
                        client.write(`data: ${JSON.stringify({
                            error: `Voice cloning failed with code ${code}. Check server logs.`
                        })}\n\n`);
                    }
                }
            });
        } catch (error) {
            console.error('Voice cloning error:', error);
            if (!res.headersSent) {
                res.status(500).json({ error: error.message });
            }
        }
    });

    // AI Metadata Generation (OpenRouter)
    app.post('/api/ai/metadata', async (req, res) => {
        try {
            const { title, author, apiKey, model } = req.body;
            if (!title) return res.status(400).json({ error: 'Title is required' });
            
            const ai = await getAIEngine();
            const metadata = await ai.generateMetadata(title, author, apiKey, { model });
            res.json(metadata);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // AI Narration Planning (OpenRouter)
    app.post('/api/ai/narration-plan', async (req, res) => {
        try {
            const { text, apiKey, model } = req.body;
            if (!text) return res.status(400).json({ error: 'Text is required' });
            
            const ai = await getAIEngine();
            const plan = await ai.analyzeNarration(text, apiKey, { model });
            res.json(plan);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // AI Models API
    app.post('/api/ai/models', async (req, res) => {
        try {
            const { apiKey } = req.body;
            const ai = await getAIEngine();
            const models = await ai.getModels(apiKey);
            res.json({ models });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Audio Cleanup API
    app.post('/api/audio-clean', upload.single('file'), async (req, res) => {
        try {
            if (!req.file) return res.status(400).json({ error: 'No file provided' });
            
            const outputFilename = `cleaned_${path.basename(req.file.originalname)}`;
            const outputPath = path.join(outputsDir, outputFilename);
            
            await cleanAudio(req.file.path, outputPath);
            
            // Cleanup input
            fs.unlink(req.file.path, () => {});
            
            res.json({
                success: true,
                downloadUrl: `/api/download/${outputFilename}`,
                filename: outputFilename
            });
        } catch (error) {
            if (req.file) fs.unlink(req.file.path, () => {});
            res.status(500).json({ error: error.message });
        }
    });

    // Quality Verification API
    app.post('/api/verify-quality', upload.single('file'), async (req, res) => {
        try {
            if (!req.file) return res.status(400).json({ error: 'No file provided' });
            
            const result = await verifyQuality(req.file.path);
            
            // Cleanup input
            fs.unlink(req.file.path, () => {});
            
            res.json({ success: true, result });
        } catch (error) {
            if (req.file) fs.unlink(req.file.path, () => {});
            res.status(500).json({ error: error.message });
        }
    });

    app.post('/api/checksum', upload.single('file'), async (req, res) => {
        try {
            if (!req.file) return res.status(400).json({ error: 'No file provided' });
            
            const checksum = await generateChecksum(req.file.path);
            
            // Cleanup input
            fs.unlink(req.file.path, () => {});
            
            res.json({ success: true, checksum });
        } catch (error) {
            if (req.file) fs.unlink(req.file.path, () => {});
            res.status(500).json({ error: error.message });
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

    // Engine Info API
    app.get('/api/engine-info', async (req, res) => {
        try {
            const abogenInstalled = await isAbogenInstalled();
            const abogenVersion = abogenInstalled ? await getAbogenVersion() : 'not installed';
            
            res.json({
                kokoro: { status: 'ready', type: 'local-pool' },
                abogen: { 
                    status: abogenInstalled ? 'ready' : 'missing',
                    version: abogenVersion
                }
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Voices API
    app.get('/api/voices', async (req, res) => {
        try {
            let voices = [...AVAILABLE_VOICES];
            
            // Try to add Abogen voices if installed
            try {
                if (await isAbogenInstalled()) {
                    const abogenVoices = await getAbogenVoices();
                    abogenVoices.forEach(vId => {
                        if (vId && !voices.find(v => v.id === vId)) {
                            voices.push({ 
                                id: vId, 
                                name: vId, 
                                lang: 'en-US', 
                                traits: 'abogen',
                                grade: 'A'
                            });
                        }
                    });
                }
            } catch (err) {
                console.warn('[Server] Failed to fetch Abogen voices:', err.message);
            }

            res.json({ voices, models: AVAILABLE_MODELS });
        } catch (error) {
            console.error('[Server] Voice API Error:', error);
            res.status(500).json({ error: 'Failed to load voices' });
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

    // ── Folder-to-M4B Endpoint ──
    app.post('/api/folder-to-m4b', express.json(), async (req, res) => {
        try {
            const { folderPath, metadata: metaJSON, cover_base64, jobId, audioQuality } = req.body;

            if (!folderPath) {
                return res.status(400).json({ error: 'No folder path provided' });
            }

            if (!fs.existsSync(folderPath)) {
                return res.status(404).json({ error: 'Folder not found' });
            }

            // Parse metadata
            let metadata = null;
            if (metaJSON) {
                try { metadata = JSON.parse(metaJSON); } catch (e) { }
            }

            // Handle cover art
            let coverPath = null;
            let tempCoverPath = null;
            if (cover_base64) {
                const base64Data = cover_base64.replace(/^data:image\/\w+;base64,/, '');
                tempCoverPath = path.join(uploadsDir, `cover_${crypto.randomUUID()}.jpg`);
                fs.writeFileSync(tempCoverPath, base64Data, 'base64');
                coverPath = tempCoverPath;
            }

            const folderName = path.basename(folderPath);
            const outputFilename = (metadata?.title || folderName).replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.m4b';
            const outputPath = path.join(outputsDir, outputFilename);

            console.log(`[Folder-to-M4B] Converting folder: ${folderPath} → ${outputFilename}`);

            // Accept the request immediately
            const jid = jobId || crypto.randomUUID();

            setImmediate(async () => {
                try {
                    // Apply Colab optimizations if in Colab environment
                    const colabOpts = colabConfig.isColab ? colabConfig.optimizations : {};
                    
                    await folderToM4b(folderPath, outputPath, {
                        audioQuality: audioQuality || '64k',
                        metadata,
                        coverPath,
                        concurrency: colabOpts.concurrency || options.concurrency,
                        fastMode: colabOpts.fastMode !== false,
                        onProgress: (percent, msg) => {
                            const client = progressClients.get(jid);
                            if (client) {
                                client.write(`data: ${JSON.stringify({ percent, message: msg })}\n\n`);
                            }
                            console.log(`  [Folder-to-M4B] ${percent}% - ${msg}`);
                        }
                    });

                    const client = progressClients.get(jid);
                    if (client) {
                        client.write(`data: ${JSON.stringify({
                            percent: 100,
                            message: `Folder conversion completed! File: ${outputFilename}`,
                            downloadUrl: `/api/download/${outputFilename}`
                        })}\n\n`);
                    }
                    console.log(`[Folder-to-M4B] Completed: ${outputFilename}`);
                } catch (err) {
                    console.error('[Folder-to-M4B] Error:', err);
                    const client = progressClients.get(jid);
                    if (client) {
                        client.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
                    }
                }
            });

            res.json({
                success: true,
                jobId: jid,
                message: 'Folder conversion started. Monitor progress via SSE.'
            });
        } catch (error) {
            console.error('Error in folder-to-m4b:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // ── EPUB to Audiobook Endpoints (NEW - Abogen Integration) ──

    // Get EPUB metadata
    app.post('/api/epub-metadata', documentUpload.single('document_file'), async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'No EPUB file provided' });
            }

            const filePath = req.file.path;
            const ext = path.extname(req.file.originalname).toLowerCase();

            if (ext !== '.epub') {
                fs.unlink(filePath, () => { });
                return res.status(400).json({ error: 'Only EPUB files are supported' });
            }

            const metadata = await getEpubMetadata(filePath);

            fs.unlink(filePath, () => { });

            res.json({
                success: true,
                metadata: {
                    title: metadata.title,
                    author: metadata.author,
                    language: metadata.language,
                    publisher: metadata.publisher,
                    description: metadata.description,
                    totalChapters: metadata.totalChapters,
                    chapters: metadata.chapters
                }
            });
        } catch (error) {
            if (req.file) fs.unlink(req.file.path, () => { });
            console.error('[EPUB Metadata] Error:', error);
            res.status(500).json({ error: error.message || 'Failed to parse EPUB' });
        }
    });

    // Get available voices for EPUB conversion
    app.get('/api/epub-voices', (req, res) => {
        try {
            const voices = getAvailableVoices();
            res.json({
                success: true,
                voices
            });
        } catch (error) {
            console.error('[EPUB Voices] Error:', error);
            res.status(500).json({ error: 'Failed to get voices' });
        }
    });

    // Convert EPUB to audiobook
    app.post('/api/epub-to-audiobook', documentUpload.single('document_file'), async (req, res) => {
        const jobId = crypto.randomUUID();
        let docFile = null;

        try {
            docFile = req.file;
            const { voice, language, speed, audioQuality, selectedChapters, engine } = req.body;

            if (!docFile) {
                return res.status(400).json({ error: 'No EPUB file provided' });
            }

            const ext = path.extname(docFile.originalname).toLowerCase();
            if (ext !== '.epub') {
                fs.unlink(docFile.path, () => { });
                return res.status(400).json({ error: 'Only EPUB files are supported' });
            }

            const outputPath = path.join(process.cwd(), 'outputs', `audiobook_${Date.now()}.m4b`);

            // Parse selected chapters if provided
            let selectedIndices = null;
            if (selectedChapters) {
                try {
                    selectedIndices = JSON.parse(selectedChapters);
                } catch (e) {
                    console.warn('[EPUB Conversion] Invalid selectedChapters format');
                }
            }

            // Setup SSE for progress updates
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            const sendProgress = (message, progress) => {
                res.write(`data: ${JSON.stringify({ message, progress })}\n\n`);
            };

            const result = await epubToAudiobook(
                docFile.path,
                outputPath,
                {
                    voice: voice || null,
                    language: language || null,
                    speed: speed ? parseFloat(speed) : 1.0,
                    audioQuality: audioQuality || '128k',
                    selectedChapters: selectedIndices,
                    engine: engine || 'abogen', // 'bpm4b' or 'abogen' (default: abogen)
                    onProgress: sendProgress,
                    jobId
                }
            );

            fs.unlink(docFile.path, () => { });

            res.write(`data: ${JSON.stringify({ 
                success: true, 
                downloadUrl: `/download/${path.basename(result.outputPath)}`,
                result 
            })}\n\n`);
            res.end();

        } catch (error) {
            if (docFile) fs.unlink(docFile.path, () => { });
            console.error('[EPUB Conversion] Error:', error);
            if (!res.headersSent) {
                res.status(500).json({ error: error.message || 'EPUB conversion failed' });
            } else {
                res.write(`data: ${JSON.stringify({ error: error.message || 'EPUB conversion failed' })}\n\n`);
                res.end();
            }
        }
    });

    // ── Document to EPUB Endpoints (NEW - For Abogen Compatibility) ──

    // Convert PDF/DOCX/TXT to EPUB
    app.post('/api/document-to-epub', documentUpload.single('document_file'), async (req, res) => {
        let docFile = null;

        try {
            docFile = req.file;
            const { title, author, language, genre, description } = req.body;

            if (!docFile) {
                return res.status(400).json({ error: 'No document file provided' });
            }

            const ext = path.extname(docFile.originalname).toLowerCase();
            const supportedExts = [
                '.pdf', 
                '.docx', '.doc', '.docm', '.dot', '.dotx',
                '.txt', '.text', '.asc', '.ansi', '.log', '.me', '.0', '.1st', '.600', '.602', '.info',
                '.md', '.markdown',
                '.html', '.htm', '.xhtml', '.xht',
                '.xml',
                '.rtf',
                '.tex', '.bib',
                '.csv',
                '.odt', '.odm', '.ott',
                '.abw',
                '.wpd'
            ];
            
            if (!supportedExts.includes(ext)) {
                fs.unlink(docFile.path, () => { });
                return res.status(400).json({ 
                    error: 'Supported formats: PDF, DOCX, DOC, DOCM, DOT, DOTX, TXT, TEXT, ASC, ANSI, LOG, ME, MD, HTML, HTM, XHTML, XHT, XML, RTF, TEX, BIB, CSV, ODT, ODM, OTT, ABW, WPD' 
                });
            }

            const outputPath = path.join(process.cwd(), 'outputs', `${path.basename(docFile.originalname, ext)}_${Date.now()}.epub`);

            const result = await documentToEpub(
                docFile.path,
                outputPath,
                {
                    title: title || null,
                    author: author || null,
                    language: language || null,
                    genre: genre || null,
                    description: description || null
                }
            );

            fs.unlink(docFile.path, () => { });

            const epubFilename = path.basename(outputPath);
            res.json({
                success: true,
                downloadUrl: `/api/download/${epubFilename}`,
                filename: epubFilename,
                metadata: result ? result.metadata : {}
            });

        } catch (error) {
            if (docFile) fs.unlink(docFile.path, () => { });
            console.error('[Document to EPUB] Error:', error);
            res.status(500).json({ error: error.message || 'Document to EPUB conversion failed' });
        }
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
                tempCoverPath = path.join(uploadsDir, `cover_${crypto.randomUUID()}.jpg`);
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
                const runGeneration = async () => {
                    const engine = req.body.engine || 'bpm4b';
                    let currentDocPath = docFile.path;
                    let tempEpubPath = null;

                    try {
                        // If Abogen is selected, ensure we have a clean EPUB
                        const ext = path.extname(docFile.originalname).toLowerCase();
                        if (engine === 'abogen') {
                            if (ext !== '.epub') {
                                onProgress(5, 'Converting document to EPUB for Abogen...');
                                const epubOutputPath = path.join(outputsDir, `temp_${crypto.randomUUID()}.epub`);
                                const conversionResult = await documentToEpub(docFile.path, epubOutputPath, {
                                    title: metadata?.title || originalName,
                                    author: metadata?.author || 'BPM4B User',
                                    language: req.body.language || 'en'
                                });
                                currentDocPath = conversionResult.outputPath;
                                tempEpubPath = currentDocPath;
                            } else {
                                // HEALING STEP: Re-package existing EPUB to fix common issues
                                onProgress(5, 'Healing EPUB structure for maximum Abogen compatibility...');
                                const healedOutputPath = path.join(outputsDir, `healed_${crypto.randomUUID()}.epub`);
                                try {
                                    const conversionResult = await documentToEpub(docFile.path, healedOutputPath, {
                                        title: metadata?.title,
                                        author: metadata?.author,
                                        language: req.body.language || 'en'
                                    });
                                    currentDocPath = conversionResult.outputPath;
                                    tempEpubPath = currentDocPath;
                                } catch (err) {
                                    console.warn(`[Server] EPUB Healing failed, using original file: ${err.message}`);
                                    // If healing fails, fall back to original file
                                    currentDocPath = docFile.path;
                                }
                            }
                        }

                        // Select the appropriate builder based on engine
                        if (engine === 'abogen') {
                            await epubToAudiobook(currentDocPath, outputPath, {
                                voice, speed, audioQuality,
                                onProgress: (msg, percent) => onProgress(percent, msg),
                                jobId,
                                engine: 'abogen',
                                customPath: req.body.abogenPath || null
                            });
                        } else {
                            await buildAudiobook(currentDocPath, outputPath, {
                                voice, model, speed, audioQuality, customChapters,
                                metadata, coverPath,
                                multiVoice, dialogueVoice,
                                announceChapters,
                                onProgress: onProgress
                            });
                        }

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
                    } catch (err) {
                        onProgress(0, `Error: ${err.message}`);
                        console.error('Audiobook generation error:', err);
                    } finally {
                        // Cleanup uploaded original document
                        if (docFile) fs.unlink(docFile.path, () => { });
                        // Cleanup temporary EPUB if created
                        if (tempEpubPath) fs.unlink(tempEpubPath, () => { });
                    }
                };

                runGeneration();

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

/**
 * Start the server with optional tunneling for Colab
 * @param {Object} options - Server options
 * @returns {Promise<{app: express.Application, server: any, tunnel?: any}>}
 */
async function startServer(options = {}) {
    const app = createServer(options);
    const { port = 5000, host = '0.0.0.0', enableTunnel = false, tunnelService = null } = options;
    
    return new Promise((resolve, reject) => {
        const server = app.listen(port, host, async (err) => {
            if (err) {
                reject(err);
                return;
            }
            
            console.log(`[Server] BPM4B running on http://${host}:${port}`);
            
            // Auto-enable tunneling in Colab or if requested
            if (enableTunnel || isColabEnvironment()) {
                console.log('[Server] Starting tunnel for remote access...');
                try {
                    const tunnel = await startTunnel(port, { preferred: tunnelService });
                    console.log(`[Server] Tunnel active: ${tunnel.url}`);
                    console.log(`[Server] Service: ${tunnel.service}`);
                    resolve({ app, server, tunnel });
                } catch (tunnelErr) {
                    console.warn('[Server] Tunnel failed, server running locally only:', tunnelErr.message);
                    resolve({ app, server });
                }
            } else {
                resolve({ app, server });
            }
        });
        
        server.on('error', (err) => {
            reject(err);
        });
    });
}

module.exports = {
    createServer,
    startServer,
    checkFFmpeg,
    isColabEnvironment,
    startTunnel
};
