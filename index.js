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

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildModeration] });
client.commands = new Collection();



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

async function loadCommands() {
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
      if (mod.default?.data && mod.default?.execute) {
        const name = mod.default.data.name;
        if (client.commands.has(name)) {
          throw new Error(`Yinelenen komut adı: /${name}`);
        }
        client.commands.set(name, mod.default);
      }
    } catch (error) {
      console.error(`${filePath} yüklenemedi; bot başlatılamıyor:`, error);
      throw error;
    }
  }

  console.log(`${client.commands.size} komut yüklendi.`);
}


async function sendConfiguredLog(guild, payload) {
  try {
    const result = await pool.query('SELECT log_channel_id FROM guild_settings WHERE guild_id=$1', [guild.id]);
    const channelId = result.rows[0]?.log_channel_id;
    if (!channelId) return;
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (channel?.isTextBased() && channel.send) await channel.send({ ...payload, allowedMentions: { parse: [] } });
  } catch (error) {
    console.error('Moderasyon log hatası:', error);
  }
}

client.on(Events.GuildMemberRemove, async member => {
  await sendConfiguredLog(member.guild, { content: `📤 **Üye ayrıldı:** ${member.user?.tag ?? member.id} (${member.id})` });
});

client.on(Events.GuildMemberAdd, async member => {
  await sendConfiguredLog(member.guild, { content: `📥 **Yeni üye katıldı:** ${member.user?.tag ?? member.id} (${member.id})` });
  try {
    const result = await pool.query(
      'SELECT welcome_channel_id, welcome_message FROM guild_settings WHERE guild_id=$1',
      [member.guild.id]
    );
    const settings = result.rows[0];
    if (!settings?.welcome_channel_id) return;
    const channel = await member.guild.channels.fetch(settings.welcome_channel_id).catch(() => null);
    if (!channel?.isTextBased() || !channel.send) return;
    const message = String(settings.welcome_message || 'Hoş geldin {user}! 🥐 {server} sunucusuna katıldın.')
      .replaceAll('{user}', member.toString())
      .replaceAll('{server}', member.guild.name)
      .replaceAll('{count}', String(member.guild.memberCount));
    await channel.send({ content: message.slice(0, 1900) });
  } catch (error) {
    console.error('Karşılama mesajı hatası:', error);
  }
});

client.on(Events.GuildBanAdd, async ban => {
  await sendConfiguredLog(ban.guild, { content: `🔨 **Ban uygulandı:** ${ban.user.tag} (${ban.user.id})` });
});
client.on(Events.GuildBanRemove, async ban => {
  await sendConfiguredLog(ban.guild, { content: `🔓 **Ban kaldırıldı:** ${ban.user.tag} (${ban.user.id})` });
});

client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  if (oldMember.nickname !== newMember.nickname) {
    await sendConfiguredLog(newMember.guild, { content: `✏️ **Takma ad değişti:** ${newMember.user.tag} — ${oldMember.nickname ?? 'Yok'} → ${newMember.nickname ?? 'Yok'}` });
  }

  const oldRoles = new Set(oldMember.roles.cache.keys());
  const newRoles = new Set(newMember.roles.cache.keys());
  const addedRoles = [...newRoles].filter(id => !oldRoles.has(id)).map(id => newMember.guild.roles.cache.get(id)?.name).filter(Boolean);
  const removedRoles = [...oldRoles].filter(id => !newRoles.has(id)).map(id => oldMember.guild.roles.cache.get(id)?.name).filter(Boolean);
  if (addedRoles.length || removedRoles.length) {
    const changes = [];
    if (addedRoles.length) changes.push('Eklendi: ' + addedRoles.join(', '));
    if (removedRoles.length) changes.push('Kaldırıldı: ' + removedRoles.join(', '));
    await sendConfiguredLog(newMember.guild, { content: `🎭 **Rol değişikliği:** ${newMember.user.tag} (${newMember.id})\n${changes.join('\n')}` });
  }

  if (oldMember.communicationDisabledUntilTimestamp !== newMember.communicationDisabledUntilTimestamp) {
    const until = newMember.communicationDisabledUntilTimestamp;
    await sendConfiguredLog(newMember.guild, {
      content: until
        ? `🔇 **Timeout uygulandı/değiştirildi:** ${newMember.user.tag} (${newMember.id}) — <t:${Math.floor(until / 1000)}:R> sona erecek.`
        : `🔊 **Timeout kaldırıldı:** ${newMember.user.tag} (${newMember.id})`
    });
  }
});

client.on(Events.MessageDelete, async message => {
  if (!message.guild || message.author?.bot) return;
  const author = message.author ? `${message.author.tag} (${message.author.id})` : 'Yazarı önbellekte olmayan kullanıcı';
  const content = message.content?.trim()
    ? message.content.slice(0, 700)
    : '[Mesaj metni önbellekte yok veya erişilemiyor]';
  await sendConfiguredLog(message.guild, {
    content: `🗑️ **Mesaj silindi** • <#${message.channelId}>\nYazar: ${author}\nİçerik: ${content}`
  });
});

client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
  if (!newMessage.guild || newMessage.author?.bot) return;
  if (oldMessage.partial || newMessage.partial) {
    await sendConfiguredLog(newMessage.guild, { content: `✏️ **Mesaj düzenlendi** • <#${newMessage.channelId}> — mesaj içeriği önbellekte yok.` });
    return;
  }
  if (oldMessage.content === newMessage.content) return;
  const before = oldMessage.content?.trim() ? oldMessage.content.slice(0, 350) : '[önceki içerik erişilemiyor]';
  const after = newMessage.content?.trim() ? newMessage.content.slice(0, 350) : '[yeni içerik erişilemiyor]';
  await sendConfiguredLog(newMessage.guild, {
    content: `✏️ **Mesaj düzenlendi** • <#${newMessage.channelId}>\nYazar: ${newMessage.author?.tag ?? newMessage.authorId ?? 'Bilinmiyor'}\nÖnce: ${before}\nSonra: ${after}`
  });
});

client.on(Events.MessageBulkDelete, async messages => {
  const first = messages.first();
  if (!first?.guild) return;
  await sendConfiguredLog(first.guild, { content: `🧹 **Toplu mesaj silme:** <#${first.channelId}> kanalında ${messages.size} mesaj silindi.` });
});

client.once(Events.ClientReady, readyClient => {
  console.log(`Poğaça Frieren aktif: ${readyClient.user.tag}`);
  const activities = [
    'bin yıllık büyüler öğreniyor ✨',
    'Fern ile büyü çalışıyor 🔮',
    'Stark ile iblis avlıyor ⚔️',
    'Himmel’in yolculuklarını hatırlıyor 🌼',
    'mimic sandıklarından uzak duruyor 📦',
    'poğaça ve mana arıyor 🥐'
  ];
  let activityIndex = 0;
  readyClient.user.setActivity(activities[activityIndex]);
  setInterval(() => {
    activityIndex = (activityIndex + 1) % activities.length;
    readyClient.user.setActivity(activities[activityIndex]);
  }, 60_000);
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
        return interaction.update({...actualDetail,content:null,attachments:[]});
      } else if (action === 'market_back' || action === 'market_open') {
        const panel = await renderMarket(interaction.guildId, interaction.user.id);
        return interaction.update({...panel,content:null,attachments:[]});
      } else if (action === 'market_refresh') {
        const panel = await renderMarket(interaction.guildId, interaction.user.id);
        return interaction.update({...panel,content:null,attachments:[]});
      } else if (action === 'market_cat') {
        const categories = ['Hepsi','Ekipman','Büyülü Eşyalar','Anime Hatıraları','Koleksiyon Eşyaları'];
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
      return interaction.update({ ...panel, content: notice, attachments:[] });
    } catch (error) {
      console.error('Market paneli hatası:', error);
      return interaction.reply({ content: 'Market panelinde bir sorun oluştu. Biraz sonra tekrar dene.', ephemeral: true }).catch(() => {});
    }
  }
  if (interaction.isButton() && (interaction.customId.startsWith('trade_accept:') || interaction.customId.startsWith('trade_decline:'))) {
    const [action, offerId] = interaction.customId.split(':');
    if (!interaction.guildId || !offerId) {
      return interaction.reply({ content: 'Bu takas teklifi geçersiz.', ephemeral: true });
    }
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      const offerResult = await db.query(
        'SELECT * FROM trade_offers WHERE offer_id=$1 AND guild_id=$2 FOR UPDATE',
        [offerId, interaction.guildId]
      );
      const offer = offerResult.rows[0];
      if (!offer) {
        await db.query('ROLLBACK');
        return interaction.reply({ content: 'Bu takas teklifi bulunamadı veya artık geçerli değil.', ephemeral: true });
      }
      if (interaction.user.id !== offer.to_user_id) {
        await db.query('ROLLBACK');
        return interaction.reply({ content: 'Bu teklife yalnızca teklif gönderilen kullanıcı yanıt verebilir.', ephemeral: true });
      }
      if (offer.status !== 'pending') {
        await db.query('ROLLBACK');
        return interaction.update({ content: offer.status === 'accepted' ? '✅ Bu takas daha önce tamamlandı.' : offer.status === 'declined' ? '❌ Bu takas daha önce reddedildi.' : '⏰ Bu takas teklifi artık geçerli değil.', embeds: [], components: [] });
      }
      if (new Date(offer.expires_at).getTime() <= Date.now()) {
        await db.query("UPDATE trade_offers SET status='expired',resolved_at=NOW() WHERE offer_id=$1",[offerId]);
        await db.query('COMMIT');
        return interaction.update({ content: '⏰ Takas teklifinin süresi doldu.', embeds: [], components: [] });
      }
      if (action === 'trade_decline') {
        await db.query("UPDATE trade_offers SET status='declined',resolved_at=NOW() WHERE offer_id=$1",[offerId]);
        await db.query('COMMIT');
        return interaction.update({ content: '❌ Takas teklifi reddedildi.', embeds: [], components: [] });
      }

      const found = await db.query(
        `SELECT character_name, quantity FROM anime_character_collection
         WHERE guild_id=$1 AND user_id=$2 AND character_name=$3 FOR UPDATE`,
        [interaction.guildId, offer.from_user_id, offer.character_name]
      );
      const reservedResult = await db.query(
        `SELECT COALESCE(SUM(amount),0)::int AS amount FROM trade_offers
         WHERE guild_id=$1 AND from_user_id=$2 AND character_name=$3 AND status='pending'
           AND expires_at>NOW() AND offer_id<>$4`,
        [interaction.guildId, offer.from_user_id, found.rows[0]?.character_name ?? offer.character_name, offerId]
      );
      const reservedForOthers = Number(reservedResult.rows[0].amount);
      if (!found.rowCount || Number(found.rows[0].quantity) - Number(offer.amount) < reservedForOthers + 1) {
        await db.query("UPDATE trade_offers SET status='invalid',resolved_at=NOW() WHERE offer_id=$1",[offerId]);
        await db.query('COMMIT');
        return interaction.update({ content: 'Takas yapılamadı: kopyalar artık bu teklif ve diğer bekleyen teklifler için yeterli değil. Son kopya korunur.', embeds: [], components: [] });
      }
      const character = await db.query(
        `SELECT anime, rarity, emoji, color, description, traits, image
         FROM anime_character_collection WHERE guild_id=$1 AND user_id=$2 AND character_name=$3`,
        [interaction.guildId, offer.from_user_id, found.rows[0].character_name]
      );
      const c = character.rows[0];
      await db.query(
        'UPDATE anime_character_collection SET quantity=quantity-$4,last_obtained_at=NOW() WHERE guild_id=$1 AND user_id=$2 AND character_name=$3',
        [interaction.guildId, offer.from_user_id, found.rows[0].character_name, Number(offer.amount)]
      );
      await db.query(
        `INSERT INTO anime_character_collection
         (guild_id,user_id,character_name,anime,rarity,emoji,color,description,traits,image,quantity)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT(guild_id,user_id,character_name) DO UPDATE SET
         quantity=anime_character_collection.quantity+EXCLUDED.quantity,last_obtained_at=NOW()`,
        [interaction.guildId, offer.to_user_id, found.rows[0].character_name, c.anime, c.rarity, c.emoji, c.color, c.description, c.traits, c.image, Number(offer.amount)]
      );
      await db.query("UPDATE trade_offers SET status='accepted',resolved_at=NOW() WHERE offer_id=$1",[offerId]);
      await db.query('COMMIT');
      return interaction.update({ content: '✅ Takas tamamlandı! **' + found.rows[0].character_name + '** ×' + offer.amount + ' kopya yeni sahibine aktarıldı.', embeds: [], components: [] });
    } catch (error) {
      await db.query('ROLLBACK').catch(() => {});
      console.error('Takas kabul hatası:', error);
      return interaction.reply({ content: 'Takas sırasında hata oluştu. Daha sonra tekrar dene.', ephemeral: true }).catch(() => {});
    } finally { db.release(); }
  }
  if (interaction.isAutocomplete()) {
    const command = client.commands.get(interaction.commandName);
    if (!command?.autocomplete) return interaction.respond([]).catch(() => {});
    try { await command.autocomplete(interaction); }
    catch (error) { console.error('Otomatik tamamlama hatası:', error); await interaction.respond([]).catch(() => {}); }
    return;
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
