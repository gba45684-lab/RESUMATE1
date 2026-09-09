// Functional regression suite. Requires a real browser (Chromium/Chrome)
// and playwright-core. If neither can be found, this SKIPS (exit 0) rather
// than failing, so `npm test` still works in a plain Node environment --
// but it fails loudly (non-zero) on any real assertion failure so CI (which
// does install a browser -- see .github/workflows/test.yml) actually
// catches regressions instead of silently skipping them.
import { createServer } from 'node:http';
import { readFile, access } from 'node:fs/promises';
import { extname, join } from 'node:path';

function findChrome() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_PATH,
    '/opt/google/chrome/chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ].filter(Boolean);
  return candidates; // existence checked by caller; playwright can also fall back to its own bundled build
}

let chromium;
try {
  ({ chromium } = await import('playwright-core'));
} catch (e) {
  console.log('playwright-core not installed -- skipping functional suite (syntax check already ran).');
  process.exit(0);
}

async function pickExecutable() {
  for (const p of findChrome()) {
    try { await access(p); return p; } catch (e) { /* try next */ }
  }
  return null; // let playwright try its own managed browser install, if any
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
function serveStatic(root) {
  return createServer(async (req, res) => {
    try {
      const path = req.url === '/' ? '/index.html' : req.url.split('?')[0];
      const body = await readFile(join(root, path));
      res.writeHead(200, { 'Content-Type': MIME[extname(path)] || 'application/octet-stream' });
      res.end(body);
    } catch (e) { res.writeHead(404); res.end('not found'); }
  });
}

let failures = 0;
function assert(cond, message) {
  if (!cond) { failures++; console.error(`FAIL: ${message}`); }
  else console.log(`ok: ${message}`);
}

const server = serveStatic('www');
await new Promise((resolve) => server.listen(0, resolve));
const port = server.address().port;
const baseUrl = `http://127.0.0.1:${port}`;

const executablePath = await pickExecutable();
const browser = await chromium.launch({ executablePath: executablePath || undefined, args: ['--no-sandbox'] });

try {
  // ── Core: app boots with no page errors ────────────────────────────
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(900);
    assert(pageErrors.length === 0, `app loads with zero uncaught page errors (got: ${pageErrors.join('; ')})`);
    assert(await page.evaluate(() => typeof window.go === 'function'), 'window.go is defined (main script executed)');
    assert(await page.evaluate(() => !!document.getElementById('welcome')), 'welcome overlay is present');
    await page.close();
  }

  // ── AI: local engine works for every task type, with zero key/network ──
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(900);
    const result = await page.evaluate(async () => {
      const sample = {
        profile: { role: 'Software Engineer', email: 'a@b.com', phone: '' },
        summary: 'I am a hardworking team player who worked on many things.',
        skills: ['JavaScript', 'React'],
        experience: [{ role: 'Engineer', company: 'Acme', bullets: [
          'Responsible for maintaining the app', 'Increased conversion by 12% through A/B testing'] }],
        education: [], certifications: []
      };
      const tasks = [
        ['bullet', { text: 'Responsible for handling customer complaints' }],
        ['summary', { text: sample.summary }],
        ['keywords', { text: 'Led migration of payments system to microservices using Kubernetes and AWS' }],
        ['quantify', { text: 'Managed a team\nImproved performance by 30%' }],
        ['rewrite_bullet', { bullet: 'responsible for handling tickets' }],
        ['improve_summary', { summary: '  messy   summary text  ' }],
        ['job_match', { jobDescription: 'Looking for a Software Engineer with React and AWS experience.', resume: sample }],
        ['tailor_resume', { jobDescription: 'Looking for a Software Engineer with React and AWS experience.', resume: sample }],
        ['resume_doctor', { resume: sample }],
        ['interview_questions', { role: 'Software Engineer', type: 'Mixed', resume: sample }],
        ['grammar_check', { text: 'I  recieve the  the report yesterday' }],
        ['cover_letter', { jobTitle: 'Engineer', company: 'Acme', summary: 'Experienced engineer.', skills: 'React,AWS' }],
        ['generate_resume', { text: 'Jane Doe\nSoftware Engineer\njane@doe.com' }]
      ];
      const out = {};
      for (const [task, payload] of tasks) {
        try { const r = await window.AI.generate(task, payload); out[task] = { ok: true, source: r.source, hasText: !!r.text }; }
        catch (e) { out[task] = { ok: false, error: e.message }; }
      }
      return out;
    });
    assert(await page.evaluate(() => typeof window.AI === 'object' && typeof window.AI.generate === 'function'), 'window.AI.generate exists');
    for (const [task, r] of Object.entries(result)) {
      assert(r.ok && r.source === 'local' && r.hasText, `AI.generate('${task}', ...) succeeds locally with no API key (${JSON.stringify(r)})`);
    }
    // job_match / resume_doctor must return valid, parseable structured JSON
    const structured = await page.evaluate(async () => {
      const jm = await window.AI.generate('job_match', { jobDescription: 'React AWS engineer', resume: { skills: ['React'] } });
      const rd = await window.AI.generate('resume_doctor', { resume: { skills: ['React'], experience: [] } });
      return { jobMatch: JSON.parse(jm.text), doctor: JSON.parse(rd.text) };
    });
    assert(typeof structured.jobMatch.match_score === 'number', 'job_match returns a numeric match_score');
    assert(Array.isArray(structured.jobMatch.missing_keywords), 'job_match returns missing_keywords array');
    assert(typeof structured.doctor.score === 'number' && Array.isArray(structured.doctor.issues), 'resume_doctor returns score + issues[]');
    await page.close();
  }

  // ── Storage: schema migration preserves data with zero loss ─────────
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(900);
    await page.evaluate(() => window.setAIMode('auto')); // force an initial save
    await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem('resumate.v12.final'));
      delete raw.schemaVersion;
      raw.profile.name = 'Migration Test User';
      localStorage.setItem('resumate.v12.final', JSON.stringify(raw));
    });
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(900);
    const afterMigration = await page.evaluate(() => JSON.parse(localStorage.getItem('resumate.v12.final') || '{}'));
    assert(afterMigration.profile && afterMigration.profile.name === 'Migration Test User', 'migration preserves existing user data');
    await page.evaluate(() => window.setAIMode('auto')); // force write-back
    const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('resumate.v12.final') || '{}'));
    assert(persisted.schemaVersion === 1, 'migrated data is written back with the current schemaVersion');
    await page.close();
  }

  // ── OTA: swap application, and checksum rejection ────────────────────
  {
    const { createHash } = await import('node:crypto');
    const original = await readFile('www/index.html', 'utf8');
    // Build a synthetic "build 2" from whatever the current app actually is, so this test
    // never drifts from the real code -- it's never a hand-maintained fixture file.
    const fakeHtml = original
      .replace('window.__RESUMATE_BUILD__ = 0;', 'window.__RESUMATE_BUILD__ = 2;')
      .replace('<div class="brand">Resu<b>Mate</b></div>', '<div class="brand">Resu<b>Mate</b> <span id="testOtaMarker">B2</span></div>');
    const correctSha = createHash('sha256').update(fakeHtml, 'utf8').digest('hex');

    // Scenario A: correct checksum -> downloaded and applied on next launch
    {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await context.newPage();
      await page.route('https://raw.githubusercontent.com/gba45684-lab/RESUMATE1/ota/version.json*', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify({ version: '1.0.2', build: 2, schemaVersion: 1, sha256: correctSha }) }));
      await page.route('https://raw.githubusercontent.com/gba45684-lab/RESUMATE1/ota/index.html*', (route) =>
        route.fulfill({ status: 200, contentType: 'text/html', body: fakeHtml }));
      await page.goto(`${baseUrl}/index.html`, { waitUntil: 'load', timeout: 20000 });
      await page.waitForTimeout(5200);
      const downloaded = await page.evaluate(() => { const a = localStorage.getItem('resumate.ota.active.v1'); return a ? JSON.parse(a).build : null; });
      assert(downloaded === 2, 'OTA: a correctly-checksummed update is downloaded and stashed');
      await page.reload({ waitUntil: 'load', timeout: 20000 });
      await page.waitForTimeout(800);
      const applied = await page.evaluate(() => window.__RESUMATE_BUILD__);
      const markerShown = await page.evaluate(() => !!document.getElementById('testOtaMarker'));
      assert(applied === 2 && markerShown, 'OTA: the stashed update is applied cleanly on the next launch');
      const dupIds = await page.evaluate(() => {
        const seen = {}; let dup = 0;
        document.querySelectorAll('[id]').forEach((el) => { seen[el.id] = (seen[el.id] || 0) + 1; if (seen[el.id] === 2) dup++; });
        return dup;
      });
      assert(dupIds === 0, 'OTA: applying an update produces zero duplicate DOM ids (no double-parse)');
      await context.close();
    }

    // Scenario B: wrong checksum -> rejected, never stashed, app keeps running normally
    {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await context.newPage();
      await page.route('https://raw.githubusercontent.com/gba45684-lab/RESUMATE1/ota/version.json*', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify({ version: '1.0.3', build: 3, schemaVersion: 1, sha256: '0'.repeat(64) }) }));
      await page.route('https://raw.githubusercontent.com/gba45684-lab/RESUMATE1/ota/index.html*', (route) =>
        route.fulfill({ status: 200, contentType: 'text/html', body: fakeHtml }));
      const pageErrors = [];
      page.on('pageerror', (e) => pageErrors.push(e.message));
      await page.goto(`${baseUrl}/index.html`, { waitUntil: 'load', timeout: 20000 });
      await page.waitForTimeout(5200);
      const stashed = await page.evaluate(() => localStorage.getItem('resumate.ota.active.v1'));
      assert(stashed === null, 'OTA: a bundle with a wrong checksum is rejected and never stashed');
      assert(pageErrors.length === 0, 'OTA: a checksum failure does not throw an uncaught error or break the app');
      await context.close();
    }
  }

  console.log(failures === 0 ? '\nAll functional checks passed.' : `\n${failures} functional check(s) failed.`);

} finally {
  await browser.close();
  server.close();
}

process.exit(failures === 0 ? 0 : 1);
