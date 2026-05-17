const text = `
Here is some story text.
MFSJ_01(1-132).indd 14/12/11 10:25:05 AM
This is another line.
SomeBook.indd 1/2/23 1:05:01 PM
And the end.
`;

const pattern = /^.*\.indd\s+\d{1,2}\/\d{1,2}\/\d{2,4}\s+\d{1,2}:\d{2}:\d{2}\s+[AP]M\s*$/gim;

const clean = text.replace(pattern, '');
console.log(clean);
