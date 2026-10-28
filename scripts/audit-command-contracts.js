import { readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const errors = [];
const commands = [];
const files = [];

async function walk(dir) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await walk(full);
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(full);
  }
}

const rootEntries = await readdir(root, { withFileTypes: true });
for (const entry of rootEntries) {
  if (entry.isFile() && entry.name.endsWith('.js') && !['index.js', 'deploy-commands.js'].includes(entry.name)) {
    files.push(join(root, entry.name));
  }
}
await walk(join(root, 'commands'));

const seen = new Set();
for (const file of [...new Set(files)].sort()) {
  let mod;
  try { mod = await import(pathToFileURL(file).href); }
  catch (error) {
    errors.push({ file: file.slice(root.length + 1), issue: 'MODULE_IMPORT_FAILED', detail: error.message });
    continue;
  }
  const command = mod.default;
  if (!command?.data || typeof command.data.toJSON !== 'function' || typeof command.execute !== 'function' || command.internalOnly) continue;
  const relative = file.slice(root.length + 1);
  let schema;
  try { schema = command.data.toJSON(); }
  catch (error) {
    errors.push({ file: relative, issue: 'SCHEMA_SERIALIZATION_FAILED', detail: error.message });
    continue;
  }
  const issues = [];
  if (!/^[a-z0-9_-]{1,32}$/.test(schema.name || '')) issues.push('Geçersiz veya eksik komut adı');
  if (typeof schema.description !== 'string' || !schema.description.trim() || schema.description.length > 100) issues.push('Açıklama eksik veya 100 karakterden uzun');
  if (seen.has(schema.name)) issues.push('Yinelenen komut adı: ' + schema.name);
  seen.add(schema.name);
  if (typeof command.execute !== 'function') issues.push('execute işleyicisi yok');
  const inspectOptions = options => {
    for (const option of options || []) {
      if (option.autocomplete && typeof command.autocomplete !== 'function') issues.push('autocomplete seçeneği var ancak handler yok: ' + option.name);
      if (option.type === 1 || option.type === 2) inspectOptions(option.options);
    }
  };
  inspectOptions(schema.options);
  const result = { command: '/' + schema.name, file: relative, status: issues.length ? 'FAIL' : 'PASS', checks: ['module import', 'schema serialization', 'name/description', 'execute handler', 'autocomplete contract', 'required options may validly define choices'], issues };
  commands.push(result);
  if (issues.length) errors.push({ file: relative, issue: issues.join('; ') });
}

console.log('KOMUT SÖZLEŞME DENETİMİ');
for (const item of commands.sort((a, b) => a.command.localeCompare(b.command))) {
  console.log(item.status + ' ' + item.command + ' (' + item.file + ')' + (item.issues.length ? ' — ' + item.issues.join('; ') : ''));
}
const passed = commands.filter(item => item.status === 'PASS').length;
const failed = commands.filter(item => item.status === 'FAIL').length;
console.log('ÖZET: ' + commands.length + ' komut keşfedildi; ' + passed + ' PASS; ' + failed + ' FAIL; ' + errors.filter(e => e.issue === 'MODULE_IMPORT_FAILED').length + ' import hatası.');
console.log('SINIR: Bu statik sözleşme denetimidir; komutları gerçek kullanıcı etkileşimiyle veya canlı Discord sunucusunda çalıştırmış sayılmaz.');
if (errors.length) {
  for (const error of errors) console.error(error.file + ': ' + error.issue + (error.detail ? ' — ' + error.detail : ''));
  process.exitCode = 1;
}
