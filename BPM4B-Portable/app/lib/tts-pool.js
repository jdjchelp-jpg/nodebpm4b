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
        // Aggressive dynamic worker scaling based on RAM usage for systems with limited memory
        this.maxWorkers = 4;
        this.minWorkers = 1; // Can go down to 1 worker in critical memory situations
        this.ramThresholdCritical = 85; // Emergency: reduce to 1 worker at 85% RAM
        this.ramThresholdHigh = 75;    // Reduce workers at 75% RAM
        this.ramThresholdLow = 60;     // Restore workers at 60% RAM
        
        // Initial worker count based on current RAM usage
        const currentRamUsage = this.getRamUsagePercent();
        let initialWorkers = this.maxWorkers;
        
        if (currentRamUsage >= this.ramThresholdCritical) {
            initialWorkers = this.minWorkers;
            console.warn(`[TTS Pool] CRITICAL RAM usage (${currentRamUsage}%): Starting with ${initialWorkers} worker only`);
        } else if (currentRamUsage >= this.ramThresholdHigh) {
            initialWorkers = 2;
            console.warn(`[TTS Pool] High RAM usage (${currentRamUsage}%): Starting with ${initialWorkers} workers`);
        }
        
        this.size = size || initialWorkers;
        this.workers = [];
        this.queue = [];
        this.pendingJobs = new Map(); // id -> { resolve, reject }
        this.jobCounter = 0;
        this.ready = false;
        this._initPromise = null;
        this.monitoringInterval = null;
        
        // Start aggressive RAM monitoring
        this.startRamMonitoring();
        
        // Log initial system resources
        console.log('[TTS Pool] Initial system resources check:');
        this.logSystemResources();
        this.logMemoryUsage();
    }
    
    getRamUsagePercent() {
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        const usagePercent = Math.round((usedMem / totalMem) * 100);
        
        // Log detailed memory info
        const totalGB = (totalMem / (1024 * 1024 * 1024)).toFixed(1);
        const freeGB = (freeMem / (1024 * 1024 * 1024)).toFixed(1);
        const usedGB = (usedMem / (1024 * 1024 * 1024)).toFixed(1);
        
        if (usagePercent > 75) {
            console.warn(`[TTS Pool] Memory: ${usedGB}/${totalGB}GB used (${usagePercent}%), ${freeGB}GB free`);
        }
        
        return usagePercent;
    }
    
    logMemoryUsage() {
        const memUsage = process.memoryUsage();
        const heapUsedMB = (memUsage.heapUsed / 1024 / 1024).toFixed(2);
        const heapTotalMB = (memUsage.heapTotal / 1024 / 1024).toFixed(2);
        const rssMB = (memUsage.rss / 1024 / 1024).toFixed(2);
        
        console.log(`[TTS Pool] Process Memory: RSS=${rssMB}MB, Heap=${heapUsedMB}/${heapTotalMB}MB`);
    }
    
    getCpuUsage() {
        const cpus = os.cpus();
        const cpuCount = cpus.length;
        const cpuModel = cpus[0].model;
        const cpuSpeed = cpus[0].speed;
        
        // Get CPU load averages (1, 5, 15 minute averages)
        const loadAvg = os.loadavg();
        
        return {
            cpuCount,
            cpuModel,
            cpuSpeed,
            loadAvg,
            loadPercentages: loadAvg.map(load => (load / cpuCount) * 100)
        };
    }
    
    logSystemResources() {
        const cpu = this.getCpuUsage();
        const ramPercent = this.getRamUsagePercent();
        
        console.log(`[TTS Pool] System Resources: CPU=${cpu.cpuCount} cores @ ${cpu.cpuSpeed}MHz, Load=${cpu.loadAvg.map(l => l.toFixed(2)).join(', ')}, RAM=${ramPercent}%`);
    }
    
    startRamMonitoring() {
        // Monitor RAM usage every 3 seconds and adjust workers aggressively
        this.monitoringInterval = setInterval(() => {
            const ramUsage = this.getRamUsagePercent();
            const cpu = this.getCpuUsage();
            const currentWorkers = this.workers.length;
            
            // Log process memory periodically for diagnostics
            this.logMemoryUsage();
            
            // Log CPU usage if high
            const cpuLoad1Min = cpu.loadPercentages[0];
            if (cpuLoad1Min > 80) {
                console.warn(`[TTS Pool] High CPU usage: ${cpuLoad1Min.toFixed(1)}%`);
            }
            
            // Critical memory situation - emergency scaling
            if (ramUsage >= this.ramThresholdCritical) {
                if (currentWorkers > this.minWorkers) {
                    console.error(`[TTS Pool] CRITICAL RAM (${ramUsage}%): Emergency scaling to ${this.minWorkers} worker`);
                    this.scaleWorkers(this.minWorkers);
                }
            }
            // High memory usage - reduce workers
            else if (ramUsage >= this.ramThresholdHigh && currentWorkers > 2) {
                console.warn(`[TTS Pool] High RAM (${ramUsage}%): Reducing workers from ${currentWorkers} to 2`);
                this.scaleWorkers(2);
            }
            // Memory normalized - restore workers gradually
            else if (ramUsage <= this.ramThresholdLow && currentWorkers < this.maxWorkers) {
                console.log(`[TTS Pool] RAM normalized (${ramUsage}%): Increasing workers from ${currentWorkers} to ${this.maxWorkers}`);
                this.scaleWorkers(this.maxWorkers);
            }
        }, 3000); // Check every 3 seconds instead of 5
    }
    
    async scaleWorkers(newSize) {
        if (newSize === this.workers.length) return;
        
        const oldSize = this.workers.length;
        this.size = newSize;
        
        if (newSize > oldSize) {
            // Add workers
            await this.addWorkers(newSize - oldSize);
        } else {
            // Remove workers
            await this.removeWorkers(oldSize - newSize);
        }
    }
    
    async addWorkers(count) {
        for (let i = 0; i < count; i++) {
            const worker = fork(WORKER_SCRIPT);
            const state = { worker, busy: false };
            this.workers.push(state);
            
            // Set up message handler for new worker
            worker.on('message', (msg) => {
                if (msg.type === 'ready') {
                    console.log('[TTS Pool] Additional worker ready');
                } else if (msg.type === 'result' || msg.type === 'error') {
                    state.busy = false;
                    const job = this.pendingJobs.get(msg.id);
                    if (job) {
                        if (msg.type === 'result') {
                            job.resolve(Buffer.from(msg.buffer, 'base64'));
                        } else {
                            job.reject(new Error(msg.error));
                        }
                        this.pendingJobs.delete(msg.id);
                    }
                    this._drain();
                }
            });
            
            worker.on('exit', (code) => {
                console.error(`[TTS Worker] exited with code ${code}`);
                const idx = this.workers.indexOf(state);
                if (idx >= 0) this.workers.splice(idx, 1);
            });
        }
        console.log(`Added ${count} workers. Total: ${this.workers.length}`);
    }
    
    async removeWorkers(count) {
        const removed = this.workers.splice(-count, count);
        for (const state of removed) {
            state.worker.kill();
        }
        console.log(`Removed ${count} workers. Total: ${this.workers.length}`);
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
        // Stop RAM monitoring
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
        
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
