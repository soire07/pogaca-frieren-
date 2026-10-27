import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('trade offers are persistent, expiring and single-use', async () => {
  const schema = await read('database/db.js');
  const handler = await read('index.js');
  const command = await read('takasteklif.js');
  assert.match(schema, /CREATE TABLE IF NOT EXISTS trade_offers/);
  assert.ok(schema.includes("status IN ('pending','accepted','declined','expired','invalid')"), 'trade status constraint missing');
  assert.match(schema, /idx_trade_offers_pending_sender ON trade_offers\(guild_id, from_user_id, character_name, expires_at\) WHERE status='pending'/);
  assert.match(command, /setAutocomplete\(true\)/);
  assert.match(command, /FOR UPDATE/);
  assert.match(command, /reservedAmount/);
  assert.match(handler, /reservedForOthers/);
  assert.match(command, /Date\.now\(\)\+5\*60\*1000/);
  assert.match(handler, /SELECT \* FROM trade_offers WHERE offer_id=\$1 AND guild_id=\$2 FOR UPDATE/);
  assert.match(handler, /interaction\.user\.id !== offer\.to_user_id/);
  assert.match(handler, /status='accepted'/);
  assert.match(handler, /quantity=quantity-\$4/);
  assert.match(handler, /quantity=anime_character_collection\.quantity\+EXCLUDED\.quantity/);
});

test('daily mission progress and reward claim stay in one transaction', async () => {
  const source = await read('gunlukgorev.js');
  const begin = source.indexOf("await db.query('BEGIN')");
  const progress = source.indexOf('const progress=await db.query(mission.sql');
  const claim = source.indexOf('INSERT INTO daily_mission_claims');
  const commit = source.indexOf("await db.query('COMMIT')", claim);
  assert.ok(begin >= 0 && progress > begin && claim > progress && commit > claim,
    'progress must be checked after BEGIN and before the claim is committed');
  assert.match(source, /if\(!progress\.rows\[0\]\?\.done\)\{await db\.query\('ROLLBACK'\)/);
});

test('collection rarity filters expose all supported rarities and preserve pagination state', async () => {
  const source = await read('koleksiyon.js');
  for (const rarity of ['Hepsi', 'Gizemli', 'Efsanevi', 'Destansı', 'Nadir', 'Yaygın']) {
    assert.ok(source.includes(`value: '${rarity}'`), `missing rarity option: ${rarity}`);
  }
  assert.match(source, /rarityFilter\)\);/);
  assert.match(source, /button\.update\(makePage\(target, rows, page, rarityFilter\)\)/);
  assert.match(source, /totalCharacters > 0 \? Math\.min\(100, Math\.round\(\(uniqueCount \/ totalCharacters\) \* 100\)\) : 0/);
  assert.match(source, /Koleksiyonunda henüz \*\*\$\{rarityFilter\}\*\* nadirliğinde karakter yok/);
});


test('class-specific daily quests require the selected class, validate progress transactionally and allow only one class reward per day', async () => {
  const source = await read('gunlukgorev.js');
  for (const [key, label] of [['class_buyucu','Büyücü'], ['class_muhafiz','Muhafız'], ['class_sifaci','Şifacı'], ['class_gezgin','Gezgin']]) {
    assert.ok(source.includes(key), 'missing class mission: ' + key);
    assert.ok(source.includes("className:'" + label + "'"), 'missing class gate: ' + label);
  }
  assert.ok(source.includes("SELECT class_name FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE"));
  assert.ok(source.includes("mission_key LIKE 'class_%'"));
  assert.ok(source.includes("sm.updated_at::date=CURRENT_DATE"));
  assert.ok(source.includes("u.last_boss_at::date=CURRENT_DATE"));
  assert.ok(source.includes("u.last_item_used_at::date=CURRENT_DATE"));
  assert.ok(source.includes("u.last_exploration_at::date=CURRENT_DATE"));
  const begin = source.indexOf("await db.query('BEGIN')");
  const classLock = source.indexOf("SELECT class_name FROM users", begin);
  const progress = source.indexOf('const progress=await db.query(mission.sql', begin);
  const claim = source.indexOf('INSERT INTO daily_mission_claims', begin);
  const commit = source.indexOf("await db.query('COMMIT')", claim);
  assert.ok(begin >= 0 && classLock > begin && progress > classLock && claim > progress && commit > claim,
    'class, progress and daily claim must be validated in one transaction');
});


test('PvP duels apply persistent class passives and selected combat builds', async () => {
  const source = await read('buyusavasi.js');
  assert.match(source, /SELECT max_hp, attack, defense, class_name, active_build FROM users/);
  assert.match(source, /getCharacterBuild\(stats1\.active_build\)/);
  assert.match(source, /getCharacterBuild\(stats2\.active_build\)/);
  assert.match(source, /applyClassDefense\(Number\(stats1\.defense\) \+ gear1\.defense, stats1\.class_name\)/);
  assert.match(source, /applyClassDefense\(Number\(stats2\.defense\) \+ gear2\.defense, stats2\.class_name\)/);
  assert.match(source, /applyClassDamage\(rawDamage, isPlayer1 \? stats1\.class_name : stats2\.class_name\)/);
  assert.match(source, /applyClassHealing\(baseHealing, isPlayer1 \? stats1\.class_name : stats2\.class_name\)/);
  assert.match(source, /\* build1\.hp/);
  assert.match(source, /\* build2\.hp/);
});


test('player profile displays selected combat build and build-adjusted stats', async () => {
  const source = await read('profil.js');
  assert.match(source, /active_build/);
  assert.match(source, /getCharacterBuild\(u\.active_build\)/);
  assert.match(source, /\(Number\(u\.max_hp\) \+ gear\.hp\) \* build\.hp/);
  assert.match(source, /\(Number\(u\.max_mana\) \+ gear\.mana\) \* build\.mana/);
  assert.match(source, /\(Number\(u\.attack\) \+ gear\.attack\) \* build\.attack/);
  assert.match(source, /applyClassDefense\(Number\(u\.defense\) \+ gear\.defense, u\.class_name\) \* build\.defense/);
  assert.match(source, /Savaş yapısı/);
});


test('party combat applies class discounts and healing passives and converts scaled HP back to persistent base HP', async () => {
  const dungeon = await read('katlizindan.js');
  const raid = await read('ortakboss.js');
  for (const [name, source] of [['dungeon', dungeon], ['raid', raid]]) {
    assert.match(source, /applyClassManaCost\(10, (?:p|f)\.class_name|applyClassManaCost\(10, f\.className\)/);
    assert.match(source, /applyClassManaCost\(18, (?:p|f)\.class_name|applyClassManaCost\(18, f\.className\)/);
    assert.match(source, /applyClassHealing\(26, (?:p|f)\.class_name|applyClassHealing\(26, f\.className\)/);
    assert.match(source, /hp \/ combatMaxHp/);
    assert.match(source, /Math\.min\(baseMaxHp, Math\.round\(\(hp \/ combatMaxHp\) \* baseMaxHp\)\)/);
  }
});


test('solo demon battle persists build-adjusted HP as a base-stat health ratio', async () => {
  const source = await read('iblisavasi.js');
  assert.match(source, /const toPersistentHp = hp => Math\.max\(0, Math\.min\(Number\(stats\.max_hp\), Math\.round\(\(hp \/ Math\.max\(1, playerMaxHp\)\) \* Number\(stats\.max_hp\)\)\)\)/);
  assert.equal((source.match(/toPersistentHp\(playerHp\)/g) || []).length, 3);
});


test('exploration uses equipment, class and combat-build passives while preserving base-stat HP and mana ratios', async () => {
  const source = await read('commands/rpg/kesif.js');
  assert.match(source, /applyClassDefense, applyClassManaCost, getCharacterBuild/);
  assert.match(source, /getCharacterBuild\(player\.active_build\)/);
  assert.match(source, /applyClassDefense\(Number\(player\.defense\) \+ gear\.defense, player\.class_name\)/);
  assert.match(source, /applyClassManaCost\(encounter\.manaCost, player\.class_name\)/);
  assert.match(source, /\(Number\(player\.hp\) \/ baseMaxHp\) \* effectiveMaxHp/);
  assert.match(source, /\(Number\(player\.mana\) \/ baseMaxMana\) \* effectiveMaxMana/);
  assert.match(source, /persistedHp, persistedMana/);
  assert.match(source, /savunma dahil/);
});


test('cooperative dungeon and raid scale current HP and mana proportionally with gear, talents, builds and roles', async () => {
  const dungeon = await read('katlizindan.js');
  const raid = await read('ortakboss.js');
  assert.match(dungeon, /Number\(p\.hp\) \/ Math\.max\(1, Number\(p\.max_hp\)\)\) \* maxHp/);
  assert.match(dungeon, /Number\(p\.mana\) \/ Math\.max\(1, Number\(p\.max_mana\)\)\) \* maxMana/);
  assert.match(raid, /Number\(p\.hp\) \/ Math\.max\(1, Number\(p\.max_hp\)\)\) \* maxHp/);
  assert.match(raid, /Number\(p\.mana\) \/ Math\.max\(1, Number\(p\.max_mana\)\)\) \* maxMana/);
  assert.match(dungeon, /persistedHpNow/);
  assert.match(raid, /persistedHpNow/);
});


test('profile and all battle modes preserve current HP/mana ratios across temporary gear and build bonuses', async () => {
  const profile = await read('profil.js');
  const solo = await read('iblisavasi.js');
  const dungeon = await read('katlizindan.js');
  const raid = await read('ortakboss.js');
  assert.ok(profile.includes('(Number(u.hp) / Math.max(1, Number(u.max_hp))) * effectiveMaxHp'));
  assert.ok(profile.includes('(Number(u.mana) / Math.max(1, Number(u.max_mana))) * effectiveMaxMana'));
  assert.ok(solo.includes('toPersistentMana(playerMana)'));
  assert.ok(dungeon.includes('persistedManaNow[i]'));
  assert.ok(raid.includes('persistedManaNow[i]'));
  assert.ok(raid.includes('baseMaxMana:Number(p.max_mana)'));
});


test('successful Zoltraak casts in cooperative dungeon and boss raid advance persistent spell mastery', async () => {
  const dungeon = await read('katlizindan.js');
  const raid = await read('ortakboss.js');
  for (const source of [dungeon, raid]) {
    assert.match(source, /const spellCasts = new Map\(\)/);
    assert.match(source, /spellCasts\.set\([^,]+, \(spellCasts\.get\([^)]*\) \|\| 0\) \+ 1\)/);
    assert.match(source, /INSERT INTO spell_mastery \(guild_id,user_id,spell_key,casts,mastery_level,updated_at\)/);
    assert.match(source, /mastery_level=LEAST\(10,FLOOR\(\(spell_mastery\.casts\+EXCLUDED\.casts\)\/10\.0\)::int\)/);
  }
  assert.match(raid, /applyRaidWeakness\(damage, BOSS, usedSpell \? 'spell' : 'attack'\)/);
});
