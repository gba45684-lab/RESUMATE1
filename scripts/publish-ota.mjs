// Prepares the OTA payload: stamps a build number into a COPY of
// www/index.html (main's own copy keeps the placeholder 0 -- only the
// published `ota` branch artifact carries a real number), computes its
// sha256, and writes version.json next to it.
//
// Usage: node scripts/publish-ota.mjs <build-number> <out-dir>
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const build = parseInt(process.argv[2], 10);
const outDir = process.argv[3];
if (!Number.isInteger(build) || build < 1) throw new Error('usage: publish-ota.mjs <build-number> <out-dir>');
if (!outDir) throw new Error('usage: publish-ota.mjs <build-number> <out-dir>');

const marker = 'window.__RESUMATE_BUILD__ = 0;';
let html = await readFile('www/index.html', 'utf8');
if (!html.includes(marker)) throw new Error(`expected to find "${marker}" in www/index.html`);
html = html.replace(marker, `window.__RESUMATE_BUILD__ = ${build};`);

const sha256 = createHash('sha256').update(html, 'utf8').digest('hex');
const manifest = {
  version: `1.0.${build}`,
  build,
  schemaVersion: 1,
  updated: new Date().toISOString(),
  sha256,
  rollbackEnabled: true
};

await mkdir(outDir, { recursive: true });
await writeFile(`${outDir}/index.html`, html, 'utf8');
await writeFile(`${outDir}/version.json`, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

console.log(`Prepared OTA build ${build} (sha256 ${sha256.slice(0, 12)}...) in ${outDir}/`);
