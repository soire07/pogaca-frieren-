import { levelForXp } from './utils.js';
const SNOWFLAKE = /^\d{17,20}$/;
const OWNER = '1553794496234262641';

export async function listOwnerPartnerLinks(db) {
  const result = await db.query(
    'SELECT id,guild_id,partner_name,invite_url,status,created_at FROM owner_partner_links ORDER BY created_at DESC LIMIT 50'
  );
  return result.rows || [];
}

export async function saveOwnerPartnerLink(db, { guildId, name, inviteUrl }, actorId = OWNER) {
  const id = String(guildId || '').trim();
  const label = String(name || '').trim().slice(0, 80);
  let invite;
  try { invite = new URL(String(inviteUrl || '').trim()); } catch { throw new Error('INVALID_PARTNER_INVITE'); }
  if (!SNOWFLAKE.test(id) || !label || !['discord.gg','discord.com','www.discord.com'].includes(invite.hostname) ||
      !(invite.pathname.startsWith('/invite/') || (invite.hostname === 'discord.gg' && /^\/[A-Za-z0-9-]+$/.test(invite.pathname))) ||
      invite.protocol !== 'https:') throw new Error('INVALID_PARTNER_DATA');
  const result = await db.query(
    `WITH saved AS (
       INSERT INTO owner_partner_links(guild_id,partner_name,invite_url,status,created_by)
       VALUES($1,$2,$3,'active',$4)
       ON CONFLICT(guild_id) DO UPDATE SET partner_name=EXCLUDED.partner_name,invite_url=EXCLUDED.invite_url,status='active'
       RETURNING id,guild_id,partner_name,invite_url,status,created_at
     ), logged AS (
       INSERT INTO owner_audit_logs(actor_id,action,target,details)
       SELECT $4,'partner.upsert',guild_id,jsonb_build_object('name',partner_name) FROM saved
       RETURNING id
     )
     SELECT saved.* FROM saved JOIN logged ON TRUE`,
    [id, label, invite.toString(), String(actorId)]
  );
  return result.rows?.[0] || null;
}

export async function deleteOwnerPartnerLink(db, partnerId, actorId = OWNER) {
  const id = Number(partnerId);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('INVALID_PARTNER_ID');
  const result = await db.query(
    `WITH removed AS (
       DELETE FROM owner_partner_links WHERE id=$1 RETURNING id,guild_id,partner_name
     ), logged AS (
       INSERT INTO owner_audit_logs(actor_id,action,target,details)
       SELECT $2,'partner.delete',guild_id,jsonb_build_object('name',partner_name) FROM removed
       RETURNING id
     )
     SELECT removed.* FROM removed JOIN logged ON TRUE`,
    [id, String(actorId)]
  );
  return result.rows?.[0] || null;
}

export async function getOwnerRpgMetrics(db) {
  const [users, inventory, activity] = await Promise.all([
    db.query('SELECT COUNT(*)::int AS players,COALESCE(AVG(level),0)::numeric(10,1) AS average_level,COALESCE(SUM(coins),0)::bigint AS total_coins FROM users'),
    db.query('SELECT COUNT(*)::int AS inventory_stacks,COALESCE(SUM(quantity),0)::bigint AS item_count FROM inventory'),
    db.query('SELECT COALESCE(SUM(boss_defeats),0)::bigint AS boss_wins,COALESCE(SUM(dungeon_wins),0)::bigint AS dungeon_wins FROM users')
  ]);
  return {
    players: Number(users.rows?.[0]?.players || 0),
    averageLevel: Number(users.rows?.[0]?.average_level || 0),
    totalCoins: Number(users.rows?.[0]?.total_coins || 0),
    inventoryStacks: Number(inventory.rows?.[0]?.inventory_stacks || 0),
    itemCount: Number(inventory.rows?.[0]?.item_count || 0),
    bossWins: Number(activity.rows?.[0]?.boss_wins || 0),
    dungeonWins: Number(activity.rows?.[0]?.dungeon_wins || 0)
  };
}

export async function updateGuildConfiguration(db, client, {
  guildId, welcomeChannelId = null, logChannelId = null,
  welcomeMessage = 'Hoş geldin {user}! 🥐 {server} sunucusuna katıldın.',
  actorId = OWNER
}) {
  const id = String(guildId || '');
  if (!SNOWFLAKE.test(id)) throw new Error('INVALID_GUILD_ID');
  const guild = client?.guilds?.cache?.get(id);
  if (!guild) throw new Error('GUILD_NOT_FOUND');
  const validateChannel = async channelId => {
    if (!channelId) return null;
    if (!SNOWFLAKE.test(String(channelId))) throw new Error('INVALID_CHANNEL_ID');
    const channel = await guild.channels.fetch(String(channelId));
    if (!channel?.isTextBased?.() || !channel?.send || String(channel.guildId || channel.guild?.id || '') !== id) {
      throw new Error('INVALID_GUILD_TEXT_CHANNEL');
    }
    const me = guild.members.me;
    if (!me || !channel.permissionsFor(me)?.has('SendMessages')) throw new Error('MISSING_SEND_PERMISSION');
    return String(channel.id);
  };
  const welcome = await validateChannel(welcomeChannelId);
  const log = await validateChannel(logChannelId);
  const message = String(welcomeMessage || '').trim().slice(0, 300);
  if (!message) throw new Error('INVALID_WELCOME_MESSAGE');
  const result = await db.query(
    `WITH saved AS (
       INSERT INTO guild_settings(guild_id,welcome_channel_id,log_channel_id,welcome_message)
       VALUES($1,$2,$3,$4)
       ON CONFLICT(guild_id) DO UPDATE SET welcome_channel_id=EXCLUDED.welcome_channel_id,
         log_channel_id=EXCLUDED.log_channel_id,welcome_message=EXCLUDED.welcome_message
       RETURNING guild_id,welcome_channel_id,log_channel_id,welcome_message
     ), logged AS (
       INSERT INTO owner_audit_logs(actor_id,action,target,details)
       SELECT $5,'guild.settings.update',$1,jsonb_build_object(
         'welcomeChannelId',welcome_channel_id,'logChannelId',log_channel_id
       ) FROM saved RETURNING id
     )
     SELECT saved.* FROM saved JOIN logged ON TRUE`,
    [id, welcome, log, message, String(actorId)]
  );
  return result.rows?.[0] || null;
}

export async function listGuildConfigurations(db) {
  const result = await db.query(
    'SELECT guild_id,welcome_channel_id,log_channel_id,welcome_message FROM guild_settings ORDER BY guild_id'
  );
  return result.rows || [];
}


const OWNER_RESOURCE_LIMIT = 1_000_000;
export async function searchOwnerRpgPlayers(db, { guildId, query = '', limit = 25 } = {}) {
  const guild = String(guildId || '');
  if (!SNOWFLAKE.test(guild)) throw new Error('INVALID_GUILD_ID');
  const term = String(query || '').trim().slice(0, 80);
  const boundedLimit = Math.max(1, Math.min(Number(limit) || 25, 25));
  const result = await db.query(
    `SELECT user_id,character_name,class_name,level,xp,coins,hp,max_hp,mana,max_mana
     FROM users WHERE guild_id=$1 AND (
       $2='' OR user_id=$2 OR COALESCE(character_name,'') ILIKE $3 OR class_name ILIKE $3
     ) ORDER BY level DESC,xp DESC LIMIT $4`,
    [guild, /^\d{17,20}$/.test(term) ? term : '', '%' + term.replace(/[\\%_]/g, '\\$&') + '%', boundedLimit]
  );
  return result.rows || [];
}

export async function getOwnerRpgPlayerDetails(db, { guildId, userId } = {}) {
  const guild = String(guildId || '');
  const user = String(userId || '');
  if (!SNOWFLAKE.test(guild) || !SNOWFLAKE.test(user)) throw new Error('INVALID_PLAYER_TARGET');
  const [player, inventory] = await Promise.all([
    db.query('SELECT user_id,character_name,class_name,level,xp,coins,hp,max_hp,mana,max_mana,attack,defense,stat_points FROM users WHERE guild_id=$1 AND user_id=$2', [guild,user]),
    db.query('SELECT item_key,quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 ORDER BY item_key LIMIT 50', [guild,user])
  ]);
  if (!player.rows?.[0]) return null;
  return { ...player.rows[0], inventory: inventory.rows || [] };
}

export async function adjustOwnerRpgResources(db, {
  guildId, userId, coinsDelta = 0, xpDelta = 0, reason, actorId = OWNER
} = {}) {
  const guild = String(guildId || '');
  const user = String(userId || '');
  const actor = String(actorId || '');
  const coins = Number(coinsDelta);
  const xp = Number(xpDelta);
  const note = String(reason || '').trim().slice(0, 200);
  if (!SNOWFLAKE.test(guild) || !SNOWFLAKE.test(user) || !SNOWFLAKE.test(actor) ||
      !Number.isSafeInteger(coins) || !Number.isSafeInteger(xp) ||
      Math.abs(coins) > OWNER_RESOURCE_LIMIT || Math.abs(xp) > OWNER_RESOURCE_LIMIT ||
      (coins === 0 && xp === 0) || xp < 0 || !note) throw new Error('INVALID_RPG_ADJUSTMENT');
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const locked = await client.query(
      'SELECT coins,xp,level FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE',
      [guild,user]
    );
    if (!locked.rows?.[0]) throw new Error('PLAYER_NOT_FOUND');
    const before = { coins: Number(locked.rows[0].coins), xp: Number(locked.rows[0].xp), level: Number(locked.rows[0].level) };
    const nextXp = Math.max(0, before.xp + xp);
    const nextLevel = levelForXp(nextXp);
    const gainedStatPoints = Math.max(0, nextLevel - before.level);
    const updated = await client.query(
      `UPDATE users SET coins=GREATEST(0,coins+$3),xp=$4,level=$5,stat_points=stat_points+$6
       WHERE guild_id=$1 AND user_id=$2 RETURNING coins,xp,level`,
      [guild,user,coins,nextXp,nextLevel,gainedStatPoints]
    );
    const after = { coins: Number(updated.rows[0].coins), xp: Number(updated.rows[0].xp), level: Number(updated.rows[0].level) };
    await client.query(
      `INSERT INTO owner_audit_logs(actor_id,action,target,details)
       VALUES($1,'rpg.resources.adjust',$2,$3::jsonb)`,
      [actor,guild + ':' + user,JSON.stringify({ before, after, coinsDelta: coins, xpDelta: xp, reason: note })]
    );
    await client.query('COMMIT');
    return { before, after };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
