const SNOWFLAKE = /^\d{17,20}$/;
const QUEST_KEY = /^[a-z][a-z0-9_]{1,39}$/;
const OWNER = '1553794496234262641';

export const DAILY_QUEST_CLASSES = Object.freeze(['Büyücü', 'Muhafız', 'Şifacı', 'Gezgin']);

export const DAILY_QUEST_OBJECTIVES = Object.freeze({
  adventure: {
    label: 'Macera tamamla',
    sql: "SELECT (last_adventure_at::date = CURRENT_DATE) AS done FROM users WHERE guild_id=$1 AND user_id=$2"
  },
  daily: {
    label: 'Günlük ödül al',
    sql: "SELECT (last_daily_at::date = CURRENT_DATE) AS done FROM users WHERE guild_id=$1 AND user_id=$2"
  },
  draw: {
    label: 'Ücretsiz karakter çek',
    sql: "SELECT (last_free_character_at::date = CURRENT_DATE) AS done FROM users WHERE guild_id=$1 AND user_id=$2"
  },
  explore: {
    label: 'Keşif tamamla',
    sql: "SELECT (last_exploration_at::date = CURRENT_DATE) AS done FROM users WHERE guild_id=$1 AND user_id=$2"
  },
  item: {
    label: 'Envanter eşyası kullan',
    sql: "SELECT (last_item_used_at::date = CURRENT_DATE) AS done FROM users WHERE guild_id=$1 AND user_id=$2"
  },
  boss_fight: {
    label: 'Boss karşılaşmasına katıl',
    sql: "SELECT (last_boss_at::date = CURRENT_DATE) AS done FROM users WHERE guild_id=$1 AND user_id=$2"
  },
  boss_win: {
    label: 'Boss yen',
    sql: "SELECT (last_boss_win_at::date = CURRENT_DATE) AS done FROM users WHERE guild_id=$1 AND user_id=$2"
  },
  spell: {
    label: 'Büyü çalış',
    sql: "SELECT EXISTS (SELECT 1 FROM spell_mastery WHERE guild_id=$1 AND user_id=$2 AND updated_at::date=CURRENT_DATE) AS done"
  }
});

export const DEFAULT_DAILY_QUESTS = Object.freeze([
  { key: 'adventure', title: 'Macera tutkunu', description: 'Bugün bir maceraya çık', objectiveType: 'adventure', rewardCoins: 100 },
  { key: 'daily', title: 'Fırın ziyareti', description: 'Günlük ödülünü al', objectiveType: 'daily', rewardCoins: 75 },
  { key: 'draw', title: 'Karakter avcısı', description: 'Bugün ücretsiz karakter çek', objectiveType: 'draw', rewardCoins: 125 },
  { key: 'explore', title: 'Kuzeyin iz sürücüsü', description: '/kesif ile bugün bir keşif tamamla', objectiveType: 'explore', rewardCoins: 90 },
  { key: 'item', title: 'Hazırlıklı maceracı', description: 'Envanterinden bugün bir eşya kullan', objectiveType: 'item', rewardCoins: 80 },
  { key: 'class_buyucu', title: 'Mana araştırmacısı', description: 'Büyücü olarak bugün /buyupratik ile bir büyü çalış', objectiveType: 'spell', className: 'Büyücü', rewardCoins: 140 },
  { key: 'class_muhafiz', title: 'Ön safta nöbet', description: 'Muhafız olarak bugün bir iblisle yüzleş', objectiveType: 'boss_fight', className: 'Muhafız', rewardCoins: 130 },
  { key: 'class_sifaci', title: 'Hazırlıklı şifacı', description: 'Şifacı olarak bugün envanterinden bir eşya kullan', objectiveType: 'item', className: 'Şifacı', rewardCoins: 120 },
  { key: 'class_gezgin', title: 'Yolun çağrısı', description: 'Gezgin olarak bugün bir keşif tamamla', objectiveType: 'explore', className: 'Gezgin', rewardCoins: 110 }
].map(quest => Object.freeze({ ...quest })));

function validateGuildId(value) {
  const guildId = String(value || '').trim();
  if (!SNOWFLAKE.test(guildId)) throw new Error('INVALID_DAILY_QUEST');
  return guildId;
}

function validateActorId(value) {
  const actorId = String(value || OWNER).trim();
  if (!SNOWFLAKE.test(actorId)) throw new Error('INVALID_DAILY_QUEST');
  return actorId;
}

function validateQuestKey(value) {
  const questKey = String(value || '').trim().toLowerCase();
  if (!QUEST_KEY.test(questKey)) throw new Error('INVALID_DAILY_QUEST');
  return questKey;
}

export function validateOwnerDailyQuestInput(input = {}) {
  const guildId = validateGuildId(input.guildId);
  const questKey = validateQuestKey(input.questKey);
  const title = String(input.title || '').trim();
  const description = String(input.description || '').trim();
  const objectiveType = String(input.objectiveType || '').trim();
  const className = input.className ? String(input.className).trim() : null;
  const rewardCoins = Number(input.rewardCoins);
  const reason = String(input.reason || '').trim();
  const actorId = validateActorId(input.actorId);
  const active = input.active === undefined ? true : input.active === true || input.active === 'yes' || input.active === 'true';

  if (title.length < 2 || title.length > 80 || description.length < 5 || description.length > 240 ||
      !DAILY_QUEST_OBJECTIVES[objectiveType] || (className && !DAILY_QUEST_CLASSES.includes(className)) ||
      !Number.isSafeInteger(rewardCoins) || rewardCoins < 0 || rewardCoins > 5000 ||
      reason.length < 3 || reason.length > 200) {
    throw new Error('INVALID_DAILY_QUEST');
  }
  return { guildId, questKey, title, description, objectiveType, className, rewardCoins, active, reason, actorId };
}

export function getDailyQuestObjectiveSql(objectiveType) {
  const objective = DAILY_QUEST_OBJECTIVES[String(objectiveType || '')];
  if (!objective) throw new Error('INVALID_DAILY_QUEST_OBJECTIVE');
  return objective.sql;
}

export async function ensureGuildDailyQuestCatalog(db, guildId) {
  const id = validateGuildId(guildId);
  const values = DEFAULT_DAILY_QUESTS.map((quest, index) => {
    const offset = 2 + index * 6;
    return `($1,$${offset},$${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4},$${offset + 5},TRUE,TRUE)`;
  }).join(',');
  const params = [id, ...DEFAULT_DAILY_QUESTS.flatMap(quest => [
    quest.key, quest.title, quest.description, quest.objectiveType, quest.className || null, quest.rewardCoins
  ])];
  await db.query(
    `INSERT INTO guild_daily_quests
     (guild_id,quest_key,title,description,objective_type,class_name,reward_coins,active,is_system)
     VALUES ${values}
     ON CONFLICT(guild_id,quest_key) DO NOTHING`,
    params
  );
}

export async function listOwnerDailyQuests(db, { guildId } = {}) {
  const id = validateGuildId(guildId);
  await ensureGuildDailyQuestCatalog(db, id);
  const result = await db.query(
    `SELECT guild_id,quest_key,title,description,objective_type,class_name,reward_coins,active,is_system,updated_at
     FROM guild_daily_quests WHERE guild_id=$1
     ORDER BY is_system DESC,title ASC LIMIT 100`,
    [id]
  );
  return result.rows || [];
}

export async function saveOwnerDailyQuest(db, input = {}) {
  const quest = validateOwnerDailyQuestInput(input);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const saved = await client.query(
      `INSERT INTO guild_daily_quests
       (guild_id,quest_key,title,description,objective_type,class_name,reward_coins,active,is_system,created_by,updated_by,updated_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,FALSE,$9,$9,NOW())
       ON CONFLICT(guild_id,quest_key) DO UPDATE SET
         title=EXCLUDED.title,description=EXCLUDED.description,objective_type=EXCLUDED.objective_type,
         class_name=EXCLUDED.class_name,reward_coins=EXCLUDED.reward_coins,active=EXCLUDED.active,
         updated_by=EXCLUDED.updated_by,updated_at=NOW()
       RETURNING guild_id,quest_key,title,description,objective_type,class_name,reward_coins,active,is_system`,
      [quest.guildId, quest.questKey, quest.title, quest.description, quest.objectiveType, quest.className,
        quest.rewardCoins, quest.active, quest.actorId]
    );
    const row = saved.rows?.[0];
    if (!row) throw new Error('DAILY_QUEST_SAVE_FAILED');
    await client.query(
      `INSERT INTO owner_audit_logs(actor_id,action,target,details)
       VALUES($1,'rpg.daily_quest.save',$2,$3::jsonb)`,
      [quest.actorId, quest.guildId, JSON.stringify({
        questKey: quest.questKey, objectiveType: quest.objectiveType, rewardCoins: quest.rewardCoins,
        active: quest.active, reason: quest.reason
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

export async function setOwnerDailyQuestActive(db, input = {}) {
  const guildId = validateGuildId(input.guildId);
  const questKey = validateQuestKey(input.questKey);
  const actorId = validateActorId(input.actorId);
  const reason = String(input.reason || '').trim();
  const active = input.active === true || input.active === 'yes' || input.active === 'true';
  if (reason.length < 3 || reason.length > 200) throw new Error('INVALID_DAILY_QUEST');
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE guild_daily_quests SET active=$3,updated_by=$4,updated_at=NOW()
       WHERE guild_id=$1 AND quest_key=$2
       RETURNING guild_id,quest_key,title,active,is_system`,
      [guildId, questKey, active, actorId]
    );
    const row = result.rows?.[0];
    if (!row) throw new Error('DAILY_QUEST_NOT_FOUND');
    await client.query(
      `INSERT INTO owner_audit_logs(actor_id,action,target,details)
       VALUES($1,'rpg.daily_quest.toggle',$2,$3::jsonb)`,
      [actorId, guildId, JSON.stringify({ questKey, active, reason, isSystem: row.is_system })]
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
