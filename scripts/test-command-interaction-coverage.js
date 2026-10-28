import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const excludedRootFiles = new Set(['index.js', 'deploy-commands.js']);

async function findCommandFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && !['node_modules', '.git', 'coverage'].includes(entry.name)) {
      files.push(...await findCommandFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }
  return files;
}

async function loadCommandEntries() {
  const rootEntries = await readdir(root, { withFileTypes: true });
  const files = rootEntries
    .filter(entry => entry.isFile() && entry.name.endsWith('.js') && !excludedRootFiles.has(entry.name))
    .map(entry => path.join(root, entry.name));
  files.push(...await findCommandFiles(path.join(root, 'commands')));

  const commands = [];
  const loadErrors = [];
  for (const file of [...new Set(files)].sort()) {
    let module;
    try {
      module = await import(pathToFileURL(file).href);
    } catch (error) {
      loadErrors.push({ file: path.relative(root, file), message: error.message });
      continue;
    }
    const command = module.default;
    if (!command?.data || typeof command.data.toJSON !== 'function' || typeof command.execute !== 'function' || command.internalOnly) continue;
    commands.push({ file: path.relative(root, file), command, schema: command.data.toJSON() });
  }
  return { commands, loadErrors };
}

test('command interaction coverage: every discoverable slash command exposes a valid interaction contract', async () => {
  const { commands, loadErrors } = await loadCommandEntries();

  assert.deepEqual(loadErrors, [], 'All command modules should import without throwing');
  assert.ok(commands.length > 0, 'At least one slash command should be discovered');

  const seenNames = new Set();
  const failures = [];

  for (const { file, command, schema } of commands) {
    if (!schema.name || typeof schema.name !== 'string') failures.push(file + ': missing command name');
    if (!schema.description || typeof schema.description !== 'string') failures.push(file + ': missing command description');
    if (typeof command.execute !== 'function') failures.push(file + ': missing execute interaction handler');

    const normalizedName = String(schema.name || '').toLocaleLowerCase('en-US');
    if (seenNames.has(normalizedName)) failures.push(file + ': duplicate command name /' + normalizedName);
    seenNames.add(normalizedName);

    for (const option of schema.options || []) {
      if (!option.name || typeof option.name !== 'string') failures.push(file + ': option with missing name');
      if (!option.description || typeof option.description !== 'string') failures.push(file + ': option ' + option.name + ' has missing description');
      if (option.required && option.autocomplete && option.choices?.length) {
        failures.push(file + ': option ' + option.name + ' cannot combine autocomplete and static choices');
      }
    }
  }

  assert.deepEqual(failures, [], failures.join('\n'));
  console.log('Structural interaction coverage checked ' + commands.length + ' slash commands.');
  console.log('Scope: command modules, slash-command schemas, option contracts and handler presence; no live Discord API call is performed.');
});
