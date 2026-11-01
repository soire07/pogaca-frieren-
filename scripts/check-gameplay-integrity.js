import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('trade offers are persistent, expiring and single-use', async () => {
  const schema = await read('database/db.js');
  const handler = await read('index.js');
  const transaction = await read('trade-transaction.js');
  const command = await read('takasteklif.js');
  assert.match(schema, /CREATE TABLE IF NOT EXISTS trade_offers/);
  assert.ok(schema.includes("status IN ('pending','accepted','declined','expired','invalid')"), 'trade status constraint missing');
  assert.match(schema, /idx_trade_offers_pending_sender ON trade_offers\(guild_id, from_user_id, character_name, expires_at\) WHERE status='pending'/);
  assert.match(command, /setAutocomplete\(true\)/);
  assert.match(command, /FOR UPDATE/);
  assert.match(command, /reservedAmount/);
  assert.match(transaction, /reservedForOthers/);
  assert.match(command, /NOW\(\)\+INTERVAL '5 minutes'/);
  assert.match(transaction, /SELECT \* FROM trade_offers WHERE offer_id=\$1 AND guild_id=\$2 FOR UPDATE/);
  assert.ok(transaction.includes('acceptingUserId !== offer.to_user_id'));
  assert.match(transaction, /status='accepted'/);
  assert.match(transaction, /quantity=quantity-\$4/);
  assert.match(transaction, /quantity=anime_character_collection\.quantity\+EXCLUDED\.quantity/);
});

test('daily mission progress and reward claim stay in one transaction', async () => {
  const source = await read('gunlukgorev.js');
  const begin = source.indexOf("await db.query('BEGIN')");
  const progress = source.indexOf('getDailyQuestObjectiveSql(mission.objective_type)');
  const claim = source.indexOf('INSERT INTO daily_mission_claims');
  const commit = source.indexOf("await db.query('COMMIT')", claim);
  assert.ok(begin >= 0 && progress > begin && claim > progress && commit > claim,
    'progress must be checked after BEGIN and before the claim is committed');
  assert.match(source, /if \(!progress\.rows\[0\]\?\.done\)/);
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


test('class-specific daily quests use the guild catalog, validate progress transactionally and allow one class reward per day', async () => {
  const source = await read('gunlukgorev.js');
  const catalog = await read('owner-rpg-quests.js');
  for (const [key, label] of [['class_buyucu','Büyücü'], ['class_muhafiz','Muhafız'], ['class_sifaci','Şifacı'], ['class_gezgin','Gezgin']]) {
    assert.ok(catalog.includes("key: '" + key + "'"), 'missing class mission: ' + key);
    assert.ok(catalog.includes("className: '" + label + "'"), 'missing class gate: ' + label);
  }
  assert.ok(source.includes("SELECT class_name FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE"));
  assert.ok(source.includes("mission_key IN (SELECT quest_key FROM guild_daily_quests WHERE guild_id=$1 AND class_name IS NOT NULL)"));
  assert.ok(source.includes("mission_key='__class_daily_reward__'"));
  assert.ok(source.includes("VALUES($1,$2,CURRENT_DATE,'__class_daily_reward__')"));
  assert.ok(source.includes("mission_key LIKE 'class_%'"));
  assert.ok(catalog.includes('FROM spell_mastery WHERE'));
  assert.ok(catalog.includes('last_boss_at::date = CURRENT_DATE'));
  assert.ok(catalog.includes('last_item_used_at::date = CURRENT_DATE'));
  assert.ok(catalog.includes('last_exploration_at::date = CURRENT_DATE'));
  const begin = source.indexOf("await db.query('BEGIN')");
  const classLock = source.indexOf("SELECT class_name FROM users", begin);
  const progress = source.indexOf('getDailyQuestObjectiveSql(mission.objective_type)', begin);
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


test('party combat applies class discounts/healing and uses shared HP/mana persistence conversion', async () => {
  const dungeon = await read('katlizindan.js');
  const raid = await read('ortakboss.js');
  for (const [name, source] of [['dungeon', dungeon], ['raid', raid]]) {
    assert.match(source, /applyClassManaCost\(10, (?:p|f)\.class_name|applyClassManaCost\(10, f\.className\)/);
    assert.match(source, /applyClassManaCost\(18, (?:p|f)\.class_name|applyClassManaCost\(18, f\.className\)/);
    assert.match(source, /applyClassHealing\(26, (?:p|f)\.class_name|applyClassHealing\(26, f\.className\)/);
    assert.match(source, /restoreResourceRatio/);
    assert.match(source, /persistedHpNow/);
    assert.match(source, /persistedManaNow/);
    assert.match(source, /restoreResourceRatio\(/, name + ': persistent resource conversion helper used');
  }
});


test('solo demon battle persists HP and mana using the shared base-stat ratio helper', async () => {
  const source = await read('iblisavasi.js');
  assert.match(source, /const toPersistentHp = hp => restoreResourceRatio\(hp, playerMaxHp, stats\.max_hp\)/);
  assert.match(source, /const toPersistentMana = mana => restoreResourceRatio\(mana, playerMaxMana, stats\.max_mana\)/);
  assert.equal((source.match(/toPersistentHp\(playerHp\)/g) || []).length, 2);
  assert.equal((source.match(/toPersistentMana\(playerMana\)/g) || []).length, 2);
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


test('item use persists base HP and mana without permanently adding temporary equipment bonuses', async () => {
  const source = await read('esyakullan.js');
  assert.match(source, /mana = LEAST\(LEAST\(2000, max_mana \+ \$8\), mana \+ \$5\)/);
  assert.match(source, /hp = LEAST\(LEAST\(2000, max_hp \+ \$7\), hp \+ \$6\)/);
  assert.doesNotMatch(source, /max_mana \+ \$8 \+ \$12/);
  assert.doesNotMatch(source, /max_hp \+ \$7 \+ \$11/);
  assert.match(source, /Math\.min\(1, Number\(user\.hp\) \/ Math\.max\(1, Number\(user\.max_hp\)\)\)/);
  assert.match(source, /Math\.min\(1, Number\(user\.mana\) \/ Math\.max\(1, Number\(user\.max_mana\)\)\)/);
});


test('item-use SQL bind count exactly matches its highest placeholder', async () => {
  const source = await read('esyakullan.js');
  const start = source.indexOf('const updated = await db.query(');
  assert.ok(start >= 0, 'item-use UPDATE query missing');
  const end = source.indexOf('\n      );', start);
  assert.ok(end > start, 'item-use SQL query closing not found');
  const call = source.slice(start, end);
  const placeholders = [...call.matchAll(/\$(\d+)/g)].map(match => Number(match[1]));
  assert.ok(placeholders.length > 0, 'SQL placeholders missing');
  const maxPlaceholder = Math.max(...placeholders);
  const valuesMatch = call.match(/,\s*\[([\s\S]*?)\]\s*$/);
  assert.ok(valuesMatch, 'item-use SQL parameter array missing');
  const parameterCount = valuesMatch[1].split(',').length;
  assert.equal(parameterCount, maxPlaceholder, 'PostgreSQL bind values must match the highest placeholder');
});

test('equipment equip and unequip are user-scoped transactions and never permanently add gear stats', async () => {
  const source = await read('ekipman.js');
  const unequipAction = source.indexOf("if (action === 'unequip')");
  const unequipBegin = source.indexOf("await db.query('BEGIN')", unequipAction);
  const unequipDelete = source.indexOf('DELETE FROM user_equipment', unequipBegin);
  const unequipClamp = source.indexOf('UPDATE users SET hp=LEAST(hp,$3), mana=LEAST(mana,$4)', unequipDelete);
  const unequipCommit = source.indexOf("await db.query('COMMIT')", unequipClamp);
  assert.ok(unequipAction >= 0 && unequipBegin > unequipAction && unequipDelete > unequipBegin && unequipClamp > unequipDelete && unequipCommit > unequipClamp,
    'unequip must remove gear, clamp resources and commit transactionally');

  const equipItem = source.indexOf("const item = equipmentItems.find");
  const equipBegin = source.indexOf("await db.query('BEGIN')", equipItem);
  const equipInsert = source.indexOf('INSERT INTO user_equipment', equipBegin);
  const equipClamp = source.indexOf('UPDATE users SET hp=LEAST(hp,$3), mana=LEAST(mana,$4)', equipInsert);
  const equipCommit = source.indexOf("await db.query('COMMIT')", equipClamp);
  assert.ok(equipItem >= 0 && equipBegin > equipItem && equipInsert > equipBegin && equipClamp > equipInsert && equipCommit > equipClamp,
    'equip must write gear, clamp resources and commit transactionally');
  assert.equal((source.match(/WHERE guild_id=\$1 AND user_id=\$2/g) || []).length >= 4, true,
    'equipment reads and writes must be scoped to guild/user');
  assert.match(source, /SELECT hp,max_hp,mana,max_mana FROM users WHERE guild_id=\$1 AND user_id=\$2 FOR UPDATE/);
  assert.doesNotMatch(source, /UPDATE users SET[^;]*(?:max_hp|max_mana)\s*=/,
    'equipping gear must not persist temporary max HP/mana bonuses to base stats');
});


test('interaction dispatch catches component-handler and database-acquisition failures safely', async () => {
  const source = await read('index.js');
  assert.ok(source.includes('async function sendPrivateInteractionError(interaction, content)'));
  assert.ok(source.includes('client.on(Events.InteractionCreate, async interaction => {\n  try {'));
  assert.ok(source.includes('if (interaction.deferred || interaction.replied) await interaction.followUp(payload)'));
  const tradeTransaction = await read('trade-transaction.js');
  assert.ok(source.includes('const result = await resolveTradeOffer(pool'));
  assert.ok(tradeTransaction.includes("await db.query('ROLLBACK').catch(() => {})"));
  assert.ok(tradeTransaction.includes('finally {\n    db.release();\n  }'));
});


test('runtime startup does not clear or race slash-command registration', async () => {
  const source = await read('index.js');
  assert.ok(source.includes('Slash komutları yalnızca deploy-commands.js / GitHub Actions tarafından kaydedilir.'));
  assert.ok(!source.includes('guild.commands.set([])'));
  assert.ok(!source.includes('application.commands.set('));
  const deploy = await read('deploy-commands.js');
  assert.ok(deploy.includes('Routes.applicationGuildCommands'));
  assert.ok(deploy.includes('Routes.applicationCommands'));
});


test('co-op raid acknowledges the Discord interaction before database work and types spell mastery casts explicitly', async () => {
  const source = await read('ortakboss.js');
  const ack = source.indexOf('await interaction.deferReply()');
  const ensure = source.indexOf('await ensureUser(');
  const firstDb = source.indexOf('pool.connect()');
  assert.ok(ack >= 0 && ensure > ack && firstDb > ack,
    'raid command must defer its reply before database work');
  assert.match(source, /const msg = await interaction\.editReply\(/,
    'invitation message must edit the deferred reply');
  assert.match(source, /VALUES \(\$1,\$2,'zoltraak',\$3::integer,LEAST\(10,FLOOR\(\$3::numeric\/10\.0\)::int\),NOW\(\)\)/,
    'spell mastery casts parameter must have explicit integer/numeric casts');
});


test('inventory acknowledges privately before user creation and database reads', async () => {
  const source = await read('envanter.js');
  const ack = source.indexOf('await interaction.deferReply({ ephemeral: true })');
  const ensure = source.indexOf('await ensureUser(');
  const firstQuery = source.indexOf('await pool.query(');
  assert.ok(ack >= 0 && ensure > ack && firstQuery > ack,
    'inventory must defer its ephemeral response before database work');
  assert.ok(source.includes('await interaction.editReply({'),
    'inventory must edit the deferred response');
  assert.ok(source.includes('embeds: [embed]'));
  assert.ok(!source.includes('await interaction.reply({\n      embeds: [embed]'),
    'inventory must not reply a second time after deferring');
});


test('same-player equipment mutations lock the player row before reading or writing equipped slots', async () => {
  const source = await read('ekipman.js');

  const unequipAction = source.indexOf("if (action === 'unequip')");
  const unequipBegin = source.indexOf("await db.query('BEGIN')", unequipAction);
  const unequipLock = source.indexOf('SELECT hp,max_hp,mana,max_mana FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE', unequipBegin);
  const unequipDelete = source.indexOf('DELETE FROM user_equipment', unequipBegin);
  assert.ok(unequipAction >= 0 && unequipBegin > unequipAction && unequipLock > unequipBegin && unequipLock < unequipDelete,
    'unequip must serialize on the player row before deleting an equipped slot');

  const equipItem = source.indexOf('const item = equipmentItems.find(entry => entry.id === itemId)');
  const equipBegin = source.indexOf("await db.query('BEGIN')", equipItem);
  const equipLock = source.indexOf('SELECT hp,max_hp,mana,max_mana FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE', equipBegin);
  const equipOwned = source.indexOf('SELECT quantity FROM inventory', equipBegin);
  const equipSlots = source.indexOf('SELECT slot FROM user_equipment', equipBegin);
  const equipWrite = source.indexOf('INSERT INTO user_equipment', equipBegin);
  assert.ok(equipItem >= 0 && equipBegin > equipItem && equipLock > equipBegin && equipLock < equipOwned && equipOwned < equipSlots && equipSlots < equipWrite,
    'equip must lock the player first, then inventory, before reading or writing equipped slots');
});


test('market purchases, item consumption and equipment changes use one player-first lock order', async () => {
  const market = await read('market.js');
  const itemUse = await read('esyakullan.js');
  const equipment = await read('ekipman.js');

  const purchaseStart = market.indexOf('export async function buyMarketItem');
  const purchaseBegin = market.indexOf("await db.query('BEGIN')", purchaseStart);
  const purchasePlayerLock = market.indexOf('UPDATE users SET coins=coins-$3', purchaseBegin);
  const purchaseInventoryWrite = market.indexOf('INSERT INTO inventory', purchaseBegin);
  assert.ok(purchaseStart >= 0 && purchaseBegin > purchaseStart && purchasePlayerLock > purchaseBegin && purchaseInventoryWrite > purchasePlayerLock,
    'market purchase must lock/debit the player before writing inventory');

  const useBegin = itemUse.indexOf("await db.query('BEGIN')");
  const usePlayerLock = itemUse.indexOf('SELECT user_id FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE', useBegin);
  const useInventoryLock = itemUse.indexOf('SELECT quantity FROM inventory', useBegin);
  const usePlayerUpdate = itemUse.indexOf('UPDATE users SET', useInventoryLock);
  assert.ok(useBegin >= 0 && usePlayerLock > useBegin && usePlayerLock < useInventoryLock && useInventoryLock < usePlayerUpdate,
    'item use must lock the player before inventory and apply effects inside the same transaction');

  const equipBegin = equipment.indexOf("await db.query('BEGIN')", equipment.indexOf('const item = equipmentItems.find(entry => entry.id === itemId)'));
  const equipPlayerLock = equipment.indexOf('SELECT hp,max_hp,mana,max_mana FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE', equipBegin);
  const equipInventoryLock = equipment.indexOf('SELECT quantity FROM inventory', equipBegin);
  const equipWrite = equipment.indexOf('INSERT INTO user_equipment', equipBegin);
  assert.ok(equipBegin >= 0 && equipPlayerLock > equipBegin && equipPlayerLock < equipInventoryLock && equipInventoryLock < equipWrite,
    'equipment changes must use the same player-first lock order');
});


test('trade acceptance serializes player, offer and collection rows in one stable lock order', async () => {
  const handler = await read('index.js');
  const transaction = await read('trade-transaction.js');
  const command = await read('takasteklif.js');
  assert.ok(handler.includes('resolveTradeOffer(pool'));
  const playerLock = transaction.indexOf('SELECT user_id FROM users');
  const offerLock = transaction.indexOf('SELECT * FROM trade_offers');
  const collectionLock = transaction.indexOf('FROM anime_character_collection');
  assert.ok(playerLock >= 0 && offerLock > playerLock && collectionLock > offerLock,
    'production transaction must lock player rows, then the offer, then the collection');
  assert.ok(transaction.includes('ORDER BY user_id FOR UPDATE'),
    'both participants must be locked in deterministic order');
  const createBegin = command.indexOf("await db.query('BEGIN')");
  const createPlayerLock = command.indexOf('SELECT user_id FROM users', createBegin);
  const createCollectionLock = command.indexOf('FROM anime_character_collection', createPlayerLock);
  assert.ok(createBegin >= 0 && createPlayerLock > createBegin && createCollectionLock > createPlayerLock,
    'offer creation must use the same player-before-collection order');
});
