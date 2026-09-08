import { access, readFile } from 'node:fs/promises';

await access('www/index.html');
const html = await readFile('www/index.html', 'utf8');
if (!/<html[\s>]/i.test(html) || !/<body[\s>]/i.test(html)) throw new Error('Invalid HTML shell');
if (!html.includes('ResuMate')) throw new Error('ResuMate app marker missing');
console.log(`ResuMate project check passed (${html.length} HTML chars).`);
