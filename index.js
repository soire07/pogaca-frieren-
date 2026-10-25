import 'dotenv/config';
import { Client, Collection, Events, GatewayIntentBits } from 'discord.js';
import { readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { initDatabase, pool } from './database/db.js';
import { levelForXp } from './utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
if (!process.env.DISCORD_TOKEN) throw new Error('DISCORD_TOKEN eksik. Render Environment bölümünü kontrol et.');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL eksik. Önce Render PostgreSQL oluştur ve bağlantıyı ekle.');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });
client.commands = new Collection();

async function loadCommands() {
  const root = join(__dirname, 'commands');
  for (const category of await readdir(root, { withFileTypes: true })) {
    if (!category.isDirectory()) continue;
    const dir = join(root, category.name);
    for (const file of await readdir(dir)) {
      if (!file.endsWith('.js')) continue;
      const mod = await import(pathToFileURL(join(dir, file)).href);
      if (mod.default?.data && mod.default?.execute) client.commands.set(mod.default.data.name, mod.default);
    }
  }
  console.log(`${client.commands.size} komut yüklendi.`);
}

client.once(Events.ClientReady, readyClient => {
  console.log(`Poğaça Frieren aktif: ${readyClient.user.tag}`);
  readyClient.user.setActivity('büyü ve poğaça arıyor 🥐');
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) return;
  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`/${interaction.commandName} hatası:`, error);
    const message = { content: 'Bu komut çalışırken bir hata oluştu. Hata kaydedildi; daha sonra tekrar dene.', ephemeral: true };
    if (interaction.replied || interaction.deferred) await interaction.followUp(message).catch(() => {});
    else await interaction.reply(message).catch(() => {});
  }
});

// Mesaj XP'si: aynı kullanıcıya en fazla 60 saniyede bir XP verilir.
client.on(Events.MessageCreate, async message => {
  if (!message.guild || message.author.bot) return;
  try {
    const gained = 10 + Math.floor(Math.random() * 11);
    const result = await pool.query(`INSERT INTO users (guild_id,user_id,xp,level,last_xp_at)
      VALUES ($1,$2,$3,$4,NOW())
      ON CONFLICT (guild_id,user_id) DO UPDATE SET
        xp = users.xp + $3,
        level = FLOOR(SQRT((users.xp + $3)::numeric / 100))::int + 1,
        last_xp_at = NOW()
      WHERE users.last_xp_at < NOW() - INTERVAL '60 seconds'
      RETURNING xp, level`, [message.guild.id, message.author.id, gained, levelForXp(gained)]);
    if (result.rowCount && result.rows[0].xp > 0) {
      const newLevel = result.rows[0].level;
      if (newLevel > 1 && result.rows[0].xp < (newLevel * newLevel * 100) + 21) {
        // Seviye bildirimi yalnızca seviye eşiğine yakın sonuçlarda gösterilir.
        const previousXp = result.rows[0].xp - gained;
        if (levelForXp(previousXp) < newLevel) await message.channel.send(`✨ ${message.author}, **${newLevel}. seviyeye** ulaştın!`).catch(() => {});
      }
    }
  } catch (error) { console.error('Mesaj XP hatası:', error); }
});

await loadCommands();
await initDatabase();
await client.login(process.env.DISCORD_TOKEN);

process.on('SIGTERM', async () => {
  console.log('Kapatılıyor...');
  await client.destroy();
  await pool.end();
  process.exit(0);
});
