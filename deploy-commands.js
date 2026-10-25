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

const commands = [];
const root = __dirname;
const files = await readdir(root);

for (const file of files) {
  if (!file.endsWith('.js')) continue;
  if (file === 'index.js' || file === 'deploy-commands.js') continue;

  try {
    const mod = await import(pathToFileURL(join(root, file)).href);

    if (mod.default?.data && typeof mod.default.data.toJSON === 'function') {
      commands.push(mod.default.data.toJSON());
    }
  } catch (error) {
    console.error(`${file} yüklenemedi:`, error);
  }
}

const rest = new REST({ version: '10' }).setToken(token);

if (process.env.GUILD_ID) {
  await rest.put(
    Routes.applicationGuildCommands(clientId, process.env.GUILD_ID),
    { body: commands }
  );
  console.log(`${commands.length} komut test sunucusuna kaydedildi.`);
} else {
  await rest.put(
    Routes.applicationCommands(clientId),
    { body: commands }
  );
  console.log(`${commands.length} komut global olarak kaydedildi.`);
}
