/**
 * TTS Worker Pool
 * Manages a pool of worker threads, each running its own Kokoro model instance.
 * Distributes synthesis tasks across all cores for maximum throughput.
 */

const { fork } = require('child_process');
const path = require('path');
const os = require('os');

const WORKER_SCRIPT = path.join(__dirname, 'tts-worker.js');

class TTSWorkerPool {
    constructor(size) {
        // Dynamically scale workers based on both CPU cores AND Available RAM.
        // Each Kokoro q8 instance uses ~300MB RAM.
        const numCores = os.cpus().length;
        const freeMemMB = os.freemem() / (1024 * 1024);
        
        // Reserve 1.0 GB (1000 MB) for the OS and main Node process,
        // then divide remaining memory by 300MB per worker.
        const safeWorkersByRam = Math.max(1, Math.floor((freeMemMB - 1000) / 300));
        
        // Cap based on the most restrictive bottleneck (CPU or RAM), max 6.
        const maxWorkers = Math.max(1, Math.min(numCores - 1, safeWorkersByRam, 6));
        this.size = size || maxWorkers;
        this.workers = [];
        this.queue = [];
        this.pendingJobs = new Map(); // id -> { resolve, reject }
        this.jobCounter = 0;
        this.ready = false;
        this._initPromise = null;
    }

    async init() {
        if (this._initPromise) return this._initPromise;
        this._initPromise = this._startAll();
        return this._initPromise;
    }

    _startAll() {
        return new Promise((resolve, reject) => {
            let readyCount = 0;
            const errors = [];

            for (let i = 0; i < this.size; i++) {
                const worker = fork(WORKER_SCRIPT);
                const state = { worker, busy: false };
                this.workers.push(state);

                worker.on('message', (msg) => {
                    if (msg.type === 'ready') {
                        readyCount++;
                        if (readyCount === this.size) {
                            this.ready = true;
                            resolve();
                        }
                        return;
                    }

                    if (msg.type === 'result' || msg.type === 'error') {
                        state.busy = false;
                        if (msg.type === 'error' && !msg.id) {
                            console.error(`[TTS Worker Error] ${msg.error}`);
                            errors.push(new Error(msg.error));
                            if (errors.length + readyCount >= this.size) {
                                reject(new Error('Worker pool failed to initialize: ' + errors[0].message));
                            }
                        }
                        const job = this.pendingJobs.get(msg.id);
                        if (job) {
                            this.pendingJobs.delete(msg.id);
                            if (msg.type === 'result') {
                                job.resolve(Buffer.from(msg.buffer, 'base64'));
                            } else {
                                job.reject(new Error(msg.error));
                            }
                        }
                        // Process next queued item
                        this._drain();
                    }
                });

                worker.on('error', (err) => {
                    errors.push(err);
                    if (errors.length + readyCount >= this.size) {
                        reject(new Error('Worker pool failed to initialize: ' + errors[0].message));
                    }
                });

                worker.on('exit', (code) => {
                    if (code !== 0) {
                        console.error(`[TTS Worker] exited with code ${code}`);
                        errors.push(new Error(`Worker exited with code ${code}`));
                        if (!this.ready && errors.length + readyCount >= this.size) {
                            reject(new Error('Worker pool failed to initialize: workers exited.'));
                        }
                    }
                    // Remove from pool
                    const idx = this.workers.indexOf(state);
                    if (idx >= 0) this.workers.splice(idx, 1);
                });
            }
        });
    }

    /**
     * Synthesize text to a WAV Buffer.
     */
    synthesize(text, voice, speed = 1.0) {
        return new Promise((resolve, reject) => {
            const id = ++this.jobCounter;
            this.pendingJobs.set(id, { resolve, reject });
            this.queue.push({ id, text, voice, speed });
            this._drain();
        });
    }

    _drain() {
        while (this.queue.length > 0) {
            const freeWorker = this.workers.find(w => !w.busy);
            if (!freeWorker) break;

            const job = this.queue.shift();
            freeWorker.busy = true;
            freeWorker.worker.send({
                type: 'synthesize',
                id: job.id,
                text: job.text,
                voice: job.voice,
                speed: job.speed
            });
        }
    }

    /**
     * Terminate all workers gracefully.
     */
    async terminate() {
        for (const { worker } of this.workers) {
            worker.kill();
        }
        this.workers = [];
        this.ready = false;
        this._initPromise = null;
    }

    get workerCount() {
        return this.workers.length;
    }
}

// Singleton pool — shared across all requests
let pool = null;

async function getPool() {
    if (!pool) {
        pool = new TTSWorkerPool();
        await pool.init();
        console.log(`[TTS Pool] Initialized with ${pool.workerCount} workers (q8 quantized Kokoro)`);
    }
    return pool;
}

module.exports = { TTSWorkerPool, getPool };
