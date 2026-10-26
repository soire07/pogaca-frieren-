import 'dotenv/config';
import { Client, Collection, Events, GatewayIntentBits } from 'discord.js';
import { readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { initDatabase, pool } from './database/db.js';
import { renderMarket, renderMarketItem, buyMarketItem, renderPurchaseResult, renderMarketInventory } from './market.js';
import { levelForXp } from './utils.js';
import { createServer } from 'node:http';

const __dirname = dirname(fileURLToPath(import.meta.url));
if (!process.env.DISCORD_TOKEN) throw new Error('DISCORD_TOKEN eksik. Render Environment bölümünü kontrol et.');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL eksik. Önce Render PostgreSQL oluştur ve bağlantıyı ekle.');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });
client.commands = new Collection();


async function loadCommands() {
  const root = __dirname;
  const files = await readdir(root);

  for (const file of files) {
    if (!file.endsWith('.js')) continue;
    if (file === 'index.js' || file === 'deploy-commands.js') continue;

    try {
      const mod = await import(pathToFileURL(join(root, file)).href);

      if (mod.default?.data && mod.default?.execute) {
        client.commands.set(mod.default.data.name, mod.default);
      }
    } catch (error) {
      console.error(`${file} yüklenemedi:`, error);
    }
  }

  console.log(`${client.commands.size} komut yüklendi.`);
}


client.once(Events.ClientReady, readyClient => {
  console.log(`Poğaça Frieren aktif: ${readyClient.user.tag}`);
  readyClient.user.setActivity('büyü ve poğaça arıyor 🥐');
});

client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isButton() && interaction.customId.startsWith('market_')) {
    const parts = interaction.customId.split(':');
    const action = parts[0];
    const ownerId = parts[parts.length - 1];
    if (interaction.user.id !== ownerId) {
      return interaction.reply({ content: 'Bu market paneli başka bir kullanıcıya ait. Kendi panelin için /market yaz.', ephemeral: true });
    }
    try {
      let page = 0;
      let category = 'Hepsi';
      let notice = null;
      if (action === 'market_detail') {
        const detail = renderMarketItem(parts[1], 0, interaction.user.id);
        if (!detail) return interaction.reply({content:'Bu eşya bulunamadı.',ephemeral:true});
        const balanceResult = await pool.query('SELECT coins FROM users WHERE guild_id=$1 AND user_id=$2',[interaction.guildId,interaction.user.id]);
        const actualDetail = renderMarketItem(parts[1], balanceResult.rows[0]?.coins ?? 0, interaction.user.id);
        return interaction.update({...actualDetail,content:null});
      } else if (action === 'market_back') {
        const panel = await renderMarket(interaction.guildId, interaction.user.id);
        return interaction.update({...panel,content:null});
      } else if (action === 'market_refresh') {
        const panel = await renderMarket(interaction.guildId, interaction.user.id);
        return interaction.update({...panel,content:null});
      } else if (action === 'market_cat') {
        const categories = ['Hepsi','Büyülü Eşyalar','Anime Hatıraları','Lanetli Eşyalar','Fırın Özel'];
        category = categories[Number(parts[1])] || 'Hepsi';
      } else if (action === 'market_prev' || action === 'market_next') {
        page = Number(parts[1]) + (action === 'market_prev' ? -1 : 1);
        category = parts[2] || 'Hepsi';
      } else if (action === 'market_buy') {
        const result = await buyMarketItem(interaction.guildId, interaction.user.id, parts[1]);
        if (result.ok) {
          const balanceResult = await pool.query('SELECT coins FROM users WHERE guild_id=$1 AND user_id=$2',[interaction.guildId,interaction.user.id]);
          const success = renderPurchaseResult(parts[1], balanceResult.rows[0]?.coins ?? 0, interaction.user.id);
          return interaction.update(success);
        }
        notice = result.message;
      } else if (action === 'market_inventory') {
        const inventory = await renderMarketInventory(interaction.guildId, interaction.user.id);
        return interaction.update(inventory);
      }
      const panel = await renderMarket(interaction.guildId, interaction.user.id, page, category);
      return interaction.update({ ...panel, content: notice });
    } catch (error) {
      console.error('Market paneli hatası:', error);
      return interaction.reply({ content: 'Market panelinde bir sorun oluştu. Biraz sonra tekrar dene.', ephemeral: true }).catch(() => {});
    }
  }
  if (interaction.isButton() && (interaction.customId.startsWith('trade_accept:') || interaction.customId.startsWith('trade_decline:'))) {
    const [action, encoded] = interaction.customId.split(':');
    let offer;
    try { offer = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')); }
    catch { return interaction.reply({ content: 'Bu takas teklifi geçersiz.', ephemeral: true }); }
    if (!interaction.guildId || interaction.user.id !== offer.t) {
      return interaction.reply({ content: 'Bu teklife yalnızca teklif gönderilen kullanıcı yanıt verebilir.', ephemeral: true });
    }
    if (Date.now() - interaction.message.createdTimestamp > 5 * 60 * 1000) {
      return interaction.update({ content: '⏰ Takas teklifinin süresi doldu.', embeds: [], components: [] });
    }
    if (action === 'trade_decline') {
      return interaction.update({ content: '❌ Takas teklifi reddedildi.', embeds: [], components: [] });
    }
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      const found = await db.query(`SELECT character_name, quantity FROM anime_character_collection
        WHERE guild_id=$1 AND user_id=$2 AND LOWER(character_name)=LOWER($3) FOR UPDATE`,
        [interaction.guildId, offer.f, offer.n]);
      if (!found.rowCount || Number(found.rows[0].quantity) <= Number(offer.a)) {
        await db.query('ROLLBACK');
        return interaction.update({ content: 'Takas yapılamadı: gönderenin yeterli kopyası kalmamış. Son kopya korunur.', embeds: [], components: [] });
      }
      const character = await db.query(`SELECT anime, rarity, emoji, color, description, traits, image
        FROM anime_character_collection WHERE guild_id=$1 AND user_id=$2 AND character_name=$3`,
        [interaction.guildId, offer.f, found.rows[0].character_name]);
      await db.query('UPDATE anime_character_collection SET quantity=quantity-$4 WHERE guild_id=$1 AND user_id=$2 AND character_name=$3',
        [interaction.guildId, offer.f, found.rows[0].character_name, Number(offer.a)]);
      const c = character.rows[0];
      await db.query(`INSERT INTO anime_character_collection
        (guild_id,user_id,character_name,anime,rarity,emoji,color,description,traits,image,quantity)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT(guild_id,user_id,character_name) DO UPDATE SET quantity=anime_character_collection.quantity+EXCLUDED.quantity,
        last_obtained_at=NOW()`,
        [interaction.guildId, offer.t, found.rows[0].character_name, c.anime, c.rarity, c.emoji, c.color, c.description, c.traits, c.image, Number(offer.a)]);
      await db.query('COMMIT');
      return interaction.update({ content: '✅ Takas tamamlandı! **' + found.rows[0].character_name + '** ×' + offer.a + ' kopya yeni sahibine aktarıldı.', embeds: [], components: [] });
    } catch (error) {
      await db.query('ROLLBACK').catch(() => {});
      console.error('Takas kabul hatası:', error);
      return interaction.reply({ content: 'Takas sırasında hata oluştu. Daha sonra tekrar dene.', ephemeral: true }).catch(() => {});
    } finally { db.release(); }
  }
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
const PORT = process.env.PORT || 3000;

createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Poğaça Frieren aktif! 🥐');
}).listen(PORT, '0.0.0.0', () => {
  console.log(`Web sunucusu ${PORT} portunda çalışıyor.`);
});
