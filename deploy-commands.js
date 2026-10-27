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

const rest = new REST({ version: '10' }).setToken(token);

if (process.env.GUILD_ID) {
  // Global kayıtları boşalt; sunucu komutlarıyla aynı adların iki kez görünmesini önle.
  await rest.put(Routes.applicationCommands(clientId), { body: [] });
  await rest.put(
    Routes.applicationGuildCommands(clientId, process.env.GUILD_ID),
    { body: commands }
  );
  console.log(`${commands.length} komut test sunucusuna kaydedildi; eski global komutlar temizlendi.`);
} else {
  await rest.put(
    Routes.applicationCommands(clientId),
    { body: commands }
  );
  console.log(`${commands.length} komut global olarak kaydedildi.`);
}
