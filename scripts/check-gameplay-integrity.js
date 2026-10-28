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


test('daily reward uses a single guarded database update to prevent double claims', async () => {
  const source = await read('gunlukodul.js');
  assert.match(source, /WITH eligible AS \([\s\S]*?FOR UPDATE[\s\S]*?\), updated AS \([\s\S]*?UPDATE users AS u[\s\S]*?last_daily_at = NOW\(\)/);
  assert.match(source, /last_daily_at IS NULL OR last_daily_at <= NOW\(\) - INTERVAL '20 hours'/);
  assert.match(source, /if \(!result\.rowCount\)[\s\S]*?Günlük ödülünü yakın zamanda aldın/);
});

test('daily mission and achievement rewards use unique claim records and transactions', async () => {
  const mission = await read('gunlukgorev.js');
  assert.match(mission, /await db\.query\('BEGIN'\)/);
  assert.match(mission, /SELECT class_name FROM users WHERE guild_id=\$1 AND user_id=\$2 FOR UPDATE/);
  assert.match(mission, /INSERT INTO daily_mission_claims[\s\S]*?ON CONFLICT DO NOTHING RETURNING mission_key/);
  assert.match(mission, /if\(!claim\.rowCount\)[\s\S]*?await db\.query\('ROLLBACK'\)/);
  assert.match(mission, /UPDATE users SET coins=coins\+\$3[\s\S]*?await db\.query\('COMMIT'\)/);

  const achievements = await read('basarimlar.js');
  assert.match(achievements, /await db\.query\('BEGIN'\)/);
  assert.match(achievements, /INSERT INTO achievement_claims\(guild_id,user_id,achievement_key\)[\s\S]*?ON CONFLICT DO NOTHING RETURNING achievement_key/);
  assert.match(achievements, /if\(!claim\.rowCount\)[\s\S]*?await db\.query\('ROLLBACK'\)/);
  assert.match(achievements, /UPDATE users SET coins=coins\+\$3[\s\S]*?await db\.query\('COMMIT'\)/);
});

test('daily quest chain serializes each step and applies rewards atomically', async () => {
  const source = await read('gorevzinciri.js');
  const begin = source.indexOf("await db.query('BEGIN')");
  const playerLock = source.indexOf('SELECT xp, level, stat_points FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE');
  const chainLock = source.indexOf('SELECT current_step FROM daily_quest_chains WHERE guild_id=$1 AND user_id=$2 AND chain_date=CURRENT_DATE FOR UPDATE');
  const objective = source.indexOf('const objective = await db.query(step.sql', chainLock);
  const advance = source.indexOf('UPDATE daily_quest_chains SET current_step=$3', objective);
  const reward = source.indexOf('UPDATE users SET coins=coins+$3, xp=$4', advance);
  const commit = source.indexOf("await db.query('COMMIT')", reward);
  assert.ok(begin >= 0 && playerLock > begin && chainLock > playerLock && objective > chainLock && advance > objective && reward > advance && commit > reward,
    'quest step, reward and chain advancement must be one ordered transaction');
});

test('daily crafting reward is claimed once and committed with XP and currency', async () => {
  const source = await read('zanaatgorevi.js');
  assert.match(source, /SELECT crafted_items, claimed_at FROM daily_crafting_progress[\s\S]*?FOR UPDATE/);
  assert.match(source, /if \(progress\.claimed_at\)[\s\S]*?await db\.query\('ROLLBACK'\)/);
  const claimed = source.indexOf('UPDATE daily_crafting_progress SET claimed_at=NOW()');
  const reward = source.indexOf('UPDATE users SET coins=coins+$3, xp=$4', claimed);
  const commit = source.indexOf("await db.query('COMMIT')", reward);
  assert.ok(claimed >= 0 && reward > claimed && commit > reward,
    'daily crafting claim marker and reward must commit together');
});

test('adventure history records the full XP reward including streak milestones', async () => {
  const source = await read('macera.js');
  assert.match(source, /xp_awarded,item_found,first_discovery\)[\s\S]*?outcome\.xp \+ discoveryXp \+ routeMasteryReward\.xp \+ streakReward\.xp \+ dailyAdventureReward\.xp \+ treasureReward\.xp \+ classAdventureReward\.xp \+ streakMilestoneReward\.xp/);
});

test('rare discovery pity takes priority over a manually selected common route', async () => {
  const source = await read('macera.js');
  const outcomeSelection = source.indexOf('const outcome =');
  const pity = source.indexOf('pityReady && undiscoveredRare.length', outcomeSelection);
  const chosenRoute = source.indexOf('chosenRoute', outcomeSelection);
  assert.ok(outcomeSelection >= 0 && pity > outcomeSelection && chosenRoute > pity,
    'the guaranteed undiscovered rare location must be selected before honoring a common route');
});

test('adventure, treasure, story and NPC rewards are blocked during active encounters', async () => {
  const checks = [
    ['macera.js', /SELECT coins, xp, class_name, last_adventure_at FROM users WHERE guild_id=\$1 AND user_id=\$2 FOR UPDATE/, /SELECT encounter_id FROM active_rpg_encounters WHERE guild_id=\$1 AND user_id=\$2 AND expires_at > NOW\(\)/, /await client\.query\('ROLLBACK'\)/],
    ['hazineac.js', /SELECT xp, level FROM users WHERE guild_id=\$1 AND user_id=\$2 FOR UPDATE/, /SELECT encounter_id FROM active_rpg_encounters WHERE guild_id=\$1 AND user_id=\$2 AND expires_at > NOW\(\)/, /await db\.query\('ROLLBACK'\)/],
    ['hikaye.js', /SELECT xp, level, coins, exploration_count, items_used_count, boss_defeats FROM users WHERE guild_id=\$1 AND user_id=\$2 FOR UPDATE/, /SELECT encounter_id FROM active_rpg_encounters WHERE guild_id=\$1 AND user_id=\$2 AND expires_at > NOW\(\)/, /await client\.query\('ROLLBACK'\)/],
    ['npc.js', /SELECT xp, level, coins, items_used_count, boss_defeats FROM users WHERE guild_id=\$1 AND user_id=\$2 FOR UPDATE/, /SELECT encounter_id FROM active_rpg_encounters WHERE guild_id=\$1 AND user_id=\$2 AND expires_at > NOW\(\)/, /await client\.query\('ROLLBACK'\)/]
  ];
  for (const [path, playerLockPattern, encounterPattern, rollbackPattern] of checks) {
    const source = await read(path);
    const playerLock = source.search(playerLockPattern);
    const encounterCheck = source.search(encounterPattern);
    assert.ok(playerLock >= 0 && encounterCheck > playerLock, path + ': lock player before checking active encounter');
    assert.match(source, encounterPattern, path + ': must check active encounter');
    const guardStart = source.indexOf('if (activeEncounterCount)', encounterCheck);
    const guardEnd = source.indexOf('}', guardStart);
    assert.ok(guardStart > encounterCheck && guardEnd > guardStart, path + ': active encounter guard is missing');
    assert.match(source.slice(guardStart, Math.min(source.length, guardStart + 350)), rollbackPattern,
      path + ': blocked action must roll back its transaction');
  }
});

test('adventure discovery catalog matches every normal and rare adventure outcome', async () => {
  const adventure = await read('macera.js');
  const catalog = await read('adventure-data.js');
  const catalogKeys = new Set([...catalog.matchAll(/key:\s*'([^']+)'/g)].map(match => match[1]));
  const outcomeBlock = adventure.match(/const outcomes = \[([\s\S]*?)\n\];/);
  const rareBlock = adventure.match(/const rareOutcomes = \[([\s\S]*?)\n\];/);
  assert.ok(outcomeBlock && rareBlock, 'normal and rare adventure outcome lists must exist');
  const outcomeKeys = [...outcomeBlock[1].matchAll(/discovery:\s*'([^']+)'/g), ...rareBlock[1].matchAll(/discovery:\s*'([^']+)'/g)].map(match => match[1]);
  assert.equal(new Set(outcomeKeys).size, outcomeKeys.length, 'each adventure outcome should map to a unique discovery key');
  for (const key of outcomeKeys) assert.ok(catalogKeys.has(key), 'missing discovery catalog entry for ' + key);
  for (const key of catalogKeys) assert.ok(outcomeKeys.includes(key), 'catalog entry has no adventure outcome: ' + key);
  const commandChoices = [...adventure.matchAll(/value:\s*'([^']+)'/g)].map(match => match[1]).filter(value => outcomeKeys.includes(value));
  for (const key of commandChoices) assert.ok(outcomeKeys.includes(key), 'selectable route must map to an outcome: ' + key);
});

test('adventure journal completion is awarded only once after the full discovery catalog is found', async () => {
  const adventure = await read('macera.js');
  const catalog = await read('adventure-data.js');
  assert.match(adventure, /COUNT\(\*\)::int AS count FROM adventure_discoveries/);
  assert.match(adventure, /Number\(discoveryCount\.count\) >= ADVENTURE_DISCOVERIES\.length/);
  assert.match(adventure, /INSERT INTO adventure_journal_claims\(guild_id,user_id\) VALUES\(\$1,\$2\) ON CONFLICT DO NOTHING RETURNING user_id/);
  assert.match(adventure, /if \(claim\) \{[\s\S]*?journalCompletionCoins = COMPLETE_ADVENTURE_JOURNAL_REWARD\.coins/);
  assert.match(catalog, /export const COMPLETE_ADVENTURE_JOURNAL_REWARD = \{ coins: 250 \}/);
});

test('every equipment has a craft recipe and a salvage yield', async () => {
  const equipment = await read('equipment-data.js');
  const crafting = await read('zanaat.js');
  const salvage = await read('ekipmanparcala.js');
  const equipmentBlock = equipment.match(/export const equipmentItems = \[([\s\S]*?)\n\];/);
  assert.ok(equipmentBlock, 'equipment catalog must exist');
  const equipmentIds = [...equipmentBlock[1].matchAll(/id:\s*'([^']+)'/g)].map(match => match[1]);
  const recipeBlock = crafting.match(/const RECIPES = \{([\s\S]*?)\n\};/);
  const salvageBlock = salvage.match(/const SALVAGE_YIELD = \{([\s\S]*?)\n\};/);
  assert.ok(recipeBlock, 'crafting recipe catalog must exist');
  assert.ok(salvageBlock, 'equipment salvage catalog must exist');
  const recipeIds = [...recipeBlock[1].matchAll(/^\s{2}([a-z_]+):/gm)].map(match => match[1]);
  const salvageIds = [...salvageBlock[1].matchAll(/^\s{2}([a-z_]+):/gm)].map(match => match[1]);
  for (const id of equipmentIds) {
    assert.ok(recipeIds.includes(id), 'missing crafting recipe for ' + id);
    assert.ok(salvageIds.includes(id), 'missing salvage yield for ' + id);
  }
});

test('rare crafting ingredients are obtainable from existing dungeon, boss or treasure loot', async () => {
  const crafting = await read('zanaat.js');
  const dungeon = await read('zindan.js');
  const layeredDungeon = await read('katlizindan.js');
  const boss = await read('iblisavasi.js');
  const treasure = await read('hazineac.js');
  const sources = dungeon + layeredDungeon + boss + treasure;
  const materials = [
    'Orman Kristali',
    'Eski Mahzen Anahtarı',
    'Kadim Rün Parçası',
    'Kuzey Mührü',
    '🩸 İblis Komutanının Kanı',
    '🐉 Ejderha Pulu',
    '🪄 Frieren’in Kadim Asası'
  ];
  for (const material of materials) {
    assert.ok(crafting.includes(`item: '${material}'`), 'material has no crafting use: ' + material);
    assert.ok(sources.includes(material), 'crafting ingredient has no known loot source: ' + material);
  }
});


test('usable item definitions match slash-command choices and inventory keys', async () => {
  const source = await read('esyakullan.js');
  const definitions = source.match(/const usableItems = \{([\s\S]*?)\n\};/);
  assert.ok(definitions, 'usable item catalog must exist');
  const ids = [...definitions[1].matchAll(/^  ([a-z_]+):/gm)].map(match => match[1]);
  const choicesBlock = source.match(/\.addChoices\(([\s\S]*?)\n        \)\n    \),/);
  assert.ok(choicesBlock, 'usable item slash choices must exist');
  const choiceIds = [...choicesBlock[1].matchAll(/value: '([^']+)'/g)].map(match => match[1]);
  assert.deepEqual([...choiceIds].sort(), [...ids].sort(), 'every usable item must have a matching slash choice');
  assert.equal(new Set(choiceIds).size, choiceIds.length, 'usable item choices must not contain duplicates');
  for (const block of definitions[1].split(/(?=^  [a-z_]+:)/m).filter(Boolean).slice(1)) {
    const name = block.match(/name: '([^']+)'/);
    const key = block.match(/key: '([^']+)'/);
    assert.ok(name && key, 'every usable item needs a display name and inventory key');
    assert.equal(key[1], name[1], 'inventory key must match display name: ' + name[1]);
  }
});

test('item-use missing inventory message does not assume every item comes from the market', async () => {
  const source = await read('esyakullan.js');
  assert.match(source, /Bu eşya envanterinde bulunmuyor/);
  assert.doesNotMatch(source, /Önce \/market üzerinden satın alman gerekiyor/);
});


test('market consumable names stay compatible with item-use inventory keys', async () => {
  const market = await read('market.js');
  const use = await read('esyakullan.js');
  const usableBlock = use.match(/const usableItems = \{([\s\S]*?)\n\};/);
  assert.ok(usableBlock, 'usable item catalog must exist');
  const usable = new Map();
  for (const block of usableBlock[1].split(/(?=^  [a-z_]+:)/m).filter(Boolean)) {
    const id = block.match(/^\s*([a-z_]+):/);
    const name = block.match(/name: '([^']+)'/);
    const key = block.match(/key: '([^']+)'/);
    if (id && name && key) usable.set(id[1], { name: name[1], key: key[1] });
  }
  const marketBlock = market.match(/export const marketItems = \[([\s\S]*?)\n\];/);
  assert.ok(marketBlock, 'market catalog must exist');
  for (const block of marketBlock[1].split(/(?=^ \{ id:)/m).filter(Boolean)) {
    const id = block.match(/id:'([^']+)'/);
    const name = block.match(/name:'([^']+)'/);
    if (!id || !name || !usable.has(id[1])) continue;
    assert.equal(name[1], usable.get(id[1]).key, 'market purchase must create the inventory key expected by item-use: ' + id[1]);
  }
});


test('market catalog stays within the Frieren and Poagaca fantasy theme', async () => {
  const market = await read('market.js');
  for (const crossoverId of ['goku_orb', 'ninja_scroll', 'cursed_charm', 'breathing_mask', 'survey_badge']) {
    assert.doesNotMatch(market.match(/export const marketItems = \[([\s\S]*?)\n\];/)?.[1] || '', new RegExp("id:'" + crossoverId + "'"),
      'off-theme crossover item must not be purchasable in the market: ' + crossoverId);
  }
  const usable = await read('esyakullan.js');
  for (const legacyId of ['goku_orb', 'ninja_scroll', 'cursed_charm', 'breathing_mask', 'survey_badge']) {
    assert.match(usable, new RegExp('^  ' + legacyId + ':', 'm'),
      'legacy inventory items must remain usable after market cleanup: ' + legacyId);
  }
});


test('legacy Frieren-themed consumables remain obtainable without renaming stored inventory keys', async () => {
  const treasure = await read('hazineac.js');
  const usable = await read('esyakullan.js');
  const supplementalLoot = treasure.match(/const UTILITY_LOOT = \[([\s\S]*?)\n\];/);
  assert.ok(supplementalLoot, 'supplemental treasure loot must exist');
  for (const item of [
    '✨ Eski Büyü Kalıntısı',
    '🗝️ Harabe Anahtarı',
    '🩸 İblis Özü',
    '🌼 Kurutulmuş Çiçek',
    '🥐 Büyülü Poğaça'
  ]) {
    assert.ok(supplementalLoot[1].includes(item), 'legacy themed item needs an obtainable source: ' + item);
    assert.ok(usable.includes("key: '" + item + "'"), 'item-use must keep the exact legacy inventory key: ' + item);
  }
  assert.match(treasure, /roll < 0\.10[\s\S]*?UTILITY_LOOT/);
  assert.match(treasure, /roll < 0\.04[\s\S]*?RARE_LOOT\[0\]/);
  assert.match(treasure, /roll < 0\.01[\s\S]*?RARE_LOOT\[1\]/);
});


test('party dungeon applies equipment HP bonuses proportionally to current HP', async () => {
  const source = await read('zindan.js');
  assert.match(source, /hp:\s*Math\.min\([\s\S]*?Math\.round\(\(Number\(player\.hp\)\s*\/\s*Math\.max\(1, Number\(player\.max_hp\)\)\)\s*\*\s*Math\.min\(2000, Number\(player\.max_hp\) \+ gear\.hp\)\)/,
    'dungeon current HP should scale with equipment-adjusted max HP');
  assert.match(source, /maxHp:\s*Math\.min\(2000, Number\(player\.max_hp\) \+ gear\.hp\)/,
    'dungeon max HP should include equipment HP bonuses');
});
