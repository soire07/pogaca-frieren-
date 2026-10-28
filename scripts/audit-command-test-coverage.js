import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const normalize = value => String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('tr-TR');
const skip = new Set(['node_modules', '.git', 'coverage', '.render']);
async function walk(dir, depth = 0) {
  if (depth > 6) return [];
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const out = [];
  for (const e of entries) {
    if (e.isDirectory() && !skip.has(e.name)) out.push(...await walk(path.join(dir, e.name), depth + 1));
    else if (e.isFile() && (/^test-.*\.js$/i.test(e.name) || /\.(test|spec)\.[cm]?[jt]s$/i.test(e.name))) out.push(path.join(dir, e.name));
  }
  return out;
}
async function commandFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const out = [];
  for (const e of entries) {
    if (e.isDirectory()) out.push(...await commandFiles(path.join(dir, e.name)));
    else if (e.isFile() && e.name.endsWith('.js')) out.push(path.join(dir, e.name));
  }
  return out;
}
const entries = await readdir(root, { withFileTypes: true });
const files = entries.filter(e => e.isFile() && e.name.endsWith('.js') && !['index.js','deploy-commands.js'].includes(e.name)).map(e => path.join(root,e.name));
files.push(...await commandFiles(path.join(root,'commands')));
const tests = await Promise.all((await walk(root)).map(async file => ({file:path.relative(root,file), text:normalize(await readFile(file,'utf8').catch(()=>''))})));
const records = [];
for (const file of [...new Set(files)].sort()) {
  let mod;
  try { mod = await import(pathToFileURL(file).href); } catch { continue; }
  if (!mod.default?.data || typeof mod.default.data.toJSON !== 'function' || typeof mod.default.execute !== 'function' || mod.default.internalOnly) continue;
  let schema;
  try { schema = mod.default.data.toJSON(); } catch { continue; }
  const name = normalize(schema.name);
  const base = normalize(path.basename(file,'.js')).replace(/[^a-z0-9]+/g,' ');
  const matches = tests.filter(t => t.text.includes(name) || (base.length >= 4 && t.text.includes(base))).map(t=>t.file);
  records.push({name:schema.name,file:path.relative(root,file),matches:[...new Set(matches)]});
}
console.log('KOMUT OTOMASYON KAPSAMI — dosya eşleşmesi davranışın kanıtlandığı anlamına gelmez');
for (const r of records) console.log((r.matches.length ? 'TEST ADAYI' : 'TEST BULUNAMADI') + ' /' + r.name + ' | ' + r.file + ' | ' + (r.matches.join(', ') || 'eşleşen test yok'));
const covered = records.filter(r=>r.matches.length).length;
console.log('ÖZET: ' + records.length + ' komut; ' + covered + ' komutta test dosyası eşleşmesi; ' + (records.length-covered) + ' komutta eşleşme yok.');
console.log('SINIR: Bu rapor ad/içerik eşleşmesi yapar; eşleşen testin komutu gerçekten çalıştırdığını garanti etmez.');
