const fs = require('fs');

async function test() {
    const fd = new FormData();
    const fileBlob = new Blob([fs.readFileSync('test.mp3')], { type: 'audio/mpeg' });
    fd.append('source_file', fileBlob, 'test.mp3');
    fd.append('audio_quality', '256k');
    fd.append('output_name', 'out.m4b');
    fd.append('jobId', 'test-job-123');
    fd.append('chapters', JSON.stringify([{title: '1', startTime: 0}]));

    try {
        const res = await fetch('http://localhost:5000/api/convert', {
            method: 'POST',
            body: fd
        });
        
        if (!res.ok) {
            const txt = await res.text();
            console.log("FAILED WITH:", res.status, txt);
        } else {
            console.log("SUCCESS");
        }
    } catch (e) {
        console.error("Fetch Exception:", e);
    }
}
test();
