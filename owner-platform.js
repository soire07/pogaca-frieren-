import { levelForXp } from './utils.js';
import { equipmentItems, equipmentBonus } from './equipment-data.js';
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
  const result = await db.query(`
    SELECT
      (SELECT COUNT(*)::int FROM users) AS players,
      (SELECT COALESCE(AVG(level),0)::numeric(10,1) FROM users) AS average_level,
      (SELECT COALESCE(SUM(coins),0)::bigint FROM users) AS total_coins,
      (SELECT COUNT(*)::int FROM inventory) AS inventory_stacks,
      (SELECT COALESCE(SUM(quantity),0)::bigint FROM inventory) AS item_count,
      (SELECT COALESCE(SUM(boss_defeats),0)::bigint FROM users) AS boss_wins,
      (SELECT COALESCE(SUM(dungeon_wins),0)::bigint FROM users) AS dungeon_wins
  `);
  const row = result.rows?.[0] || {};
  return {
    players: Number(row.players || 0),
    averageLevel: Number(row.average_level || 0),
    totalCoins: Number(row.total_coins || 0),
    inventoryStacks: Number(row.inventory_stacks || 0),
    itemCount: Number(row.item_count || 0),
    bossWins: Number(row.boss_wins || 0),
    dungeonWins: Number(row.dungeon_wins || 0)
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
  const [player, inventory, equipment] = await Promise.all([
    db.query('SELECT user_id,character_name,class_name,level,xp,coins,hp,max_hp,mana,max_mana,attack,defense,stat_points FROM users WHERE guild_id=$1 AND user_id=$2', [guild,user]),
    db.query('SELECT item_key,quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 ORDER BY item_key LIMIT 50', [guild,user]),
    db.query('SELECT slot,item_key FROM user_equipment WHERE guild_id=$1 AND user_id=$2 ORDER BY slot', [guild,user])
  ]);
  if (!player.rows?.[0]) return null;
  return { ...player.rows[0], inventory: inventory.rows || [], equipment: equipment.rows || [] };
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


const OWNER_INVENTORY_LIMIT = 1000;
function validateOwnerRpgTarget({ guildId, userId, actorId = OWNER, reason }) {
  const guild = String(guildId || '');
  const user = String(userId || '');
  const actor = String(actorId || '');
  const note = String(reason || '').trim().slice(0, 200);
  if (!SNOWFLAKE.test(guild) || !SNOWFLAKE.test(user) || !SNOWFLAKE.test(actor) || !note) {
    throw new Error('INVALID_RPG_INVENTORY_ACTION');
  }
  return { guild, user, actor, note };
}

export async function adjustOwnerRpgInventory(db, {
  guildId, userId, itemId, quantityDelta, reason, actorId = OWNER
} = {}) {
  const target = validateOwnerRpgTarget({ guildId, userId, actorId, reason });
  const item = equipmentItems.find(entry => entry.id === String(itemId || ''));
  const delta = Number(quantityDelta);
  if (!item || !Number.isSafeInteger(delta) || delta === 0 || Math.abs(delta) > OWNER_INVENTORY_LIMIT) {
    throw new Error('INVALID_RPG_INVENTORY_ACTION');
  }
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    // Match gameplay's equipment lock order (inventory before users) to avoid deadlocks.
    const inventory = await client.query(
      'SELECT quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key=$3 FOR UPDATE',
      [target.guild, target.user, item.name]
    );
    const player = await client.query(
      'SELECT user_id FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE',
      [target.guild, target.user]
    );
    if (!player.rowCount) throw new Error('PLAYER_NOT_FOUND');
    const equipped = await client.query(
      'SELECT slot,item_key FROM user_equipment WHERE guild_id=$1 AND user_id=$2 FOR UPDATE',
      [target.guild, target.user]
    );
    const before = Number(inventory.rows?.[0]?.quantity || 0);
    const equippedCount = (equipped.rows || []).filter(row => row.item_key === item.name).length;
    const after = before + delta;
    if (after < equippedCount) throw new Error('EQUIPPED_ITEM_CANNOT_BE_REMOVED');
    if (after < 0 || after > OWNER_INVENTORY_LIMIT) throw new Error('RPG_INVENTORY_QUANTITY_OUT_OF_RANGE');
    if (after === 0) {
      await client.query(
        'DELETE FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key=$3',
        [target.guild, target.user, item.name]
      );
    } else {
      await client.query(
        `INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,$3,$4)
         ON CONFLICT(guild_id,user_id,item_key) DO UPDATE SET quantity=EXCLUDED.quantity`,
        [target.guild, target.user, item.name, after]
      );
    }
    await client.query(
      `INSERT INTO owner_audit_logs(actor_id,action,target,details)
       VALUES($1,'rpg.inventory.adjust',$2,$3::jsonb)`,
      [target.actor, target.guild + ':' + target.user,
        JSON.stringify({ itemId: item.id, itemName: item.name, before, after, delta, reason: target.note })]
    );
    await client.query('COMMIT');
    return { itemId: item.id, itemName: item.name, before, quantity: after };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function setOwnerRpgEquipment(db, {
  guildId, userId, slot, itemId = null, reason, actorId = OWNER
} = {}) {
  const target = validateOwnerRpgTarget({ guildId, userId, actorId, reason });
  const selectedSlot = String(slot || '');
  const validSlots = ['weapon', 'armor', 'ring1', 'ring2'];
  const item = itemId ? equipmentItems.find(entry => entry.id === String(itemId)) : null;
  if (!validSlots.includes(selectedSlot) || (itemId && !item) ||
      (item && item.slot !== (selectedSlot.startsWith('ring') ? 'ring' : selectedSlot))) {
    throw new Error('INVALID_EQUIPMENT_SLOT');
  }
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    // Lock the candidate inventory stack before the player row, matching /ekipman.
    const owned = item ? await client.query(
      'SELECT quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key=$3 FOR UPDATE',
      [target.guild, target.user, item.name]
    ) : { rows: [], rowCount: 0 };
    const playerResult = await client.query(
      'SELECT level,hp,max_hp,mana,max_mana FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE',
      [target.guild, target.user]
    );
    const player = playerResult.rows?.[0];
    if (!player) throw new Error('PLAYER_NOT_FOUND');
    if (item && Number(player.level) < item.levelReq) throw new Error('EQUIPMENT_LEVEL_REQUIREMENT_NOT_MET');
    const currentSlot = await client.query(
      'SELECT item_key FROM user_equipment WHERE guild_id=$1 AND user_id=$2 AND slot=$3 FOR UPDATE',
      [target.guild, target.user, selectedSlot]
    );
    const previousItem = currentSlot.rows?.[0]?.item_key || null;
    if (item) {
      const sameItemEquipped = await client.query(
        'SELECT COUNT(*)::int AS count FROM user_equipment WHERE guild_id=$1 AND user_id=$2 AND item_key=$3',
        [target.guild, target.user, item.name]
      );
      const alreadyInSlot = previousItem === item.name;
      if (!owned.rowCount || Number(owned.rows[0].quantity) < Number(sameItemEquipped.rows?.[0]?.count || 0) + (alreadyInSlot ? 0 : 1)) {
        throw new Error('EQUIPMENT_NOT_OWNED');
      }
      await client.query(
        `INSERT INTO user_equipment(guild_id,user_id,slot,item_key)
         VALUES($1,$2,$3,$4)
         ON CONFLICT(guild_id,user_id,slot) DO UPDATE SET item_key=EXCLUDED.item_key,equipped_at=NOW()`,
        [target.guild, target.user, selectedSlot, item.name]
      );
    } else {
      await client.query(
        'DELETE FROM user_equipment WHERE guild_id=$1 AND user_id=$2 AND slot=$3',
        [target.guild, target.user, selectedSlot]
      );
    }
    const allEquipped = await client.query(
      'SELECT item_key FROM user_equipment WHERE guild_id=$1 AND user_id=$2 FOR UPDATE',
      [target.guild, target.user]
    );
    const bonus = equipmentBonus((allEquipped.rows || [])
      .map(row => equipmentItems.find(entry => entry.name === row.item_key)).filter(Boolean));
    const effectiveMaxHp = Math.min(2000, Number(player.max_hp) + bonus.hp);
    const effectiveMaxMana = Math.min(2000, Number(player.max_mana) + bonus.mana);
    await client.query(
      'UPDATE users SET hp=LEAST(hp,$3),mana=LEAST(mana,$4) WHERE guild_id=$1 AND user_id=$2',
      [target.guild, target.user, effectiveMaxHp, effectiveMaxMana]
    );
    await client.query(
      `INSERT INTO owner_audit_logs(actor_id,action,target,details)
       VALUES($1,'rpg.equipment.set',$2,$3::jsonb)`,
      [target.actor, target.guild + ':' + target.user,
        JSON.stringify({ slot: selectedSlot, before: previousItem, after: item?.name || null,
          effectiveMaxHp, effectiveMaxMana, reason: target.note })]
    );
    await client.query('COMMIT');
    return { slot: selectedSlot, before: previousItem, itemName: item?.name || null,
      effectiveMaxHp, effectiveMaxMana };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
