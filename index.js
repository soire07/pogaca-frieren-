import 'dotenv/config';
import { Client, Collection, Events, GatewayIntentBits, MessageFlags } from 'discord.js';
import { readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { initDatabase, pool } from './database/db.js';
import { renderMarket, renderMarketItem, buyMarketItem, renderPurchaseResult, renderMarketInventory } from './market.js';
import { levelForXp } from './utils.js';
import { handleCharacterPanelInteraction } from './karakter.js';
import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createAiAgentChildEnv, AI_AGENT_HEALTH_PORT } from './ai-agent/render-supervisor.js';
import { runCommandTestSuite } from './scripts/live-command-test.js';
import { handleFrierenMentionMessage } from './frieren-chat.js';
import { handleOwnerDashboardRequest } from './owner-dashboard.js';
import { handlePublicSiteRequest } from './public-site.js';
import { getMaintenanceState, initOwnerAdminSchema, recordCommandUsage, recordOwnerError } from './owner-admin.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
if (!process.env.DISCORD_TOKEN) throw new Error('DISCORD_TOKEN eksik. Render Environment bölümünü kontrol et.');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL eksik. Önce Render PostgreSQL oluştur ve bağlantıyı ekle.');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMembers, ...(process.env.ENABLE_MESSAGE_CONTENT_INTENT === 'true' ? [GatewayIntentBits.MessageContent] : [])] });
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
      if (mod.default?.data && mod.default?.execute && !mod.default?.internalOnly) {
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


async function sendPrivateInteractionError(interaction, content) {
  if (!interaction?.isRepliable?.()) return;
  const payload = { content, flags: MessageFlags.Ephemeral };
  try {
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
    else await interaction.reply(payload);
  } catch (error) {
    console.error('Etkileşim hata yanıtı gönderilemedi:', error?.message || error);
  }
}

client.once(Events.ClientReady, async readyClient => {
  // Slash komutları yalnızca deploy-commands.js / GitHub Actions tarafından kaydedilir.
  // Bot her yeniden başladığında komut listesini temizlemek, diğer sunuculardaki komutları
  // silebilir ve aynı anda çalışan kayıt iş akışıyla yarışabilir.
  console.log(`Poğaça Frieren aktif: ${readyClient.user.tag}`);
  const connectedGuilds = [...readyClient.guilds.cache.values()]
    .map(guild => ({ name: guild.name, id: guild.id }))
    .sort((a, b) => a.name.localeCompare(b.name));
  console.log('Bağlı Discord sunucuları (ad/ID):', JSON.stringify(connectedGuilds));
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

client.on(Events.GuildMemberAdd, async member => {
  try {
    const result = await pool.query(
      'SELECT welcome_channel_id,log_channel_id,welcome_message FROM guild_settings WHERE guild_id=$1',
      [member.guild.id]
    );
    const settings = result.rows?.[0];
    if (!settings) return;
    const sendToConfiguredChannel = async (channelId, content) => {
      if (!channelId) return;
      const channel = await member.guild.channels.fetch(String(channelId)).catch(() => null);
      if (!channel?.isTextBased?.() || !channel.send) return;
      const me = member.guild.members.me;
      if (!me || !channel.permissionsFor(me)?.has('SendMessages')) return;
      await channel.send({ content, allowedMentions: { parse: [], users: [member.id] } });
    };
    if (settings.welcome_channel_id) {
      const message = String(settings.welcome_message || 'Hoş geldin {user}! {server} sunucusuna katıldın.')
        .replaceAll('{user}', '<@' + member.id + '>')
        .replaceAll('{server}', member.guild.name);
      await sendToConfiguredChannel(settings.welcome_channel_id, message.slice(0, 300));
    }
    if (settings.log_channel_id && settings.log_channel_id !== settings.welcome_channel_id) {
      await sendToConfiguredChannel(settings.log_channel_id, '↗ Üye katıldı: ' + member.user.tag + ' (' + member.id + ')');
    }
  } catch (error) {
    console.error('Guild member welcome/log handler failed:', error?.message || error);
    await recordOwnerError(pool, 'guild-member-join', error?.name || 'Error').catch(() => {});
  }
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isChatInputCommand() && !interaction.commandName.startsWith('owner') && interaction.commandName !== 'status' && await getMaintenanceState(pool)) {
      return sendPrivateInteractionError(interaction, 'Frieren şu anda bakım modunda. İşlemler kısa süreliğine durduruldu.');
    }
    if (!interaction.isChatInputCommand() && await getMaintenanceState(pool)) {
      return sendPrivateInteractionError(interaction, 'Frieren şu anda bakım modunda. İşlemler kısa süreliğine durduruldu.');
    }
    if (await handleCharacterPanelInteraction(interaction)) return;
  if (interaction.isButton() && interaction.customId.startsWith('market_')) {
    const parts = interaction.customId.split(':');
    const action = parts[0];
    const ownerId = parts[parts.length - 1];
    if (interaction.user.id !== ownerId) {
      return interaction.reply({ content: 'Bu market paneli başka bir kullanıcıya ait. Kendi panelin için /market yaz.', flags: MessageFlags.Ephemeral });
    }
    try {
      let page = 0;
      let category = 'Hepsi';
      let notice = null;
      if (action === 'market_detail') {
        const detail = renderMarketItem(parts[1], 0, interaction.user.id);
        if (!detail) return interaction.reply({content:'Bu eşya bulunamadı.',flags: MessageFlags.Ephemeral});
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
      return sendPrivateInteractionError(interaction, 'Market panelinde bir sorun oluştu. Biraz sonra tekrar dene.');
    }
  }
  if (interaction.isButton() && (interaction.customId.startsWith('trade_accept:') || interaction.customId.startsWith('trade_decline:'))) {
    const [action, offerId] = interaction.customId.split(':');
    if (!interaction.guildId || !offerId) {
      return interaction.reply({ content: 'Bu takas teklifi geçersiz.', flags: MessageFlags.Ephemeral });
    }
    let db;
    try {
      db = await pool.connect();
      await db.query('BEGIN');
      const offerResult = await db.query(
        'SELECT * FROM trade_offers WHERE offer_id=$1 AND guild_id=$2 FOR UPDATE',
        [offerId, interaction.guildId]
      );
      const offer = offerResult.rows[0];
      if (!offer) {
        await db.query('ROLLBACK');
        return interaction.reply({ content: 'Bu takas teklifi bulunamadı veya artık geçerli değil.', flags: MessageFlags.Ephemeral });
      }
      if (interaction.user.id !== offer.to_user_id) {
        await db.query('ROLLBACK');
        return interaction.reply({ content: 'Bu teklife yalnızca teklif gönderilen kullanıcı yanıt verebilir.', flags: MessageFlags.Ephemeral });
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
      if (db) await db.query('ROLLBACK').catch(() => {});
      console.error('Takas kabul hatası:', error?.stack || error);
      return sendPrivateInteractionError(interaction, 'Takas sırasında hata oluştu. Daha sonra tekrar dene.');
    } finally { db?.release(); }
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
    await recordCommandUsage(pool, interaction.commandName, interaction.guildId).catch(error => console.warn('Komut ölçümü kaydedilemedi:', error?.message || error));
    await command.execute(interaction);
  } catch (error) {
    await recordOwnerError(pool, '/' + interaction.commandName, error?.name || 'CommandError').catch(() => {});
    console.error(`/${interaction.commandName} hatası:`, error);
    await sendPrivateInteractionError(interaction, 'Bu komut çalışırken bir hata oluştu. Hata kaydedildi; daha sonra tekrar dene.');
  }
  } catch (error) {
    console.error('Etkileşim yönlendirme hatası:', error?.stack || error);
    await sendPrivateInteractionError(interaction, 'Bu etkileşim işlenirken bir hata oluştu. Biraz sonra tekrar dene.');
  }
});

// Mesaj XP'si: aynı kullanıcıya en fazla 60 saniyede bir XP verilir.
client.on(Events.MessageCreate, async message => {
  if (!message.guild || message.author.bot) return;
  try {
    if (await getMaintenanceState(pool)) return;
    await handleFrierenMentionMessage({ message, botUserId: client.user?.id, db: pool });
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
await initOwnerAdminSchema(pool);
await client.login(process.env.DISCORD_TOKEN);

let aiAgentChild = null;
let aiAgentRestartTimer = null;
let shuttingDown = false;

function startAiAgent() {
  const config = createAiAgentChildEnv(process.env);
  if (!config.ok) {
    const reason = config.missing?.length
      ? 'eksik Render değişkenleri: ' + config.missing.join(', ')
      : 'AI botu yalnızca Frieren test sunucusuna kayıt yapabilir.';
    console.error('Frieren AI Agent başlatılmadı; ' + reason);
    return;
  }

  aiAgentChild = spawn(process.execPath, [join(__dirname, 'ai-agent', 'index.js')], {
    cwd: __dirname,
    env: config.env,
    stdio: 'inherit',
  });
  console.log('Frieren AI Agent ayrı süreç olarak başlatıldı.');

  aiAgentChild.once('error', error => {
    console.error('Frieren AI Agent süreci başlatılamadı:', error.message);
  });
  aiAgentChild.once('exit', (code, signal) => {
    aiAgentChild = null;
    if (shuttingDown) return;
    console.error('Frieren AI Agent kapandı (code=' + code + ', signal=' + signal + '). 5 saniye sonra yeniden başlatılacak.');
    aiAgentRestartTimer = setTimeout(startAiAgent, 5_000);
    aiAgentRestartTimer.unref();
  });
}

startAiAgent();

async function stopAiAgentChild() {
  const child = aiAgentChild;
  if (!child || child.exitCode !== null || child.signalCode !== null) return;

  await new Promise(resolve => {
    const forceKillTimer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        console.error('Frieren AI Agent 5 saniyede kapanmadı; SIGKILL gönderiliyor.');
        child.kill('SIGKILL');
      }
    }, 5_000);
    forceKillTimer.unref();

    child.once('exit', () => {
      clearTimeout(forceKillTimer);
      resolve();
    });

    if (!child.killed) child.kill('SIGTERM');
  });
}

process.once('SIGTERM', async () => {
  shuttingDown = true;
  if (aiAgentRestartTimer) clearTimeout(aiAgentRestartTimer);
  console.log('Kapatılıyor...');

  await Promise.allSettled([
    client.destroy(),
    pool.end(),
    stopAiAgentChild(),
  ]);
  process.exit(0);
});
const PORT = process.env.PORT || 3000;
let uptimeRobotCache = null;

createServer(async (req, res) => {
  if (await handleOwnerDashboardRequest(req, res, { client, db: pool })) return;
  if (await handlePublicSiteRequest(req, res, { client })) return;
  const sendJson = (status, payload) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(payload));
  };
  if (req.method === 'GET' && (req.url === '/ai-health' || req.url === '/ai-ready')) {
    try {
      const childPath = req.url === '/ai-health' ? '/live' : '/health';
      const response = await fetch('http://127.0.0.1:' + AI_AGENT_HEALTH_PORT + childPath, {
        signal: AbortSignal.timeout(2_500),
      });
      const body = await response.text();
      res.writeHead(response.status, {
        'Content-Type': response.headers.get('content-type') || 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(body);
    } catch {
      sendJson(503, { status: 'not_ready', service: 'frieren-ai-agent' });
    }
    return;
  }
  if (req.method === 'GET' && req.url === '/uptimerobot-status') {
    const apiKey = process.env.UPTIMEROBOT_API_KEY;
    if (!apiKey) return sendJson(503, { error: 'uptimerobot_not_configured' });

    // Cache briefly to protect the UptimeRobot API rate limit from public polling.
    if (uptimeRobotCache && Date.now() - uptimeRobotCache.checkedAt < 60_000) {
      return sendJson(200, uptimeRobotCache.payload);
    }

    try {
      const body = new URLSearchParams({
        api_key: apiKey,
        format: 'json',
        custom_uptime_ratios: '7-30-45'
      });
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8_000);
      let response;
      try {
        response = await fetch('https://api.uptimerobot.com/v2/getMonitors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
          signal: controller.signal
        });
      } finally {
        clearTimeout(timeout);
      }
      if (!response.ok) return sendJson(502, { error: 'uptimerobot_api_http_error' });
      const data = await response.json();
      if (data.stat !== 'ok' || !Array.isArray(data.monitors)) {
        console.error('UptimeRobot API returned an unsuccessful response.');
        return sendJson(502, { error: 'uptimerobot_api_error' });
      }

      const monitor = data.monitors.find(item => {
        const monitoredUrl = String(item.url || '').replace(/\/$/, '').toLowerCase();
        return monitoredUrl === 'https://pogaca-frieren.onrender.com'
          || String(item.friendly_name || '').toLowerCase() === 'poğaça frieren';
      });
      if (!monitor) return sendJson(404, { error: 'pogaca_frieren_monitor_not_found' });

      const statusText = ({
        0: 'paused',
        1: 'not_checked_yet',
        2: 'up',
        8: 'seems_down',
        9: 'down'
      })[Number(monitor.status)] || 'unknown';
      const payload = {
        service: 'pogaca-frieren',
        checkedAt: new Date().toISOString(),
        monitor: {
          name: String(monitor.friendly_name || 'Poğaça Frieren'),
          status: statusText,
          url: 'https://pogaca-frieren.onrender.com',
          uptimeRatios: monitor.custom_uptime_ratio || null
        }
      };
      uptimeRobotCache = { checkedAt: Date.now(), payload };
      return sendJson(200, payload);
    } catch (error) {
      console.error('UptimeRobot status check failed:', error?.name || 'Error');
      return sendJson(502, { error: 'uptimerobot_check_failed' });
    }
  }
  if (req.url?.startsWith('/internal/test-')) {
    const configuredSecret = process.env.FRIEREN_BRIDGE_SECRET || process.env.FRIEREN_AI_BRIDGE_SECRET || '';
    const suppliedSecret = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const a = Buffer.from(configuredSecret);
    const b = Buffer.from(suppliedSecret);
    const authorized = configuredSecret.length >= 32 && a.length === b.length && timingSafeEqual(a, b);
    if (!authorized) return sendJson(401, { error: 'unauthorized' });
    if (!client.isReady()) return sendJson(503, { error: 'discord_not_ready' });
    if (req.method === 'GET' && req.url === '/internal/test-catalog') {
      const commands = [...client.commands.values()].map(command => {
        const data = typeof command.data?.toJSON === 'function' ? command.data.toJSON() : command.data;
        return { name: data.name, description: data.description, options: data.options || [] };
      });
      return sendJson(200, { service: 'pogaca-frieren', generatedAt: new Date().toISOString(), count: commands.length, commands });
    }
    if (req.method === 'POST' && req.url === '/internal/test-suite') {
      let raw = '';
      try {
        for await (const chunk of req) {
          raw += chunk;
          if (raw.length > 32_768) return sendJson(413, { error: 'payload_too_large' });
        }
        const body = raw ? JSON.parse(raw) : {};
        const names = Array.isArray(body.commands) ? body.commands.filter(x => typeof x === 'string').slice(0, 100) : [];
        const report = await runCommandTestSuite(client.commands, names);
        return sendJson(200, report);
      } catch (error) {
        console.error('Frieren isolated command test failed:', error?.stack || error);
        return sendJson(500, { error: 'test_runner_failed', message: String(error?.message || error).slice(0, 800) });
      }
    }
    return sendJson(404, { error: 'not_found' });
  }
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  if (!client.isReady()) {
    res.writeHead(503);
    res.end('Poğaça Frieren hazır değil: Discord bağlantısı bekleniyor.');
    return;
  }
  try {
    await pool.query('SELECT 1');
    res.writeHead(200);
    res.end('Poğaça Frieren aktif! Discord ve veritabanı bağlantısı sağlıklı. 🥐');
  } catch (error) {
    console.error('Sağlık kontrolü başarısız:', error);
    res.writeHead(503);
    res.end('Poğaça Frieren hazır değil: veritabanı erişilemiyor.');
  }
}).listen(PORT, '0.0.0.0', () => {
  console.log(`Web sunucusu ${PORT} portunda çalışıyor.`);
});
