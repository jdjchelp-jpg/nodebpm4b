const text = `
MFSJ_01(1-132).indd 14/12/11 10:25:05 AM
MFSJ_01(1-132).indd 54/12/11 10:25:05 AM
Some text here
Another.indd 12/12/2023 11:11:11 PM
`;

const pattern = /^\s*.*\.indd\s*\d+\/\d+\/\d+\s+\d+:\d+:\d+\s+[AP]M\s*$/gim;

const clean = text.replace(pattern, '');
console.log(clean);
