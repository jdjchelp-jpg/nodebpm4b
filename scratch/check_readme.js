const fs = require('fs');
const content = fs.readFileSync('c:/Users/johns/Downloads/nodebpm4b/README.md', 'utf8');

console.log("README.md length:", content.length);

// 1. Check details / summary tags
const detailsOpen = (content.match(/<details>/g) || []).length;
const detailsClose = (content.match(/<\/details>/g) || []).length;
console.log(`details tags: Open=${detailsOpen}, Close=${detailsClose}`);

// 2. Check backticks
let threeBacktickCount = 0;
let pos = 0;
while ((pos = content.indexOf('```', pos)) !== -1) {
    threeBacktickCount++;
    pos += 3;
}
console.log(`Three backtick blocks count: ${threeBacktickCount}`);
if (threeBacktickCount % 2 !== 0) {
    console.log("WARNING: Mismatched three-backtick code blocks!");
}

// 3. Find lines with single backticks or stray backticks
const lines = content.split('\n');
lines.forEach((line, idx) => {
    // Check if line has mismatched backticks (odd number of single backticks)
    const backticks = (line.match(/`/g) || []).length;
    // Exclude code fence lines (which start with ```)
    if (!line.trim().startsWith('```') && backticks % 2 !== 0) {
        console.log(`Line ${idx + 1} has mismatched single backticks (${backticks}): "${line}"`);
    }
});

// 4. Check bold/italic markers
lines.forEach((line, idx) => {
    const boldCount = (line.match(/\*\*/g) || []).length;
    if (boldCount % 2 !== 0) {
        console.log(`Line ${idx + 1} has mismatched bold markers (**): "${line}"`);
    }
});

// 5. Check brackets and parentheses for links
lines.forEach((line, idx) => {
    const openBrackets = (line.match(/\[/g) || []).length;
    const closeBrackets = (line.match(/\]/g) || []).length;
    const openParens = (line.match(/\(/g) || []).length;
    const closeParens = (line.match(/\)/g) || []).length;
    if (openBrackets !== closeBrackets) {
        console.log(`Line ${idx + 1} has mismatched square brackets: "${line}"`);
    }
    if (openParens !== closeParens) {
        console.log(`Line ${idx + 1} has mismatched parentheses: "${line}"`);
    }
});
