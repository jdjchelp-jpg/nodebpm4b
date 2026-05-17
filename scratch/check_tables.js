const fs = require('fs');
const content = fs.readFileSync('c:/Users/johns/Downloads/nodebpm4b/README.md', 'utf8');
const lines = content.split('\n');

let inTable = false;
let tableStartLine = 0;
let tableHeadersCount = 0;

lines.forEach((line, idx) => {
    const isTableRow = line.trim().startsWith('|') && line.trim().endsWith('|');
    if (isTableRow) {
        if (!inTable) {
            inTable = true;
            tableStartLine = idx + 1;
            // count pipes to find columns
            tableHeadersCount = (line.match(/\|/g) || []).length;
        } else {
            const columnsCount = (line.match(/\|/g) || []).length;
            if (columnsCount !== tableHeadersCount) {
                console.log(`WARNING: Table starting at line ${tableStartLine} has mismatched column count at line ${idx + 1}! Header columns count: ${tableHeadersCount}, Row columns count: ${columnsCount}. Row content: "${line}"`);
            }
        }
    } else {
        if (inTable) {
            inTable = false;
        }
    }
});

console.log("Table check completed.");
