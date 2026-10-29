import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;

if (!token || !clientId) {
  throw new Error('DISCORD_TOKEN ve CLIENT_ID Render Environment içinde olmalı.');
}


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

const commands = [];
const root = __dirname;
const rootFiles = (await readdir(root, { withFileTypes: true }))
  .filter(entry => entry.isFile() && entry.name.endsWith('.js'))
  .map(entry => join(root, entry.name))
  .filter(file => !['index.js', 'deploy-commands.js'].includes(file.split(/[\\/]/).pop()));
const nestedFiles = await findCommandFiles(join(root, 'commands'));
const files = [...rootFiles, ...nestedFiles];

for (const filePath of files) {
  try {
    const mod = await import(pathToFileURL(filePath).href);
    if (mod.default?.data && typeof mod.default.data.toJSON === 'function' && !mod.default?.internalOnly) {
      commands.push(mod.default.data.toJSON());
    }
  } catch (error) {
    console.error(`${filePath} yüklenemedi; komut kaydı durduruldu:`, error);
    process.exitCode = 1;
    throw error;
  }
}

const names = commands.map(command => command.name);
const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
if (duplicates.length) {
  throw new Error('Tekrarlanan slash komut adları: ' + [...new Set(duplicates)].join(', '));
}
console.log(`Kaydedilmeye hazır ${commands.length} komut doğrulandı.`);

// discord.js REST kendi timeout/retry mekanizmasını yönetsin. Harici AbortSignal,
// yeniden denemeler sürerken isteği erken iptal edip gereksiz kayıt hatalarına yol açabilir.
const rest = new REST({ version: '10', timeout: 60_000, retries: 2 }).setToken(token);
async function putWithDiagnostics(route, body, label) {
  try {
    return await rest.put(route, { body });
  } catch (error) {
    console.error(`Discord API komut kaydı başarısız (${label}).`, JSON.stringify({
      name: error?.name ?? 'Error',
      message: error?.message ?? String(error),
      status: error?.status ?? null,
      code: error?.code ?? null,
      route
    }));
    throw error;
  }
}
console.log(`Discord komut eşitlemesi başlıyor: ${commands.length} komut.`);

if (process.env.GUILD_ID) {
  // Önce hedef sunucuya komutları kaydet; bu başarısız olursa mevcut global komutları silme.
  await putWithDiagnostics(
    Routes.applicationGuildCommands(clientId, process.env.GUILD_ID),
    commands,
    'hedef sunucuya kayıt'
  );
  console.log(`${commands.length} komut hedef sunucuya kaydedildi.`);
  // Yalnızca hedef sunucu kaydı başarılı olduktan sonra eski global kopyaları temizle.
  await putWithDiagnostics(Routes.applicationCommands(clientId), [], 'eski global komutları temizleme');
  console.log('Eski global komut kayıtları temizlendi.');
} else {
  await putWithDiagnostics(
    Routes.applicationCommands(clientId),
    commands,
    'global kayıt'
  );
  console.log(`${commands.length} komut global olarak kaydedildi.`);
}
console.log('Discord komut eşitlemesi tamamlandı.');
