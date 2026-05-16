/**
 * Audiblez Integration Module
 * Runs Audiblez as a subprocess for audiobook generation
 * Allows users to choose between BPM4B TTS and Audiblez
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

/**
 * Helper to get the correct path to python or audiblez executables, 
 * searching for venv in local directories first.
 */
async function getExecutablePath(name, customPath = null) {
    const isWin = process.platform === 'win32';
    const cwd = process.cwd();
    
    // Potential venv locations
    const venvPaths = [];
    if (customPath) {
        // Handle both the venv root or the venv/Scripts path
        venvPaths.push(customPath);
        if (!customPath.toLowerCase().endsWith('venv')) {
            venvPaths.push(path.join(customPath, 'venv'));
        }
    }
    venvPaths.push(path.join(cwd, 'venv'));
    venvPaths.push(path.join(cwd, 'audiblez', 'venv'));
    
    for (const venvPath of venvPaths) {
        const binDir = isWin ? 'Scripts' : 'bin';
        const ext = isWin ? '.exe' : '';
        const execPath = path.join(venvPath, binDir, `${name}${ext}`);
        
        try {
            await fs.access(execPath);
            console.log(`[Audiblez] Found ${name} in environment: ${execPath}`);
            return execPath;
        } catch (e) {
            // Check if name itself is the full path (already include binDir/Scripts)
            const directPath = path.join(venvPath, `${name}${ext}`);
            try {
                await fs.access(directPath);
                return directPath;
            } catch (e2) {}
        }
    }
    
    // Fallback to global command
    return name;
}

/**
 * Check if Audiblez is installed
 * @returns {Promise<boolean>}
 */
async function isAudiblezInstalled(customPath = null) {
    try {
        const audiblezExec = await getExecutablePath('audiblez', customPath);
        return new Promise((resolve) => {
            const proc = spawn(audiblezExec, ['--version'], { stdio: 'pipe' });
            proc.on('error', () => resolve(false));
            proc.on('close', (code) => resolve(code === 0));
            setTimeout(() => resolve(false), 5000);
        });
    } catch (err) {
        return false;
    }
}

/**
 * Install Audiblez using pip
 * @returns {Promise<boolean>}
 */
async function installAudiblez(customPath = null) {
    console.log('[Audiblez] Installing Audiblez and dependencies (Pillow, wxPython)...');
    
    try {
        const pythonCmd = await getExecutablePath(process.platform === 'win32' ? 'python' : 'python3', customPath);
        const args = ['-m', 'pip', 'install', 'audiblez', 'pillow', 'wxpython'];
        
        return new Promise((resolve) => {
            const proc = spawn(pythonCmd, args, { stdio: 'pipe' });
            
            proc.stdout.on('data', (data) => {
                const msg = data.toString().trim();
                if (msg) console.log(`[Audiblez Install] ${msg}`);
            });
            
            proc.stderr.on('data', (data) => {
                const msg = data.toString().trim();
                // Some warnings come on stderr, don't necessarily treat as error
                if (msg) console.log(`[Audiblez Install Info] ${msg}`);
            });
            
            proc.on('close', (code) => {
                if (code === 0) {
                    console.log('[Audiblez] Installation successful');
                    resolve(true);
                } else {
                    console.error(`[Audiblez] Installation failed with code ${code}. Trying simple pip install...`);
                    // Fallback to simple pip install
                    const fallback = spawn('pip', ['install', 'audiblez'], { stdio: 'pipe' });
                    fallback.on('close', (c) => resolve(c === 0));
                }
            });
            
            proc.on('error', (err) => {
                console.error(`[Audiblez] Installation error: ${err.message}`);
                resolve(false);
            });
            
            setTimeout(() => resolve(false), 300000); // 5 minute timeout for wxpython
        });
    } catch (err) {
        console.error(`[Audiblez] Installation failed: ${err.message}`);
        return false;
    }
}

/**
 * Ensure Audiblez is installed, install if not
 * @returns {Promise<boolean>}
 */
async function ensureAudiblezInstalled(customPath = null) {
    const installed = await isAudiblezInstalled(customPath);
    if (installed) {
        return true;
    }
    
    console.log('[Audiblez] Not installed, attempting automatic installation...');
    const installedSuccessfully = await installAudiblez(customPath);
    
    if (installedSuccessfully) {
        // Verify installation
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for installation to complete
        return await isAudiblezInstalled(customPath);
    }
    
    return false;
}

/**
 * Run Audiblez to convert EPUB to audiobook
 * @param {string} epubPath - Path to EPUB file
 * @param {string} outputPath - Output M4B file path
 * @param {Object} options - Conversion options
 * @returns {Promise<Object>} Conversion result
 */
async function runAudiblez(epubPath, outputPath, options = {}) {
    console.log(`[Audiblez] Starting conversion: "${epubPath}" -> "${outputPath}"`);
    
    const {
        voice = 'default',
        speed = 1.0,
        language = 'en',
        chapters = null,
        onProgress = null,
        customPath = null
    } = options;
    
    const audiblezExec = await getExecutablePath('audiblez', customPath);
    
    return new Promise((resolve, reject) => {
        // Build Audiblez command
        const args = [
            'convert',
            epubPath,
            '--output', outputPath,
            '--voice', voice,
            '--speed', speed.toString(),
            '--language', language
        ];
        
        if (chapters && chapters.length > 0) {
            args.push('--chapters', chapters.join(','));
        }
        
        console.log(`[Audiblez] Command: ${audiblezExec} ${args.join(' ')}`);
        
        // Spawn Audiblez process
        const audiblez = spawn(audiblezExec, args, {
            stdio: ['ignore', 'pipe', 'pipe']
        });
        
        let output = '';
        let errorOutput = '';
        
        // Capture stdout for progress parsing
        audiblez.stdout.on('data', (data) => {
            const text = data.toString();
            output += text;
            
            // Parse progress if callback provided
            if (onProgress) {
                const progressMatch = text.match(/(\d+)%/);
                if (progressMatch) {
                    const progress = parseInt(progressMatch[1]);
                    onProgress(progress);
                }
            }
        });
        
        // Capture stderr
        audiblez.stderr.on('data', (data) => {
            errorOutput += data.toString();
            console.log(`[Audiblez] ${data.toString().trim()}`);
        });
        
        // Handle process completion
        audiblez.on('close', (code) => {
            if (code === 0) {
                console.log(`[Audiblez] Conversion complete: "${outputPath}"`);
                resolve({
                    success: true,
                    outputPath,
                    code
                });
            } else {
                console.error(`[Audiblez] Conversion failed with code ${code}`);
                reject(new Error(`Audiblez failed with code ${code}: ${errorOutput}`));
            }
        });
        
        // Handle process errors
        audiblez.on('error', (err) => {
            console.error(`[Audiblez] Process error:`, err);
            reject(new Error(`Failed to start Audiblez: ${err.message}. Is Audiblez installed?`));
        });
    });
}

/**
 * Convert EPUB to audiobook using Audiblez
 * @param {string} epubPath - Path to EPUB file
 * @param {string} outputPath - Output M4B file path
 * @param {Object} options - Conversion options
 * @returns {Promise<Object>} Conversion result
 */
async function epubToAudiobookWithAudiblez(epubPath, outputPath, options = {}) {
    const { customPath = null } = options;
    
    // Check if Audiblez is installed
    const installed = await isAudiblezInstalled(customPath);
    if (!installed) {
        throw new Error('Audiblez is not installed or not found at the specified path.');
    }
    
    // Run Audiblez
    return await runAudiblez(epubPath, outputPath, options);
}

/**
 * Get Audiblez version
 * @returns {Promise<string>}
 */
async function getAudiblezVersion() {
    return new Promise((resolve) => {
        const audiblez = spawn('audiblez', ['--version'], { stdio: 'pipe' });
        let output = '';
        
        audiblez.stdout.on('data', (data) => {
            output += data.toString();
        });
        
        audiblez.on('close', (code) => {
            if (code === 0) {
                resolve(output.trim());
            } else {
                resolve('unknown');
            }
        });
        
        audiblez.on('error', () => {
            resolve('not installed');
        });
        
        setTimeout(() => resolve('unknown'), 5000);
    });
}

/**
 * Get available Audiblez voices
 * @returns {Promise<Array>}
 */
async function getAudiblezVoices() {
    return new Promise((resolve) => {
        const audiblez = spawn('audiblez', ['--list-voices'], { stdio: 'pipe' });
        let output = '';
        
        audiblez.stdout.on('data', (data) => {
            output += data.toString();
        });
        
        audiblez.on('close', (code) => {
            if (code === 0) {
                // Parse voice list
                const voices = output.split('\n')
                    .filter(line => line.trim())
                    .map(line => line.trim());
                resolve(voices);
            } else {
                resolve([]);
            }
        });
        
        audiblez.on('error', () => {
            resolve([]);
        });
        
        setTimeout(() => resolve([]), 5000);
    });
}

module.exports = {
    isAudiblezInstalled,
    installAudiblez,
    ensureAudiblezInstalled,
    runAudiblez,
    epubToAudiobookWithAudiblez,
    getAudiblezVersion,
    getAudiblezVoices
};
