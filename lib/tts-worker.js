/**
 * TTS Worker Thread
 * Each worker owns a single Kokoro model instance and processes chunks independently.
 * This enables true CPU parallelism across multiple cores.
 */

// child_process used instead of worker_threads to avoid ONNX V8 thread-locking crashes

let Kokoro;
try {
    Kokoro = require('kokoro-js').KokoroTTS;
} catch (e) {
    console.error(`[TTS Worker Init Error] kokoro-js not found: ${e.message}`);
    process.send({ type: 'error', error: 'kokoro-js not found: ' + e.message });
    process.exit(1);
}

let modelInstance = null;

async function initModel() {
    if (modelInstance) return modelInstance;
    modelInstance = await Kokoro.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
        dtype: 'q8', // INT8 quantization — ~3-4x faster than fp32 with minimal quality loss
    });
    return modelInstance;
}

function createWavBuffer(audioArray, sampleRate) {
    const numChannels = 1;
    const bytesPerSample = 2;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = audioArray.length * bytesPerSample;
    const buffer = Buffer.alloc(44 + dataSize);

    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(numChannels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(byteRate, 28);
    buffer.writeUInt16LE(blockAlign, 32);
    buffer.writeUInt16LE(16, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);

    for (let i = 0; i < audioArray.length; i++) {
        const sample = Math.max(-1, Math.min(1, audioArray[i]));
        const val = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        buffer.writeInt16LE(Math.floor(val), 44 + i * 2);
    }

    return buffer;
}

// Initialize model on startup, then signal ready
initModel().then(() => {
    process.send({ type: 'ready' });

    process.on('message', async (msg) => {
        if (msg.type === 'synthesize') {
            try {
                const model = await initModel();
                const result = await model.generate(msg.text, {
                    voice: msg.voice,
                    speed: msg.speed || 1.0
                });
                const wavBuffer = createWavBuffer(result.audio, result.sampling_rate);
                process.send({
                    type: 'result',
                    id: msg.id,
                    buffer: wavBuffer.toString('base64')
                });
            } catch (err) {
                process.send({
                    type: 'error',
                    id: msg.id,
                    error: err.message
                });
            }
        }
    });
}).catch(err => {
    console.error(`[TTS Worker Init Error] Model init failed: ${err.message}`);
    process.send({ type: 'error', error: err.message });
    process.exit(1);
});
