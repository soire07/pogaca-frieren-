import { withIsolatedTestSchema, ensureUser, pool } from '../database/db.js';
import { buildCommandEvidence } from './command-test-evidence.js';
import { equipmentItems, equipmentBonus } from '../equipment-data.js';
import { applyEquipmentSetBonus } from '../rpg-mechanics.js';

const TEST_GUILD_PREFIX = 'frieren-test-guild-';
const TEST_USER_PREFIX = '900000000000';

function sampleValue(option) {
  if (option.type === 1 || option.type === 2) return undefined;
  switch (option.type) {
    case 3: return option.choices?.[0]?.value ?? 'test';
    case 4: return option.min_value ?? 1;
    case 5: return true;
    case 6: return { id: '900000000000000001', username: 'FrierenTest', tag: 'FrierenTest#0001', bot: false, displayAvatarURL() { return 'https://example.com/test-avatar.png'; }, toString() { return '<@900000000000000001>'; } };
    case 7: return fakeChannel();
    case 8: return { id: '900000000000000002', name: 'test-role', members: new Map(), toString() { return '<@&900000000000000002>'; } };
    case 9: return { id: '900000000000000003', username: 'FrierenTest', toString() { return '<@900000000000000003>'; } };
    case 10: return option.min_value ?? 1;
    case 11: return null;
    default: return undefined;
  }
}
function fakeChannel() {
  return {
    id: '900000000000000004',
    name: 'test-channel',
    isTextBased: () => true,
    send: async () => ({ id: 'test-message' }),
    // Simulate the Discord.js message collector API without creating a real collector.
    createMessageCollector: () => {
      const listeners = new Map();
      return {
        on(event, listener) { listeners.set(event, listener); return this; },
        stop(reason = 'user') {
          const end = listeners.get('end');
          if (end) void end([], reason);
        }
      };
    },
    toString() { return '<#900000000000000004>'; }
  };
}
function buildOptions(schemaOptions = [], overrides = {}) {
  const values = { ...overrides };
  const flat = [];
  const visit = (options) => {
    for (const option of options || []) {
      if (option.type === 1 || option.type === 2) {
        if (option.type === 1 && !values.__subcommand) values.__subcommand = option.name;
        if (option.type === 2 && !values.__subcommandGroup) values.__subcommandGroup = option.name;
        visit(option.options);
      } else {
        flat.push(option);
        if (!(option.name in values) && option.required) values[option.name] = sampleValue(option);
      }
    }
  };
  visit(schemaOptions);
  const get = (name) => values[name] ?? null;
  return {
    getSubcommand: (_required = false) => values.__subcommand ?? schemaOptions.find(x => x.type === 1)?.name ?? null,
    getSubcommandGroup: (_required = false) => values.__subcommandGroup ?? null,
    getString: (name, required = false) => { const v = get(name); return v == null && required ? sampleValue(flat.find(x => x.name === name) || { type: 3 }) : v; },
    getInteger: (name, required = false) => { const v = get(name); return v == null && required ? 1 : v; },
    getNumber: (name, required = false) => { const v = get(name); return v == null && required ? 1 : v; },
    getBoolean: (name, required = false) => { const v = get(name); return v == null && required ? true : v; },
    getUser: (name) => get(name) || sampleValue(flat.find(x => x.name === name) || { type: 6 }),
    getMember: (name) => makeMember(get(name)?.id || '900000000000000001'),
    getChannel: (name) => get(name) || fakeChannel(),
    getRole: (name) => get(name) || sampleValue({ type: 8 }),
    getMentionable: (name) => get(name) || sampleValue({ type: 9 }),
    getAttachment: (name) => get(name),
    getFocused: () => ({ name: '', value: '' }),
    _values: values,
    _schema: flat
  };
}
function makeMember(id) {
  const roles = { cache: new Map(), add: async () => {}, remove: async () => {} };
  return {
    id, user: { id, username: 'FrierenTest', tag: 'FrierenTest#0001', bot: false, toString() { return '<@' + id + '>'; } },
    displayName: 'FrierenTest', nickname: null, displayAvatarURL: () => 'https://example.com/test-avatar.png', roles, permissions: { has: () => true },
    setNickname: async () => ({ simulated: true }),
    communicationDisabledUntilTimestamp: null, toString() { return '<@' + id + '>'; }
  };
}
function makeInteraction(command, options, guildId, effects) {
  const user = { id: '900000000000000001', username: 'FrierenTest', tag: 'FrierenTest#0001', bot: false, displayAvatarURL: () => 'https://example.com/test-avatar.png', toString() { return '<@' + this.id + '>'; } };
  const member = makeMember(user.id);
  const channel = fakeChannel();
  const guild = {
    id: guildId, name: 'Frieren Isolated Test Guild', memberCount: 1,
    members: {
      cache: new Map([[user.id, member]]),
      fetch: async (id) => makeMember(typeof id === 'string' ? id : user.id),
    },
    roles: { cache: new Map(), fetch: async (id) => ({ id, name: 'test-role', members: new Map() }) },
    channels: { cache: new Map([[channel.id, channel]]), fetch: async () => channel },
    bans: { fetch: async () => new Map() },
    commands: { cache: new Map() }
  };
  const client = { commands: new Map(), user: { id: '900000000000000099', username: 'FrierenTestBot' }, users: { fetch: async id => ({ id, username: 'FrierenTest' }) } };
  const interaction = {
    id: 'test-interaction-' + command.data.name, commandName: command.data.name, command, options, user, member, guild, guildId, channel, channelId: channel.id, client,
    memberPermissions: { has: () => true }, appPermissions: { has: () => true }, permissions: { has: () => true },
    replied: false, deferred: false, isChatInputCommand: () => true, isButton: () => false, isStringSelectMenu: () => false, isModalSubmit: () => false,
    inGuild: () => true, isRepliable: () => true,
    reply: async payload => { interaction.replied = true; effects.push({ type: 'reply', payload: normalizePayload(payload) }); return payload; },
    deferReply: async payload => { interaction.deferred = true; effects.push({ type: 'deferReply', payload: normalizePayload(payload) }); },
    editReply: async payload => { interaction.replied = true; effects.push({ type: 'editReply', payload: normalizePayload(payload) }); return payload; },
    followUp: async payload => { effects.push({ type: 'followUp', payload: normalizePayload(payload) }); return payload; },
    update: async payload => { effects.push({ type: 'update', payload: normalizePayload(payload) }); return payload; },
    deferUpdate: async () => { interaction.deferred = true; effects.push({ type: 'deferUpdate' }); },
    respond: async payload => { effects.push({ type: 'respond', payload: normalizePayload(payload) }); },
    showModal: async payload => { effects.push({ type: 'showModal', payload: normalizePayload(payload) }); },
    deleteReply: async () => { effects.push({ type: 'deleteReply' }); },
    fetchReply: async () => ({ id: 'test-reply' })
  };
  client.commands.set(command.data.name, command);
  return interaction;
}
function normalizePayload(payload) {
  if (typeof payload === 'string') return { content: payload.slice(0, 1800) };
  if (!payload || typeof payload !== 'object') return payload;
  return {
    content: typeof payload.content === 'string' ? payload.content.slice(0, 1800) : undefined,
    embeds: Array.isArray(payload.embeds) ? payload.embeds.map(e => {
      try { return typeof e.toJSON === 'function' ? e.toJSON() : e; } catch { return '[embed]'; }
    }).slice(0, 5) : undefined,
    components: Array.isArray(payload.components) ? payload.components.length : undefined,
    files: Array.isArray(payload.files) ? payload.files.length : undefined
  };
}

export async function runCommandTestSuite(commandMap, requestedNames = []) {
  const commands = requestedNames.length
    ? requestedNames.map(name => commandMap.get(name)).filter(Boolean)
    : [...commandMap.values()];
  const unknown = requestedNames.filter(name => !commandMap.has(name));
  return withIsolatedTestSchema(async () => {
    const results = [];
    let index = 0;
    for (const command of commands) {
      index++;
      const guildId = TEST_GUILD_PREFIX + index;
      const userId = TEST_USER_PREFIX + String(index).padStart(6, '0');
      const effects = [];
      try {
        await ensureUser(guildId, userId);
        const schema = typeof command.data?.toJSON === 'function' ? command.data.toJSON() : command.data;
        const commandName = schema?.name || 'unknown';
        if (commandName === 'buyupratik') {
          await pool.query('UPDATE users SET coins=100, mana=100 WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
        }
        const behavioralChecks = [];
        if (commandName === 'ekipman') {
          await pool.query(
            'UPDATE users SET level=45,hp=100,max_hp=100,mana=100,max_mana=100 WHERE guild_id=$1 AND user_id=$2',
            [guildId, userId]
          );
          const blade = equipmentItems.find(item => item.id === 'demon_blade');
          const armor = equipmentItems.find(item => item.id === 'demon_armor');
          await pool.query(
            'INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,$3,1),($1,$2,$4,1)',
            [guildId, userId, blade.name, armor.name]
          );
          const executeAction = async values => {
            const actionEffects = [];
            const actionOptions = buildOptions(schema?.options, values);
            const actionInteraction = makeInteraction(command, actionOptions, guildId, actionEffects);
            actionInteraction.user.id = userId;
            actionInteraction.member = makeMember(userId);
            await command.execute(actionInteraction);
            effects.push(...actionEffects);
          };

          await executeAction({ islem: 'equip', esya: 'demon_blade', yuva: 'weapon' });
          await executeAction({ islem: 'equip', esya: 'demon_armor', yuva: 'armor' });
          const equippedBefore = await pool.query(
            'SELECT slot,item_key FROM user_equipment WHERE guild_id=$1 AND user_id=$2 ORDER BY slot',
            [guildId, userId]
          );
          const equippedItems = equippedBefore.rows
            .map(row => equipmentItems.find(item => item.name === row.item_key))
            .filter(Boolean);
          const activeSet = applyEquipmentSetBonus(equippedItems, equipmentBonus(equippedItems));
          const inventoryBefore = await pool.query(
            'SELECT item_key,quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 ORDER BY item_key',
            [guildId, userId]
          );
          await executeAction({ islem: 'unequip', yuva: 'armor' });
          const equippedAfter = await pool.query(
            'SELECT slot,item_key FROM user_equipment WHERE guild_id=$1 AND user_id=$2',
            [guildId, userId]
          );
          const remainingItems = equippedAfter.rows
            .map(row => equipmentItems.find(item => item.name === row.item_key))
            .filter(Boolean);
          const inactiveSet = applyEquipmentSetBonus(remainingItems, equipmentBonus(remainingItems));
          const inventoryAfter = await pool.query(
            'SELECT quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key=$3',
            [guildId, userId, armor.name]
          );
          behavioralChecks.push(
            { name: 'Silah ve zırh kuşanma kaydı', expected: '2 ekipman yuvası dolu', actual: equippedBefore.rowCount + ' ekipman yuvası dolu', passed: equippedBefore.rowCount === 2 && equippedBefore.rows.some(row => row.slot === 'weapon' && row.item_key === blade.name) && equippedBefore.rows.some(row => row.slot === 'armor' && row.item_key === armor.name) },
            { name: 'Efsanevi set bonusu', expected: '+4 saldırı ve +25 HP; toplam saldırı 20, HP bonusu 85', actual: 'saldırı ' + activeSet.attack + ', HP bonusu ' + activeSet.hp + ', set: ' + activeSet.setText, passed: activeSet.attack === 20 && activeSet.hp === 85 && activeSet.setText === 'Efsanevi set: +4 saldırı, +25 HP' },
            { name: 'Kuşanma envanter eşyasını tüketmez', expected: 'iki eşya da miktar 1 olarak kalır', actual: inventoryBefore.rows.map(row => row.quantity).join(', '), passed: inventoryBefore.rowCount === 2 && inventoryBefore.rows.every(row => Number(row.quantity) === 1) },
            { name: 'Zırh çıkarma ve set bonusunun kapanması', expected: 'yalnızca silah kalır; set bonusu sıfırlanır', actual: equippedAfter.rowCount + ' ekipman kaldı; saldırı ' + inactiveSet.attack + ', HP bonusu ' + inactiveSet.hp + ', set: ' + inactiveSet.setText, passed: equippedAfter.rowCount === 1 && equippedAfter.rows[0].slot === 'weapon' && inactiveSet.attack === 16 && inactiveSet.hp === 0 && inactiveSet.setText === null },
            { name: 'Çıkarılan zırh envantere geri döner', expected: 'zırh miktarı 1', actual: inventoryAfter.rows[0] ? 'miktar ' + inventoryAfter.rows[0].quantity : 'envanter kaydı yok', passed: Number(inventoryAfter.rows[0]?.quantity) === 1 }
          );
        } else if (commandName === 'esyakullan') {
          const potionKey = '🧪 Şifa İksiri';
          await pool.query(
            'UPDATE users SET hp=40,max_hp=100,mana=20,max_mana=100 WHERE guild_id=$1 AND user_id=$2',
            [guildId, userId]
          );
          await pool.query(
            'INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,$3,1)',
            [guildId, userId, potionKey]
          );
          const options = buildOptions(schema?.options, { esya: 'healing_potion' });
          const interaction = makeInteraction(command, options, guildId, effects);
          interaction.user.id = userId;
          interaction.member = makeMember(userId);
          await command.execute(interaction);
          const userState = await pool.query(
            'SELECT hp,max_hp,mana,max_mana,items_used_count FROM users WHERE guild_id=$1 AND user_id=$2',
            [guildId, userId]
          );
          const potionState = await pool.query(
            'SELECT quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key=$3',
            [guildId, userId, potionKey]
          );
          const user = userState.rows[0];
          behavioralChecks.push(
            { name: 'Şifa iksiri HP yenilemesi', expected: '40 → 100 / 100', actual: user ? 'HP ' + user.hp + ' / ' + user.max_hp : 'kullanıcı kaydı yok', passed: Number(user?.hp) === 100 && Number(user?.max_hp) === 100 },
            { name: 'Şifa iksiri mana yenilemesi', expected: '20 → 45 / 100', actual: user ? 'Mana ' + user.mana + ' / ' + user.max_mana : 'kullanıcı kaydı yok', passed: Number(user?.mana) === 45 && Number(user?.max_mana) === 100 },
            { name: 'Şifa iksiri tüketimi ve sayaç', expected: 'envanterden silinmiş; items_used_count=1', actual: (potionState.rows[0] ? 'envanter miktarı ' + potionState.rows[0].quantity : 'envanterden silinmiş') + '; kullanım sayısı ' + user?.items_used_count, passed: potionState.rowCount === 0 && Number(user?.items_used_count) === 1 }
          );
        } else {
          const options = buildOptions(schema?.options, { user: undefined });
          const interaction = makeInteraction(command, options, guildId, effects);
          interaction.user.id = userId;
          interaction.member = makeMember(userId);
          await command.execute(interaction);
        }

        if (commandName === 'buyupratik') {
          const userState = await pool.query('SELECT coins, mana FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const masteryState = await pool.query('SELECT casts, mastery_level FROM spell_mastery WHERE guild_id=$1 AND user_id=$2 AND spell_key=$3', [guildId, userId, 'zoltraak']);
          const user = userState.rows[0];
          const mastery = masteryState.rows[0];
          behavioralChecks.push(
            { name: 'Altın bakiyesi', expected: '100 → 75 (-25)', actual: user ? '100 → ' + user.coins : 'Kullanıcı satırı bulunamadı', passed: Number(user?.coins) === 75 },
            { name: 'Mana bakiyesi', expected: '100 → 92 (-8)', actual: user ? '100 → ' + user.mana : 'Kullanıcı satırı bulunamadı', passed: Number(user?.mana) === 92 },
            { name: 'Zoltraak ustalık kaydı', expected: 'casts=1, mastery_level=0', actual: mastery ? 'casts=' + mastery.casts + ', mastery_level=' + mastery.mastery_level : 'Ustalık kaydı bulunamadı', passed: Number(mastery?.casts) === 1 && Number(mastery?.mastery_level) === 0 }
          );
        }
        const evidence = buildCommandEvidence({ responseCount: effects.length, behavioralChecks });
        results.push({
          command: commandName,
          ...evidence,
          evidenceType: behavioralChecks.length ? 'synthetic-discord-interaction+isolated-postgresql-state-assertions' : 'handler-executed-with-synthetic-discord-interaction',
          automaticallyObserved: true,
          responseCount: effects.length,
          responses: effects.slice(0, 4),
          behavioralChecks,
          error: evidence.status === 'FAIL' ? evidence.detail : null
        });
      } catch (error) {
        results.push({
          command: command.data?.name || 'unknown', status: 'FAIL',
          expected: 'Komut işleyicisi hata atmadan tamamlanmalı ve en az bir Discord yanıtı/etkisi üretmeli.',
          actual: 'İşleyici hata fırlattı: ' + String(error?.message || error).slice(0, 500),
          comparison: 'MISMATCH: işleyici hata verdi',
          evidenceType: 'handler-executed-with-synthetic-discord-interaction',
          automaticallyObserved: true, responseCount: effects.length,
          responses: effects.slice(0, 4),
          error: String(error?.stack || error?.message || error).slice(0, 1800)
        });
      }
    }
    for (const name of unknown) results.push({ command: name, status: 'FAIL', expected: 'Komut kayıtlı olmalı.', actual: 'Komut bulunamadı.', comparison: 'MISMATCH', error: 'Komut bulunamadı.' });
    return {
      title: 'Poğaça Frieren isolated command handler test report',
      generatedAt: new Date().toISOString(),
      executionMode: 'synthetic Discord interaction; isolated PostgreSQL schema frieren_test',
      note: 'Bu rapor gerçek Discord kullanıcısının etkileşimi değildir. Yanıt kaydı tek başına INCONCLUSIVE sayılır. PASS yalnızca komuta özel davranış doğrulamaları ve yalıtılmış PostgreSQL durum kontrolleri geçtiğinde verilir. /buyupratik için altın, mana ve büyü ustalığı; /ekipman için kuşanma, çıkarma, envanter ve efsanevi set bonusu; /esyakullan için HP, mana ve eşya tüketimi yalıtılmış PostgreSQL üzerinde doğrulanır. Diğer komutlar için davranış testi eklenene kadar sonuç kesin değildir.',
      summary: {
        total: results.length,
        pass: results.filter(x => x.status === 'PASS').length,
        fail: results.filter(x => x.status === 'FAIL').length,
        inconclusive: results.filter(x => x.status === 'INCONCLUSIVE').length,
        blocked: 0
      },
      results
    };
  });
}
