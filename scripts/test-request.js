import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const rawTarget = process.argv.slice(2).join(' ').trim();
const ignored = new Set(['test', 'tests', 'testet', 'kontrol', 'kontrolu', 'kontrolü', 'dogru', 'doğru', 'calis', 'çalış', 'mi', 'mu', 've', 'ile', 'icin', 'için', 'bir', 'bu', 'su', 'şu', 'olan', 'olsun', 'gibi', 'hepsi', 'tum', 'tüm', 'benim', 'yazdigim', 'yazdığım']);
const normalize = value => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('tr-TR');
const tokens = value => [...new Set(normalize(value).split(/[^a-z0-9]+/).filter(word => word.length >= 3 && !ignored.has(word)))];

async function walk(dir, depth = 0) {
  if (depth > 5) return [];
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'coverage') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full, depth + 1));
    else if (/\.(test|spec)\.[cm]?[jt]s$/.test(entry.name) || /^test-[\w-]+\.js$/.test(entry.name) || /^test-.*\.js$/.test(path.basename(full))) files.push(full);
  }
  return files;
}

function scoreFile(file, source, words) {
  const haystack = normalize(file + ' ' + source);
  const hits = words.filter(word => haystack.includes(word));
  return { file, hits, score: hits.length };
}

function run(file) {
  return new Promise(resolve => {
    const relative = path.relative(root, file);
    const child = spawn(process.execPath, ['--test', relative], {
      cwd: root, shell: false, windowsHide: true, env: { ...process.env, CI: 'true' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '', stderr = '', done = false;
    const finish = (code, extra = '') => {
      if (done) return;
      done = true; clearTimeout(timer);
      resolve({ file: relative, code, stdout: (stdout + extra).slice(-5000), stderr: stderr.slice(-3000) });
    };
    child.stdout.on('data', chunk => { stdout = (stdout + chunk.toString()).slice(-5000); });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-3000); });
    child.on('error', error => finish(null, error.message));
    child.on('close', code => finish(code));
    const timer = setTimeout(() => { child.kill('SIGTERM'); finish(null, 'Test zaman aşımına uğradı.'); }, Math.max(30000, Math.min(Number(process.env.FRIEREN_TEST_TIMEOUT_MS) || 180000, 300000)));
  });
}

if (!rawTarget) {
  console.error('Test hedefi boş. Test etmek istediğin davranışı açıklayıcı şekilde yaz.');
  process.exit(2);
}

const words = tokens(rawTarget);
const testFiles = await walk(root);
const normalizedTarget = normalize(rawTarget);
const forcedFiles = /command\\s+interaction\\s+coverage|interaction\\s+command\\s+coverage|komut\\s+etkilesim\\s+kapsam/i.test(normalizedTarget)
  ? ['scripts/test-command-interaction-coverage.js']
  : [];
const ranked = [];
for (const file of testFiles) {
  const source = await readFile(file, 'utf8').catch(() => '');
  const result = scoreFile(path.relative(root, file), source, words);
  if (result.score > 0) ranked.push(result);
}
ranked.sort((a, b) => b.score - a.score || a.file.localeCompare(b.file));
const selectedMap = new Map();
for (const file of forcedFiles) {
  selectedMap.set(file, { file: path.join(root, file), hits: words, score: words.length, forced: true });
}
for (const item of ranked.filter(item => item.score >= Math.min(2, Math.max(1, words.length))).slice(0, 5)) {
  const key = path.relative(root, item.file).split(path.sep).join('/');
  if (!selectedMap.has(key)) selectedMap.set(key, item);
}
const selected = [...selectedMap.values()].slice(0, 5);

console.log('İSTENEN SENARYO: ' + rawTarget);
console.log('ANAHTAR KAVRAMLAR: ' + (words.join(', ') || 'Belirlenemedi'));
if (!selected.length) {
  console.log('HEDEFE ÖZEL TEST: BULUNAMADI');
  console.log('Bu isteğe doğrudan uyan mevcut test dosyası bulunamadı. Bu nedenle hedefe özel başarı iddiası verilmiyor.');
  console.log('GENEL TESTLER: Üst komut tarafından ayrıca çalıştırılır.');
  process.exit(3);
}

console.log('SEÇİLEN TEST DOSYALARI: ' + selected.map(item => item.file + ' (' + item.score + ' eşleşme)').join('; '));
const results = [];
for (const item of selected) results.push(await run(path.join(root, item.file)));
for (const result of results) {
  console.log('\n--- ' + result.file + ' | ' + (result.code === 0 ? 'BAŞARILI' : 'BAŞARISIZ') + ' ---');
  if (result.stdout) console.log(result.stdout);
  if (result.stderr) console.log(result.stderr);
}
const failed = results.filter(result => result.code !== 0);
console.log('\nHEDEFE ÖZEL SONUÇ: ' + (failed.length ? 'BAŞARISIZ' : 'SEÇİLEN TESTLER BAŞARILI'));
console.log('KAPSAM SINIRI: Bu motor mevcut testleri isteğe göre eşleştirir; kendi başına yeni test kodu üretmez ve eşleşen testler isteğin her ayrıntısını kanıtlamayabilir.');
process.exit(failed.length ? 1 : 0);
