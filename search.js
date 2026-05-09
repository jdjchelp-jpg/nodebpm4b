const fs = require('fs');
const lines = fs.readFileSync('templates/index.ejs', 'utf8').split('\n');
lines.forEach((l, i) => {
    if (l.includes('timeRemaining') || l.includes('Est:')) {
        console.log(`${i+1}: ${l.trim()}`);
    }
});
