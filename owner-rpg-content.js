import { RPG_CONTENT_CATALOGS } from './rpg-content-catalog.js';

const SNOWFLAKE = /^\d{17,20}$/;
const OWNER = '1553794496234262641';
const TYPES = new Set(Object.keys(RPG_CONTENT_CATALOGS));

function guildIdValue(value) {
  const id = String(value || '').trim();
  if (!SNOWFLAKE.test(id)) throw new Error('INVALID_RPG_CONTENT');
  return id;
}

function actorIdValue(value) {
  const id = String(value || OWNER).trim();
  if (!SNOWFLAKE.test(id)) throw new Error('INVALID_RPG_CONTENT');
  return id;
}

function defaultFor(type, key) {
  const catalog = RPG_CONTENT_CATALOGS[type];
  return catalog?.find(item => item.key === key) || null;
}

function boundedInteger(value, fallback, min, max) {
  const number = Number(value ?? fallback);
  if (!Number.isSafeInteger(number) || number < min || number > max) throw new Error('INVALID_RPG_CONTENT');
  return number;
}

function boundedNumber(value, fallback, min, max) {
  const number = Number(value ?? fallback);
  if (!Number.isFinite(number) || number < min || number > max) throw new Error('INVALID_RPG_CONTENT');
  return number;
}

function boundedText(value, fallback, min = 2, max = 80) {
  const text = String(value ?? fallback ?? '').trim();
  if (text.length < min || text.length > max) throw new Error('INVALID_RPG_CONTENT');
  return text;
}

function normalizeConfig(type, defaults, input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('INVALID_RPG_CONTENT');
  if (type === 'dungeon') {
    return {
      name: boundedText(input.name, defaults.name),
      hp: boundedInteger(input.hp, defaults.hp, 80, 10000),
      damage: boundedInteger(input.damage, defaults.damage, 1, 500),
      xp: boundedInteger(input.xp, defaults.xp, 0, 10000),
      coins: boundedInteger(input.coins, defaults.coins, 0, 10000),
      lootChance: boundedNumber(input.lootChance, defaults.lootChance, 0, 1),
      loot: boundedText(input.loot, defaults.loot)
    };
  }
  if (type === 'solo_boss') {
    const lootInput = input.loot ?? defaults.loot;
    const loot = (Array.isArray(lootInput) ? lootInput : String(lootInput).split(','))
      .map(value => String(value || '').trim()).filter(Boolean);
    if (!loot.length || loot.length > 5 || loot.some(value => value.length < 2 || value.length > 80)) throw new Error('INVALID_RPG_CONTENT');
    const config = {
      name: boundedText(input.name, defaults.name),
      region: boundedText(input.region, defaults.region),
      maxHp: boundedInteger(input.maxHp, defaults.maxHp, 50, 20000),
      minDamage: boundedInteger(input.minDamage, defaults.minDamage, 1, 1000),
      maxDamage: boundedInteger(input.maxDamage, defaults.maxDamage, 1, 1500),
      coinMin: boundedInteger(input.coinMin, defaults.coinMin, 0, 20000),
      coinMax: boundedInteger(input.coinMax, defaults.coinMax, 0, 30000),
      xpMin: boundedInteger(input.xpMin, defaults.xpMin, 0, 10000),
      xpMax: boundedInteger(input.xpMax, defaults.xpMax, 0, 20000),
      lootChance: boundedNumber(input.lootChance, defaults.lootChance, 0, 1),
      loot
    };
    if (config.minDamage > config.maxDamage || config.coinMin > config.coinMax || config.xpMin > config.xpMax) {
      throw new Error('INVALID_RPG_CONTENT');
    }
    return config;
  }
  if (type === 'raid_boss') {
    const weakness = String(input.weakness ?? defaults.weakness);
    if (!['spell', 'attack'].includes(weakness)) throw new Error('INVALID_RPG_CONTENT');
    return {
      name: boundedText(input.name, defaults.name),
      hp: boundedInteger(input.hp, defaults.hp, 50, 20000),
      damage: boundedInteger(input.damage, defaults.damage, 1, 1500),
      xp: boundedInteger(input.xp, defaults.xp, 0, 20000),
      coins: boundedInteger(input.coins, defaults.coins, 0, 30000),
      loot: boundedText(input.loot, defaults.loot),
      weakness,
      weaknessLabel: boundedText(input.weaknessLabel, defaults.weaknessLabel, 2, 40)
    };
  }
  throw new Error('INVALID_RPG_CONTENT');
}

export function validateOwnerRpgContentInput(input = {}) {
  const guildId = guildIdValue(input.guildId);
  const contentType = String(input.contentType || '');
  const contentKey = String(input.contentKey || '');
  if (!TYPES.has(contentType)) throw new Error('INVALID_RPG_CONTENT');
  const defaults = defaultFor(contentType, contentKey);
  if (!defaults) throw new Error('INVALID_RPG_CONTENT');
  const reason = String(input.reason || '').trim();
  if (reason.length < 3 || reason.length > 200) throw new Error('INVALID_RPG_CONTENT');
  const actorId = actorIdValue(input.actorId);
  const active = input.active === undefined ? true : input.active === true || input.active === 'yes' || input.active === 'true';
  const config = normalizeConfig(contentType, defaults, input.config);
  return { guildId, contentType, contentKey, config, active, reason, actorId };
}

function parseConfig(value) {
  if (!value) return {};
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return {}; }
  }
  return typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function mergeCatalog(catalog, rows, guildId, typeFilter = null) {
  const overrides = new Map((rows || []).map(row => [
    row.content_type + ':' + row.content_key,
    row
  ]));
  const result = [];
  for (const [type, defaults] of Object.entries(RPG_CONTENT_CATALOGS)) {
    if (typeFilter && type !== typeFilter) continue;
    for (const item of defaults) {
      const override = overrides.get(type + ':' + item.key);
      result.push({
        guild_id: guildId,
        content_type: type,
        content_key: item.key,
        config: { ...item, ...parseConfig(override?.config) },
        active: override ? override.active !== false : true,
        is_system: true,
        updated_at: override?.updated_at || null
      });
    }
  }
  return result;
}

export async function listOwnerRpgContent(db, { guildId } = {}) {
  const id = guildIdValue(guildId);
  const result = await db.query(
    `SELECT content_type,content_key,config,active,updated_at
     FROM guild_rpg_content_overrides WHERE guild_id=$1`,
    [id]
  );
  return mergeCatalog(RPG_CONTENT_CATALOGS, result.rows, id);
}

export async function getGuildRpgContent(db, guildId, contentType) {
  const id = guildIdValue(guildId);
  if (!TYPES.has(String(contentType || ''))) throw new Error('INVALID_RPG_CONTENT');
  const result = await db.query(
    `SELECT content_type,content_key,config,active,updated_at
     FROM guild_rpg_content_overrides WHERE guild_id=$1 AND content_type=$2`,
    [id, contentType]
  );
  return mergeCatalog(RPG_CONTENT_CATALOGS, result.rows, id, contentType)
    .filter(item => item.active)
    .map(item => item.config);
}

async function assertAtLeastOneActive(client, guildId, contentType) {
  const result = await client.query(
    'SELECT content_key,active FROM guild_rpg_content_overrides WHERE guild_id=$1 AND content_type=$2',
    [guildId, contentType]
  );
  const overrides = new Map((result.rows || []).map(row => [row.content_key, row.active !== false]));
  const activeCount = RPG_CONTENT_CATALOGS[contentType]
    .filter(item => overrides.has(item.key) ? overrides.get(item.key) : true).length;
  if (activeCount < 1) throw new Error('LAST_ACTIVE_RPG_CONTENT');
}

export async function saveOwnerRpgContent(db, input = {}) {
  const item = validateOwnerRpgContentInput(input);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))', [item.guildId, item.contentType]);
    const saved = await client.query(
      `INSERT INTO guild_rpg_content_overrides
       (guild_id,content_type,content_key,config,active,updated_by,updated_at)
       VALUES($1,$2,$3,$4::jsonb,$5,$6,NOW())
       ON CONFLICT(guild_id,content_type,content_key) DO UPDATE SET
         config=EXCLUDED.config,active=EXCLUDED.active,updated_by=EXCLUDED.updated_by,updated_at=NOW()
       RETURNING guild_id,content_type,content_key,config,active`,
      [item.guildId, item.contentType, item.contentKey, JSON.stringify(item.config), item.active, item.actorId]
    );
    const row = saved.rows?.[0];
    if (!row) throw new Error('RPG_CONTENT_SAVE_FAILED');
    await assertAtLeastOneActive(client, item.guildId, item.contentType);
    await client.query(
      `INSERT INTO owner_audit_logs(actor_id,action,target,details)
       VALUES($1,'rpg.content.save',$2,$3::jsonb)`,
      [item.actorId, item.guildId, JSON.stringify({
        contentType: item.contentType, contentKey: item.contentKey,
        config: item.config, active: item.active, reason: item.reason
      })]
    );
    await client.query('COMMIT');
    return row;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function setOwnerRpgContentActive(db, input = {}) {
  const guildId = guildIdValue(input.guildId);
  const contentType = String(input.contentType || '');
  const contentKey = String(input.contentKey || '');
  if (!TYPES.has(contentType) || !defaultFor(contentType, contentKey)) throw new Error('INVALID_RPG_CONTENT');
  const actorId = actorIdValue(input.actorId);
  const reason = String(input.reason || '').trim();
  if (reason.length < 3 || reason.length > 200) throw new Error('INVALID_RPG_CONTENT');
  const active = input.active === true || input.active === 'yes' || input.active === 'true';
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))', [guildId, contentType]);
    const result = await client.query(
      `INSERT INTO guild_rpg_content_overrides
       (guild_id,content_type,content_key,config,active,updated_by,updated_at)
       VALUES($1,$2,$3,'{}'::jsonb,$4,$5,NOW())
       ON CONFLICT(guild_id,content_type,content_key) DO UPDATE SET
         active=EXCLUDED.active,updated_by=EXCLUDED.updated_by,updated_at=NOW()
       RETURNING guild_id,content_type,content_key,active`,
      [guildId, contentType, contentKey, active, actorId]
    );
    const row = result.rows?.[0];
    if (!row) throw new Error('RPG_CONTENT_NOT_FOUND');
    await assertAtLeastOneActive(client, guildId, contentType);
    await client.query(
      `INSERT INTO owner_audit_logs(actor_id,action,target,details)
       VALUES($1,'rpg.content.toggle',$2,$3::jsonb)`,
      [actorId, guildId, JSON.stringify({ contentType, contentKey, active, reason })]
    );
    await client.query('COMMIT');
    return row;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
