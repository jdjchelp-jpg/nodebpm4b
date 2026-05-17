const fs = require('fs');
const path = require('path');

const filesToUpdate = [
  "test-epub-integration.js",
  "test-document-to-epub.js",
  "test-audiblez-integration.js",
  "templates/index.ejs",
  "lib/audiblez-integration.js",
  "lib/epub-parser.js",
  "lib/server.js",
  "lib/multi-language-voices.js",
  "lib/epub-to-audiobook.js",
  "lib/document-to-epub.js",
  "lib/audiobook-builder.js",
  "BPM4B-Portable/app/lib/audiobook-builder.js"
];

for (const file of filesToUpdate) {
  const fullPath = path.join(process.cwd(), file);
  if (fs.existsSync(fullPath)) {
    let content = fs.readFileSync(fullPath, 'utf8');
    content = content.replace(/audiblez/g, 'abogen');
    content = content.replace(/Audiblez/g, 'Abogen');
    content = content.replace(/AUDIBLEZ/g, 'ABOGEN');
    fs.writeFileSync(fullPath, content);
    console.log('Updated ' + file);
    
    // rename file if it contains audiblez
    if (file.includes('audiblez')) {
      const newFile = file.replace('audiblez', 'abogen');
      const newFullPath = path.join(process.cwd(), newFile);
      fs.renameSync(fullPath, newFullPath);
      console.log('Renamed to ' + newFile);
    }
  }
}
