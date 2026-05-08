const { execSync } = require('child_process');
const fs = require('fs-extra');
const path = require('path');

async function build() {
    const rootDir = path.join(__dirname, '..');
    const distDir = path.join(rootDir, 'dist-exe');
    const binDir = path.join(distDir, 'bin');

    console.log('Cleaning dist directory...');
    await fs.remove(distDir);
    await fs.ensureDir(binDir);

    console.log('Building executable with pkg...');
    try {
        execSync('npx pkg . --out-path dist-exe', { stdio: 'inherit', cwd: rootDir });
    } catch (error) {
        console.error('pkg build failed:', error.message);
        process.exit(1);
    }

    console.log('Copying native modules...');
    const onnxDir = path.join(rootDir, 'node_modules', 'onnxruntime-node', 'bin', 'napi-v6', 'win32', 'x64');
    const targetOnnxDir = distDir; // Keep DLLs next to executable

    if (await fs.exists(onnxDir)) {
        await fs.copy(onnxDir, targetOnnxDir);
        console.log('Native modules copied to dist-exe/');
    } else {
        console.warn('Warning: onnxruntime-node native binaries not found at expected path.');
    }

    console.log('Build complete! Executable and DLLs are in dist-exe/');
}

build().catch(err => {
    console.error(err);
    process.exit(1);
});
