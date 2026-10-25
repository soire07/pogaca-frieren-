import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
if (!token || !clientId) throw new Error('DISCORD_TOKEN ve CLIENT_ID .env / Render Environment içinde olmalı.');
const commands = [];
const root = join(__dirname, 'commands');
for (const category of await readdir(root, { withFileTypes: true })) {
  if (!category.isDirectory()) continue;
  for (const file of await readdir(join(root, category.name))) {
    if (!file.endsWith('.js')) continue;
    const mod = await import(pathToFileURL(join(root, category.name, file)).href);
    if (mod.default?.data) commands.push(mod.default.data.toJSON());
  }
}
const rest = new REST({ version: '10' }).setToken(token);
if (process.env.GUILD_ID) {
  await rest.put(Routes.applicationGuildCommands(clientId, process.env.GUILD_ID), { body: commands });
  console.log(`${commands.length} komut test sunucusuna kaydedildi.`);
} else {
  await rest.put(Routes.applicationCommands(clientId), { body: commands });
  console.log(`${commands.length} komut global olarak kaydedildi. Global komutların görünmesi zaman alabilir.`);
}
