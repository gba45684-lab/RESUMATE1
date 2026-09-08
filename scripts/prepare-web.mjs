import { access } from 'node:fs/promises';

try {
  await access('www/index.html');
} catch {
  throw new Error('www/index.html is missing');
}
console.log('Web bundle ready: www/index.html');
