const { convertMp3ToM4b } = require('./lib/core');
const fs = require('fs');
const path = require('path');

async function run() {
    const input = path.join(__dirname, 'test.mp3');
    const output = path.join(__dirname, 'test.m4b');
    
    const chapters = [
        {title: "Intro", start_time: 0, end_time: 0.5},
        {title: "Outro", start_time: 0.5, end_time: 1}
    ];

    try {
        await convertMp3ToM4b(input, output, chapters, { audioQuality: '256k', onProgress: (pct, msg) => console.log(pct, msg) });
        console.log("Success");
    } catch (e) {
        console.error("Failed:", e.message);
    }
}
run();
