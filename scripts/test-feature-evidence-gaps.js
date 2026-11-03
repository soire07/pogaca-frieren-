import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SOLO_BOSSES, selectSoloBossForLevel } from '../rpg-content-catalog.js';
import { NPC_SIDE_QUESTS } from '../npc.js';
import { ADVENTURE_OUTCOMES, RARE_ADVENTURE_OUTCOMES } from '../macera.js';
import sans from '../sans.js';
import saril from '../saril.js';

test('solo boss tier selection unlocks exactly at each configured player-level boundary', () => {
  const boundaries = [[1,'level_1'],[9,'level_1'],[10,'level_10'],[19,'level_10'],[20,'level_20'],[34,'level_20'],[35,'level_35'],[49,'level_35'],[50,'level_50'],[100,'level_50']];
  for (const [level, expected] of boundaries) assert.equal(selectSoloBossForLevel(level, DEFAULT_SOLO_BOSSES, () => 0).key, expected);
  assert.equal(selectSoloBossForLevel(0), null);
  assert.equal(selectSoloBossForLevel(Number.NaN), null);
});

test('solo boss rotation reaches every unlocked tier and clamps random edge values', () => {
  for (let index = 0; index < DEFAULT_SOLO_BOSSES.length; index++) {
    const sample = (index + 0.25) / DEFAULT_SOLO_BOSSES.length;
    assert.equal(selectSoloBossForLevel(50, DEFAULT_SOLO_BOSSES, () => sample).key, DEFAULT_SOLO_BOSSES[index].key);
  }
  assert.equal(selectSoloBossForLevel(50, DEFAULT_SOLO_BOSSES, () => -1).key, DEFAULT_SOLO_BOSSES[0].key);
  assert.equal(selectSoloBossForLevel(50, DEFAULT_SOLO_BOSSES, () => 1).key, DEFAULT_SOLO_BOSSES.at(-1).key);
  assert.equal(selectSoloBossForLevel(50, DEFAULT_SOLO_BOSSES, () => Number.NaN).key, DEFAULT_SOLO_BOSSES[0].key);
});

test('every solo boss tier has valid combat, reward, loot and crafting configuration', () => {
  assert.equal(DEFAULT_SOLO_BOSSES.length, 5);
  for (const boss of DEFAULT_SOLO_BOSSES) {
    assert.ok(boss.maxHp > 0);
    assert.ok(boss.minDamage > 0 && boss.maxDamage >= boss.minDamage);
    assert.ok(boss.coinMin > 0 && boss.coinMax >= boss.coinMin);
    assert.ok(boss.xpMin > 0 && boss.xpMax >= boss.xpMin);
    assert.ok(boss.lootChance >= 0 && boss.lootChance <= 1);
    assert.ok(Array.isArray(boss.loot) && boss.loot.length > 0);
    assert.ok(boss.craftingMaterial);
    assert.ok(['heavy','drain','arcane'].includes(boss.specialType));
  }
});

test('NPC side quests have unique story paths, quest keys and positive rewards', () => {
  const entries = Object.entries(NPC_SIDE_QUESTS);
  assert.deepEqual(entries.map(([key]) => key).sort(), ['fern','frieren','stark']);
  assert.equal(new Set(entries.map(([, npc]) => npc.path)).size, 3);
  assert.equal(new Set(entries.map(([, npc]) => npc.questKey)).size, 3);
  for (const [, npc] of entries) {
    assert.ok(npc.questTitle && npc.objective && npc.questDialogue);
    assert.ok(npc.reward.coins > 0 && npc.reward.xp > 0);
    assert.equal(typeof npc.requirement, 'function');
  }
});

test('NPC side quest requirements enforce each distinct progression condition', async () => {
  const spellDb = { query: async (sql, values) => {
    assert.match(sql, /learned_spells/);
    assert.deepEqual(values, ['guild-1','player-1']);
    return { rows: [{ count: 1 }] };
  } };
  assert.deepEqual(await NPC_SIDE_QUESTS.frieren.requirement(spellDb,'guild-1','player-1'), { ok:false, progress:'1 / 2 yeni büyü' });
  spellDb.query = async () => ({ rows:[{count:2}] });
  assert.deepEqual(await NPC_SIDE_QUESTS.frieren.requirement(spellDb,'guild-1','player-1'), { ok:true, progress:'2 / 2 yeni büyü' });
  assert.deepEqual(await NPC_SIDE_QUESTS.fern.requirement(null,'g','u',{items_used_count:2}), {ok:false,progress:'2 / 3 eşya kullanımı'});
  assert.deepEqual(await NPC_SIDE_QUESTS.fern.requirement(null,'g','u',{items_used_count:3}), {ok:true,progress:'3 / 3 eşya kullanımı'});
  assert.deepEqual(await NPC_SIDE_QUESTS.stark.requirement(null,'g','u',{boss_defeats:1}), {ok:false,progress:'1 / 2 iblis zaferi'});
  assert.deepEqual(await NPC_SIDE_QUESTS.stark.requirement(null,'g','u',{boss_defeats:2}), {ok:true,progress:'2 / 2 iblis zaferi'});
});

test('adventure route catalog includes the mimic interaction with its no-item outcome', () => {
  const mimic = ADVENTURE_OUTCOMES.find(outcome => outcome.discovery === 'mimic-trail');
  assert.ok(mimic);
  assert.match(mimic.text, /Mimic/);
  assert.equal(mimic.coins, 10);
  assert.equal(mimic.xp, 20);
  assert.equal(mimic.item, null);
  assert.equal(new Set(ADVENTURE_OUTCOMES.map(outcome => outcome.discovery)).size, ADVENTURE_OUTCOMES.length);
  assert.equal(new Set(RARE_ADVENTURE_OUTCOMES.map(outcome => outcome.discovery)).size, RARE_ADVENTURE_OUTCOMES.length);
});

test('luck command stays within zero-to-one-hundred and selects the correct message bands', async () => {
  const original = Math.random;
  const replies = [];
  try {
    for (const [sample, expected] of [[0,'%0'],[0.45,'%45'],[0.81,'%81'],[0.999999,'%100']]) {
      Math.random = () => sample;
      await sans.execute({ user:{toString:()=>'<@player-1>'}, reply:async message=>replies.push(message) });
      assert.ok(replies.at(-1).includes(expected));
    }
  } finally { Math.random = original; }
});

test('hug command addresses the selected recipient and remains a friendly interaction', async () => {
  let response;
  const recipient = { toString: () => '<@target-1>' };
  await saril.execute({
    user:{toString:()=>'<@player-1>'},
    options:{getUser:name=>{assert.equal(name,'kullanici');return recipient;}},
    reply:async message=>{response=message;}
  });
  assert.match(response, /<@player-1>/);
  assert.match(response, /<@target-1>/);
  assert.match(response, /Fern onaylı/);
});
