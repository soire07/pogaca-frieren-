import { readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
    if (entry.isDirectory()) {
      files.push(...await findCommandFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }
  return files;
}

const rootFiles = (await readdir(root, { withFileTypes: true }))
  .filter(entry => entry.isFile() && entry.name.endsWith('.js'))
  .map(entry => join(root, entry.name))
  .filter(file => !['index.js', 'deploy-commands.js'].includes(file.split(/[\\/]/).pop()));
const nestedFiles = await findCommandFiles(join(root, 'commands'));
const files = [...rootFiles, ...nestedFiles];
const names = [];
const errors = [];

for (const filePath of files) {
  try {
    const mod = await import(pathToFileURL(filePath).href);
    if (mod.default?.data && typeof mod.default.data.toJSON === 'function' && typeof mod.default.execute === 'function') {
      const command = mod.default.data.toJSON();
      if (!command.name || !command.description) throw new Error('Komut adı veya açıklaması eksik.');
      const hasAutocomplete = (options = []) => options.some(option => option.autocomplete === true || hasAutocomplete(option.options || []));
      if (hasAutocomplete(command.options || []) && typeof mod.default.autocomplete !== 'function') {
        throw new Error('Otomatik tamamlama seçeneği var ancak autocomplete işleyicisi yok.');
      }
      names.push(command.name);
    }
  } catch (error) {
    errors.push(`${filePath.slice(root.length + 1)}: ${error.stack || error.message}`);
  }
}

const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
if (duplicates.length) errors.push('Tekrarlanan komut adları: ' + [...new Set(duplicates)].join(', '));
if (errors.length) {
  console.error(errors.join('\n\n'));
  process.exitCode = 1;
} else {
  console.log(`Komut denetimi başarılı: ${names.length} slash komutu yüklendi, şema doğrulandı ve yinelenen ad bulunmadı.\n${names.sort().map(name => '/' + name).join(', ')}`);
}
