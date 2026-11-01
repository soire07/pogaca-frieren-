import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = new URL('../', import.meta.url);

async function collectJavaScript(directory, files = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (['node_modules', '.git', 'coverage'].includes(entry.name)) continue;
      if (path.relative(root.pathname, path.join(directory, entry.name)) === 'scripts') continue;
      await collectJavaScript(path.join(directory, entry.name), files);
    } else if (entry.isFile() && entry.name.endsWith('.js') && !entry.name.endsWith('.test.js')) {
      files.push(path.join(directory, entry.name));
    }
  }
  return files;
}

test('runtime Discord interactions do not use deprecated ephemeral boolean options', async () => {
  const files = await collectJavaScript(root.pathname);
  const violations = [];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    if (/\bephemeral\s*:\s*true\b/.test(source)) {
      violations.push(path.relative(root.pathname, file) + ' still uses deprecated ephemeral');
    }
    if (/\bflags\s*:\s*MessageFlags\.Ephemeral\b/.test(source)
      && !/import\s*\{[^}]*\bMessageFlags\b[^}]*\}\s*from\s*['"]discord\.js['"]/.test(source)) {
      violations.push(path.relative(root.pathname, file) + ' uses MessageFlags without importing it');
    }
  }
  assert.deepEqual(violations, [], 'Replace deprecated ephemeral: true options with MessageFlags.Ephemeral: ' + violations.join(', '));
});
