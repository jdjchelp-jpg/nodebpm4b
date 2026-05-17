/**
 * Abogen Integration Module
 * Runs Abogen as a subprocess for audiobook generation
 * Allows users to choose between BPM4B TTS and Abogen
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

/**
 * Helper to get the correct path to python or abogen executables, 
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
    venvPaths.push(path.join(cwd, 'abogen', 'venv'));
    
    for (const venvPath of venvPaths) {
        const binDir = isWin ? 'Scripts' : 'bin';
        const ext = isWin ? '.exe' : '';
        const execPath = path.join(venvPath, binDir, `${name}${ext}`);
        
        try {
            await fs.access(execPath);
            console.log(`[Abogen] Found ${name} in environment: ${execPath}`);
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
 * Check if Abogen is installed
 * @returns {Promise<boolean>}
 */
async function isAbogenInstalled(customPath = null) {
    try {
        const abogenExec = await getExecutablePath('abogen', customPath);
        return new Promise((resolve) => {
            const proc = spawn(abogenExec, ['--version'], { stdio: 'pipe' });
            proc.on('error', () => resolve(false));
            proc.on('close', (code) => resolve(code === 0));
            setTimeout(() => resolve(false), 5000);
        });
    } catch (err) {
        return false;
    }
}

/**
 * Install Abogen using pip
 * @returns {Promise<boolean>}
 */
async function installAbogen(customPath = null) {
    console.log('[Abogen] Installing Abogen and dependencies (Pillow, wxPython)...');
    
    try {
        const pythonCmd = await getExecutablePath(process.platform === 'win32' ? 'python' : 'python3', customPath);
        const args = ['-m', 'pip', 'install', 'abogen', 'pillow', 'wxpython'];
        
        return new Promise((resolve) => {
            const proc = spawn(pythonCmd, args, { stdio: 'pipe' });
            
            proc.stdout.on('data', (data) => {
                const msg = data.toString().trim();
                if (msg) console.log(`[Abogen Install] ${msg}`);
            });
            
            proc.stderr.on('data', (data) => {
                const msg = data.toString().trim();
                // Some warnings come on stderr, don't necessarily treat as error
                if (msg) console.log(`[Abogen Install Info] ${msg}`);
            });
            
            proc.on('close', (code) => {
                if (code === 0) {
                    console.log('[Abogen] Installation successful');
                    resolve(true);
                } else {
                    console.error(`[Abogen] Installation failed with code ${code}. Trying simple pip install...`);
                    // Fallback to simple pip install
                    const fallback = spawn('pip', ['install', 'abogen'], { stdio: 'pipe' });
                    fallback.on('close', (c) => resolve(c === 0));
                }
            });
            
            proc.on('error', (err) => {
                console.error(`[Abogen] Installation error: ${err.message}`);
                resolve(false);
            });
            
            setTimeout(() => resolve(false), 300000); // 5 minute timeout for wxpython
        });
    } catch (err) {
        console.error(`[Abogen] Installation failed: ${err.message}`);
        return false;
    }
}

/**
 * Ensure Abogen is installed, install if not
 * @returns {Promise<boolean>}
 */
async function ensureAbogenInstalled(customPath = null) {
    const installed = await isAbogenInstalled(customPath);
    if (installed) {
        return true;
    }
    
    console.log('[Abogen] Not installed, attempting automatic installation...');
    const installedSuccessfully = await installAbogen(customPath);
    
    if (installedSuccessfully) {
        // Verify installation
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for installation to complete
        return await isAbogenInstalled(customPath);
    }
    
    return false;
}

/**
 * Run Abogen to convert EPUB to audiobook
 * @param {string} epubPath - Path to EPUB file
 * @param {string} outputPath - Output M4B file path
 * @param {Object} options - Conversion options
 * @returns {Promise<Object>} Conversion result
 */
async function runAbogen(epubPath, outputPath, options = {}) {
    console.log(`[Abogen] Starting conversion: "${epubPath}" -> "${outputPath}"`);
    
    const {
        voice = 'default',
        speed = 1.0,
        language = 'en',
        chapters = null,
        onProgress = null,
        customPath = null
    } = options;
    
    const abogenExec = await getExecutablePath('abogen', customPath);
    
    return new Promise((resolve, reject) => {
        // Build Abogen command
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
        
        console.log(`[Abogen] Command: ${abogenExec} ${args.join(' ')}`);
        
        // Spawn Abogen process
        const abogen = spawn(abogenExec, args, {
            stdio: ['ignore', 'pipe', 'pipe']
        });
        
        let output = '';
        let errorOutput = '';
        
        // Capture stdout for progress parsing
        abogen.stdout.on('data', (data) => {
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
        abogen.stderr.on('data', (data) => {
            errorOutput += data.toString();
            console.log(`[Abogen] ${data.toString().trim()}`);
        });
        
        // Handle process completion
        abogen.on('close', (code) => {
            if (code === 0) {
                console.log(`[Abogen] Conversion complete: "${outputPath}"`);
                resolve({
                    success: true,
                    outputPath,
                    code
                });
            } else {
                console.error(`[Abogen] Conversion failed with code ${code}`);
                reject(new Error(`Abogen failed with code ${code}: ${errorOutput}`));
            }
        });
        
        // Handle process errors
        abogen.on('error', (err) => {
            console.error(`[Abogen] Process error:`, err);
            reject(new Error(`Failed to start Abogen: ${err.message}. Is Abogen installed?`));
        });
    });
}

/**
 * Convert EPUB to audiobook using Abogen
 * @param {string} epubPath - Path to EPUB file
 * @param {string} outputPath - Output M4B file path
 * @param {Object} options - Conversion options
 * @returns {Promise<Object>} Conversion result
 */
async function epubToAudiobookWithAbogen(epubPath, outputPath, options = {}) {
    const { customPath = null } = options;
    
    // Check if Abogen is installed
    const installed = await isAbogenInstalled(customPath);
    if (!installed) {
        throw new Error('Abogen is not installed or not found at the specified path.');
    }
    
    // Run Abogen
    return await runAbogen(epubPath, outputPath, options);
}

/**
 * Get Abogen version
 * @returns {Promise<string>}
 */
async function getAbogenVersion() {
    return new Promise((resolve) => {
        const abogen = spawn('abogen', ['--version'], { stdio: 'pipe' });
        let output = '';
        
        abogen.stdout.on('data', (data) => {
            output += data.toString();
        });
        
        abogen.on('close', (code) => {
            if (code === 0) {
                resolve(output.trim());
            } else {
                resolve('unknown');
            }
        });
        
        abogen.on('error', () => {
            resolve('not installed');
        });
        
        setTimeout(() => resolve('unknown'), 5000);
    });
}

/**
 * Get available Abogen voices
 * @returns {Promise<Array>}
 */
async function getAbogenVoices() {
    return new Promise((resolve) => {
        const abogen = spawn('abogen', ['--list-voices'], { stdio: 'pipe' });
        let output = '';
        
        abogen.stdout.on('data', (data) => {
            output += data.toString();
        });
        
        abogen.on('close', (code) => {
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
        
        abogen.on('error', () => {
            resolve([]);
        });
        
        setTimeout(() => resolve([]), 5000);
    });
}

module.exports = {
    isAbogenInstalled,
    installAbogen,
    ensureAbogenInstalled,
    runAbogen,
    epubToAudiobookWithAbogen,
    getAbogenVersion,
    getAbogenVoices
};
