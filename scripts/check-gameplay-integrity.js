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
  assert.equal((source.match(/toPersistentHp\(playerHp\)/g) || []).length, 2);
});


test('exploration uses equipment, class and combat-build passives while preserving base-stat HP and mana ratios', async () => {
  const source = await read('commands/rpg/kesif.js');
  assert.match(source, /applyClassDefense, applyClassManaCost, applyEquipmentSetBonus, explorationMasteryReward, getCharacterBuild/);
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
    assert.match(source, /const castCount = \(spellCasts\.get\([^)]*\) \|\| 0\) \+ 1/);
    assert.match(source, /INSERT INTO spell_mastery \(guild_id,user_id,spell_key,casts,mastery_level,updated_at\)/);
    assert.match(source, /mastery_level=LEAST\(10,FLOOR\(\(spell_mastery\.casts\+EXCLUDED\.casts\)\/10\.0\)::int\)/);
  }
  assert.match(raid, /applyRaidWeakness\(damage, BOSS, usedSpell \? 'spell' : 'attack'\)/);
});


test('exploration activates the same rarity-based equipment set bonuses as combat', async () => {
  const source = await read('commands/rpg/kesif.js');
  assert.match(source, /applyEquipmentSetBonus\(equippedItems, equipmentBonus\(equippedItems\)\)/);
  assert.match(source, /Etkin ekipman seti/);
  assert.match(source, /const effectiveDefense = Math\.min\(250, Math\.round\(applyClassDefense/);
  assert.match(source, /const effectiveMaxHp = Math\.min\(2000, Math\.round\(\(baseMaxHp \+ gear\.hp\) \* build\.hp \* \(1 \+ Number\(player\.talent_hp\) \* 0\.05\)\)\)/);
  assert.match(source, /const effectiveMaxMana = Math\.min\(2000, Math\.round\(\(baseMaxMana \+ gear\.mana\) \* build\.mana \* \(1 \+ Number\(player\.talent_mana\) \* 0\.05\)\)\)/);
});


test('exploration applies persistent HP, mana and defense talent ranks to effective stats', async () => {
  const source = await read('commands/rpg/kesif.js');
  for (const talent of ['hp_rank', 'mana_rank', 'defense_rank']) {
    assert.ok(source.includes(`AS talent_${talent.replace('_rank', '')}`) || source.includes(`AS talent_${talent}`), 'missing talent stat: ' + talent);
  }
  assert.match(source, /Number\(player\.talent_hp\) \* 0\.05/);
  assert.match(source, /Number\(player\.talent_mana\) \* 0\.05/);
  assert.match(source, /Number\(player\.talent_defense\) \* 0\.04/);
});


test('player profile includes persistent talent ranks and equipment rarity set bonuses in effective stats', async () => {
  const source = await read('profil.js');
  assert.match(source, /applyEquipmentSetBonus\(equippedItems, equipmentBonus\(equippedItems\)\)/);
  assert.match(source, /Ekipman set bonusu/);
  for (const field of ['talent_attack', 'talent_defense', 'talent_hp', 'talent_mana']) {
    assert.ok(source.includes(`AS ${field}`), 'missing profile talent field: ' + field);
  }
  assert.match(source, /Number\(u\.talent_hp\) \* 0\.05/);
  assert.match(source, /Number\(u\.talent_mana\) \* 0\.05/);
  assert.match(source, /Number\(u\.talent_attack\) \* 0\.04/);
  assert.match(source, /Number\(u\.talent_defense\) \* 0\.04/);
});


test('cooperative Zoltraak damage uses saved mastery and can level up during the same encounter', async () => {
  const dungeon = await read('katlizindan.js');
  const raid = await read('ortakboss.js');
  for (const source of [dungeon, raid]) {
    assert.match(source, /SELECT user_id,casts,mastery_level FROM spell_mastery/);
    assert.match(source, /\+ \(spellMastery\.get\([^)]*\) \|\| 0\) \* 2/);
    assert.match(source, /spellMastery\.set\([^,]+, Math\.min\(10, Math\.floor\(/);
    assert.match(source, /masteryCastTotals\.get\([^)]*\) \|\| 0/);
  }
});


test('co-op encounter reservations prevent overlapping party runs and expire after abandoned sessions', async () => {
  const schema = await read('database/db.js');
  assert.match(schema, /CREATE TABLE IF NOT EXISTS active_rpg_encounters/);
  assert.match(schema, /PRIMARY KEY \(guild_id, user_id\)/);
  assert.match(schema, /expires_at TIMESTAMPTZ NOT NULL/);
  for (const [path, mode] of [['katlizindan.js', 'dungeon'], ['ortakboss.js', 'raid']]) {
    const source = await read(path);
    assert.ok(source.includes(`VALUES ($1,$2,$3,'${mode}',NOW()+INTERVAL '30 minutes')`), path + ': reservation must expire if the process dies');
    assert.ok(source.includes('DELETE FROM active_rpg_encounters WHERE guild_id=$1 AND encounter_id=$2'), path + ': reservation is released after encounter');
    assert.ok(source.includes('activeReservations.rowCount !== ids.length'), path + ': all participants must still own the reservation before rewards');
    assert.ok(source.includes('reservationError.code === \'23505\''), path + ': overlapping encounter is rejected');
  }
});

test('co-op combat releases database locks before waiting for player turns and revalidates cooldown on save', async () => {
  for (const [path, cooldown] of [['katlizindan.js', 'last_dungeon_at'], ['ortakboss.js', 'last_boss_at']]) {
    const source = await read(path);
    const release = source.indexOf('db = null;');
    const wait = source.indexOf('while (', release);
    const save = source.indexOf('Reacquire a short transaction', wait);
    const lock = source.indexOf('ORDER BY user_id FOR UPDATE', save);
    assert.ok(release >= 0 && wait > release && save > wait && lock > save, path + ': lock/connection must be released during interactive combat and reacquired for persistence');
    assert.ok(source.includes(cooldown), path + ': concurrent-run cooldown is revalidated');
    assert.ok(source.includes('INSERT INTO active_rpg_encounters'), path + ': participants are reserved before combat starts');
    assert.ok(source.includes('FOR UPDATE'), path + ': final persistence serializes participant state');
    assert.ok(source.includes("await db.query('ROLLBACK')"), path + ': failed validation rolls back');
    assert.ok(source.includes('if (db) db.release()'), path + ': released clients are not released twice');
    assert.match(source, /SELECT user_id,last_(?:dungeon|boss)_at,xp,level/ , path + ': final save reads current XP/level under lock');
    assert.ok(source.includes('currentProgress.get('), path + ': reward calculation uses locked current progression');
  }
});

test('solo boss victory commits final HP, mana, rewards, mastery and loot in one transaction', async () => {
  const source = await read('iblisavasi.js');
  const victory = source.indexOf('if (bossHp <= 0)');
  const begin = source.indexOf("await db.query('BEGIN')", victory);
  const userUpdate = source.indexOf('UPDATE users SET hp=$3, mana=$4, coins=coins+$5, xp=xp+$6', begin);
  const mastery = source.indexOf('if (spellUsed)', userUpdate);
  const loot = source.indexOf("INSERT INTO inventory(guild_id,user_id,item_key,quantity)", mastery);
  const commit = source.indexOf("await db.query('COMMIT')", loot);
  assert.ok(victory >= 0 && begin > victory && userUpdate > begin && mastery > userUpdate && loot > mastery && commit > loot,
    'victory state, rewards, mastery and loot must share one transaction');
  assert.ok(!source.slice(victory, begin).includes("UPDATE users SET hp=$3, mana=$4"),
    'victory HP/mana must not be saved before the reward transaction');
  assert.ok(source.indexOf('if (spellUsed)', userUpdate) < commit, 'the final killing spell is deferred into the victory transaction');
});

test('solo demon combat saves non-victory HP, mana and spell mastery within the same transaction', async () => {
  const source = await read('iblisavasi.js');
  const turnSave = source.indexOf("Persist each non-victory turn's HP/mana and spell mastery atomically");
  const begin = source.indexOf("await turnDb.query('BEGIN')", turnSave);
  const hpMana = source.indexOf('UPDATE users SET hp=$3, mana=$4', begin);
  const mastery = source.indexOf('INSERT INTO spell_mastery', hpMana);
  const commit = source.indexOf("await turnDb.query('COMMIT')", mastery);
  assert.ok(turnSave >= 0 && begin > turnSave && hpMana > begin && mastery > hpMana && commit > mastery,
    'turn HP/mana and mastery must commit or roll back together');
  assert.ok(source.includes("await turnDb.query('ROLLBACK')"));
});

test('health endpoint reports Discord readiness and database failures instead of unconditional success', async () => {
  const source = await read('index.js');
  assert.match(source, /ENABLE_MESSAGE_CONTENT_INTENT === 'true'/);
  assert.match(source, /if \(!client\.isReady\(\)\)/);
  assert.match(source, /await pool\.query\('SELECT 1'\)/);
  assert.match(source, /res\.writeHead\(503\)/);
  assert.match(source, /Sağlık kontrolü başarısız/);
});

test('RPG guide accurately distinguishes server statistics and the two inventory commands', async () => {
  const guide = await read('commands/rpg/rehber.js');
  const stats = await read('stats.js');
  assert.match(stats, /Kayıtlı oyuncu/);
  assert.match(stats, /En yüksek seviye/);
  assert.match(stats, /Ping/);
  assert.match(guide, /kayıtlı RPG oyuncusu sayısını, en yüksek seviyeyi ve bot pingini gösterir/);
  assert.doesNotMatch(guide, /bot istatistiklerini/);
  assert.match(guide, /ham eşya miktarlarını/);
  assert.match(guide, /kuşanılmış ekipman yuvalarıyla birlikte ayrıntılı çantanı/);
});

test('learning a spell through the character panel also records it in the gameplay journal', async () => {
  const character = await read('karakter.js');
  const standalone = await read('commands/rpg/buyuogren.js');
  assert.match(character, /import \{ recordJournalEntry \} from '\.\/gameplay-journal\.js'/);
  const panelLearn = character.indexOf("await db.query('INSERT INTO learned_spells(guild_id,user_id,spell_key) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[i.guildId,i.user.id,value]);");
  const journalWrite = character.indexOf("await recordJournalEntry(db,i.guildId,i.user.id,'spells',value);", panelLearn);
  const commit = character.indexOf("await db.query('COMMIT');", panelLearn);
  assert.ok(panelLearn >= 0 && journalWrite > panelLearn && commit > journalWrite,
    'panel spell purchase must write the journal entry in the same transaction');
  assert.match(standalone, /recordJournalEntry\(db, interaction\.guildId, interaction\.user\.id, 'spells', spellKey\)/);
});

test('solo boss encounters reserve the player and release the reservation on every normal exit', async () => {
  const schema = await read('database/db.js');
  const boss = await read('iblisavasi.js');
  const exploration = await read('commands/rpg/kesif.js');
  const rest = await read('commands/rpg/dinlen.js');
  assert.match(schema, /encounter_type IN \('dungeon','raid','boss'\)/);
  const reserve = boss.indexOf("INSERT INTO active_rpg_encounters");
  const stats = boss.indexOf('SELECT hp, max_hp, mana, max_mana');
  assert.ok(reserve >= 0 && stats > reserve, 'boss reservation must exist before reading combat stats');
  assert.match(boss, /SELECT user_id FROM users WHERE guild_id=\$1 AND user_id=\$2 FOR UPDATE/);
  assert.match(boss, /DELETE FROM active_rpg_encounters WHERE guild_id=\$1 AND user_id=\$2 AND encounter_id=\$3/);
  assert.match(boss, /reservationCreated = false/);
  assert.match(exploration, /SELECT encounter_type FROM active_rpg_encounters WHERE guild_id=\$1 AND user_id=\$2 AND expires_at > NOW\(\)/);
  assert.match(rest, /SELECT encounter_type FROM active_rpg_encounters WHERE guild_id=\$1 AND user_id=\$2 AND expires_at > NOW\(\)/);
  assert.match(boss, /collector\.on\('end', async \(_, reason\) => \{[\s\S]*?await releaseReservation\(\)/);
});


test('rest serializes against encounter reservations and rolls back blocked rests', async () => {
  const source = await read('commands/rpg/dinlen.js');
  const begin = source.indexOf("await db.query('BEGIN')");
  const playerLock = source.indexOf('SELECT hp, max_hp, mana, max_mana, last_rest_at FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE');
  const encounterCheck = source.indexOf('SELECT encounter_type FROM active_rpg_encounters', playerLock);
  const update = source.indexOf('UPDATE users', encounterCheck);
  const commit = source.indexOf("await db.query('COMMIT')", update);
  assert.ok(begin >= 0 && playerLock > begin && encounterCheck > playerLock && update > encounterCheck && commit > update,
    'rest must lock the player row, check active encounters and save within one transaction');
  assert.match(source, /if \(activeEncounter\.rowCount\) \{[\s\S]*?await db\.query\('ROLLBACK'\)/);
  assert.match(source, /catch \(error\) \{[\s\S]*?await db\.query\('ROLLBACK'\)/);
  assert.match(source, /finally \{\s*db\.release\(\)/);
});


test('legacy two-player dungeon rejects teammates with active interactive encounters', async () => {
  const source = await read('zindan.js');
  const lock = source.indexOf('FROM users WHERE guild_id=$1 AND user_id = ANY($2::text[]) FOR UPDATE');
  const encounterCheck = source.indexOf('SELECT user_id FROM active_rpg_encounters', lock);
  const byId = source.indexOf('const byId = new Map', encounterCheck);
  assert.ok(lock >= 0 && encounterCheck > lock && byId > encounterCheck,
    'legacy dungeon must lock both players then check encounter reservations before combat');
  assert.match(source, /if \(activeEncounter\.rowCount\) \{\s*await db\.query\('ROLLBACK'\)/);
});


test('resource-changing commands cannot race active encounters', async () => {
  const files = [
    ['ekipman.js', /SELECT user_id FROM users WHERE guild_id=\$1 AND user_id=\$2 FOR UPDATE/, 2],
    ['esyakullan.js', /SELECT user_id FROM users WHERE guild_id=\$1 AND user_id=\$2 FOR UPDATE/, 1],
    ['commands/rpg/buyupratik.js', /SELECT encounter_type FROM active_rpg_encounters WHERE guild_id=\$1 AND user_id=\$2 AND expires_at > NOW\(\)/, 1],
    ['commands/rpg/gelisim.js', /SELECT encounter_type FROM active_rpg_encounters WHERE guild_id=\$1 AND user_id=\$2 AND expires_at > NOW\(\)/, 1]
  ];
  for (const [path, pattern, minimum] of files) {
    const source = await read(path);
    assert.ok((source.match(new RegExp(pattern.source, 'g')) || []).length >= minimum, path + ': active encounter guard missing');
    assert.match(source, /activeEncounter\.rowCount/ , path + ': active encounter must block the operation');
    assert.match(source, /await (?:db|client)\.query\('ROLLBACK'\)/, path + ': blocked operation must roll back');
  }
  const practice = await read('commands/rpg/buyupratik.js');
  const playerLock = practice.indexOf('SELECT mana, coins FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE');
  const encounterCheck = practice.indexOf('SELECT encounter_type FROM active_rpg_encounters', playerLock);
  const manaSpend = practice.indexOf('UPDATE users SET mana=mana-8', encounterCheck);
  assert.ok(playerLock >= 0 && encounterCheck > playerLock && manaSpend > encounterCheck,
    'spell practice must lock player, check reservation and only then spend resources');
});
