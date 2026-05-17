const text = `
CONTENTS
1The blow6
2Reflections15
3Neighbours30
4Growing38
5To market, to market46
6A wedding so contrary57
7Who’s afraid of defeat?67
8A pyrrhic victory73
9Building78
10Christmas88
11My father, Sun-Sun Johnson103
Notes
113
MFSJ_01(1-132).indd 54/12/11 10:25:05 AM

6
1
The blow
I WAS THERE WHEN THE BLOW FELL. And Father took it
like a man.
`;

function cleanAdvancedBoilerplate(text) {
    let clean = text;

    // 1. Remove InDesign artifacts
    clean = clean.replace(/^\s*.*\.indd\s*\d+\/\d+\/\d+\s+\d+:\d+:\d+\s+[AP]M\s*$/gim, '');

    // 2. Remove TOC section if it's fused like "1The blow6"
    // We can look for "CONTENTS" followed by lines that start and end with digits.
    // Since it's hard to safely regex the whole block without false positives, 
    // let's remove any line that strictly matches fused TOC entries:
    // e.g., starts with 1-3 digits, has letters, ends with 1-4 digits, no spaces at the start/end
    clean = clean.replace(/^\s*\d{1,3}[A-Z][^\n]*?\d{1,4}\s*$/gim, '');
    
    // Also remove "CONTENTS" if it's on a line by itself
    clean = clean.replace(/^\s*CONTENTS\s*$/gim, '');
    clean = clean.replace(/^\s*Notes\s*$/gim, '');

    // 3. Remove standalone page numbers (lines with only 1-4 digits)
    // Be careful not to remove valid chapter numbers if they are formatting like "1 \n The Blow"
    // Actually, standalone numbers that are > 3 are almost certainly page numbers if they are isolated.
    // Or we just remove any line that is purely a number up to 4 digits.
    // Let's replace lines with strictly digits, but maybe we shouldn't if it's "1".
    // Wait, if we remove "1", then "The blow" becomes the first line, which is great for chapter detection!
    clean = clean.replace(/^\s*\d+\s*$/gim, '');

    // Clean up excessive newlines
    clean = clean.replace(/\n{3,}/g, '\n\n');

    return clean.trim();
}

console.log(cleanAdvancedBoilerplate(text));
