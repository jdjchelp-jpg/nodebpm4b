const { KokoroTTS } = require('kokoro-js');

async function test() {
    try {
        console.log('Loading Kokoro-82M ONNX model...');
        const model = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
            dtype: 'q8',
        });
        console.log('Model loaded successfully!', Object.keys(model));
    } catch (err) {
        console.error('Error loading model:', err);
    }
}
test();
