import 'dotenv/config';
import { REST, Routes, SlashCommandBuilder } from 'discord.js';

const required = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID'];
const missing = required.filter(key => !process.env[key]?.trim());
if (missing.length) {
  console.error('Missing required environment variables: ' + missing.join(', '));
  process.exit(1);
}

const commands = [
  new SlashCommandBuilder()
    .setName('frieren-test')
    .setDescription('Frieren botunun izin verilen otomatik testlerini çalıştırır.')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('frieren-ai')
    .setDescription('Frieren botunun kodu ve test sistemi hakkında yapay zekâya soru sorar.')
    .addStringOption(option => option.setName('soru').setDescription('Sorunu veya inceleme isteğini yaz.').setRequired(true).setMaxLength(1500))
    .toJSON(),
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
const route = process.env.DISCORD_GUILD_ID
  ? Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID)
  : Routes.applicationCommands(process.env.DISCORD_CLIENT_ID);

await rest.put(route, { body: commands });
console.log(process.env.DISCORD_GUILD_ID ? 'Frieren AI guild commands registered.' : 'Frieren AI global commands registered.');
