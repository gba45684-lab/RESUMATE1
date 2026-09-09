// Syntax-checks every inline <script> in www/index.html. Zero dependencies
// (uses `new Function`, built into Node) so this always runs, even without
// a browser available -- this is exactly the class of bug (a corrupted
// regex literal, a raw-string escaping mistake) that has broken this app
// silently in the past: a single bad script tag aborts the ENTIRE app,
// including every onclick handler, with no visible error in most WebViews.
import { readFile } from 'node:fs/promises';

const html = await readFile('www/index.html', 'utf8');
const re = /<script(?:\s+[^>]*)?>([\s\S]*?)<\/script>/gi;
let match, index = 0, errors = 0, checked = 0;

while ((match = re.exec(html))) {
  const tag = match[0].slice(0, match[0].indexOf('>') + 1);
  if (/\ssrc=/.test(tag)) { index++; continue; } // external script, nothing to parse locally
  checked++;
  try {
    new Function(match[1]);
  } catch (e) {
    errors++;
    console.error(`Syntax error in inline <script> #${index}: ${e.message}`);
  }
  index++;
}

console.log(`Checked ${checked} inline script block(s), ${errors} error(s).`);
if (errors > 0) process.exit(1);
