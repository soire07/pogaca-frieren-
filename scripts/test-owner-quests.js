import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_DAILY_QUESTS,
  DAILY_QUEST_OBJECTIVES,
  validateOwnerDailyQuestInput,
  getDailyQuestObjectiveSql,
  listOwnerDailyQuests,
  saveOwnerDailyQuest,
  setOwnerDailyQuestActive
} from '../owner-rpg-quests.js';

const guildId = '1539562273197260860';
const actorId = '1553794496234262641';

test('daily quest defaults preserve the existing built-in missions and class restrictions', () => {
  assert.ok(DEFAULT_DAILY_QUESTS.length >= 9);
  assert.ok(DEFAULT_DAILY_QUESTS.some(quest => quest.key === 'adventure' && quest.objectiveType === 'adventure'));
  assert.ok(DEFAULT_DAILY_QUESTS.some(quest => quest.key === 'class_buyucu' && quest.className === 'Büyücü'));
  assert.ok(DEFAULT_DAILY_QUESTS.every(quest => DAILY_QUEST_OBJECTIVES[quest.objectiveType]));
});

test('daily quest input accepts bounded rewards and supported objectives', () => {
  const quest = validateOwnerDailyQuestInput({
    guildId, questKey: 'northern_trial', title: 'Kuzey sınavı',
    description: 'Bugün bir keşif tamamla.', objectiveType: 'explore',
    className: '', rewardCoins: 250, reason: 'Yeni sezon görevi'
  });
  assert.equal(quest.questKey, 'northern_trial');
  assert.equal(quest.rewardCoins, 250);
  assert.equal(quest.className, null);
});

test('daily quest input rejects unsafe keys, unsupported objectives and excessive rewards', () => {
  const base = { guildId, questKey: 'valid_key', title: 'Geçerli görev', description: 'Bir hedefi tamamla.', objectiveType: 'explore', rewardCoins: 100, reason: 'Düzenleme' };
  assert.throws(() => validateOwnerDailyQuestInput({ ...base, questKey: 'bad key' }), /INVALID_DAILY_QUEST/);
  assert.throws(() => validateOwnerDailyQuestInput({ ...base, objectiveType: 'raw_sql' }), /INVALID_DAILY_QUEST/);
  assert.throws(() => validateOwnerDailyQuestInput({ ...base, rewardCoins: 1000000 }), /INVALID_DAILY_QUEST/);
  assert.throws(() => validateOwnerDailyQuestInput({ ...base, reason: '' }), /INVALID_DAILY_QUEST/);
});

test('daily quest objective SQL is selected only from the internal allowlist', () => {
  assert.match(getDailyQuestObjectiveSql('adventure'), /last_adventure_at/);
  assert.match(getDailyQuestObjectiveSql('spell'), /spell_mastery/);
  assert.throws(() => getDailyQuestObjectiveSql('DROP TABLE users'), /INVALID_DAILY_QUEST_OBJECTIVE/);
});

test('daily quest catalog seeds defaults and lists only the selected guild', async () => {
  const calls = [];
  const db = { query: async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('FROM guild_daily_quests')) return { rows: [{ quest_key: 'adventure', title: 'Macera tutkunu', active: true }] };
    return { rows: [], rowCount: 1 };
  } };
  const quests = await listOwnerDailyQuests(db, { guildId });
  assert.equal(quests.length, 1);
  assert.ok(calls.filter(call => call.sql.includes('INSERT INTO guild_daily_quests')).length >= 9);
  assert.ok(calls.every(call => !call.sql.includes('guild_id=$2') || call.params.includes(guildId)));
  assert.deepEqual(calls.at(-1).params, [guildId]);
});

test('daily quest save commits the definition and audit record atomically', async () => {
  const calls = [];
  const client = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('INSERT INTO guild_daily_quests')) return { rows: [{ guild_id: guildId, quest_key: 'northern_trial', title: 'Kuzey sınavı', active: true }] };
      return { rows: [] };
    },
    release() { calls.push({ sql: 'RELEASE' }); }
  };
  const saved = await saveOwnerDailyQuest({ connect: async () => client }, {
    guildId, questKey: 'northern_trial', title: 'Kuzey sınavı',
    description: 'Bugün bir keşif tamamla.', objectiveType: 'explore',
    className: '', rewardCoins: 250, active: true,
    reason: 'Yeni sezon görevi', actorId
  });
  assert.equal(saved.quest_key, 'northern_trial');
  assert.ok(calls.some(call => call.sql === 'BEGIN'));
  assert.ok(calls.some(call => call.sql.includes('owner_audit_logs')));
  assert.ok(calls.some(call => call.sql === 'COMMIT'));
  assert.equal(calls.at(-1).sql, 'RELEASE');
});

test('daily quest save rolls back when its audit record cannot be written', async () => {
  const calls = [];
  const client = {
    query: async sql => {
      calls.push(sql);
      if (sql.includes('owner_audit_logs')) throw new Error('audit unavailable');
      if (sql.includes('INSERT INTO guild_daily_quests')) return { rows: [{ quest_key: 'northern_trial' }] };
      return { rows: [] };
    },
    release() {}
  };
  await assert.rejects(saveOwnerDailyQuest({ connect: async () => client }, {
    guildId, questKey: 'northern_trial', title: 'Kuzey sınavı',
    description: 'Bugün bir keşif tamamla.', objectiveType: 'explore',
    rewardCoins: 250, reason: 'Yeni sezon görevi', actorId
  }), /audit unavailable/);
  assert.ok(calls.includes('ROLLBACK'));
  assert.ok(!calls.includes('COMMIT'));
});

test('deleting a daily quest is a reversible soft-disable and preserves claim history', async () => {
  const calls = [];
  const client = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('UPDATE guild_daily_quests')) return { rows: [{ quest_key: 'northern_trial', active: false }], rowCount: 1 };
      return { rows: [] };
    },
    release() {}
  };
  const result = await setOwnerDailyQuestActive({ connect: async () => client }, {
    guildId, questKey: 'northern_trial', active: false,
    reason: 'Görev sezonu sona erdi', actorId
  });
  assert.equal(result.active, false);
  const update = calls.find(call => call.sql.includes('UPDATE guild_daily_quests'));
  assert.ok(update.sql.includes('SET active=$3'));
  assert.ok(!calls.some(call => call.sql.includes('DELETE FROM daily_mission_claims')));
  assert.ok(calls.some(call => call.sql.includes('owner_audit_logs')));
  assert.ok(calls.some(call => call.sql === 'COMMIT'));
});
