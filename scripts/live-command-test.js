import { withIsolatedTestSchema, ensureUser, pool } from '../database/db.js';
import { buildCommandEvidence } from './command-test-evidence.js';
import { equipmentItems, equipmentBonus } from '../equipment-data.js';
import { applyEquipmentSetBonus } from '../rpg-mechanics.js';
import { buildCoopTestUserIds } from './coop-test-users.js';
import { handleCharacterPanelInteraction } from '../karakter.js';
import { createIsolatedTestRunContext } from './isolated-test-run-context.js';


export function buildIsolatedTestGuildId(index) {
  const sequence = Number(index);
  if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence > 999) {
    throw new Error('INVALID_TEST_GUILD_SEQUENCE');
  }
  return '910000000000000' + String(sequence).padStart(3, '0');
}

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
    awaitMessageComponent: async () => { throw new Error('simulated invitation timeout'); },
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
    getUser: (name, required = false) => { const value = get(name); return value ?? (required ? sampleValue(flat.find(x => x.name === name) || { type: 6 }) : null); },
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
function makeInteraction(command, options, guildId, effects, simulation = null) {
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
  const client = { commands: new Map(), ws: { ping: 42 }, isReady: () => true, uptime: 123456, guilds: { cache: new Map([['test-guild', guild]]) }, user: { id: '900000000000000099', username: 'FrierenTestBot' }, users: { fetch: async id => ({ id, username: 'FrierenTest' }) } };
  const interaction = {
    id: 'test-interaction-' + command.data.name, commandName: command.data.name, command, options, user, member, guild, guildId, channel, channelId: channel.id, client,
    memberPermissions: { has: () => true }, appPermissions: { has: () => true }, permissions: { has: () => true },
    replied: false, deferred: false, isChatInputCommand: () => true, isButton: () => false, isStringSelectMenu: () => false, isModalSubmit: () => false,
    inGuild: () => true, isRepliable: () => true,
    reply: async payload => { interaction.replied = true; effects.push({ type: 'reply', payload: normalizePayload(payload) }); return makeSimulatedMessage(payload, simulation || { users: [user] }); },
    deferReply: async payload => { interaction.deferred = true; effects.push({ type: 'deferReply', payload: normalizePayload(payload) }); },
    editReply: async payload => { interaction.replied = true; effects.push({ type: 'editReply', payload: normalizePayload(payload) }); return makeSimulatedMessage(payload, simulation || { users: [user] }); },
    followUp: async payload => { effects.push({ type: 'followUp', payload: normalizePayload(payload) }); return payload; },
    update: async payload => { effects.push({ type: 'update', payload: normalizePayload(payload) }); return payload; },
    deferUpdate: async () => { interaction.deferred = true; effects.push({ type: 'deferUpdate' }); },
    respond: async payload => { effects.push({ type: 'respond', payload: normalizePayload(payload) }); },
    showModal: async payload => { effects.push({ type: 'showModal', payload: normalizePayload(payload) }); },
    deleteReply: async () => { effects.push({ type: 'deleteReply' }); },
    fetchReply: async () => makeSimulatedMessage({}, simulation || { users: [user] })
  };
  client.commands.set(command.data.name, command);
  return interaction;
}

function makeSimulatedMessage(payload, simulation) {
  return {
    createMessageComponentCollector({ filter } = {}) {
      const listeners = { collect: [], end: [] };
      let stopped = false;
      const collector = {
        on(event, listener) { listeners[event]?.push(listener); return this; },
        once(event, listener) { listeners[event]?.push(listener); return this; },
        stop(reason = 'test-complete') {
          if (stopped) return;
          stopped = true;
          for (const listener of listeners.end) void Promise.resolve(listener([], reason));
        }
      };
      queueMicrotask(async () => {
        const buttons = (payload?.components || []).flatMap(row =>
          (row.components || []).map(component => component.data?.custom_id).filter(Boolean)
        );
        let clicks = [];
        const inviteButtons = buttons.filter(id => id.includes(':accept:') || id.includes(':yes:'));
        const roleButtons = buttons.filter(id => id.includes(':role:'));
        const pathButton = buttons.find(id => id.includes(':path:safe:'));
        const actionButton = buttons.find(id => id.includes(':act:attack:'));
        if (inviteButtons.length) {
          clicks = inviteButtons.map(customId => ({
            customId,
            user: simulation.users.find(user => customId.endsWith(':' + user.id))
          }));
        } else if (roleButtons.length) {
          const roleIds = ['tank', 'healer', 'damage'];
          clicks = simulation.users.map((user, index) => ({
            customId: roleButtons.find(id => id.includes(':role:' + roleIds[index] + ':')) || roleButtons.find(id => id.includes(':role:damage:')),
            user
          }));
        } else if (pathButton) {
          clicks = [{ customId: pathButton, user: simulation.users[0] }];
        } else if (actionButton) {
          clicks = simulation.users.map(user => ({ customId: actionButton, user }));
        }
        for (const click of clicks) {
          if (!click.customId || !click.user) continue;
          const component = {
            ...click,
            deferUpdate: async () => {},
            reply: async () => {},
            update: async () => {}
          };
          if (filter && !filter(component)) continue;
          for (const listener of listeners.collect) await listener(component);
          if (stopped) break;
        }
        if (!stopped) collector.stop('test-complete');
      });
      return collector;
    }
  };
}

function payloadTextFromEffects(effects) {
  return effects.flatMap(effect => {
    const payload = effect?.payload;
    if (typeof payload === 'string') return [payload];
    if (!payload || typeof payload !== 'object') return [];
    const embeds = (payload.embeds || []).flatMap(embed => {
      const data = typeof embed?.toJSON === 'function' ? embed.toJSON() : (embed?.data ?? embed);
      return [
        data?.title,
        data?.description,
        ...(data?.fields || []).flatMap(field => [field?.name, field?.value]),
        data?.footer?.text,
        data?.author?.name
      ];
    });
    const components = (payload.components || []).flatMap(row => {
      if (Array.isArray(row)) return row;
      return (row?.components || []).flatMap(component => [
        component?.data?.custom_id,
        component?.data?.label,
        component?.customId,
        component?.label
      ]);
    });
    return [payload.content, ...embeds, ...components];
  }).filter(value => typeof value === 'string' && value.length).join('\n');
}

function normalizePayload(payload) {
  if (typeof payload === 'string') return { content: payload.slice(0, 1800) };
  if (!payload || typeof payload !== 'object') return payload;
  return {
    content: typeof payload.content === 'string' ? payload.content.slice(0, 1800) : undefined,
    embeds: Array.isArray(payload.embeds) ? payload.embeds.map(e => {
      try { return typeof e.toJSON === 'function' ? e.toJSON() : e; } catch { return '[embed]'; }
    }).slice(0, 5) : undefined,
    components: Array.isArray(payload.components) ? payload.components.map(row => (row.components || []).map(component => component.data?.custom_id).filter(Boolean)) : undefined,
    files: Array.isArray(payload.files) ? payload.files.length : undefined
  };
}

export async function runCommandTestSuite(commandMap, requestedNames = []) {
  const commands = requestedNames.length
    ? requestedNames.map(name => commandMap.get(name)).filter(Boolean)
    : [...commandMap.values()].filter(command => {
      const name = command?.data?.name || '';
      return !command?.internalOnly && !name.startsWith('owner-') && name !== 'owner';
    });
  const unknown = requestedNames.filter(name => !commandMap.has(name));
  const runContext = createIsolatedTestRunContext(Math.max(1, commands.length));
  return withIsolatedTestSchema(async () => {
    const results = [];
    let index = 0;
    for (const command of commands) {
      index++;
      const guildId = runContext.guildIds[index - 1];
      const userId = runContext.userId(index);
      const effects = [];
      try {
        await ensureUser(guildId, userId);
        const schema = typeof command.data?.toJSON === 'function' ? command.data.toJSON() : command.data;
        const commandName = schema?.name || 'unknown';
        if (commandName === 'buyupratik') {
          await pool.query('UPDATE users SET coins=100, mana=100 WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
        }
        const behavioralChecks = [];
        if (commandName === 'gunlukgorev') {
          await pool.query('UPDATE users SET coins=100,last_adventure_at=NOW() WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const claimMission = async questKey => {
            const actionEffects = [];
            const interaction = makeInteraction(command, buildOptions(schema?.options, { odul: questKey }), guildId, actionEffects);
            interaction.user.id = userId;
            interaction.member = makeMember(userId);
            await command.execute(interaction);
            effects.push(...actionEffects);
          };
          await claimMission('adventure');
          const first = await pool.query('SELECT coins FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const claims = await pool.query("SELECT mission_key FROM daily_mission_claims WHERE guild_id=$1 AND user_id=$2 AND mission_date=CURRENT_DATE AND mission_key='adventure'", [guildId, userId]);
          await claimMission('adventure');
          const second = await pool.query('SELECT coins FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          behavioralChecks.push(
            { name: 'Tamamlanan günlük görev ödülü', expected: '100 → 200 altın', actual: String(first.rows[0]?.coins), passed: Number(first.rows[0]?.coins) === 200 },
            { name: 'Görev ödülünün tekil kaydı', expected: 'tek adventure claim kaydı', actual: claims.rowCount + ' kayıt', passed: claims.rowCount === 1 },
            { name: 'Tekrar ödül almada çift ödeme engeli', expected: 'bakiye 200 kalmalı', actual: String(second.rows[0]?.coins), passed: Number(second.rows[0]?.coins) === 200 }
          );

          await pool.query("UPDATE users SET class_name='Muhafız',last_boss_at=NOW(),coins=0 WHERE guild_id=$1 AND user_id=$2", [guildId, userId]);
          await claimMission('class_muhafiz');
          const classBalance = await pool.query('SELECT coins FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const classClaims = await pool.query(
            "SELECT mission_key FROM daily_mission_claims WHERE guild_id=$1 AND user_id=$2 AND mission_date=CURRENT_DATE AND mission_key IN ('class_muhafiz','__class_daily_reward__')",
            [guildId, userId]
          );
          await pool.query(
            `INSERT INTO guild_daily_quests(guild_id,quest_key,title,description,objective_type,class_name,reward_coins,active,is_system)
             VALUES($1,'class_custom_trial','Özel Muhafız Görevi','Bir boss karşılaşmasına katıl','boss_fight','Muhafız',90,TRUE,FALSE)`,
            [guildId]
          );
          await claimMission('class_custom_trial');
          const classBalanceAfterSecond = await pool.query('SELECT coins FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const customClaim = await pool.query(
            "SELECT 1 FROM daily_mission_claims WHERE guild_id=$1 AND user_id=$2 AND mission_date=CURRENT_DATE AND mission_key='class_custom_trial'",
            [guildId, userId]
          );
          behavioralChecks.push(
            { name: 'Sınıfa özel görev ödülü', expected: '130 altın', actual: String(classBalance.rows[0]?.coins), passed: Number(classBalance.rows[0]?.coins) === 130 },
            { name: 'Kalıcı sınıf ödül kilidi', expected: 'class_muhafiz ve sentinel kayıtları', actual: classClaims.rowCount + ' kayıt', passed: classClaims.rowCount === 2 },
            { name: 'İkinci sınıf görevi engeli', expected: 'bakiye 130 kalmalı ve özel claim oluşmamalı', actual: 'bakiye ' + classBalanceAfterSecond.rows[0]?.coins + ', claim ' + customClaim.rowCount, passed: Number(classBalanceAfterSecond.rows[0]?.coins) === 130 && customClaim.rowCount === 0 }
          );
        } else if (commandName === 'hazineac') {
          await pool.query('UPDATE users SET coins=0,xp=0,level=1,stat_points=0 WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          await pool.query("INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,'🗝️ Kadim Hazine Sandığı',2)", [guildId, userId]);
          const interaction = makeInteraction(command, buildOptions(schema?.options, { adet: 2 }), guildId, effects);
          interaction.user.id = userId;
          interaction.member = makeMember(userId);
          await command.execute(interaction);
          const player = await pool.query('SELECT coins,xp,level FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const chest = await pool.query("SELECT quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key='🗝️ Kadim Hazine Sandığı'", [guildId, userId]);
          const openings = await pool.query('SELECT loot_item,coins,xp FROM treasure_openings WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const loot = await pool.query("SELECT COALESCE(SUM(quantity),0)::int AS quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key <> '🗝️ Kadim Hazine Sandığı'", [guildId, userId]);
          behavioralChecks.push(
            { name: 'Sandık adedinin düşmesi', expected: '2 → 0 sandık', actual: String(chest.rows[0]?.quantity ?? 0), passed: chest.rowCount === 0 },
            { name: 'Her sandık için ganimet kaydı', expected: '2 treasure_openings kaydı', actual: openings.rowCount + ' kayıt', passed: openings.rowCount === 2 },
            { name: 'Ganimet ve ödül bakiyeleri', expected: 'pozitif altın, XP ve envanter ganimeti', actual: player.rows[0] ? 'altın ' + player.rows[0].coins + ', XP ' + player.rows[0].xp + ', eşya ' + loot.rows[0].quantity : 'kullanıcı kaydı yok', passed: Number(player.rows[0]?.coins) > 0 && Number(player.rows[0]?.xp) > 0 && Number(loot.rows[0]?.quantity) > 0 }
          );
        } else if (commandName === 'karakter') {
          await pool.query(
            "UPDATE users SET character_name='FrierenTest',class_name='Gezgin',stat_points=5,attack=10 WHERE guild_id=$1 AND user_id=$2",
            [guildId, userId]
          );
          const componentUser = {
            id: userId, username: 'FrierenTest', tag: 'FrierenTest#0001', bot: false,
            displayAvatarURL: () => 'https://example.com/test-avatar.png',
            toString() { return '<@' + userId + '>'; }
          };
          const componentEffects = [];
          const classInteraction = {
            customId: 'charpanel:class:' + userId,
            guildId, user: componentUser, values: ['buyucu'],
            isButton: () => false, isStringSelectMenu: () => true, isModalSubmit: () => false,
            reply: async payload => { componentEffects.push({ type: 'reply', payload: normalizePayload(payload) }); },
            update: async payload => { componentEffects.push({ type: 'update', payload: normalizePayload(payload) }); },
            followUp: async payload => { componentEffects.push({ type: 'followUp', payload: normalizePayload(payload) }); }
          };
          await handleCharacterPanelInteraction(classInteraction);
          const classState = await pool.query(
            'SELECT class_name FROM users WHERE guild_id=$1 AND user_id=$2',
            [guildId, userId]
          );
          const statsInteraction = {
            customId: 'charpanel:save-stats:' + userId,
            guildId, user: componentUser,
            isButton: () => false, isStringSelectMenu: () => false, isModalSubmit: () => true,
            fields: { getTextInputValue: name => name === 'stat' ? 'attack' : '3' },
            message: {
              editable: true,
              edit: async payload => { componentEffects.push({ type: 'message-edit', payload: normalizePayload(payload) }); }
            },
            reply: async payload => { componentEffects.push({ type: 'reply', payload: normalizePayload(payload) }); },
            followUp: async payload => { componentEffects.push({ type: 'followUp', payload: normalizePayload(payload) }); }
          };
          await handleCharacterPanelInteraction(statsInteraction);
          const state = await pool.query(
            'SELECT class_name,stat_points,attack FROM users WHERE guild_id=$1 AND user_id=$2',
            [guildId, userId]
          );
          effects.push(...componentEffects);
          behavioralChecks.push(
            {
              name: 'Karakter paneli sınıf seçimi',
              expected: 'Büyücü sınıfı kalıcı kaydedilmeli',
              actual: classState.rows[0]?.class_name || 'kayıt yok',
              passed: classState.rows[0]?.class_name === 'Büyücü'
            },
            {
              name: 'Karakter paneli saldırı gelişimi',
              expected: '10 → 16 (+6)',
              actual: state.rows[0] ? String(state.rows[0].attack) : 'kayıt yok',
              passed: Number(state.rows[0]?.attack) === 16
            },
            {
              name: 'Karakter paneli gelişim puanı düşümü',
              expected: '5 → 2 (-3)',
              actual: state.rows[0] ? String(state.rows[0].stat_points) : 'kayıt yok',
              passed: Number(state.rows[0]?.stat_points) === 2
            },
            {
              name: 'Karakter paneli etkileşim yanıtları',
              expected: 'sınıf ve gelişim işlemleri yanıt üretmeli',
              actual: componentEffects.length + ' yanıt/etki',
              passed: componentEffects.length >= 2
            }
          );
        } else if (commandName === 'kesif') {
          await pool.query(
            'UPDATE users SET level=1,xp=0,coins=0,hp=100,max_hp=100,mana=100,max_mana=100,attack=10,defense=5,last_exploration_at=NULL,exploration_count=0 WHERE guild_id=$1 AND user_id=$2',
            [guildId, userId]
          );
          const runExploration = async () => {
            const actionEffects = [];
            const interaction = makeInteraction(command, buildOptions(schema?.options, { bolge: 'merkez' }), guildId, actionEffects);
            interaction.user.id = userId;
            interaction.member = makeMember(userId);
            await command.execute(interaction);
            effects.push(...actionEffects);
          };
          await runExploration();
          const first = await pool.query(
            'SELECT xp,level,coins,hp,max_hp,mana,max_mana,last_exploration_at,exploration_count FROM users WHERE guild_id=$1 AND user_id=$2',
            [guildId, userId]
          );
          const mastery = await pool.query(
            'SELECT visits FROM exploration_region_mastery WHERE guild_id=$1 AND user_id=$2 AND region_key=$3',
            [guildId, userId, 'merkez']
          );
          await runExploration();
          const second = await pool.query(
            'SELECT xp,coins,exploration_count FROM users WHERE guild_id=$1 AND user_id=$2',
            [guildId, userId]
          );
          const player = first.rows[0];
          behavioralChecks.push(
            { name: 'Keşif ilerleme kaydı', expected: 'XP/altın kazanılmalı; keşif sayısı 1 ve zaman damgası kaydedilmeli', actual: player ? 'XP ' + player.xp + ', altın ' + player.coins + ', keşif ' + player.exploration_count + ', zaman ' + player.last_exploration_at : 'kullanıcı kaydı yok', passed: Number(player?.xp) > 0 && Number(player?.coins) > 0 && Number(player?.exploration_count) === 1 && player?.last_exploration_at != null },
            { name: 'Bölge ustalığı ilerlemesi', expected: 'merkez bölgesi ziyareti 1 olarak kaydedilmeli', actual: String(mastery.rows[0]?.visits ?? 'kayıt yok'), passed: Number(mastery.rows[0]?.visits) === 1 },
            { name: 'Keşif savaş kaynakları sınırları', expected: 'HP ve mana 0 ile maksimum değerleri arasında kalmalı', actual: player ? 'HP ' + player.hp + '/' + player.max_hp + ', mana ' + player.mana + '/' + player.max_mana : 'kullanıcı kaydı yok', passed: Number(player?.hp) >= 0 && Number(player?.hp) <= Number(player?.max_hp) && Number(player?.mana) >= 0 && Number(player?.mana) <= Number(player?.max_mana) },
            { name: 'Keşif bekleme süresi çift ödülü engeller', expected: 'ikinci denemede keşif sayısı ve ödüller değişmemeli', actual: second.rows[0] ? 'XP ' + second.rows[0].xp + ', altın ' + second.rows[0].coins + ', keşif ' + second.rows[0].exploration_count : 'kullanıcı kaydı yok', passed: Number(second.rows[0]?.xp) === Number(player?.xp) && Number(second.rows[0]?.coins) === Number(player?.coins) && Number(second.rows[0]?.exploration_count) === 1 }
          );
        } else if (commandName === 'cantam') {
          await pool.query(
            "INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,'🧪 Test Şifa İksiri',2),($1,$2,'📜 Test Grimoire',3)",
            [guildId, userId]
          );
          const interaction = makeInteraction(command, buildOptions(schema?.options), guildId, effects);
          interaction.user.id = userId;
          interaction.member = makeMember(userId);
          await command.execute(interaction);
          const state = await pool.query(
            'SELECT COUNT(*)::int AS distinct_items,COALESCE(SUM(quantity),0)::int AS total_items FROM inventory WHERE guild_id=$1 AND user_id=$2',
            [guildId, userId]
          );
          const responseText = JSON.stringify(effects.map(effect => effect.payload));
          behavioralChecks.push(
            { name: 'Envanter eşya listesi', expected: 'iki eşya adı ve miktarları yanıtta görünmeli', actual: responseText.includes('Test Şifa İksiri') && responseText.includes('Test Grimoire') ? 'iki eşya da listelendi' : responseText.slice(0, 500), passed: responseText.includes('Test Şifa İksiri') && responseText.includes('Test Grimoire') && responseText.includes('×2') && responseText.includes('×3') },
            { name: 'Envanter toplamları', expected: '2 farklı eşya ve toplam 5 adet', actual: state.rows[0] ? state.rows[0].distinct_items + ' farklı / ' + state.rows[0].total_items + ' toplam' : 'envanter kaydı yok', passed: Number(state.rows[0]?.distinct_items) === 2 && Number(state.rows[0]?.total_items) === 5 }
          );
        } else if (commandName === 'buyular') {
          await pool.query(
            "INSERT INTO learned_spells(guild_id,user_id,spell_key) VALUES($1,$2,'alev_kuresi') ON CONFLICT DO NOTHING",
            [guildId, userId]
          );
          const interaction = makeInteraction(command, buildOptions(schema?.options), guildId, effects);
          interaction.user.id = userId;
          interaction.member = makeMember(userId);
          await command.execute(interaction);
          const learned = await pool.query(
            'SELECT spell_key, COUNT(*) OVER (PARTITION BY spell_key)::int AS spell_count FROM learned_spells WHERE guild_id=$1 AND user_id=$2',
            [guildId, userId]
          );
          const alevRows = learned.rows.filter(row => row.spell_key === 'alev_kuresi');
          const responseText = JSON.stringify(effects.map(effect => effect.payload));
          behavioralChecks.push(
            { name: 'Başlangıç büyüsünün görünmesi', expected: 'Zoltraak varsayılan büyü olarak listelenmeli', actual: responseText.includes('Zoltraak') ? 'Zoltraak listelendi' : 'Zoltraak bulunamadı', passed: responseText.includes('Zoltraak') },
            { name: 'Öğrenilmiş büyünün görünmesi', expected: 'Alev Küresi arşivde listelenmeli ve kendi kaydı tam bir kez bulunmalı', actual: learned.rows.map(row => row.spell_key).join(', ') + (responseText.includes('Alev Küresi') ? ' · yanıtta listelendi' : ' · yanıtta bulunamadı') + ' · Alev Küresi kayıt sayısı: ' + alevRows.length, passed: alevRows.length === 1 && responseText.includes('Alev Küresi') }
          );
        } else if (commandName === 'buyuustaligi') {
          await pool.query(
            "INSERT INTO learned_spells(guild_id,user_id,spell_key) VALUES($1,$2,'alev_kuresi'),($1,$2,'zoltraak') ON CONFLICT DO NOTHING",
            [guildId, userId]
          );
          await pool.query(
            "INSERT INTO spell_mastery(guild_id,user_id,spell_key,casts,mastery_level) VALUES($1,$2,'alev_kuresi',20,2),($1,$2,'zoltraak',0,0) ON CONFLICT (guild_id,user_id,spell_key) DO UPDATE SET casts=EXCLUDED.casts, mastery_level=EXCLUDED.mastery_level",
            [guildId, userId]
          );
          const interaction = makeInteraction(command, buildOptions(schema?.options), guildId, effects);
          interaction.user.id = userId;
          interaction.member = makeMember(userId);
          await command.execute(interaction);
          const mastery = await pool.query(
            'SELECT spell_key,casts,mastery_level FROM spell_mastery WHERE guild_id=$1 AND user_id=$2 ORDER BY spell_key',
            [guildId, userId]
          );
          const responseText = JSON.stringify(effects.map(effect => effect.payload));
          behavioralChecks.push(
            { name: 'Büyü ustalığı seviyeleri ve kullanım sayıları', expected: 'Alev Küresi 2/10 ve 20 kullanım; Zoltraak 0/10 görünmeli', actual: mastery.rows.map(row => row.spell_key + ': ' + row.mastery_level + '/10, ' + row.casts + ' kullanım').join(' | '), passed: mastery.rowCount === 2 && mastery.rows.some(row => row.spell_key === 'alev_kuresi' && Number(row.mastery_level) === 2 && Number(row.casts) === 20) && mastery.rows.some(row => row.spell_key === 'zoltraak' && Number(row.mastery_level) === 0 && Number(row.casts) === 0) },
            { name: 'Büyü ustalığı paneli', expected: 'öğrenilmiş büyüler ve ustalık ilerlemesi yanıtta gösterilmeli', actual: responseText.includes('Alev Küresi') && responseText.includes('2/10') && responseText.includes('20 kullanım') ? 'ustalık paneli doğru içeriği gösterdi' : responseText.slice(0, 500), passed: responseText.includes('Alev Küresi') && responseText.includes('2/10') && responseText.includes('20 kullanım') && responseText.includes('Zoltraak') }
          );
        } else if (commandName === 'dinlen') {
          await pool.query('UPDATE users SET hp=40,max_hp=100,mana=20,max_mana=100,last_rest_at=NULL WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const interaction = makeInteraction(command, buildOptions(schema?.options), guildId, effects);
          interaction.user.id = userId;
          interaction.member = makeMember(userId);
          await command.execute(interaction);
          const state = await pool.query('SELECT hp,max_hp,mana,max_mana,last_rest_at FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const player = state.rows[0];
          behavioralChecks.push(
            { name: 'Dinlenme HP yenilemesi', expected: '40 → 100', actual: player ? player.hp + '/' + player.max_hp : 'kayıt yok', passed: Number(player?.hp) === 100 && Number(player?.max_hp) === 100 },
            { name: 'Dinlenme mana yenilemesi', expected: '20 → 100', actual: player ? player.mana + '/' + player.max_mana : 'kayıt yok', passed: Number(player?.mana) === 100 && Number(player?.max_mana) === 100 },
            { name: 'Dinlenme zaman damgası', expected: 'last_rest_at kaydedilmeli', actual: String(player?.last_rest_at || 'NULL'), passed: player?.last_rest_at != null }
          );
        } else if (commandName === 'buyuogren') {
          await pool.query('UPDATE users SET coins=500,level=30,boss_defeats=10 WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const runLearn = async () => {
            const actionEffects = [];
            const interaction = makeInteraction(command, buildOptions(schema?.options, { buyu: 'alev_kuresi' }), guildId, actionEffects);
            interaction.user.id = userId;
            interaction.member = makeMember(userId);
            await command.execute(interaction);
            effects.push(...actionEffects);
          };
          await runLearn();
          const afterFirst = await pool.query('SELECT coins FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const learned = await pool.query('SELECT spell_key FROM learned_spells WHERE guild_id=$1 AND user_id=$2 AND spell_key=$3', [guildId, userId, 'alev_kuresi']);
          await runLearn();
          const afterSecond = await pool.query('SELECT coins FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          behavioralChecks.push(
            { name: 'Büyü öğrenme kaydı', expected: 'alev_kuresi bir kez kaydedilmeli', actual: learned.rowCount + ' kayıt', passed: learned.rowCount === 1 },
            { name: 'Büyü satın alma bedeli', expected: '500 → 320 altın', actual: String(afterFirst.rows[0]?.coins), passed: Number(afterFirst.rows[0]?.coins) === 320 },
            { name: 'Tekrar satın almada çift ücret alınmaması', expected: 'bakiye ikinci denemede 320 kalmalı', actual: String(afterSecond.rows[0]?.coins), passed: Number(afterSecond.rows[0]?.coins) === 320 }
          );
        } else if (commandName === 'gunlukodul') {
          await pool.query('UPDATE users SET coins=0,daily_streak=0,last_daily_at=NULL WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const interaction = makeInteraction(command, buildOptions(schema?.options), guildId, effects);
          interaction.user.id = userId;
          interaction.member = makeMember(userId);
          await command.execute(interaction);
          const state = await pool.query('SELECT coins,daily_streak,best_daily_streak,last_daily_at FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const player = state.rows[0];
          behavioralChecks.push(
            { name: 'Günlük ödül bakiyesi', expected: '50–100 altın', actual: String(player?.coins), passed: Number(player?.coins) >= 50 && Number(player?.coins) <= 100 },
            { name: 'Günlük seri kaydı', expected: 'daily_streak=1 ve best_daily_streak=1', actual: player ? player.daily_streak + '/' + player.best_daily_streak : 'kayıt yok', passed: Number(player?.daily_streak) === 1 && Number(player?.best_daily_streak) === 1 },
            { name: 'Günlük ödül zaman damgası', expected: 'last_daily_at kaydedilmeli', actual: String(player?.last_daily_at || 'NULL'), passed: player?.last_daily_at != null }
          );
        } else if (commandName === 'ekipman') {
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

        } else if (commandName === 'katlizindan' || commandName === 'ortakboss') {
          const teamUserIds = buildCoopTestUserIds(index, userId, runContext.coopUserPrefix);
          const teamUsers = teamUserIds.map((id, offset) => ({
            id,
            username: 'FrierenTest' + (offset + 1),
            tag: 'FrierenTest#0001',
            bot: false,
            displayAvatarURL: () => 'https://example.com/test-avatar.png',
            toString() { return '<@' + this.id + '>'; }
          }));
          for (const member of teamUsers) {
            await ensureUser(guildId, member.id);
            await pool.query(
              'UPDATE users SET level=50,xp=0,coins=100,hp=2000,max_hp=2000,mana=500,max_mana=500,attack=500,defense=250,last_dungeon_at=NULL,last_boss_at=NULL,dungeon_runs=0,dungeon_wins=0,boss_defeats=0 WHERE guild_id=$1 AND user_id=$2',
              [guildId, member.id]
            );
            await pool.query(
              'INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,$3,1) ON CONFLICT(guild_id,user_id,item_key) DO UPDATE SET quantity=EXCLUDED.quantity',
              [guildId, member.id, 'test-owner-' + member.id]
            );
          }
          const options = buildOptions(schema?.options, {
            takim_arkadasi: teamUsers[1],
            takim_arkadasi_2: teamUsers[2],
            zorluk: 'easy'
          });
          const simulation = { users: teamUsers };
          const interaction = makeInteraction(command, options, guildId, effects, simulation);
          interaction.id = 'test-interaction-' + commandName + '-' + index;
          interaction.user.id = userId;
          interaction.user.username = teamUsers[0].username;
          interaction.member = makeMember(userId);
          await command.execute(interaction);
          const ids = teamUsers.map(member => member.id);
          const saved = await pool.query(
            'SELECT user_id,xp,coins,hp,max_hp,mana,max_mana,dungeon_runs,dungeon_wins,boss_defeats,last_dungeon_at,last_boss_at FROM users WHERE guild_id=$1 AND user_id=ANY($2::text[]) ORDER BY user_id',
            [guildId, ids]
          );
          const reservations = await pool.query(
            'SELECT user_id,encounter_type FROM active_rpg_encounters WHERE guild_id=$1 AND user_id=ANY($2::text[])',
            [guildId, ids]
          );
          const markers = await pool.query(
            "SELECT user_id,item_key,quantity FROM inventory WHERE guild_id=$1 AND user_id=ANY($2::text[]) AND item_key LIKE 'test-owner-%' ORDER BY user_id",
            [guildId, ids]
          );
          const isDungeon = commandName === 'katlizindan';
          const timestampField = isDungeon ? 'last_dungeon_at' : 'last_boss_at';
          const counterField = isDungeon ? 'dungeon_runs' : 'boss_defeats';
          const responseText = JSON.stringify(effects.map(effect => effect.payload));
          behavioralChecks.push(
            { name: 'Üç takım üyesinin kalıcı kaydı', expected: 'aynı sunucuda 3 ayrı oyuncu kaydı', actual: saved.rowCount + ' oyuncu kaydı', passed: saved.rowCount === 3 && new Set(saved.rows.map(row => row.user_id)).size === 3 },
            { name: 'Savaş sonucu ve bekleme süresi', expected: 'üç oyuncuda da karşılaşma zaman damgası ve sayaç', actual: saved.rows.map(row => row.user_id + ': ' + row[counterField] + ', ' + row[timestampField]).join(' | '), passed: saved.rows.length === 3 && saved.rows.every(row => Number(row[counterField]) === 1 && row[timestampField] != null) },
            { name: 'Kişi başı savaş ödülü', expected: 'üç oyuncunun XP ve altın bakiyesi artmalı', actual: saved.rows.map(row => row.user_id + ': XP ' + row.xp + ', altın ' + row.coins).join(' | '), passed: saved.rows.length === 3 && saved.rows.every(row => Number(row.xp) > 0 && Number(row.coins) > 100) },
            { name: 'HP ve mana sınırları korunur', expected: 'her oyuncuda 0 ≤ HP ≤ maksimum HP ve 0 ≤ mana ≤ maksimum mana', actual: saved.rows.map(row => row.user_id + ': ' + row.hp + '/' + row.max_hp + ' HP, ' + row.mana + '/' + row.max_mana + ' mana').join(' | '), passed: saved.rows.length === 3 && saved.rows.every(row => Number(row.hp) >= 0 && Number(row.hp) <= Number(row.max_hp) && Number(row.mana) >= 0 && Number(row.mana) <= Number(row.max_mana)) },
            { name: 'Oyuncu verisi izolasyonu', expected: 'her oyuncunun yalnızca kendi test envanter işareti bulunmalı', actual: markers.rows.map(row => row.user_id + ': ' + row.item_key).join(' | '), passed: markers.rowCount === 3 && markers.rows.every(row => row.item_key === 'test-owner-' + row.user_id && Number(row.quantity) === 1) },
            { name: 'Karşılaşma kilidi temizliği', expected: 'savaş sonunda etkin karşılaşma kaydı kalmamalı', actual: reservations.rowCount + ' etkin kilit', passed: reservations.rowCount === 0 },
            { name: 'Komut sonucu paneli', expected: 'savaş sonucu Discord yanıtı üretilmeli', actual: effects.length + ' yanıt/etki; ' + (responseText.includes('Kat') || responseText.includes('Boss') ? 'savaş paneli içeriği kaydedildi' : 'panel metni kaydedildi'), passed: effects.length > 0 && (responseText.includes('Kat') || responseText.includes('Boss') || responseText.includes('baskın') || responseText.includes('zindan')) }
          );
        } else if (commandName === 'bakiye') {
          await pool.query('UPDATE users SET coins=4321,xp=987,level=7 WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const interaction = makeInteraction(command, buildOptions(schema?.options), guildId, effects);
          interaction.user.id = userId;
          interaction.member = makeMember(userId);
          await command.execute(interaction);
          const state = await pool.query('SELECT coins,xp,level FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const payloadText = JSON.stringify(effects.map(effect => effect.payload));
          behavioralChecks.push(
            { name: 'Cüzdan bakiyesi ve oyuncu seviyesi', expected: '4.321 altın, 987 XP ve seviye 7 gösterilmeli', actual: payloadText.includes('4.321') && payloadText.includes('987') && payloadText.includes('7') ? 'Bakiye, XP ve seviye yanıtta gösterildi' : payloadText.slice(0, 500), passed: payloadText.includes('4.321') && payloadText.includes('987') && payloadText.includes('7') },
            { name: 'Cüzdan salt okunur davranışı', expected: 'komut oyuncu bakiyesini değiştirmemeli', actual: state.rows[0] ? state.rows[0].coins + ' altın / ' + state.rows[0].xp + ' XP / seviye ' + state.rows[0].level : 'oyuncu kaydı yok', passed: Number(state.rows[0]?.coins) === 4321 && Number(state.rows[0]?.xp) === 987 && Number(state.rows[0]?.level) === 7 }
          );
        } else if (commandName === 'istatistik') {
          await pool.query('UPDATE users SET level=7 WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const interaction = makeInteraction(command, buildOptions(schema?.options), guildId, effects);
          interaction.user.id = userId;
          interaction.member = makeMember(userId);
          await command.execute(interaction);
          const state = await pool.query('SELECT COUNT(*)::int AS players,MAX(level)::int AS max_level FROM users WHERE guild_id=$1', [guildId]);
          const payloadText = JSON.stringify(effects.map(effect => effect.payload));
          behavioralChecks.push(
            { name: 'Sunucu oyuncu ve seviye istatistikleri', expected: '1 kayıtlı oyuncu ve en yüksek seviye 7 gösterilmeli', actual: state.rows[0].players + ' oyuncu / en yüksek seviye ' + state.rows[0].max_level, passed: Number(state.rows[0].players) === 1 && Number(state.rows[0].max_level) === 7 && payloadText.includes('1') && payloadText.includes('7') },
            { name: 'İstatistik yanıtı ve ping alanı', expected: 'istatistik panelinde ping değeri gösterilmeli', actual: payloadText.includes('42') ? '42 ms ping alanı gösterildi' : 'Ping alanı bulunamadı', passed: payloadText.includes('42') }
          );
        } else if (commandName === 'liderlik') {
          await pool.query('UPDATE users SET coins=4321,xp=987,level=7 WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const interaction = makeInteraction(command, buildOptions(schema?.options), guildId, effects);
          interaction.user.id = userId;
          interaction.member = makeMember(userId);
          await command.execute(interaction);
          const state = await pool.query('SELECT user_id,coins,level,xp FROM users WHERE guild_id=$1 ORDER BY coins DESC LIMIT 10', [guildId]);
          const payloadText = JSON.stringify(effects.map(effect => effect.payload));
          behavioralChecks.push(
            { name: 'Liderlik sıralaması', expected: 'test oyuncusu 4.321 altın ve seviye 7 ile listelenmeli', actual: state.rows.length + ' sıralama kaydı; ' + (state.rows[0] ? state.rows[0].coins + ' altın / seviye ' + state.rows[0].level : 'kayıt yok'), passed: state.rowCount === 1 && state.rows[0].user_id === userId && Number(state.rows[0].coins) === 4321 && Number(state.rows[0].level) === 7 && payloadText.includes('FrierenTest') && payloadText.includes('4.321') }
          );
        } else if (commandName === 'hedefler') {
          await pool.query('UPDATE users SET level=10,boss_defeats=5,dungeon_wins=3,exploration_count=10 WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const interaction = makeInteraction(command, buildOptions(schema?.options), guildId, effects);
          interaction.user.id = userId;
          interaction.member = makeMember(userId);
          await command.execute(interaction);
          const state = await pool.query('SELECT level,boss_defeats,dungeon_wins,exploration_count FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const payloadText = JSON.stringify(effects.map(effect => effect.payload));
          const labels = ['Yeni bir güç seviyesi','İblis avcısı','Zindan uzmanı','Kuzeyin kâşifi','Karakter koleksiyoncusu','Büyü öğrencisi'];
          behavioralChecks.push(
            { name: 'Altı gelişim hedefinin görünmesi', expected: 'seviye, boss, zindan, keşif, koleksiyon ve büyü hedefleri listelenmeli', actual: labels.filter(label => payloadText.includes(label)).join(', '), passed: labels.every(label => payloadText.includes(label)) },
            { name: 'Tamamlanan hedeflerin DB ilerlemesi', expected: 'seviye 10, 5 boss, 3 zindan ve 10 keşif durumu korunmalı', actual: state.rows[0] ? JSON.stringify(state.rows[0]) : 'oyuncu kaydı yok', passed: Number(state.rows[0]?.level) === 10 && Number(state.rows[0]?.boss_defeats) === 5 && Number(state.rows[0]?.dungeon_wins) === 3 && Number(state.rows[0]?.exploration_count) === 10 }
          );
        } else if (commandName === 'hazinegecmisi') {
          await pool.query('INSERT INTO treasure_openings(guild_id,user_id,loot_item,coins,xp) VALUES($1,$2,$3,$4,$5)', [guildId, userId, 'TEST Mana Kristali', 321, 123]);
          const interaction = makeInteraction(command, buildOptions(schema?.options), guildId, effects);
          interaction.user.id = userId;
          interaction.member = makeMember(userId);
          await command.execute(interaction);
          const state = await pool.query('SELECT loot_item,coins,xp FROM treasure_openings WHERE guild_id=$1 AND user_id=$2 ORDER BY opened_at DESC,id DESC LIMIT 10', [guildId, userId]);
          const payloadText = JSON.stringify(effects.map(effect => effect.payload));
          behavioralChecks.push(
            { name: 'Hazine geçmişi kayıtlarını gösterme', expected: 'TEST Mana Kristali, 321 altın ve 123 XP görünmeli', actual: payloadText.includes('TEST Mana Kristali') && payloadText.includes('321') && payloadText.includes('123') ? 'Test ganimeti yanıtta listelendi' : payloadText.slice(0, 500), passed: state.rowCount === 1 && state.rows[0].loot_item === 'TEST Mana Kristali' && Number(state.rows[0].coins) === 321 && Number(state.rows[0].xp) === 123 && payloadText.includes('TEST Mana Kristali') && payloadText.includes('321') && payloadText.includes('123') },
            { name: 'Hazine geçmişinin salt okunur olması', expected: 'geçmiş sorgusu ganimet kayıtlarını değiştirmemeli', actual: state.rowCount + ' hazine kaydı', passed: state.rowCount === 1 }
          );
        } else if (commandName === 'kesifdefteri') {
          const before = await pool.query('SELECT COUNT(*)::int AS total FROM adventure_discoveries WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const interaction = makeInteraction(command, buildOptions(schema?.options), guildId, effects);
          interaction.user.id = userId;
          interaction.member = makeMember(userId);
          await command.execute(interaction);
          const after = await pool.query('SELECT COUNT(*)::int AS total FROM adventure_discoveries WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const payloadText = JSON.stringify(effects.map(effect => effect.payload));
          const labels = ['Macera Keşif Defteri','Hazine haritası','Günlük macera serisi','Keşfedilen yerler'];
          behavioralChecks.push(
            { name: 'Keşif defteri görünümü', expected: 'keşif defteri, hazine haritası, günlük seri ve rota ustalığı gösterilmeli', actual: labels.filter(label => payloadText.includes(label)).join(', '), passed: labels.every(label => payloadText.includes(label)) },
            { name: 'Keşif defterinin salt okunur olması', expected: 'görüntüleme sırasında keşif kayıtları değişmemeli', actual: before.rows[0].total + ' → ' + after.rows[0].total + ' keşif kaydı', passed: Number(before.rows[0].total) === Number(after.rows[0].total) }
          );
        } else if (['bossrehberi','sinifrehberi','dunya','yardim','buyu','evren'].includes(commandName)) {
          const before = await pool.query('SELECT coins,xp,level FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const interaction = makeInteraction(command, buildOptions(schema?.options), guildId, effects);
          interaction.user.id = userId;
          interaction.member = makeMember(userId);
          await command.execute(interaction);
          const after = await pool.query('SELECT coins,xp,level FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const payloadText = JSON.stringify(effects.map(effect => effect.payload));
          const expectedTitles = { bossrehberi:'Kuzey Seferi', sinifrehberi:'Maceracı Sınıfları', dunya:'Frieren Dünyası', yardim:'Gezginin Komut Rehberi', buyu:'🔮', evren:'Frieren Evreni' };
          const expectedTitle = expectedTitles[commandName];
          behavioralChecks.push(
            { name: 'Rehber içeriği ve başlık', expected: 'komuta ait rehber başlığı ve açıklaması gösterilmeli', actual: payloadText.includes(expectedTitle) ? expectedTitle + ' gösterildi' : payloadText.slice(0, 400), passed: payloadText.includes(expectedTitle) },
            { name: 'Rehber komutunun oyuncu verisini değiştirmemesi', expected: 'rehber görüntüleme altın, XP ve seviyeyi değiştirmemeli', actual: JSON.stringify(before.rows[0]) + ' → ' + JSON.stringify(after.rows[0]), passed: Number(before.rows[0].coins) === Number(after.rows[0].coins) && Number(before.rows[0].xp) === Number(after.rows[0].xp) && Number(before.rows[0].level) === Number(after.rows[0].level) }
          );
        } else if (commandName === 'gunluk') {
          await pool.query("INSERT INTO learned_spells(guild_id,user_id,spell_key) VALUES($1,$2,'alev_kuresi') ON CONFLICT DO NOTHING", [guildId, userId]);
          await pool.query("INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,'🥐 Büyülü Poğaça Kutusu',1) ON CONFLICT(guild_id,user_id,item_key) DO UPDATE SET quantity=EXCLUDED.quantity", [guildId, userId]);
          const interaction = makeInteraction(command, buildOptions(schema?.options), guildId, effects);
          interaction.user.id = userId;
          interaction.member = makeMember(userId);
          await command.execute(interaction);
          const entries = await pool.query('SELECT collection_key,entry_key FROM adventure_journal_entries WHERE guild_id=$1 AND user_id=$2 ORDER BY collection_key,entry_key', [guildId, userId]);
          const payloadText = JSON.stringify(effects.map(effect => effect.payload));
          behavioralChecks.push(
            { name: 'Macera günlüğü koleksiyon kaydı', expected: 'Alev Küresi ve Büyülü Poğaça Kutusu kalıcı günlük girdisi olmalı', actual: entries.rows.map(row => row.collection_key + ':' + row.entry_key).join(', '), passed: entries.rows.some(row => row.collection_key === 'spells' && row.entry_key === 'alev_kuresi') && entries.rows.some(row => row.collection_key === 'relics' && row.entry_key === 'Büyülü Poğaça Kutusu') },
            { name: 'Macera günlüğü paneli', expected: 'karakter, başarılar, bölge ustalığı ve koleksiyon hedefleri gösterilmeli', actual: ['Macera Günlüğü','Karakter','Başarılar','Bölge ustalığı','Koleksiyon hedefleri'].filter(x => payloadText.includes(x)).join(', '), passed: ['Macera Günlüğü','Karakter','Başarılar','Bölge ustalığı','Koleksiyon hedefleri'].every(x => payloadText.includes(x)) }
          );
        } else if (commandName === 'takasteklif') {
          await pool.query("INSERT INTO anime_character_collection(guild_id,user_id,character_name,anime,rarity,emoji,color,description,traits,image,quantity) VALUES($1,$2,'Test Fern','Frieren','Nadir','🌿',123,'test','test',NULL,3)", [guildId, userId]);
          const interaction = makeInteraction(command, buildOptions(schema?.options, { kullanici: sampleValue({type:6}), karakter: 'Test Fern', miktar: 1 }), guildId, effects);
          interaction.user.id = userId;
          interaction.member = makeMember(userId);
          await command.execute(interaction);
          const offer = await pool.query("SELECT from_user_id,to_user_id,character_name,amount,status FROM trade_offers WHERE guild_id=$1 AND from_user_id=$2 AND character_name='Test Fern'", [guildId, userId]);
          const collection = await pool.query("SELECT quantity FROM anime_character_collection WHERE guild_id=$1 AND user_id=$2 AND character_name='Test Fern'", [guildId, userId]);
          const payloadText = JSON.stringify(effects.map(effect => effect.payload));
          behavioralChecks.push(
            { name: 'Takas teklifinin kalıcı kaydı', expected: 'alıcıya 1 Test Fern için bekleyen teklif oluşturulmalı', actual: offer.rows[0] ? offer.rows[0].status + ' / ' + offer.rows[0].amount : 'teklif yok', passed: offer.rowCount === 1 && offer.rows[0].to_user_id === '900000000000000001' && offer.rows[0].status === 'pending' && Number(offer.rows[0].amount) === 1 },
            { name: 'Takas teklifi kopyayı önceden taşımaz', expected: 'teklif kabul edilene kadar gönderenin 3 kopyası korunmalı', actual: String(collection.rows[0]?.quantity ?? 0), passed: Number(collection.rows[0]?.quantity) === 3 && payloadText.includes('Karakter Takas Teklifi') && payloadText.includes('trade_accept:') }
          );
        } else if (commandName === 'zindan') {
          const before = await pool.query('SELECT coins,xp,level,hp,dungeon_runs FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const interaction = makeInteraction(command, buildOptions(schema?.options), guildId, effects);
          interaction.user.id = userId;
          interaction.member = makeMember(userId);
          await command.execute(interaction);
          const after = await pool.query('SELECT coins,xp,level,hp,dungeon_runs FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const payloadText = JSON.stringify(effects.map(effect => effect.payload));
          behavioralChecks.push(
            { name: 'Zindan davet paneli', expected: 'takım arkadaşına kabul/ret daveti gönderilmeli', actual: payloadText.includes('birlikte zindana') ? 'zindan daveti gönderildi' : payloadText.slice(0, 400), passed: payloadText.includes('birlikte zindana') && payloadText.includes('dungeon_accept:') && payloadText.includes('dungeon_decline:') },
            { name: 'Yanıtlanmayan davetin güvenli kapanması', expected: 'süre dolunca zindan ödülü/hasarı uygulanmamalı', actual: JSON.stringify(before.rows[0]) + ' → ' + JSON.stringify(after.rows[0]), passed: ['coins','xp','level','hp','dungeon_runs'].every(key => Number(before.rows[0][key]) === Number(after.rows[0][key])) && payloadText.includes('davetinin süresi doldu') }
          );
        } else if (commandName === 'teknik-talep') {
          const interaction = makeInteraction(command, buildOptions(schema?.options, { tur: 'teknik-bilgi', baslik: 'Güvenlik kontrolü', aciklama: 'Discord bot token paylaşımı' }), guildId, effects);
          interaction.user.id = userId;
          interaction.member = makeMember(userId);
          await command.execute(interaction);
          const payloadText = JSON.stringify(effects.map(effect => effect.payload));
          behavioralChecks.push(
            { name: 'Teknik talepte gizli bilgi koruması', expected: 'token ifadesi reddedilmeli ve güvenli uyarı verilmeli', actual: payloadText.includes('Gizli bilgileri paylaşmadan') ? 'gizli bilgi uyarısı gösterildi' : payloadText.slice(0, 400), passed: payloadText.includes('Gizli bilgileri paylaşmadan') && !payloadText.includes('Owner inceleme kuyruğuna eklendi') }
          );
        } else if (commandName === 'basarimlar') {
          await pool.query('UPDATE users SET coins=1000 WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const interaction = makeInteraction(command, buildOptions(schema?.options, { odul: 'rich_1000' }), guildId, effects);
          interaction.user.id = userId;
          interaction.member = makeMember(userId);
          await command.execute(interaction);
          const player = await pool.query('SELECT coins FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const claim = await pool.query("SELECT achievement_key FROM achievement_claims WHERE guild_id=$1 AND user_id=$2 AND achievement_key='rich_1000'", [guildId, userId]);
          const payloadText = JSON.stringify(effects.map(effect => effect.payload));
          behavioralChecks.push(
            { name: 'Başarım ödülü talebi', expected: '1.000 altın başarımı için 100 altın ödül verilmeli', actual: player.rows[0]?.coins + ' altın / ' + claim.rowCount + ' kayıt', passed: Number(player.rows[0]?.coins) === 1100 && claim.rowCount === 1 && payloadText.includes('Poğaça Zengini') && payloadText.includes('100 altın') },
            { name: 'Başarım ödülünün tekil kaydı', expected: 'rich_1000 yalnızca bir kez kaydedilmeli', actual: claim.rowCount + ' kayıt', passed: claim.rowCount === 1 }
          );
        } else if (commandName === 'macera') {
          await pool.query('UPDATE users SET coins=0,xp=0,level=1,last_adventure_at=NULL WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const interaction = makeInteraction(command, buildOptions(schema?.options, { rota: 'forest-grimoire' }), guildId, effects);
          interaction.user.id = userId;
          interaction.member = makeMember(userId);
          await command.execute(interaction);
          const player = await pool.query('SELECT coins,xp,last_adventure_at FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const route = await pool.query("SELECT visits FROM adventure_route_mastery WHERE guild_id=$1 AND user_id=$2 AND route_key='forest-grimoire'", [guildId, userId]);
          const discovery = await pool.query("SELECT discovery_key FROM adventure_discoveries WHERE guild_id=$1 AND user_id=$2 AND discovery_key='forest-grimoire'", [guildId, userId]);
          const history = await pool.query("SELECT discovery_key,coins_awarded,xp_awarded FROM adventure_history WHERE guild_id=$1 AND user_id=$2", [guildId, userId]);
          const payloadText = payloadTextFromEffects(effects);
          behavioralChecks.push(
            { name: 'Macera ödül ve bekleme süresi kaydı', expected: 'altın/XP artmalı ve last_adventure_at kaydedilmeli', actual: 'altın ' + player.rows[0]?.coins + ', XP ' + player.rows[0]?.xp + ', zaman ' + Boolean(player.rows[0]?.last_adventure_at), passed: Number(player.rows[0]?.coins) > 0 && Number(player.rows[0]?.xp) > 0 && Boolean(player.rows[0]?.last_adventure_at) },
            { name: 'Rota ustalığı ve keşif kaydı', expected: 'forest-grimoire rotası ve geçmiş kaydı bir kez yazılmalı', actual: 'rota ' + (route.rows[0]?.visits ?? 0) + ', keşif ' + discovery.rowCount + ', geçmiş ' + history.rowCount, passed: Number(route.rows[0]?.visits) === 1 && discovery.rowCount === 1 && history.rowCount === 1 && history.rows[0].discovery_key === 'forest-grimoire' },
            { name: 'Macera sonuç paneli', expected: 'macera tamamlandı ve seçilen rotanın görünen adı gösterilmeli', actual: payloadText.includes('Macera Tamamlandı') && payloadText.includes('Kuzey Ormanı') ? 'sonuç paneli ve Kuzey Ormanı rotası gösterildi' : payloadText.slice(0, 500), passed: payloadText.includes('Macera Tamamlandı') && payloadText.includes('Kuzey Ormanı') }
          );
        } else if (commandName === 'rehber') {
          const before = await pool.query('SELECT coins,xp,level FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const interaction = makeInteraction(command, buildOptions(schema?.options), guildId, effects);
          interaction.user.id = userId;
          interaction.member = makeMember(userId);
          await command.execute(interaction);
          const after = await pool.query('SELECT coins,xp,level FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const payloadText = JSON.stringify(effects.map(effect => effect.payload));
          behavioralChecks.push(
            { name: 'Rehber ilk sayfa ve gezinme', expected: 'ilk adımlar rehberi ve sonraki sayfa düğmesi gösterilmeli', actual: payloadText.includes('İlk adımlar') ? 'ilk sayfa gösterildi' : payloadText.slice(0, 400), passed: payloadText.includes('İlk adımlar') && payloadText.includes('frieren_guide_next') },
            { name: 'Rehber görüntüleme salt okunur', expected: 'altın, XP ve seviye değişmemeli', actual: JSON.stringify(before.rows[0]) + ' → ' + JSON.stringify(after.rows[0]), passed: ['coins','xp','level'].every(key => Number(before.rows[0][key]) === Number(after.rows[0][key])) }
          );
        } else if (commandName === 'buyusavasi') {
          const before = await pool.query('SELECT coins,xp,level FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const interaction = makeInteraction(command, buildOptions(schema?.options), guildId, effects);
          interaction.user.id = userId;
          interaction.member = makeMember(userId);
          await command.execute(interaction);
          const after = await pool.query('SELECT coins,xp,level FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const payloadText = JSON.stringify(effects.map(effect => effect.payload));
          behavioralChecks.push(
            { name: 'Büyü düellosu daveti', expected: 'rakibe kabul/ret düğmeleri içeren davet gönderilmeli', actual: payloadText.includes('Büyü Düellosu Daveti') ? 'düello daveti gönderildi' : payloadText.slice(0, 400), passed: payloadText.includes('Büyü Düellosu Daveti') && payloadText.includes('duel_accept') && payloadText.includes('duel_decline') },
            { name: 'Davet aşamasında oyuncu verisi korunur', expected: 'düello kabul edilmeden altın, XP ve seviye değişmemeli', actual: JSON.stringify(before.rows[0]) + ' → ' + JSON.stringify(after.rows[0]), passed: ['coins','xp','level'].every(key => Number(before.rows[0][key]) === Number(after.rows[0][key])) }
          );
        } else if (commandName === 'iblisavasi') {
          const before = await pool.query('SELECT coins,xp,level,hp,mana FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const interaction = makeInteraction(command, buildOptions(schema?.options), guildId, effects);
          interaction.user.id = userId;
          interaction.member = makeMember(userId);
          await command.execute(interaction);
          const after = await pool.query('SELECT coins,xp,level,hp,mana FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const payloadText = JSON.stringify(effects.map(effect => effect.payload));
          behavioralChecks.push(
            { name: 'İblis savaşı başlangıç paneli', expected: 'boss adı, HP ve büyü/savunma hamleleri gösterilmeli', actual: payloadText.includes('Schattenwolf') ? 'boss savaş paneli açıldı' : payloadText.slice(0, 400), passed: payloadText.includes('Schattenwolf') && payloadText.includes('demon_attack') && payloadText.includes('demon_defend') },
            { name: 'Savaş başlamadan oyuncu verisi korunur', expected: 'ilk hamle yapılmadan altın, XP, seviye, HP ve mana değişmemeli', actual: JSON.stringify(before.rows[0]) + ' → ' + JSON.stringify(after.rows[0]), passed: ['coins','xp','level','hp','mana'].every(key => Number(before.rows[0][key]) === Number(after.rows[0][key])) }
          );
        } else if (commandName === 'market') {
          await pool.query('UPDATE users SET coins=1000 WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const interaction = makeInteraction(command, buildOptions(schema?.options), guildId, effects);
          interaction.user.id = userId;
          interaction.member = makeMember(userId);
          await command.execute(interaction);
          const state = await pool.query('SELECT coins FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const payloadText = JSON.stringify(effects.map(effect => effect.payload));
          behavioralChecks.push(
            { name: 'Market kataloğu ve ürün seçenekleri', expected: 'market başlığı, eşya kataloğu ve satın alma/inceleme düğmeleri gösterilmeli', actual: payloadText.includes('BÜYÜLÜ MARKET') ? 'market paneli açıldı' : payloadText.slice(0, 400), passed: payloadText.includes('BÜYÜLÜ MARKET') && payloadText.includes('market_detail:') && payloadText.includes('market_cat:') },
            { name: 'Market açılışı salt okunur', expected: '1.000 altın harcanmadan kalmalı', actual: String(state.rows[0]?.coins), passed: Number(state.rows[0]?.coins) === 1000 }
          );
        } else if (commandName === 'zanaat') {
          const interaction = makeInteraction(command, buildOptions(schema?.options), guildId, effects);
          interaction.user.id = userId;
          interaction.member = makeMember(userId);
          await command.execute(interaction);
          const payloadText = JSON.stringify(effects.map(effect => effect.payload));
          behavioralChecks.push(
            { name: 'Zanaat tarif kataloğu', expected: 'demir kılıç ve ekipman tarifleri listelenmeli', actual: payloadText.includes('Zanaat Tarif Defteri') ? 'tarif defteri açıldı' : payloadText.slice(0, 400), passed: payloadText.includes('Zanaat Tarif Defteri') && payloadText.includes('Gezginin Demir Kılıcı') && payloadText.includes('Malzeme') }
          );
        } else if (commandName === 'zanaatgorevi') {
          const before = await pool.query('SELECT coins,xp,level FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const interaction = makeInteraction(command, buildOptions(schema?.options, { odul_al: false }), guildId, effects);
          interaction.user.id = userId;
          interaction.member = makeMember(userId);
          await command.execute(interaction);
          const progress = await pool.query('SELECT crafted_items,claimed_at FROM daily_crafting_progress WHERE guild_id=$1 AND user_id=$2 AND mission_date=CURRENT_DATE', [guildId, userId]);
          const after = await pool.query('SELECT coins,xp,level FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const payloadText = payloadTextFromEffects(effects);
          const missionVisible = payloadText.includes('3 ekipman') && payloadText.includes('+100 altın') && payloadText.includes('+50 XP');
          behavioralChecks.push(
            { name: 'Günlük zanaat görevi durumu', expected: '3 ekipman hedefi ve +100 altın/+50 XP ödülü gösterilmeli; ilerleme 0/3 olmalı', actual: 'üretim ' + (progress.rows[0]?.crafted_items ?? 0) + '/3; görev metni ' + (missionVisible ? 'tam' : payloadText.slice(0, 350)), passed: Number(progress.rows[0]?.crafted_items) === 0 && !progress.rows[0]?.claimed_at && missionVisible },
            { name: 'Görev görüntüleme ödül vermez', expected: 'oyuncunun altın, XP ve seviyesi değişmemeli', actual: JSON.stringify(before.rows[0]) + ' → ' + JSON.stringify(after.rows[0]), passed: ['coins','xp','level'].every(key => Number(before.rows[0]?.[key]) === Number(after.rows[0]?.[key])) }
          );
        } else if (commandName === 'yetenekagaci') {
          await pool.query('UPDATE users SET level=6 WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          await pool.query('INSERT INTO user_talents(guild_id,user_id,attack_rank,defense_rank,hp_rank,mana_rank) VALUES($1,$2,0,0,0,0) ON CONFLICT(guild_id,user_id) DO NOTHING', [guildId, userId]);
          const interaction = makeInteraction(command, buildOptions(schema?.options, { yetenek: 'saldiri' }), guildId, effects);
          interaction.user.id = userId;
          interaction.member = makeMember(userId);
          await command.execute(interaction);
          const talent = await pool.query('SELECT attack_rank FROM user_talents WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const payloadText = JSON.stringify(effects.map(effect => effect.payload));
          behavioralChecks.push(
            { name: 'Yetenek puanı harcama', expected: 'seviye 6 oyuncusu saldırı yeteneğini 0 → 1 yükseltmeli', actual: 'saldırı rütbesi ' + (talent.rows[0]?.attack_rank ?? 0), passed: Number(talent.rows[0]?.attack_rank) === 1 && payloadText.includes('1. rütbeye') },
            { name: 'Yetenek ağacı paneli', expected: 'kalıcı saldırı bonusu ve puan özeti gösterilmeli', actual: payloadText.includes('Keskin Sezgi') ? 'yetenek paneli gösterildi' : payloadText.slice(0, 400), passed: payloadText.includes('Keskin Sezgi') && payloadText.includes('Kullanılabilir') }
          );
        } else if (commandName === 'zanaatustalari') {
          await pool.query('INSERT INTO user_crafting_progress(guild_id,user_id,level,xp,successful_crafts,salvaged_items) VALUES($1,$2,4,120,8,2) ON CONFLICT(guild_id,user_id) DO UPDATE SET level=4,xp=120,successful_crafts=8,salvaged_items=2', [guildId, userId]);
          const interaction = makeInteraction(command, buildOptions(schema?.options, { kategori: 'level' }), guildId, effects);
          interaction.user.id = userId;
          interaction.member = makeMember(userId);
          await command.execute(interaction);
          const state = await pool.query('SELECT level FROM user_crafting_progress WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const payloadText = JSON.stringify(effects.map(effect => effect.payload));
          behavioralChecks.push(
            { name: 'Zanaat ustaları sıralaması', expected: 'seviye 4 zanaatkâr listelenmeli', actual: 'zanaat seviyesi ' + state.rows[0]?.level, passed: Number(state.rows[0]?.level) === 4 && payloadText.includes('En Yüksek Zanaat Seviyesi') && payloadText.includes('4') }
          );
        } else if (commandName === 'kesifliderligi') {
          await pool.query("INSERT INTO adventure_discoveries(guild_id,user_id,discovery_key) VALUES($1,$2,'test-discovery') ON CONFLICT DO NOTHING", [guildId, userId]);
          const interaction = makeInteraction(command, buildOptions(schema?.options, { kategori: 'kesif' }), guildId, effects);
          interaction.user.id = userId;
          interaction.member = makeMember(userId);
          await command.execute(interaction);
          const state = await pool.query('SELECT COUNT(*)::int AS total FROM adventure_discoveries WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const payloadText = JSON.stringify(effects.map(effect => effect.payload));
          behavioralChecks.push(
            { name: 'Keşif liderliği sıralaması', expected: 'test oyuncusu 1 keşif ile listelenmeli', actual: state.rows[0].total + ' keşif', passed: Number(state.rows[0].total) === 1 && payloadText.includes('En Büyük Kaşifler') && payloadText.includes(userId) && payloadText.includes('1') }
          );
        } else if (commandName === 'maceragecmisi') {
          const before = await pool.query('SELECT coins,xp,level,exploration_count FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const interaction = makeInteraction(command, buildOptions(schema?.options), guildId, effects);
          interaction.user.id = userId;
          interaction.member = makeMember(userId);
          await command.execute(interaction);
          const after = await pool.query('SELECT coins,xp,level,exploration_count FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const payloadText = JSON.stringify(effects.map(effect => effect.payload));
          behavioralChecks.push(
            { name: 'Macera geçmişi özet alanları', expected: 'ilerleme, savaş, macera, koleksiyon, hazırlık ve zanaat alanları gösterilmeli', actual: ['İlerleme','Savaş','Macera','Koleksiyon','Hazırlık','Zanaat'].filter(x => payloadText.includes(x)).join(', '), passed: ['İlerleme','Savaş','Macera','Koleksiyon','Hazırlık','Zanaat'].every(x => payloadText.includes(x)) },
            { name: 'Macera geçmişi salt okunur', expected: 'oyuncu RPG durumu değişmemeli', actual: JSON.stringify(before.rows[0]) + ' → ' + JSON.stringify(after.rows[0]), passed: ['coins','xp','level','exploration_count'].every(key => Number(before.rows[0][key]) === Number(after.rows[0][key])) }
          );
        } else if (commandName === 'animequiz') {
          const interaction = makeInteraction(command, buildOptions(schema?.options), guildId, effects);
          interaction.user.id = userId;
          interaction.member = makeMember(userId);
          await command.execute(interaction);
          const payloadText = JSON.stringify(effects.map(effect => effect.payload));
          behavioralChecks.push(
            { name: 'Anime quiz soru ve süre paneli', expected: 'anime sorusu, 20 saniye süresi ve 10 puan ödülü gösterilmeli', actual: payloadText.includes('Anime Quiz Başladı') ? 'quiz sorusu ve başlangıç paneli gösterildi' : payloadText.slice(0, 400), passed: payloadText.includes('Anime Quiz Başladı') && payloadText.includes('20 saniye') && payloadText.includes('10 puan') }
          );
        } else if (commandName === 'gorevzinciri') {
          await pool.query("UPDATE users SET coins=0,xp=0,last_daily_at=NOW() WHERE guild_id=$1 AND user_id=$2", [guildId, userId]);
          const interaction = makeInteraction(command, buildOptions(schema?.options, { odul: '1' }), guildId, effects);
          interaction.user.id = userId;
          interaction.member = makeMember(userId);
          await command.execute(interaction);
          const player = await pool.query('SELECT coins,xp FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const chain = await pool.query('SELECT current_step FROM daily_quest_chains WHERE guild_id=$1 AND user_id=$2 AND chain_date=CURRENT_DATE', [guildId, userId]);
          const material = await pool.query("SELECT quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key='🥐 Büyülü Poğaça Kutusu'", [guildId, userId]);
          behavioralChecks.push(
            { name: 'Görev zinciri ilk aşama ödülü', expected: '50 altın, 20 XP ve 1 poğaça kutusu verilmeli', actual: 'altın ' + player.rows[0]?.coins + ', XP ' + player.rows[0]?.xp + ', malzeme ' + (material.rows[0]?.quantity || 0), passed: Number(player.rows[0]?.coins) === 50 && Number(player.rows[0]?.xp) === 20 && Number(material.rows[0]?.quantity) === 1 },
            { name: 'Görev zinciri aşama ilerlemesi', expected: 'current_step 1 → 2', actual: 'aşama ' + (chain.rows[0]?.current_step ?? 'yok'), passed: Number(chain.rows[0]?.current_step) === 2 }
          );
        } else if (commandName === 'hikaye') {
          const interaction = makeInteraction(command, buildOptions(schema?.options, { karar: 'merak' }), guildId, effects);
          interaction.user.id = userId;
          interaction.member = makeMember(userId);
          await command.execute(interaction);
          const progress = await pool.query('SELECT current_chapter,choices FROM story_progress WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const player = await pool.query('SELECT coins,xp FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const payloadText = JSON.stringify(effects.map(effect => effect.payload));
          behavioralChecks.push(
            { name: 'Hikâye başlangıç kararı', expected: 'Merak kararı kalıcı kaydedilmeli ve ilk bölüm ilerlemeli', actual: JSON.stringify(progress.rows[0] || null), passed: Number(progress.rows[0]?.current_chapter) === 1 && Array.isArray(progress.rows[0]?.choices) && progress.rows[0].choices[0] === 'merak' },
            { name: 'Hikâye başlangıç ödülü', expected: '50 altın ve 25 XP verilmeli', actual: 'altın ' + player.rows[0]?.coins + ', XP ' + player.rows[0]?.xp, passed: Number(player.rows[0]?.coins) === 50 && Number(player.rows[0]?.xp) === 25 && payloadText.includes('Kuzey') }
          );
        } else if (commandName === 'karaktercek') {
          await pool.query('UPDATE users SET last_free_character_at=NULL,free_character_pity_count=0 WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const interaction = makeInteraction(command, buildOptions(schema?.options), guildId, effects);
          interaction.user.id = userId;
          interaction.member = makeMember(userId);
          await command.execute(interaction);
          const collection = await pool.query('SELECT COUNT(*)::int AS total,COALESCE(SUM(quantity),0)::int AS copies FROM anime_character_collection WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const state = await pool.query('SELECT last_free_character_at,free_character_pity_count FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          behavioralChecks.push(
            { name: 'Günlük ücretsiz karakter kaydı', expected: '1 karakter koleksiyona eklenmeli', actual: collection.rows[0].total + ' karakter / ' + collection.rows[0].copies + ' kopya', passed: Number(collection.rows[0].total) === 1 && Number(collection.rows[0].copies) === 1 },
            { name: 'Ücretsiz çekim bekleme süresi ve garanti sayacı', expected: 'last_free_character_at kaydedilmeli ve sayaç 0–10 aralığında olmalı', actual: String(state.rows[0]?.last_free_character_at) + ' / ' + state.rows[0]?.free_character_pity_count, passed: Boolean(state.rows[0]?.last_free_character_at) && Number(state.rows[0]?.free_character_pity_count) >= 0 && Number(state.rows[0]?.free_character_pity_count) <= 10 }
          );
        } else if (commandName === 'parcala') {
          await pool.query("INSERT INTO anime_character_collection(guild_id,user_id,character_name,anime,rarity,emoji,color,description,traits,image,quantity) VALUES($1,$2,'Test Fern','Frieren','Nadir','🌿',123,'test','test',NULL,3)", [guildId, userId]);
          const interaction = makeInteraction(command, buildOptions(schema?.options, { karakter: 'Test Fern', miktar: 2 }), guildId, effects);
          interaction.user.id = userId;
          interaction.member = makeMember(userId);
          await command.execute(interaction);
          const collection = await pool.query("SELECT quantity FROM anime_character_collection WHERE guild_id=$1 AND user_id=$2 AND character_name='Test Fern'", [guildId, userId]);
          const player = await pool.query('SELECT coins FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          behavioralChecks.push(
            { name: 'Karakter kopyası parçalama', expected: '3 kopyadan 2 tanesi düşülmeli; 1 kopya korunmalı', actual: String(collection.rows[0]?.quantity ?? 0), passed: Number(collection.rows[0]?.quantity) === 1 },
            { name: 'Nadir karakter parçalama ödülü', expected: '24 altın eklenmeli', actual: String(player.rows[0]?.coins ?? 0) + ' altın', passed: Number(player.rows[0]?.coins) === 24 }
          );
        } else if (commandName === 'envanter') {
          await pool.query("INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,'TEST Mana Kristali',2)", [guildId, userId]);
          const interaction = makeInteraction(command, buildOptions(schema?.options), guildId, effects);
          interaction.user.id = userId;
          interaction.member = makeMember(userId);
          await command.execute(interaction);
          const state = await pool.query("SELECT quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key='TEST Mana Kristali'", [guildId, userId]);
          const payloadText = JSON.stringify(effects.map(effect => effect.payload));
          behavioralChecks.push(
            { name: 'Envanter içeriği', expected: 'TEST Mana Kristali ×2 listelenmeli', actual: payloadText.includes('TEST Mana Kristali') ? 'eşya listelendi' : payloadText.slice(0, 400), passed: Number(state.rows[0]?.quantity) === 2 && payloadText.includes('TEST Mana Kristali') && payloadText.includes('× 2') },
            { name: 'Envanter görüntüleme salt okunur', expected: 'eşya miktarı değişmemeli', actual: String(state.rows[0]?.quantity ?? 0), passed: Number(state.rows[0]?.quantity) === 2 }
          );
        } else if (commandName === 'maceraistatistik') {
          await pool.query("INSERT INTO adventure_route_mastery(guild_id,user_id,route_key,visits) VALUES($1,$2,'test-route',3)", [guildId, userId]);
          const interaction = makeInteraction(command, buildOptions(schema?.options), guildId, effects);
          interaction.user.id = userId;
          interaction.member = makeMember(userId);
          await command.execute(interaction);
          const state = await pool.query("SELECT visits FROM adventure_route_mastery WHERE guild_id=$1 AND user_id=$2 AND route_key='test-route'", [guildId, userId]);
          const payloadText = JSON.stringify(effects.map(effect => effect.payload));
          behavioralChecks.push(
            { name: 'Macera istatistikleri', expected: 'toplam macera 3 ve seviye/XP/altın paneli gösterilmeli', actual: payloadText.includes('Toplam macera') && payloadText.includes('3') ? 'istatistik paneli doğru' : payloadText.slice(0, 400), passed: Number(state.rows[0]?.visits) === 3 && payloadText.includes('Toplam macera') && payloadText.includes('3') },
            { name: 'Macera istatistiği salt okunur', expected: 'rota ziyareti sayısı değişmemeli', actual: String(state.rows[0]?.visits ?? 0), passed: Number(state.rows[0]?.visits) === 3 }
          );
        } else if (['frieren','mimic','pogaca','sans','saril'].includes(commandName)) {
          const before = await pool.query('SELECT coins,xp,level FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const interaction = makeInteraction(command, buildOptions(schema?.options), guildId, effects);
          interaction.user.id = userId;
          interaction.member = makeMember(userId);
          await command.execute(interaction);
          const after = await pool.query('SELECT coins,xp,level FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const payloadText = JSON.stringify(effects.map(effect => effect.payload));
          const patterns = { frieren: ['Frieren','günlüğü'], mimic: ['MIMIC', 'gerçek bir hazine', 'dokunmamanı', 'bayat bir poğaça'], pogaca: ['Fırın','poğaça'], sans: ['şans','eğlence amaçlı'], saril: ['Fern onaylı','dostça'] };
          const found = patterns[commandName].some(value => payloadText.toLocaleLowerCase('tr-TR').includes(value.toLocaleLowerCase('tr-TR')));
          behavioralChecks.push(
            { name: 'Eğlence komutu içeriği', expected: 'komuta özgü anime/eğlence yanıtı gösterilmeli', actual: found ? 'beklenen içerik bulundu' : payloadText.slice(0, 400), passed: found },
            { name: 'Eğlence komutu RPG verisini değiştirmez', expected: 'altın, XP ve seviye değişmemeli', actual: JSON.stringify(before.rows[0]) + ' → ' + JSON.stringify(after.rows[0]), passed: Number(before.rows[0].coins) === Number(after.rows[0].coins) && Number(before.rows[0].xp) === Number(after.rows[0].xp) && Number(before.rows[0].level) === Number(after.rows[0].level) }
          );
        } else if (commandName === 'karakterarsivi') {
          const interaction = makeInteraction(command, buildOptions(schema?.options, { isim: 'frieren' }), guildId, effects);
          interaction.user.id = userId;
          interaction.member = makeMember(userId);
          await command.execute(interaction);
          const payloadText = JSON.stringify(effects.map(effect => effect.payload));
          behavioralChecks.push(
            { name: 'Karakter arşivi kartı', expected: 'Frieren adı, Elf büyücü rolü ve karakter açıklaması gösterilmeli', actual: payloadText.includes('Frieren') && payloadText.includes('Elf büyücü') ? 'Frieren arşiv kartı gösterildi' : payloadText.slice(0, 400), passed: payloadText.includes('Frieren') && payloadText.includes('Elf büyücü') && payloadText.includes('yolculuğunun anlamını') }
          );
        } else if (commandName === 'npc') {
          const interaction = makeInteraction(command, buildOptions(schema?.options, { karakter: 'frieren', eylem: 'konus' }), guildId, effects);
          interaction.user.id = userId;
          interaction.member = makeMember(userId);
          await command.execute(interaction);
          const payloadText = JSON.stringify(effects.map(effect => effect.payload));
          behavioralChecks.push(
            { name: 'NPC diyalog sistemi', expected: 'Frieren karşılaşma başlığı ve diyalog içeriği gösterilmeli', actual: payloadText.includes('Frieren') ? 'Frieren diyalogu gösterildi' : payloadText.slice(0, 400), passed: payloadText.includes('Frieren') && payloadText.includes('karşılaşma') && payloadText.includes('büyü kalıntıları') }
          );
        } else if (commandName === 'siralama') {
          await pool.query('UPDATE users SET level=7,xp=987,coins=4321 WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const interaction = makeInteraction(command, buildOptions(schema?.options, { kategori: 'level' }), guildId, effects);
          interaction.user.id = userId;
          interaction.member = makeMember(userId);
          await command.execute(interaction);
          const payloadText = JSON.stringify(effects.map(effect => effect.payload));
          const mine = await pool.query('SELECT level FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          behavioralChecks.push(
            { name: 'Oyuncu sıralama konumu', expected: 'test oyuncusu seviye 7 ile birinci sırada görünmeli', actual: 'seviye ' + mine.rows[0]?.level, passed: Number(mine.rows[0]?.level) === 7 && payloadText.includes('Seviye 7') && payloadText.includes('Senin sıran') && payloadText.includes('#1') }
          );
        } else if (commandName === 'buyukitabi') {
          const interaction = makeInteraction(command, buildOptions(schema?.options), guildId, effects);
          interaction.user.id = userId;
          interaction.member = makeMember(userId);
          await command.execute(interaction);
          const payloadText = JSON.stringify(effects.map(effect => effect.payload));
          behavioralChecks.push(
            { name: 'Büyü kitabı sayfa paneli', expected: 'bir büyü adı, açıklaması ve sayfa gezinme düğmeleri gösterilmeli', actual: payloadText.includes('Büyük Büyü Kitabı') ? 'büyü kitabı paneli açıldı' : payloadText.slice(0, 400), passed: payloadText.includes('Büyük Büyü Kitabı') && payloadText.includes('buyukitabi_next') && payloadText.includes('buyukitabi_random') }
          );
        } else if (commandName === 'ekipmanparcala') {
          const item = equipmentItems.find(entry => entry.id === 'iron_sword');
          const salvageItem = '🥐 Büyülü Poğaça Kutusu';
          await pool.query('INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,$3,2)', [guildId, userId, item.name]);
          const interaction = makeInteraction(command, buildOptions(schema?.options, { esya: 'iron_sword', adet: 1 }), guildId, effects);
          interaction.user.id = userId;
          interaction.member = makeMember(userId);
          await command.execute(interaction);
          const source = await pool.query('SELECT quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key=$3', [guildId, userId, item.name]);
          const returned = await pool.query('SELECT quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key=$3', [guildId, userId, salvageItem]);
          const progress = await pool.query('SELECT salvaged_items FROM user_crafting_progress WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const payloadText = JSON.stringify(effects.map(effect => effect.payload));
          behavioralChecks.push(
            { name: 'Ekipman parçalama envanter düşümü', expected: '2 demir kılıçtan 1 kalmalı', actual: String(source.rows[0]?.quantity ?? 0), passed: Number(source.rows[0]?.quantity) === 1 },
            { name: 'Geri kazanım malzemesi', expected: '1 Büyülü Poğaça Kutusu eklenmeli', actual: String(returned.rows[0]?.quantity ?? 0), passed: Number(returned.rows[0]?.quantity) === 1 },
            { name: 'Parçalama ilerlemesi ve yanıtı', expected: 'salvaged_items=1 ve işlem sonucu gösterilmeli', actual: 'ilerleme ' + (progress.rows[0]?.salvaged_items ?? 0), passed: Number(progress.rows[0]?.salvaged_items) === 1 && payloadText.includes('Ekipman Parçalandı') }
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
        } else if (commandName === 'kimimben') {
          await pool.query(
            'UPDATE users SET pity_count=0,character_draw_count=0,character_draw_cooldown_until=NULL,last_character_draw_at=NULL WHERE guild_id=$1 AND user_id=$2',
            [guildId, userId]
          );
          const interaction = makeInteraction(command, buildOptions(schema?.options), guildId, effects);
          interaction.user.id = userId;
          interaction.member = makeMember(userId);
          await command.execute(interaction);
          const collection = await pool.query(
            'SELECT COUNT(*)::int AS distinct_characters,COALESCE(SUM(quantity),0)::int AS total_copies FROM anime_character_collection WHERE guild_id=$1 AND user_id=$2',
            [guildId, userId]
          );
          const state = await pool.query(
            'SELECT character_draw_count,last_character_draw_at,character_draw_cooldown_until FROM users WHERE guild_id=$1 AND user_id=$2',
            [guildId, userId]
          );
          const payloadText = payloadTextFromEffects(effects);
          behavioralChecks.push(
            { name: 'Kimimben karakter keşfi ve koleksiyon kaydı', expected: 'bir karakter keşfedilmeli ve koleksiyona tam bir kopya eklenmeli', actual: collection.rows[0]?.distinct_characters + ' karakter / ' + collection.rows[0]?.total_copies + ' kopya', passed: Number(collection.rows[0]?.distinct_characters) === 1 && Number(collection.rows[0]?.total_copies) === 1 },
            { name: 'Kimimben çekim limiti ve zaman damgası', expected: 'çekim sayacı 1 olmalı ve son çekim zamanı kaydedilmeli', actual: 'sayaç ' + state.rows[0]?.character_draw_count + ' / zaman ' + Boolean(state.rows[0]?.last_character_draw_at), passed: Number(state.rows[0]?.character_draw_count) === 1 && Boolean(state.rows[0]?.last_character_draw_at) && state.rows[0]?.character_draw_cooldown_until == null },
            { name: 'Kimimben karakter kartı ve yenileme düğmesi', expected: 'karakter kartı ve yalnızca kullanıcıya ait yenileme düğmesi gösterilmeli', actual: payloadText.includes('kimimben_again') ? 'karakter kartı ve yenileme düğmesi gösterildi' : payloadText.slice(0, 400), passed: payloadText.includes('Karakter Keşfi') && payloadText.includes('kimimben_again') }
          );
        } else if (commandName === 'status') {
          const interaction = makeInteraction(command, buildOptions(schema?.options), guildId, effects);
          interaction.user.id = userId;
          interaction.member = makeMember(userId);
          await command.execute(interaction);
          const payloadText = payloadTextFromEffects(effects);
          behavioralChecks.push(
            { name: 'Status canlı Discord bağlantısı', expected: 'bot çevrimiçi ve Discord gecikmesi gösterilmeli', actual: payloadText.includes('Çevrimiçi') && payloadText.includes('42 ms') ? 'çevrimiçi / 42 ms' : payloadText.slice(0, 400), passed: payloadText.includes('Çevrimiçi') && payloadText.includes('42 ms') },
            { name: 'Status çalışma bilgileri', expected: 'çalışma süresi, sunucu sayısı, komut sayısı ve Node.js sürümü gösterilmeli', actual: ['Çalışma süresi','Sunucu sayısı','Yüklü komut','Node.js'].filter(value => payloadText.includes(value)).join(', '), passed: ['Çalışma süresi','Sunucu sayısı','Yüklü komut','Node.js'].every(value => payloadText.includes(value)) }
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
      testRunId: runContext.runId,
      executionMode: 'synthetic Discord interaction; isolated PostgreSQL schema frieren_test',
      note: 'Bu rapor gerçek Discord kullanıcısının etkileşimi değildir. Yanıt kaydı tek başına INCONCLUSIVE sayılır. PASS yalnızca komuta özel davranış doğrulamaları ve yalıtılmış PostgreSQL durum kontrolleri geçtiğinde verilir. /buyupratik için altın, mana ve büyü ustalığı; /ekipman için kuşanma, çıkarma, envanter ve efsanevi set bonusu; /esyakullan için HP, mana ve eşya tüketimi yalıtılmış PostgreSQL üzerinde doğrulanır. /katlizindan ve /ortakboss için davet, rol, tur aksiyonları, ödül, HP/mana, oyuncu izolasyonu ve karşılaşma kilitleri yalıtılmış PostgreSQL üzerinde doğrulanır. /kesif için ödül, bölge ustalığı, kaynak sınırları ve bekleme süresi; /cantam için eşya listesi ve toplamlar; /buyular için başlangıç/öğrenilmiş büyü listesi; /buyuustaligi için kullanım ve ustalık seviyesi verileri yalıtılmış PostgreSQL üzerinde doğrulanır. /bakiye için altın/XP/seviye gösterimi ve salt okunur davranış; /istatistik için oyuncu sayısı, en yüksek seviye ve ping; /liderlik için sıralama verisi; /hedefler için altı hedefin görünümü ve DB ilerlemesi; /hazinegecmisi için ganimet geçmişi; /kesifdefteri için keşif özeti ve salt okunur davranış; /bossrehberi, /sinifrehberi, /dunya, /yardim, /buyu ve /evren için içerik ve oyuncu verisi değişmezliği yalıtılmış PostgreSQL üzerinde doğrulanır. Komut adı boş bırakıldığında tüm herkese açık oyuncu komutları çalıştırılır; internal-only ve owner komutları varsayılan toplu denetime dahil edilmez. Davranış testi henüz tanımlanmamış komutlar kesin değil olarak raporlanır.',
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