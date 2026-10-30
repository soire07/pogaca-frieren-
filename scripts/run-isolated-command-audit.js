import { readdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runCommandTestSuite } from './live-command-test.js';
import { pool } from '../database/db.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

async function findCommandFiles(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const files = [];
  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await findCommandFiles(fullPath));
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(fullPath);
  }
  return files;
}

try {
  const rootFiles = (await readdir(root, { withFileTypes: true }))
    .filter(entry => entry.isFile() && entry.name.endsWith('.js'))
    .map(entry => join(root, entry.name))
    .filter(file => !['index.js', 'deploy-commands.js'].includes(file.split(/[\\/]/).pop()));
  const files = [...rootFiles, ...await findCommandFiles(join(root, 'commands'))];
  const commands = new Map();
  for (const filePath of files) {
    const mod = await import(pathToFileURL(filePath).href);
    if (mod.default?.data && mod.default?.execute && !mod.default?.internalOnly) {
      const name = mod.default.data.name;
      if (commands.has(name)) throw new Error(`Duplicate command: /${name}`);
      commands.set(name, mod.default);
    }
  }

  const report = await runCommandTestSuite(commands);
  await writeFile('command-audit-report.json', JSON.stringify(report, null, 2) + '\\n');
  console.log(JSON.stringify(report, null, 2));
  if (report.summary.fail > 0) process.exitCode = 1;
} catch (error) {
  console.error('Isolated command audit failed:', error?.stack || error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
