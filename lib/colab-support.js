/**
 * Google Colab Support Module
 * Provides network tunneling and localhost access for Google Colab environments
 * BPM4B - Professional Multimedia Converter
 */

const { spawn } = require('child_process');
const http = require('http');

/**
 * Detect if running in Google Colab environment
 * @returns {boolean}
 */
function isColabEnvironment() {
  return process.env.COLAB_GPU !== undefined || 
         process.env.COLAB_TPU_ADDR !== undefined ||
         process.env.DATALAB_SETTINGS !== undefined;
}

/**
 * Start a localtunnel for exposing localhost to the internet
 * @param {number} localPort - Local port to expose
 * @param {string} subdomain - Optional subdomain name
 * @returns {Promise<{url: string, process: any}>}
 */
async function startLocaltunnel(localPort, subdomain = null) {
  return new Promise((resolve, reject) => {
    const args = ['--port', String(localPort)];
    if (subdomain) {
      args.push('--subdomain', subdomain);
    }

    const lt = spawn('npx', ['localtunnel', ...args]);
    
    let url = null;
    let errorOutput = '';

    lt.stdout.on('data', (data) => {
      const output = data.toString();
      console.log('[Localtunnel]', output);
      
      // Parse the URL from output
      const urlMatch = output.match(/your url is: (https:\/\/[^\s]+)/);
      if (urlMatch && !url) {
        url = urlMatch[1];
        resolve({ url, process: lt });
      }
    });

    lt.stderr.on('data', (data) => {
      errorOutput += data.toString();
      console.error('[Localtunnel Error]', data.toString());
    });

    lt.on('error', (err) => {
      reject(new Error(`Localtunnel failed to start: ${err.message}`));
    });

    lt.on('close', (code) => {
      if (code !== 0 && !url) {
        reject(new Error(`Localtunnel exited with code ${code}: ${errorOutput}`));
      }
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      if (!url) {
        lt.kill();
        reject(new Error('Localtunnel timed out after 30 seconds'));
      }
    }, 30000);
  });
}

/**
 * Start ngrok tunnel for exposing localhost to the internet
 * @param {number} localPort - Local port to expose
 * @returns {Promise<{url: string, process: any}>}
 */
async function startNgrok(localPort) {
  return new Promise((resolve, reject) => {
    const ngrok = spawn('ngrok', ['http', String(localPort)]);
    
    let url = null;
    let errorOutput = '';

    ngrok.stdout.on('data', (data) => {
      const output = data.toString();
      console.log('[Ngrok]', output);
      
      // Parse the URL from output
      const urlMatch = output.match(/https:\/\/[a-z0-9\-]+\.ngrok\.io/);
      if (urlMatch && !url) {
        url = urlMatch[0];
        resolve({ url, process: ngrok });
      }
    });

    ngrok.stderr.on('data', (data) => {
      errorOutput += data.toString();
      console.error('[Ngrok Error]', data.toString());
    });

    ngrok.on('error', (err) => {
      reject(new Error(`Ngrok failed to start: ${err.message}`));
    });

    ngrok.on('close', (code) => {
      if (code !== 0 && !url) {
        reject(new Error(`Ngrok exited with code ${code}: ${errorOutput}`));
      }
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      if (!url) {
        ngrok.kill();
        reject(new Error('Ngrok timed out after 30 seconds'));
      }
    }, 30000);
  });
}

/**
 * Auto-detect and start the best available tunneling service
 * @param {number} localPort - Local port to expose
 * @param {Object} options - Options { preferred: 'localtunnel'|'ngrok', subdomain: string }
 * @returns {Promise<{url: string, process: any, service: string}>}
 */
async function startTunnel(localPort, options = {}) {
  const { preferred = null, subdomain = null } = options;

  // Try preferred service first
  if (preferred === 'localtunnel') {
    try {
      const tunnel = await startLocaltunnel(localPort, subdomain);
      return { ...tunnel, service: 'localtunnel' };
    } catch (err) {
      console.warn('Localtunnel failed, trying ngrok:', err.message);
    }
  } else if (preferred === 'ngrok') {
    try {
      const tunnel = await startNgrok(localPort);
      return { ...tunnel, service: 'ngrok' };
    } catch (err) {
      console.warn('Ngrok failed, trying localtunnel:', err.message);
    }
  }

  // Auto-detect: try localtunnel first (easier, no auth required)
  try {
    const tunnel = await startLocaltunnel(localPort, subdomain);
    return { ...tunnel, service: 'localtunnel' };
  } catch (err) {
    console.warn('Localtunnel failed, trying ngrok:', err.message);
  }

  // Fallback to ngrok
  try {
    const tunnel = await startNgrok(localPort);
    return { ...tunnel, service: 'ngrok' };
  } catch (err) {
    throw new Error(`All tunneling services failed. Last error: ${err.message}`);
  }
}

/**
 * Setup Colab-specific optimizations
 * @returns {Object} Colab configuration
 */
function setupColabOptimizations() {
  if (!isColabEnvironment()) {
    return {
      isColab: false,
      optimizations: {}
    };
  }

  const config = {
    isColab: true,
    optimizations: {
      // Use all available CPU cores in Colab
      concurrency: require('os').cpus().length,
      
      // Enable fast mode by default in Colab
      fastMode: true,
      
      // Use higher quality in Colab (better CPU/GPU)
      audioQuality: '128k',
      
      // Colab has good I/O, can handle more parallel operations
      maxParallelFiles: 16,
      
      // Disable progress parsing in fast mode for speed
      verboseProgress: false
    }
  };

  console.log('[Colab] Detected Google Colab environment');
  console.log('[Colab] Applying optimizations:', config.optimizations);
  
  return config;
}

/**
 * Create a Colab-ready server configuration
 * @param {Object} serverOptions - Original server options
 * @returns {Object} Enhanced server options for Colab
 */
function getColabServerConfig(serverOptions = {}) {
  const colabConfig = setupColabOptimizations();
  
  if (!colabConfig.isColab) {
    return serverOptions;
  }

  return {
    ...serverOptions,
    host: '0.0.0.0', // Bind to all interfaces for Colab
    port: serverOptions.port || 5000,
    colab: true
  };
}

/**
 * Generate Colab notebook cell for running BPM4B
 * @param {number} port - Port to run on
 * @returns {string} Python code for Colab
 */
function generateColabNotebook(port = 5000) {
  return `# Install BPM4B in Google Colab
!npm install -g bpm4b

# Start the server with Colab optimizations
import subprocess
import time

# Start the server in background
server = subprocess.Popen(['bpm4b', 'web', '--port', str(port)], 
                         stdout=subprocess.PIPE, 
                         stderr=subprocess.PIPE)

# Wait for server to start
time.sleep(5)

# Setup tunneling (uncomment one of the following)
# Option 1: Using localtunnel (easier, no signup required)
!npx localtunnel --port ${port}

# Option 2: Using ngrok (requires ngrok installed)
# !ngrok http ${port}

# The server is now accessible via the tunnel URL above
# You can upload files and convert them to M4B format
`;
}

module.exports = {
  isColabEnvironment,
  startLocaltunnel,
  startNgrok,
  startTunnel,
  setupColabOptimizations,
  getColabServerConfig,
  generateColabNotebook
};
