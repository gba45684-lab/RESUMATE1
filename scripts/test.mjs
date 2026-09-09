// Orchestrator for `npm test`. Runs the fast, dependency-free syntax check
// first (always), then the fuller functional/OTA/security regression suite.
import { spawn } from 'node:child_process';

function run(script) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [script], { stdio: 'inherit' });
    p.on('exit', (code) => resolve(code ?? 1));
  });
}

const syntaxCode = await run('scripts/test-syntax.mjs');
if (syntaxCode !== 0) {
  console.error('\nSyntax check failed -- skipping functional suite until this is fixed.');
  process.exit(syntaxCode);
}

const functionalCode = await run('scripts/test-functional.mjs');
process.exit(functionalCode);
