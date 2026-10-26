import { readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const files = (await readdir(root)).filter(file =>
  file.endsWith('.js') && file !== 'index.js' && file !== 'deploy-commands.js'
);
const names = [];
const errors = [];

for (const file of files) {
  try {
    const mod = await import(pathToFileURL(join(root, file)).href);
    if (mod.default?.data && typeof mod.default.data.toJSON === 'function' && typeof mod.default.execute === 'function') {
      const command = mod.default.data.toJSON();
      if (!command.name || !command.description) throw new Error('Komut adı veya açıklaması eksik.');
      names.push(command.name);
    }
  } catch (error) {
    errors.push(`${file}: ${error.stack || error.message}`);
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
