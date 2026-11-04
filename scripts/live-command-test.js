import { withIsolatedTestSchema, ensureUser, pool } from '../database/db.js';
import { buildCommandEvidence } from './command-test-evidence.js';
import { ensureCardVariantSchema } from '../card-variants.js';
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
        const actionButtons = buttons.filter(id => id.includes(':act:'));
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
        } else if (actionButtons.length) {
          const sequence = simulation.actionSequence?.[simulation.actionIndex || 0] || [];
          simulation.actionIndex = (simulation.actionIndex || 0) + 1;
          clicks = simulation.users.map((user, index) => {
            const selected = sequence[index] || 'attack';
            return {
              customId: actionButtons.find(id => id.includes(':act:' + selected + ':')) ||
                actionButtons.find(id => id.includes(':act:attack:')),
              user
            };
          });
        } else if (buttons.includes('kimimben_again')) {
          const outsider = simulation.users.find(user => user.id !== simulation.ownerId);
          if (outsider) clicks = [{ customId: 'kimimben_again', user: outsider }];
        }
        for (const click of clicks) {
          if (!click.customId || !click.user) continue;
          const component = {
            ...click,
            deferUpdate: async () => {
              if (click.customId?.includes(':act:')) simulation.acceptedActions?.push(click.customId);
            },
            reply: async payload => {
              simulation.componentEffects?.push({ userId: click.user.id, payload: normalizePayload(payload) });
            },
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
    await ensureCardVariantSchema(pool);
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
          const buildInteraction = {
            customId: 'charpanel:build:' + userId,
            guildId, user: componentUser, values: ['avci'],
            isButton: () => false, isStringSelectMenu: () => true, isModalSubmit: () => false,
            reply: async payload => { componentEffects.push({ type: 'reply', payload: normalizePayload(payload) }); },
            update: async payload => { componentEffects.push({ type: 'update', payload: normalizePayload(payload) }); },
            followUp: async payload => { componentEffects.push({ type: 'followUp', payload: normalizePayload(payload) }); }
          };
          await handleCharacterPanelInteraction(buildInteraction);
          const buildState = await pool.query('SELECT active_build FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
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
              name: 'Karakter paneli savaş yapısı seçimi',
              expected: 'Avcı yapısı active_build alanına kalıcı yazılmalı',
              actual: buildState.rows[0]?.active_build || 'kayıt yok',
              passed: buildState.rows[0]?.active_build === 'avci'
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
          const responseText = payloadTextFromEffects(effects);
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
          const roleProfiles = [
            { className: 'Muhafız', talents: [0,3,0,0] },
            { className: 'Şifacı', talents: [0,0,3,3] },
            { className: 'Büyücü', talents: [3,0,0,0] }
          ];
          for (const [roleIndex, member] of teamUsers.entries()) {
            await ensureUser(guildId, member.id);
            const roleProfile = roleProfiles[roleIndex];
            await pool.query(
              'UPDATE users SET level=10,xp=9900,coins=100,hp=2000,max_hp=2000,mana=400,max_mana=400,attack=50,defense=50,class_name=$3,active_build=\'dengeli\',last_dungeon_at=NULL,last_boss_at=NULL,dungeon_runs=0,dungeon_wins=0,boss_defeats=0 WHERE guild_id=$1 AND user_id=$2',
              [guildId, member.id, roleProfile.className]
            );
            await pool.query(
              'UPDATE user_talents SET attack_rank=$3,defense_rank=$4,hp_rank=$5,mana_rank=$6 WHERE guild_id=$1 AND user_id=$2',
              [guildId, member.id, ...roleProfile.talents]
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
          const simulation = {
            users: teamUsers,
            actionSequence: [
              ['defend', 'defend', 'defend'],
              ['shield', 'heal', 'spell'],
              ['attack', 'attack', 'attack']
            ],
            actionIndex: 0,
            acceptedActions: []
          };
          const interaction = makeInteraction(command, options, guildId, effects, simulation);
          interaction.id = 'test-interaction-' + commandName + '-' + index;
          interaction.user.id = userId;
          interaction.user.username = teamUsers[0].username;
          interaction.member = makeMember(userId);
          const previousRandom = Math.random;
          try {
            Math.random = () => 0.3;
            await command.execute(interaction);
          } finally {
            Math.random = previousRandom;
          }
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
          const spellMastery = await pool.query(
            "SELECT user_id,casts,mastery_level FROM spell_mastery WHERE guild_id=$1 AND user_id=ANY($2::text[]) AND spell_key='zoltraak'",
            [guildId, ids]
          );
          const isDungeon = commandName === 'katlizindan';
          const timestampField = isDungeon ? 'last_dungeon_at' : 'last_boss_at';
          const counterField = isDungeon ? 'dungeon_runs' : 'boss_defeats';
          const responseText = payloadTextFromEffects(effects);
          const tankSaved = saved.rows.find(row => row.user_id === teamUsers[0].id);
          const healerSaved = saved.rows.find(row => row.user_id === teamUsers[1].id);
          const mageSaved = saved.rows.find(row => row.user_id === teamUsers[2].id);
          const mageCasts = Number(spellMastery.rows.find(row => row.user_id === teamUsers[2].id)?.casts || 0);
          const mageManaSpent = 400 - Number(mageSaved?.mana || 0);
          behavioralChecks.push(
            { name: 'Üç takım üyesinin kalıcı kaydı', expected: 'aynı sunucuda 3 ayrı oyuncu kaydı', actual: saved.rowCount + ' oyuncu kaydı', passed: saved.rowCount === 3 && new Set(saved.rows.map(row => row.user_id)).size === 3 },
            { name: 'Savaş sonucu ve bekleme süresi', expected: 'üç oyuncuda da karşılaşma zaman damgası ve sayaç', actual: saved.rows.map(row => row.user_id + ': ' + row[counterField] + ', ' + row[timestampField]).join(' | '), passed: saved.rows.length === 3 && saved.rows.every(row => Number(row[counterField]) === 1 && row[timestampField] != null) },
            { name: 'Kişi başı savaş ödülü', expected: 'üç oyuncunun XP ve altın bakiyesi artmalı', actual: saved.rows.map(row => row.user_id + ': XP ' + row.xp + ', altın ' + row.coins).join(' | '), passed: saved.rows.length === 3 && saved.rows.every(row => Number(row.xp) > 0 && Number(row.coins) > 100) },
            { name: 'HP ve mana sınırları korunur', expected: 'her oyuncuda 0 ≤ HP ≤ maksimum HP ve 0 ≤ mana ≤ maksimum mana', actual: saved.rows.map(row => row.user_id + ': ' + row.hp + '/' + row.max_hp + ' HP, ' + row.mana + '/' + row.max_mana + ' mana').join(' | '), passed: saved.rows.length === 3 && saved.rows.every(row => Number(row.hp) >= 0 && Number(row.hp) <= Number(row.max_hp) && Number(row.mana) >= 0 && Number(row.mana) <= Number(row.max_mana)) },
            { name: 'Oyuncu verisi izolasyonu', expected: 'her oyuncunun yalnızca kendi test envanter işareti bulunmalı', actual: markers.rows.map(row => row.user_id + ': ' + row.item_key).join(' | '), passed: markers.rowCount === 3 && markers.rows.every(row => row.item_key === 'test-owner-' + row.user_id && Number(row.quantity) === 1) },
            { name: 'Karşılaşma kilidi temizliği', expected: 'savaş sonunda etkin karşılaşma kaydı kalmamalı', actual: reservations.rowCount + ' etkin kilit', passed: reservations.rowCount === 0 },
            { name: 'Komut sonucu paneli', expected: 'savaş sonucu Discord yanıtı üretilmeli', actual: effects.length + ' yanıt/etki; ' + (responseText.includes('Kat') || responseText.includes('Boss') ? 'savaş paneli içeriği kaydedildi' : 'panel metni kaydedildi'), passed: effects.length > 0 && (responseText.includes('Kat') || responseText.includes('Boss') || responseText.includes('baskın') || responseText.includes('zindan')) },
            { name: 'Beş gerçek savaş aksiyonu', expected: 'savunma, Mana Kalkanı, Heilen, Zoltraak ve normal saldırı etkileşimleri kabul edilmeli; mana ve ustalık kalıcılaşmalı', actual: [...new Set(simulation.acceptedActions.map(id => id.split(':')[2]))].join(', ') + '; Zoltraak ustalık kaydı ' + spellMastery.rowCount, passed: ['attack','spell','heal','shield','defend'].every(action => simulation.acceptedActions.some(id => id.split(':')[2] === action)) && spellMastery.rowCount > 0 && spellMastery.rows.every(row => Number(row.casts) > 0) && saved.rows.every(row => Number(row.mana) < Number(row.max_mana)) },
            { name: 'Tank hedefleme ve şifacı desteği', expected: 'tank öncelikli hedef olmalı ve şifacı takım arkadaşını iyileştirmeli', actual: 'tank HP ' + tankSaved?.hp + '/' + tankSaved?.max_hp + '; iyileştirme günlüğü ' + responseText.includes('iyileştirdi'), passed: (!isDungeon || Number(tankSaved?.hp) < Number(tankSaved?.max_hp)) && responseText.includes('iyileştirdi') },
            { name: 'Büyücü sınıfının co-op Zoltraak mana verimliliği', expected: 'her başarılı Büyücü Zoltraak atışı 10 mana tüketmeli', actual: mageManaSpent + ' mana / ' + mageCasts + ' atış', passed: mageCasts > 0 && mageManaSpent === mageCasts * 10 },
            { name: isDungeon ? 'Gizli kat tuzağı olayı' : 'Boss alan özel saldırısı', expected: isDungeon ? 'deterministik rota akışında tuzak hasarı günlüğe yazılmalı' : 'Kuzey Platosu bossunun üçüncü tur alan mana patlaması çalışmalı', actual: isDungeon ? (responseText.includes('tuzak') ? 'tuzak olayı kaydedildi' : 'tuzak olayı bulunamadı') : (responseText.includes('yıldız biçimli mana patlamasıyla tüm yaşayan oyuncuları hedef alıyor') ? 'alan saldırısı kaydedildi' : 'alan saldırısı bulunamadı'), passed: isDungeon ? responseText.includes('tuzak') : responseText.includes('yıldız biçimli mana patlamasıyla tüm yaşayan oyuncuları hedef alıyor') }
          );
          if (isDungeon) {
            const floorNames = ['🌲 Köklerin Koridoru','🗿 Kadim Harabeler','🌫️ Sisli Geçit','🔥 Küller Salonu','👑 Mühürlü İblis Lordu'];
            const carrySnapshots = [...responseText.matchAll(/Kat (\d+) ([0-9/]+) → ([0-9/]+)/g)].map(match => ({
              floor: Number(match[1]), start: match[2], end: match[3]
            }));
            const floorOne = carrySnapshots.find(snapshot => snapshot.floor === 1);
            const floorTwo = carrySnapshots.find(snapshot => snapshot.floor === 2);
            const perFloorRewards = [...responseText.matchAll(/\d+\. kat temizlendi: [^\n]+ · \+\d+ XP, \+\d+ altın/g)];
            behavioralChecks.push(
              { name: 'Beş adlandırılmış zindan katı', expected: 'beş farklı kat adı sonuç günlüğünde yer almalı', actual: floorNames.filter(name => responseText.includes(name)).join(' · '), passed: floorNames.every(name => responseText.includes(name)) },
              { name: 'Katlar arasında HP taşınması', expected: 'birinci katın son HP değeri ikinci katın başlangıç HP değeriyle aynı olmalı', actual: floorOne && floorTwo ? floorOne.end + ' → ' + floorTwo.start : carrySnapshots.length + ' HP snapshot', passed: Boolean(floorOne && floorTwo && floorOne.end === floorTwo.start) },
              { name: 'Her zindan katının ayrı ödülü', expected: 'beş temizlenen katın her biri XP ve altın ödülünü ayrı göstermeli', actual: perFloorRewards.length + ' kat ödül satırı', passed: perFloorRewards.length === 5 }
            );
            const beforeCooldown = await pool.query('SELECT user_id,dungeon_runs FROM users WHERE guild_id=$1 AND user_id=ANY($2::text[]) ORDER BY user_id', [guildId, teamUsers.map(member => member.id)]);
            const cooldownEffects = [];
            const cooldownSimulation = { users: teamUsers, actionSequence: simulation.actionSequence, actionIndex: 0, acceptedActions: [] };
            const cooldownInteraction = makeInteraction(command, options, guildId, cooldownEffects, cooldownSimulation);
            cooldownInteraction.id = 'test-interaction-' + commandName + '-' + index + '-cooldown';
            cooldownInteraction.user.id = userId;
            cooldownInteraction.user.username = teamUsers[0].username;
            cooldownInteraction.member = makeMember(userId);
            const previousCooldownRandom = Math.random;
            try {
              Math.random = () => 0.3;
              await command.execute(cooldownInteraction);
            } finally {
              Math.random = previousCooldownRandom;
            }
            const afterCooldown = await pool.query('SELECT user_id,dungeon_runs FROM users WHERE guild_id=$1 AND user_id=ANY($2::text[]) ORDER BY user_id', [guildId, teamUsers.map(member => member.id)]);
            const cooldownText = payloadTextFromEffects(cooldownEffects);
            behavioralChecks.push({
              name: 'Oyuncu başına 30 dakikalık zindan bekleme süresi',
              expected: 'aynı takım hemen tekrar girememeli ve dungeon_runs artmamalı',
              actual: cooldownText.slice(-300),
              passed: cooldownText.includes('dakika') && cooldownText.includes('beklemeli') && beforeCooldown.rowCount === 3 && afterCooldown.rowCount === 3 && beforeCooldown.rows.every((row, rowIndex) => Number(row.dungeon_runs) === Number(afterCooldown.rows[rowIndex].dungeon_runs))
            });
          }
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
          await pool.query("INSERT INTO treasure_openings(guild_id,user_id,loot_item,coins,xp,opened_at) VALUES($1,$2,'TEST Older Treasure',11,12,NOW()),($1,$2,'TEST Newer Treasure',21,22,NOW())", [guildId, userId]);
          const interaction = makeInteraction(command, buildOptions(schema?.options), guildId, effects);
          interaction.user.id = userId;
          interaction.member = makeMember(userId);
          await command.execute(interaction);
          const state = await pool.query('SELECT loot_item,coins,xp FROM treasure_openings WHERE guild_id=$1 AND user_id=$2 ORDER BY opened_at DESC,id DESC LIMIT 10', [guildId, userId]);
          const payloadText = JSON.stringify(effects.map(effect => effect.payload));
          const newerIndex = payloadText.indexOf('TEST Newer Treasure');
          const olderIndex = payloadText.indexOf('TEST Older Treasure');
          behavioralChecks.push(
            { name: 'Hazine geçmişi son kayıtları', expected: 'iki ganimet, altın ve XP değerleri görünmeli', actual: state.rows.map(row => row.loot_item + ':' + row.coins + '/' + row.xp).join(', '), passed: state.rowCount === 2 && payloadText.includes('TEST Newer Treasure') && payloadText.includes('TEST Older Treasure') && payloadText.includes('21') && payloadText.includes('22') && payloadText.includes('11') && payloadText.includes('12') },
            { name: 'Hazine geçmişinde kararlı eş-zamanlı sıralama', expected: 'aynı timestamp değerinde daha yüksek kayıt ID önce görünmeli', actual: newerIndex >= 0 && olderIndex > newerIndex ? 'yeni kayıt önce' : 'sıralama kanıtı yok', passed: state.rows[0]?.loot_item === 'TEST Newer Treasure' && newerIndex >= 0 && olderIndex > newerIndex }
          );
        } else if (commandName === 'kesifdefteri') {
          await pool.query("INSERT INTO adventure_discoveries(guild_id,user_id,discovery_key) VALUES($1,$2,'ancient-elf-sanctuary') ON CONFLICT DO NOTHING", [guildId, userId]);
          await pool.query("INSERT INTO adventure_route_mastery(guild_id,user_id,route_key,visits) VALUES($1,$2,'ancient-elf-sanctuary',5) ON CONFLICT(guild_id,user_id,route_key) DO UPDATE SET visits=5", [guildId, userId]);
          await pool.query('INSERT INTO adventure_treasure_progress(guild_id,user_id,fragments,treasures_opened) VALUES($1,$2,3,2) ON CONFLICT(guild_id,user_id) DO UPDATE SET fragments=3,treasures_opened=2', [guildId, userId]);
          await pool.query('INSERT INTO adventure_streaks(guild_id,user_id,daily_streak,best_streak,last_visit_date) VALUES($1,$2,4,6,CURRENT_DATE) ON CONFLICT(guild_id,user_id) DO UPDATE SET daily_streak=4,best_streak=6,last_visit_date=CURRENT_DATE', [guildId, userId]);
          const before = await pool.query('SELECT COUNT(*)::int AS total FROM adventure_discoveries WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const interaction = makeInteraction(command, buildOptions(schema?.options), guildId, effects);
          interaction.user.id = userId;
          interaction.member = makeMember(userId);
          await command.execute(interaction);
          const after = await pool.query('SELECT COUNT(*)::int AS total FROM adventure_discoveries WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const payloadText = JSON.stringify(effects.map(effect => effect.payload));
          const labels = ['Macera Keşif Defteri','Hazine haritası','Günlük macera serisi','Keşfedilen yerler','Rota ziyaretleri: **5** · Ustalık: **1** · Sonraki ödül: **1 ziyaret**'];
          behavioralChecks.push(
            { name: 'Keşif defteri ve rota ustalığı görünümü', expected: 'keşif, hazine, seri ve 5 ziyaret/1 ustalık/1 sonraki ödül gösterilmeli', actual: labels.filter(label => payloadText.includes(label)).join(', '), passed: labels.every(label => payloadText.includes(label)) },
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
            { name: 'Zanaat tarif kataloğu ve gereksinimleri', expected: 'tarifler, oyuncu/zanaat seviyesi, malzemeler ve ekipman bonusları listelenmeli', actual: ['Zanaat Tarif Defteri','Gezginin Demir Kılıcı','Oyuncu seviyesi','Zanaat seviyesi','Malzeme'].filter(value => payloadText.includes(value)).join(', '), passed: ['Zanaat Tarif Defteri','Gezginin Demir Kılıcı','Oyuncu seviyesi','Zanaat seviyesi','Malzeme'].every(value => payloadText.includes(value)) && payloadText.includes('saldırı') }
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
          const boards = [
            { key: 'level', title: 'En Yüksek Zanaat Seviyesi', score: '4' },
            { key: 'xp', title: 'En Çok Zanaat XP', score: '120' },
            { key: 'crafts', title: 'En Çok Üretim Yapanlar', score: '8' },
            { key: 'salvage', title: 'En Çok Ekipman Parçalayanlar', score: '2' }
          ];
          for (const board of boards) {
            const start = effects.length;
            const interaction = makeInteraction(command, buildOptions(schema?.options, { kategori: board.key }), guildId, effects);
            interaction.user.id = userId;
            interaction.member = makeMember(userId);
            await command.execute(interaction);
            const payloadText = JSON.stringify(effects.slice(start).map(effect => effect.payload));
            behavioralChecks.push({
              name: 'Zanaat ustaları ' + board.key + ' kategorisi',
              expected: board.title + ' tablosunda skor ' + board.score + ' gösterilmeli',
              actual: payloadText.includes(board.title) && payloadText.includes(board.score) ? 'kategori ve skor doğru' : payloadText.slice(0, 400),
              passed: payloadText.includes(board.title) && payloadText.includes(userId) && payloadText.includes(board.score)
            });
          }
        } else if (commandName === 'kesifliderligi') {
          await pool.query("INSERT INTO adventure_discoveries(guild_id,user_id,discovery_key) VALUES($1,$2,'test-discovery') ON CONFLICT DO NOTHING", [guildId, userId]);
          await pool.query("INSERT INTO adventure_route_mastery(guild_id,user_id,route_key,visits) VALUES($1,$2,'test-route',5) ON CONFLICT(guild_id,user_id,route_key) DO UPDATE SET visits=5", [guildId, userId]);
          await pool.query('INSERT INTO adventure_streaks(guild_id,user_id,daily_streak,best_streak,last_visit_date) VALUES($1,$2,4,4,CURRENT_DATE) ON CONFLICT(guild_id,user_id) DO UPDATE SET daily_streak=4,best_streak=4,last_visit_date=CURRENT_DATE', [guildId, userId]);
          const boards = [
            { key: 'kesif', title: 'En Büyük Kaşifler', score: '1' },
            { key: 'rota', title: 'Rota Ustaları', score: '5' },
            { key: 'seri', title: 'Günlük Macera Serileri', score: '4' }
          ];
          for (const board of boards) {
            const start = effects.length;
            const interaction = makeInteraction(command, buildOptions(schema?.options, { kategori: board.key }), guildId, effects);
            interaction.user.id = userId;
            interaction.member = makeMember(userId);
            await command.execute(interaction);
            const payloadText = JSON.stringify(effects.slice(start).map(effect => effect.payload));
            behavioralChecks.push({
              name: 'Keşif liderliği ' + board.key + ' kategorisi',
              expected: board.title + ' tablosunda test oyuncusunun ' + board.score + ' puanla görünmesi',
              actual: payloadText.includes(board.title) && payloadText.includes(userId) && payloadText.includes(board.score) ? 'kategori ve skor doğru' : payloadText.slice(0, 400),
              passed: payloadText.includes(board.title) && payloadText.includes(userId) && payloadText.includes(board.score)
            });
          }
        } else if (commandName === 'maceragecmisi') {
          const before = await pool.query('SELECT coins,xp,level,exploration_count FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          await pool.query(
            "INSERT INTO adventure_history(guild_id,user_id,discovery_key,outcome_text,coins_awarded,xp_awarded,item_found,first_discovery,occurred_at) VALUES($1,$2,'forest-grimoire','Ordinary history entry',10,5,NULL,false,NOW()-INTERVAL '3 minutes'),($1,$2,'dragon-nest','Rare Dragon History',20,10,NULL,true,NOW()-INTERVAL '2 minutes'),($1,$2,'mimic-trail','Item Found History',30,15,'🧪 Test Potion',true,NOW()-INTERVAL '1 minute'),($1,$2,'forest-grimoire','Older History Entry 4',4,4,NULL,false,NOW()-INTERVAL '4 minutes'),($1,$2,'forest-grimoire','Older History Entry 5',5,5,NULL,false,NOW()-INTERVAL '5 minutes'),($1,$2,'forest-grimoire','Oldest History Excluded',6,6,NULL,false,NOW()-INTERVAL '6 minutes')",
            [guildId, userId]
          );
          await pool.query(
            'INSERT INTO user_crafting_progress(guild_id,user_id,level,xp,successful_crafts,salvaged_items) VALUES($1,$2,5,1234,9,4)',
            [guildId, userId]
          );
          const summaryStart = effects.length;
          const interaction = makeInteraction(command, buildOptions(schema?.options, { filtre: 'tum' }), guildId, effects);
          interaction.user.id = userId;
          interaction.member = makeMember(userId);
          await command.execute(interaction);
          const after = await pool.query('SELECT coins,xp,level,exploration_count FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const summaryText = JSON.stringify(effects.slice(summaryStart).map(effect => effect.payload));
          behavioralChecks.push(
            { name: 'Macera geçmişi özet alanları ve zanaat değerleri', expected: 'ilerleme, savaş, macera, koleksiyon, hazırlık, seri ve zanaat sayıları gösterilmeli', actual: ['İlerleme','Savaş','Macera','Koleksiyon','Hazırlık','Günlük seri','Zanaat XP: **1.234**','Üretilen eşya: **9**','Parçalanan eşya: **4**'].filter(x => summaryText.includes(x)).join(', '), passed: ['İlerleme','Savaş','Macera','Koleksiyon','Hazırlık','Günlük seri','Zanaat XP: **1.234**','Üretilen eşya: **9**','Parçalanan eşya: **4**'].every(x => summaryText.includes(x)) },
            { name: 'Son beş macera, göreli zaman ve ilk keşif vurgusu', expected: 'son beş kayıt gösterilmeli; altıncı kayıt gizlenmeli; zaman ve ilk keşif etiketi görünmeli', actual: (summaryText.includes('Oldest History Excluded') ? 'eski kayıt yanlışlıkla gösterildi' : 'son beş sınırı doğru') + '; ' + (summaryText.includes('<t:') ? 'göreli zaman var' : 'zaman yok') + '; ' + (summaryText.includes('Yeni keşif') ? 'ilk keşif vurgusu var' : 'ilk keşif vurgusu yok'), passed: !summaryText.includes('Oldest History Excluded') && summaryText.includes('Older History Entry 4') && summaryText.includes('Older History Entry 5') && summaryText.includes('<t:') && summaryText.includes('Yeni keşif') },
            { name: 'Macera geçmişi salt okunur', expected: 'oyuncu RPG durumu değişmemeli', actual: JSON.stringify(before.rows[0]) + ' → ' + JSON.stringify(after.rows[0]), passed: ['coins','xp','level','exploration_count'].every(key => Number(before.rows[0][key]) === Number(after.rows[0][key])) }
          );
          for (const filter of [
            { key: 'nadir', include: 'Rare Dragon History', exclude: 'Ordinary history entry' },
            { key: 'esya', include: 'Item Found History', exclude: 'Rare Dragon History' }
          ]) {
            const start = effects.length;
            const filteredInteraction = makeInteraction(command, buildOptions(schema?.options, { filtre: filter.key }), guildId, effects);
            filteredInteraction.user.id = userId;
            filteredInteraction.member = makeMember(userId);
            await command.execute(filteredInteraction);
            const filteredText = JSON.stringify(effects.slice(start).map(effect => effect.payload));
            behavioralChecks.push({
              name: 'Macera geçmişi ' + filter.key + ' filtresi',
              expected: filter.include + ' gösterilmeli ve ' + filter.exclude + ' gizlenmeli',
              actual: filteredText.includes(filter.include) && !filteredText.includes(filter.exclude) ? 'filtre doğru uygulandı' : filteredText.slice(0, 400),
              passed: filteredText.includes(filter.include) && !filteredText.includes(filter.exclude)
            });
          }
          const otherUserId = buildCoopTestUserIds(index + 500, userId, runContext.coopUserPrefix)[1];
          await ensureUser(guildId, otherUserId);
          await pool.query(
            "INSERT INTO adventure_history(guild_id,user_id,discovery_key,outcome_text,coins_awarded,xp_awarded,item_found,first_discovery) VALUES($1,$2,'dragon-nest','Other player rare history',10,5,NULL,true)",
            [guildId, otherUserId]
          );
          const otherStart = effects.length;
          const otherUser = { id: otherUserId, username: 'OtherHistoryTarget', displayAvatarURL: () => 'https://example.com/avatar.png' };
          const otherInteraction = makeInteraction(command, buildOptions(schema?.options, { kullanici: otherUser, filtre: 'nadir' }), guildId, effects);
          otherInteraction.user.id = userId;
          otherInteraction.member = makeMember(userId);
          await command.execute(otherInteraction);
          const otherText = JSON.stringify(effects.slice(otherStart).map(effect => effect.payload));
          behavioralChecks.push({
            name: 'Başka oyuncunun macera geçmişi',
            expected: 'seçilen başka oyuncunun nadir macerası ve kullanıcı adı gösterilmeli',
            actual: otherText.includes('OtherHistoryTarget') && otherText.includes('Other player rare history') ? 'hedef oyuncu geçmişi doğru' : otherText.slice(0, 400),
            passed: otherText.includes('OtherHistoryTarget') && otherText.includes('Other player rare history')
          });
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
          await pool.query('UPDATE users SET level=7,xp=700,coins=321,last_adventure_at=NOW() WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          await pool.query("INSERT INTO adventure_discoveries(guild_id,user_id,discovery_key) VALUES($1,$2,'test-discovery-a'),($1,$2,'test-discovery-b')", [guildId, userId]);
          await pool.query("INSERT INTO adventure_route_mastery(guild_id,user_id,route_key,visits) VALUES($1,$2,'test-route',5),($1,$2,'second-route',3)", [guildId, userId]);
          await pool.query('INSERT INTO adventure_streaks(guild_id,user_id,daily_streak,best_streak,last_visit_date) VALUES($1,$2,4,6,CURRENT_DATE)', [guildId, userId]);
          await pool.query('INSERT INTO adventure_treasure_progress(guild_id,user_id,fragments,treasures_opened) VALUES($1,$2,3,2)', [guildId, userId]);
          await pool.query("INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,'🗝️ Kadim Hazine Sandığı',4)", [guildId, userId]);
          const before = await pool.query('SELECT level,xp,coins FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const interaction = makeInteraction(command, buildOptions(schema?.options), guildId, effects);
          interaction.user.id = userId;
          interaction.member = makeMember(userId);
          await command.execute(interaction);
          const after = await pool.query('SELECT level,xp,coins FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const payloadText = JSON.stringify(effects.map(effect => effect.payload));
          const expectedFields = ['Seviye: **7**','XP: **700**','Altın: **321**','Toplam macera: **8**','Keşfedilen yer: **2/','En çok gezilen rota: **5** ziyaret','Günlük seri: **4 gün** · Rekor: **6 gün**','Harita parçaları: **3/5**','Tamamlanan harita: **2**','Sandık: **4**','Son macera:'];
          behavioralChecks.push(
            { name: 'Birleşik macera istatistikleri tüm ilerleme alanları', expected: 'seviye, XP, altın, macera, keşif, rota, seri, harita, sandık ve son macera gösterilmeli', actual: expectedFields.filter(value => payloadText.includes(value)).join(', '), passed: expectedFields.every(value => payloadText.includes(value)) },
            { name: 'Macera istatistiği salt okunur', expected: 'oyuncu seviye, XP ve altın değerleri değişmemeli', actual: JSON.stringify(before.rows[0]) + ' → ' + JSON.stringify(after.rows[0]), passed: ['level','xp','coins'].every(key => Number(before.rows[0]?.[key]) === Number(after.rows[0]?.[key])) }
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
          const previewEffects = [];
          const previewInteraction = makeInteraction(command, buildOptions(schema?.options, { esya: null }), guildId, previewEffects);
          previewInteraction.user.id = userId;
          previewInteraction.member = makeMember(userId);
          await command.execute(previewInteraction);
          const previewText = payloadTextFromEffects(previewEffects);
          behavioralChecks.push({
            name: 'On iki ekipman türünün parçalama önizlemesi',
            expected: 'her ekipman adı, nadirliği ve geri kazanım tarifi seçimden önce gösterilmeli',
            actual: equipmentItems.filter(entry => previewText.includes(entry.name)).length + '/' + equipmentItems.length + ' ekipman',
            passed: equipmentItems.length === 12 && equipmentItems.every(entry => previewText.includes(entry.name) && previewText.includes(entry.rarity)) && previewText.includes('Geri kazanım')
          });
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
          const buttonSimulation = { ownerId: userId, users: [{ id: userId }, { id: '900000000000000002' }], componentEffects: [] };
          const interaction = makeInteraction(command, buildOptions(schema?.options), guildId, effects, buttonSimulation);
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
          const outsiderReply = buttonSimulation.componentEffects.find(effect =>
            effect.userId !== userId && String(effect.payload?.content || '').includes('yalnızca komutu kullanan kişi')
          );
          behavioralChecks.push(
            { name: 'Kimimben karakter keşfi ve koleksiyon kaydı', expected: 'bir karakter keşfedilmeli ve koleksiyona tam bir kopya eklenmeli', actual: collection.rows[0]?.distinct_characters + ' karakter / ' + collection.rows[0]?.total_copies + ' kopya', passed: Number(collection.rows[0]?.distinct_characters) === 1 && Number(collection.rows[0]?.total_copies) === 1 },
            { name: 'Kimimben çekim limiti ve zaman damgası', expected: 'çekim sayacı 1 olmalı ve son çekim zamanı kaydedilmeli', actual: 'sayaç ' + state.rows[0]?.character_draw_count + ' / zaman ' + Boolean(state.rows[0]?.last_character_draw_at), passed: Number(state.rows[0]?.character_draw_count) === 1 && Boolean(state.rows[0]?.last_character_draw_at) && state.rows[0]?.character_draw_cooldown_until == null },
            { name: 'Kimimben kartı ve yalnızca komut sahibinin yenilemesi', expected: 'karakter kartı, yenileme düğmesi ve başka kullanıcıya ephemeral ret gösterilmeli', actual: (payloadText.includes('Güzel bir keşif yaptın!') && payloadText.includes('kimimben_again') ? 'karakter kartı ve yenileme düğmesi gösterildi' : 'karakter kartı veya yenileme düğmesi eksik') + '; yabancı kullanıcı reddi: ' + Boolean(outsiderReply), passed: payloadText.includes('Güzel bir keşif yaptın!') && payloadText.includes('kimimben_again') && Boolean(outsiderReply) && Boolean(outsiderReply.payload?.flags) }
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
        } else if (commandName === 'arena') {
          const interaction = makeInteraction(command, buildOptions(schema?.options, { __subcommand: 'katil' }), guildId, effects);
          interaction.user.id = userId;
          interaction.member = makeMember(userId);
          await command.execute(interaction);
          const queued = await pool.query('SELECT rating FROM arena_queue WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const season = await pool.query("SELECT starts_at,ends_at FROM arena_seasons WHERE guild_id=$1 AND status='active'", [guildId]);
          const durationMs = season.rowCount ? new Date(season.rows[0].ends_at).getTime() - new Date(season.rows[0].starts_at).getTime() : 0;
          const payloadText = payloadTextFromEffects(effects);
          behavioralChecks.push(
            { name: 'Arena oyuncu kuyruğu kaydı', expected: 'oyuncu yalnızca bir kez 3v3 kuyruğuna alınmalı', actual: queued.rowCount + ' kayıt', passed: queued.rowCount === 1 && Number(queued.rows[0]?.rating) === 1000 },
            { name: 'Arena sezonunun 90 günlük süresi', expected: 'aktif sezon yaklaşık 90 gün sürmeli', actual: Math.round(durationMs / 86400000) + ' gün', passed: season.rowCount === 1 && Math.abs(durationMs - 90 * 86400000) < 5000 },
            { name: 'Arena kuyruk yanıtı', expected: 'kuyrukta 1/6 oyuncu bilgisi gösterilmeli', actual: payloadText.includes('1/6') ? '1/6 gösterildi' : payloadText.slice(0, 250), passed: payloadText.includes('1/6') }
          );
        } else if (commandName === 'etkinlik') {
          const before = await pool.query('SELECT COUNT(*)::int AS count FROM guild_events WHERE guild_id=$1', [guildId]);
          const interaction = makeInteraction(command, buildOptions(schema?.options, { __subcommand: 'liste' }), guildId, effects);
          interaction.user.id = userId;
          interaction.member = makeMember(userId);
          await command.execute(interaction);
          const after = await pool.query('SELECT COUNT(*)::int AS count FROM guild_events WHERE guild_id=$1', [guildId]);
          const payloadText = payloadTextFromEffects(effects);
          behavioralChecks.push(
            { name: 'Etkinlik takvimi liste görünümü', expected: 'yaklaşan etkinlik takvimi başlığı gösterilmeli', actual: payloadText.slice(0, 250), passed: payloadText.includes('Yaklaşan Macera Etkinlikleri') },
            { name: 'Etkinlik takvimi salt okunur', expected: 'listeleme etkinlik kayıtlarını değiştirmemeli', actual: before.rows[0]?.count + ' → ' + after.rows[0]?.count, passed: Number(before.rows[0]?.count) === Number(after.rows[0]?.count) }
          );
        } else if (commandName === 'maceraci') {
          const interaction = makeInteraction(command, buildOptions(schema?.options, { __subcommand: 'bagla' }), guildId, effects);
          interaction.user.id = userId;
          interaction.member = makeMember(userId);
          await command.execute(interaction);
          const token = await pool.query('SELECT expires_at FROM site_link_tokens WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const payloadText = payloadTextFromEffects(effects);
          const remainingMs = token.rowCount ? new Date(token.rows[0].expires_at).getTime() - Date.now() : 0;
          behavioralChecks.push(
            { name: 'Web panel bağlantı kodu oluşturma', expected: 'tek kullanımlık bağlantı kodu gösterilmeli ve veritabanına hash kaydı yazılmalı', actual: token.rowCount + ' token kaydı', passed: token.rowCount === 1 && payloadText.includes('Web Maceracı Paneli bağlantı kodun') },
            { name: 'Web panel bağlantı kodu 10 dakika geçerli', expected: 'kodun kalan geçerliliği 10 dakikadan uzun olmamalı', actual: Math.round(remainingMs / 1000) + ' saniye', passed: remainingMs > 0 && remainingMs <= 10 * 60 * 1000 + 5000 }
          );
        } else if (commandName === 'koleksiyonliderlik') {
          const rivalId = userId.slice(0, -1) + '8';
          await ensureUser(guildId, rivalId);
          const suffix = String(runContext.runId);
          const names = ['Audit Fern ' + suffix, 'Audit Frieren ' + suffix, 'Audit Stark ' + suffix];
          await pool.query(
            `INSERT INTO anime_character_collection
             (guild_id,user_id,character_name,anime,rarity,emoji,color,description,traits,image,quantity)
             VALUES
             ($1,$2,$3,'Frieren','Nadir','🌿',123,'audit','audit',NULL,2),
             ($1,$2,$4,'Frieren','Nadir','🌿',123,'audit','audit',NULL,1),
             ($1,$5,$6,'Frieren','Nadir','🌿',123,'audit','audit',NULL,9)`,
            [guildId, userId, names[0], names[1], rivalId, names[2]]
          );
          const interaction = makeInteraction(command, buildOptions(schema?.options), guildId, effects);
          interaction.user.id = userId;
          interaction.member = makeMember(userId);
          await command.execute(interaction);
          const ranking = await pool.query(
            `SELECT user_id,COUNT(*)::int AS unique_characters,COALESCE(SUM(quantity),0)::int AS total_copies
             FROM anime_character_collection WHERE guild_id=$1 GROUP BY user_id
             ORDER BY unique_characters DESC,total_copies DESC,user_id ASC LIMIT 10`,
            [guildId]
          );
          const payloadText = payloadTextFromEffects(effects);
          behavioralChecks.push(
            { name: 'Koleksiyon liderliği farklı karakter sıralaması', expected: 'iki farklı karakteri olan oyuncu, dokuz kopyalı tek karakter oyuncusunun üstünde olmalı', actual: ranking.rows.map(row => row.user_id + ':' + row.unique_characters + '/' + row.total_copies).join(', '), passed: ranking.rows[0]?.user_id === userId && Number(ranking.rows[0]?.unique_characters) === 2 && ranking.rows[1]?.user_id === rivalId },
            { name: 'Koleksiyon liderliği sunucu kapsamı ve yanıtı', expected: 'yalnızca bu sunucunun koleksiyon sıralaması ve iki oyuncu gösterilmeli', actual: payloadText.slice(0, 500), passed: ranking.rowCount === 2 && payloadText.includes('Sunucu Karakter Koleksiyonu') && payloadText.includes(userId) && payloadText.includes(rivalId) }
          );
        } else if (commandName === 'zindanodulleri') {
          await pool.query(
            'UPDATE users SET coins=100,xp=0,level=1,stat_points=0,dungeon_wins=25 WHERE guild_id=$1 AND user_id=$2',
            [guildId, userId]
          );
          const itemKeys = ['💎 Mana Kristali','🐉 Ejderha Pulu','👑 Himmel’in Efsanevi Yadigârı'];
          const interaction = makeInteraction(command, buildOptions(schema?.options), guildId, effects);
          interaction.user.id = userId;
          interaction.member = makeMember(userId);
          await command.execute(interaction);
          const firstState = await pool.query('SELECT coins,xp FROM users WHERE guild_id=$1 AND user_id=$2',[guildId,userId]);
          const firstClaims = await pool.query('SELECT milestone_key FROM dungeon_milestone_claims WHERE guild_id=$1 AND user_id=$2 ORDER BY milestone_key',[guildId,userId]);
          const firstItems = await pool.query('SELECT item_key,quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key=ANY($3::text[])',[guildId,userId,itemKeys]);
          const firstText = payloadTextFromEffects(effects);
          behavioralChecks.push(
            { name: 'Zindan kilometre taşı ödülleri', expected: '5, 10 ve 25 zafer ödülleri tek işlemde; +2350 altın ve +1100 XP', actual: 'altın ' + firstState.rows[0]?.coins + ', XP ' + firstState.rows[0]?.xp + ', hak ' + firstClaims.rowCount, passed: Number(firstState.rows[0]?.coins) === 2450 && Number(firstState.rows[0]?.xp) === 1100 && firstClaims.rowCount === 3 && firstItems.rowCount === 3 && firstItems.rows.every(row => Number(row.quantity) === 1) },
            { name: 'Zindan kilometre taşı ödül yanıtı', expected: 'üç kilometre taşı ve toplam kazanım gösterilmeli', actual: firstText.slice(0, 500), passed: firstText.includes('Zindan Kilometre Taşı Ödülleri') && firstText.includes('İlk Beş Zindan') && firstText.includes('On Zindan Ustası') && firstText.includes('Kuzey Zindan Efsanesi') }
          );
          const secondEffects = [];
          const secondInteraction = makeInteraction(command, buildOptions(schema?.options), guildId, secondEffects);
          secondInteraction.user.id = userId;
          secondInteraction.member = makeMember(userId);
          await command.execute(secondInteraction);
          const secondState = await pool.query('SELECT coins,xp FROM users WHERE guild_id=$1 AND user_id=$2',[guildId,userId]);
          const secondClaims = await pool.query('SELECT COUNT(*)::int AS count FROM dungeon_milestone_claims WHERE guild_id=$1 AND user_id=$2',[guildId,userId]);
          const secondItems = await pool.query('SELECT item_key,quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key=ANY($3::text[])',[guildId,userId,itemKeys]);
          behavioralChecks.push(
            { name: 'Zindan ödülü tekrar talebinde çift ödeme koruması', expected: 'ikinci talep altın, XP, eşya veya claim sayısını artırmamalı', actual: 'altın ' + secondState.rows[0]?.coins + ', XP ' + secondState.rows[0]?.xp + ', hak ' + secondClaims.rows[0]?.count, passed: Number(secondState.rows[0]?.coins) === 2450 && Number(secondState.rows[0]?.xp) === 1100 && Number(secondClaims.rows[0]?.count) === 3 && secondItems.rowCount === 3 && secondItems.rows.every(row => Number(row.quantity) === 1) }
          );
          effects.push(...secondEffects);
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
          const beforeLockedPractice = await pool.query('SELECT coins,mana FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const lockedEffects = [];
          const lockedInteraction = makeInteraction(command, buildOptions(schema?.options, { buyu: 'alev_kuresi' }), guildId, lockedEffects);
          lockedInteraction.user.id = userId;
          lockedInteraction.member = makeMember(userId);
          await command.execute(lockedInteraction);
          const afterLockedPractice = await pool.query('SELECT coins,mana FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const lockedText = payloadTextFromEffects(lockedEffects);
          behavioralChecks.push({
            name: 'Öğrenilmemiş büyü için pratik kilidi',
            expected: 'Alev Küresi öğrenilmedi uyarısı; altın ve mana değişmemeli',
            actual: lockedText.includes('henüz öğrenilmedi') ? 'öğrenilmemiş büyü reddedildi' : lockedText.slice(0, 250),
            passed: lockedText.includes('henüz öğrenilmedi') && Number(beforeLockedPractice.rows[0]?.coins) === Number(afterLockedPractice.rows[0]?.coins) && Number(beforeLockedPractice.rows[0]?.mana) === Number(afterLockedPractice.rows[0]?.mana)
          });
        }

        // Additional multi-path behavioral scenarios for feature rows that a single
        // default interaction cannot prove.
        if (commandName === 'kesif') {
          const regionMaterials = [
            ['merkez','🥐 Büyülü Poğaça Kutusu'],['orman','💎 Mana Kristali'],
            ['harabeler','📖 Yasak Büyü Kitabı'],['kuzey','🐉 Ejderha Pulu'],
            ['yayla','🌙 Efsunlu Elf Yadigârı'],['aus','📜 Frieren’in Kayıp Notları']
          ];
          const previousRandom = Math.random;
          try {
            Math.random = () => 0;
            for (let regionIndex=0; regionIndex<regionMaterials.length; regionIndex++) {
              const [regionKey,itemKey] = regionMaterials[regionIndex];
              const regionUserId = userId + String(regionIndex + 1);
              await ensureUser(guildId,regionUserId);
              await pool.query('UPDATE users SET level=50,xp=250000,coins=0,hp=max_hp,mana=max_mana,last_exploration_at=NULL WHERE guild_id=$1 AND user_id=$2',[guildId,regionUserId]);
              const actionEffects=[];
              const regionInteraction=makeInteraction(command,buildOptions(schema?.options,{bolge:regionKey}),guildId,actionEffects);
              regionInteraction.user.id=regionUserId;
              regionInteraction.member=makeMember(regionUserId);
              await command.execute(regionInteraction);
              effects.push(...actionEffects);
              const saved=await pool.query('SELECT quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key=$3',[guildId,regionUserId,itemKey]);
              behavioralChecks.push({
                name:'Bölgeye özgü üretim malzemesi: '+regionKey,
                expected:itemKey+' envantere eklenmeli',
                actual:saved.rowCount?itemKey+' ×'+saved.rows[0].quantity:'malzeme bulunamadı',
                passed:Number(saved.rows[0]?.quantity)===1
              });
            }
          } finally { Math.random = previousRandom; }
        }

        if (commandName === 'hikaye') {
          const pathCases=[
            {path:'cesaret',prepare:async id=>pool.query('UPDATE users SET boss_defeats=1 WHERE guild_id=$1 AND user_id=$2',[guildId,id])},
            {path:'merhamet',prepare:async id=>pool.query('UPDATE users SET items_used_count=1 WHERE guild_id=$1 AND user_id=$2',[guildId,id])},
            {path:'merak',prepare:async id=>pool.query("INSERT INTO learned_spells(guild_id,user_id,spell_key) VALUES($1,$2,'alev_kuresi')",[guildId,id])}
          ];
          for(let pathIndex=0;pathIndex<pathCases.length;pathIndex++){
            const scenario=pathCases[pathIndex],pathUserId=userId+String(pathIndex+7);
            await ensureUser(guildId,pathUserId);
            await pool.query('UPDATE users SET coins=0,xp=0,level=1,boss_defeats=0,items_used_count=0 WHERE guild_id=$1 AND user_id=$2',[guildId,pathUserId]);
            const startEffects=[];
            const startInteraction=makeInteraction(command,buildOptions(schema?.options,{karar:scenario.path}),guildId,startEffects);
            startInteraction.user.id=pathUserId; startInteraction.member=makeMember(pathUserId);
            await command.execute(startInteraction);
            await scenario.prepare(pathUserId);
            const progressEffects=[];
            const progressInteraction=makeInteraction(command,buildOptions(schema?.options,{karar:scenario.path}),guildId,progressEffects);
            progressInteraction.user.id=pathUserId; progressInteraction.member=makeMember(pathUserId);
            await command.execute(progressInteraction);
            effects.push(...startEffects,...progressEffects);
            const progress=await pool.query('SELECT current_chapter,choices FROM story_progress WHERE guild_id=$1 AND user_id=$2',[guildId,pathUserId]);
            const player=await pool.query('SELECT coins,xp FROM users WHERE guild_id=$1 AND user_id=$2',[guildId,pathUserId]);
            behavioralChecks.push({
              name:'Hikâye yol gereksinimi: '+scenario.path,
              expected:'seçilen yolun kendine özgü şartı sağlanınca Bölüm I açılmalı',
              actual:'chapter '+progress.rows[0]?.current_chapter+'; '+JSON.stringify(progress.rows[0]?.choices),
              passed:Number(progress.rows[0]?.current_chapter)===2 && progress.rows[0]?.choices?.[0]===scenario.path && Number(player.rows[0]?.coins)===190 && Number(player.rows[0]?.xp)===95
            });
          }
          const blockedUserId=userId+'6';
          await ensureUser(guildId,blockedUserId);
          await pool.query('UPDATE users SET coins=0,xp=0,level=1,boss_defeats=0 WHERE guild_id=$1 AND user_id=$2',[guildId,blockedUserId]);
          const blockedStart=makeInteraction(command,buildOptions(schema?.options,{karar:'cesaret'}),guildId,[]);
          blockedStart.user.id=blockedUserId; blockedStart.member=makeMember(blockedUserId);
          await command.execute(blockedStart);
          const blockedNext=makeInteraction(command,buildOptions(schema?.options,{karar:'cesaret'}),guildId,[]);
          blockedNext.user.id=blockedUserId; blockedNext.member=makeMember(blockedUserId);
          await command.execute(blockedNext);
          const blocked=await pool.query('SELECT current_chapter FROM story_progress WHERE guild_id=$1 AND user_id=$2',[guildId,blockedUserId]);
          behavioralChecks.push({
            name:'Hikâye gereksinimi sağlanmadan bölüm kilidi',
            expected:'boss zaferi olmayan Cesaret yolu Bölüm I ilerlemesini engellemeli',
            actual:'chapter '+blocked.rows[0]?.current_chapter,
            passed:Number(blocked.rows[0]?.current_chapter)===1
          });
        }

        if (commandName === 'npc') {
          const questCases=[
            {npc:'frieren',path:'merak',coins:260,xp:100},
            {npc:'fern',path:'merhamet',coins:220,xp:110},
            {npc:'stark',path:'cesaret',coins:280,xp:120}
          ];
          for(let questIndex=0;questIndex<questCases.length;questIndex++){
            const scenario=questCases[questIndex],questUserId=userId+String(questIndex+1);
            await ensureUser(guildId,questUserId);
            await pool.query('UPDATE users SET coins=0,xp=0,level=1,items_used_count=3,boss_defeats=2 WHERE guild_id=$1 AND user_id=$2',[guildId,questUserId]);
            await pool.query(
              'INSERT INTO story_progress(guild_id,user_id,current_chapter,choices) VALUES($1,$2,1,$3::jsonb) ON CONFLICT(guild_id,user_id) DO UPDATE SET current_chapter=1,choices=EXCLUDED.choices',
              [guildId,questUserId,JSON.stringify([scenario.path])]
            );
            if(scenario.npc==='frieren'){
              await pool.query("INSERT INTO learned_spells(guild_id,user_id,spell_key) VALUES($1,$2,'alev_kuresi'),($1,$2,'buz_mizragi') ON CONFLICT DO NOTHING",[guildId,questUserId]);
            }
            for(const action of ['gorev','teslim','teslim']){
              const actionEffects=[];
              const interaction=makeInteraction(command,buildOptions(schema?.options,{karakter:scenario.npc,eylem:action}),guildId,actionEffects);
              interaction.user.id=questUserId; interaction.member=makeMember(questUserId);
              await command.execute(interaction);
              effects.push(...actionEffects);
            }
            const claim=await pool.query('SELECT quest_key FROM side_quest_claims WHERE guild_id=$1 AND user_id=$2',[guildId,questUserId]);
            const player=await pool.query('SELECT coins,xp FROM users WHERE guild_id=$1 AND user_id=$2',[guildId,questUserId]);
            behavioralChecks.push(
              {name:'NPC yol kilidi ve yan görev: '+scenario.npc,expected:'yalnızca seçilen hikâye yolunun NPC görevi tamamlanmalı',actual:claim.rows[0]?.quest_key||'görev kaydı yok',passed:claim.rowCount===1},
              {name:'NPC görev ödülü: '+scenario.npc,expected:scenario.coins+' altın ve '+scenario.xp+' XP',actual:'altın '+player.rows[0]?.coins+', XP '+player.rows[0]?.xp,passed:Number(player.rows[0]?.coins)===scenario.coins&&Number(player.rows[0]?.xp)===scenario.xp}
            );
          }
        }

        if (commandName === 'maceragecmisi') {
          const targetId=userId+'5';
          await ensureUser(guildId,targetId);
          await pool.query('UPDATE users SET level=12,xp=900,coins=450,boss_defeats=2,exploration_count=5,items_used_count=3,character_draw_count=4 WHERE guild_id=$1 AND user_id=$2',[guildId,targetId]);
          await pool.query(
            'INSERT INTO adventure_history(guild_id,user_id,discovery_key,outcome_text,coins_awarded,xp_awarded,item_found,first_discovery) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
            [guildId,targetId,'isolated-other-player-history','OtherPlayer test expedition record',77,55,'Target relic',true]
          );
          const targetUser={id:targetId,username:'OtherPlayer',tag:'OtherPlayer#0001',displayAvatarURL:()=> 'https://example.com/other.png',toString(){return '<@'+targetId+'>';}};
          const before=await pool.query('SELECT coins,xp,level,exploration_count,items_used_count,character_draw_count FROM users WHERE guild_id=$1 AND user_id=$2',[guildId,targetId]);
          const interaction=makeInteraction(command,buildOptions(schema?.options,{kullanici:targetUser}),guildId,effects);
          interaction.user.id=userId; interaction.member=makeMember(userId);
          await command.execute(interaction);
          const after=await pool.query('SELECT coins,xp,level,exploration_count,items_used_count,character_draw_count FROM users WHERE guild_id=$1 AND user_id=$2',[guildId,targetId]);
          const payloadText=JSON.stringify(effects.map(effect=>effect.payload));
          behavioralChecks.push(
            {name:'Başka oyuncunun macera geçmişi',expected:'seçilen oyuncunun profili ve kendi macera kaydı gösterilmeli',actual:payloadText.includes('OtherPlayer test expedition record')?'hedef oyuncunun macera kaydı gösterildi':payloadText.slice(0,350),passed:payloadText.includes('OtherPlayer')&&payloadText.includes('Seviye: **12**')&&payloadText.includes('450')&&payloadText.includes('OtherPlayer test expedition record')&&payloadText.includes('Target relic')},
            {name:'Başka oyuncunun istatistik kapsamı',expected:'boss, keşif, eşya kullanımı ve karakter çekimi sayıları görünmeli',actual:['İblis zaferi','Keşif: **5**','Kullanılan eşya: **3**','Karakter çekimi: **4**'].filter(x=>payloadText.includes(x)).join(', '),passed:['İblis zaferi','Keşif: **5**','Kullanılan eşya: **3**','Karakter çekimi: **4**'].every(x=>payloadText.includes(x))},
            {name:'Başka oyuncunun verisi salt okunur',expected:'hedef oyuncunun RPG durumu değişmemeli',actual:JSON.stringify(before.rows[0])+' → '+JSON.stringify(after.rows[0]),passed:Object.keys(before.rows[0]).every(key=>Number(before.rows[0][key])===Number(after.rows[0][key]))}
          );
        }

        if (commandName === 'bossrehberi') {
          await pool.query('UPDATE users SET level=20,boss_defeats=3 WHERE guild_id=$1 AND user_id=$2',[guildId,userId]);
          const interaction=makeInteraction(command,buildOptions(schema?.options),guildId,effects);
          interaction.user.id=userId; interaction.member=makeMember(userId);
          await command.execute(interaction);
          const payloadText=payloadTextFromEffects(effects);
          behavioralChecks.push(
            {name:'Oyuncu seviyesine göre boss kademesi',expected:'seviye 20 için Kuzey İblisi ve sıradaki seviye 35 bossu gösterilmeli',actual:payloadText.includes('Kuzey İblisi')&&payloadText.includes('Büyük İblis Komutanı')?'kademe ve sonraki eşik doğru':'boss rehberi içeriği eksik',passed:payloadText.includes('Seviyene göre kademe')&&payloadText.includes('Kuzey İblisi')&&payloadText.includes('Büyük İblis Komutanı')},
            {name:'Boss rehberi zafer ve ödül bilgileri',expected:'boss zafer sayısı, ödül ve ganimet olasılıkları gösterilmeli',actual:payloadText.includes('Boss zaferi')&&payloadText.includes('3')&&payloadText.includes('Nadir ganimet')?'zafer/ganimet alanları gösterildi':'rehber alanları eksik',passed:payloadText.includes('Boss zaferi')&&payloadText.includes('Nadir ganimet')}
          );
        }


        if (commandName === 'profil') {
          const targetId=userId+'4';
          await ensureUser(guildId,targetId);
          await pool.query("UPDATE users SET level=18,xp=1700,coins=765,class_name='Büyücü',active_build='avci',hp=50,max_hp=100,mana=40,max_mana=80,attack=100,defense=50 WHERE guild_id=$1 AND user_id=$2",[guildId,targetId]);
          await pool.query('INSERT INTO user_talents(guild_id,user_id,attack_rank,defense_rank,hp_rank,mana_rank) VALUES($1,$2,1,1,1,1) ON CONFLICT(guild_id,user_id) DO UPDATE SET attack_rank=1,defense_rank=1,hp_rank=1,mana_rank=1',[guildId,targetId]);
          const targetUser={id:targetId,username:'ProfileTarget',tag:'ProfileTarget#0001',displayAvatarURL:()=> 'https://example.com/profile.png',toString(){return '<@'+targetId+'>';}};
          const before=await pool.query('SELECT level,xp,coins FROM users WHERE guild_id=$1 AND user_id=$2',[guildId,targetId]);
          const actionEffects=[];
          const interaction=makeInteraction(command,buildOptions(schema?.options,{kullanici:targetUser}),guildId,actionEffects);
          interaction.user.id=userId; interaction.member=makeMember(userId);
          await command.execute(interaction);
          effects.push(...actionEffects);
          const after=await pool.query('SELECT level,xp,coins FROM users WHERE guild_id=$1 AND user_id=$2',[guildId,targetId]);
          const payloadText=JSON.stringify(actionEffects.map(effect=>effect.payload));
          behavioralChecks.push(
            {name:'Başka oyuncunun RPG profili ve savaş yapısı',expected:'hedef oyuncunun adı, seviyesi, XP, altın ve Avcı yapısı gösterilmeli',actual:payloadText.includes('Avcı')?'Avcı profili gösterildi':payloadText.slice(0,300),passed:payloadText.includes('ProfileTarget')&&payloadText.includes('Seviye')&&payloadText.includes('18')&&payloadText.includes('1.700')&&payloadText.includes('765')&&payloadText.includes('Avcı')},
            {name:'Profilin yapı ve yetenek bonuslarıyla hesaplanan değerleri',expected:'53/105 HP, 42/84 mana, 125 saldırı ve 47 savunma gösterilmeli',actual:['53/105','42/84','125','47'].filter(value=>payloadText.includes(value)).join(', '),passed:['53/105','42/84','125','47'].every(value=>payloadText.includes(value))},
            {name:'Başka oyuncu profili salt okunur',expected:'hedef oyuncunun ilerleme değerleri değişmemeli',actual:JSON.stringify(before.rows[0])+' → '+JSON.stringify(after.rows[0]),passed:Object.keys(before.rows[0]).every(key=>Number(before.rows[0][key])===Number(after.rows[0][key]))}
          );
        }

        if (commandName === 'siralama') {
          const rivalId=userId+'3';
          const outsiderId=userId+'8';
          const foreignGuildId='foreign-'+guildId;
          await ensureUser(guildId,rivalId);
          await ensureUser(foreignGuildId,outsiderId);
          await pool.query('UPDATE users SET xp=2500,boss_defeats=8,dungeon_wins=6 WHERE guild_id=$1 AND user_id=$2',[guildId,rivalId]);
          await pool.query('UPDATE users SET xp=900,boss_defeats=2,dungeon_wins=1 WHERE guild_id=$1 AND user_id=$2',[guildId,userId]);
          await pool.query('UPDATE users SET xp=999999,boss_defeats=999,dungeon_wins=999 WHERE guild_id=$1 AND user_id=$2',[foreignGuildId,outsiderId]);
          const categories=[
            ['xp','Toplam XP','2.500 XP'],
            ['bosses','İblis zaferi','8 zafer'],
            ['dungeons','Zindan zaferi','6 zafer']
          ];
          for(const [category,label,expected] of categories){
            const actionEffects=[];
            const interaction=makeInteraction(command,buildOptions(schema?.options,{kategori:category}),guildId,actionEffects);
            interaction.user.id=userId; interaction.member=makeMember(userId);
            await command.execute(interaction);
            effects.push(...actionEffects);
            const payloadText=JSON.stringify(actionEffects.map(effect=>effect.payload));
            const rivalPosition=payloadText.indexOf('<@'+rivalId+'>');
            const ownPosition=payloadText.indexOf('<@'+userId+'>');
            behavioralChecks.push({
              name:'Sunucu liderlik kategorisi: '+label,
              expected:label+' sıralamasında yüksek skorlu rakip üstte, oyuncu altta ve başka sunucu oyuncusu dışarıda kalmalı',
              actual:payloadText.includes(expected)&&rivalPosition>=0&&ownPosition>rivalPosition&&!payloadText.includes('<@'+outsiderId+'>')?'sıralama, sıra önceliği ve sunucu izolasyonu doğru':payloadText.slice(0,500),
              passed:payloadText.includes(label)&&payloadText.includes(expected)&&rivalPosition>=0&&ownPosition>rivalPosition&&!payloadText.includes('<@'+outsiderId+'>')
            });
          }
        }

        if (commandName === 'sans') {
          const previousRandom=Math.random;
          try {
            const outcomes=[];
            for(const value of [0,0.999]){
              Math.random=()=>value;
              const actionEffects=[];
              const interaction=makeInteraction(command,buildOptions(schema?.options),guildId,actionEffects);
              interaction.user.id=userId; interaction.member=makeMember(userId);
              await command.execute(interaction);
              effects.push(...actionEffects);
              outcomes.push(payloadTextFromEffects(actionEffects));
            }
            behavioralChecks.push(
              {name:'Şans yüzdesi alt sınırı',expected:'rastgele değer 0 için %0 gösterilmeli',actual:outcomes[0].includes('%0')?'%0':'alt sınır bulunamadı',passed:outcomes[0].includes('%0')},
              {name:'Şans yüzdesi üst sınırı',expected:'rastgele değer 0.999 için %100 gösterilmeli ve yüksek şans yorumu gelmeli',actual:outcomes[1].includes('%100')?'%100':'üst sınır bulunamadı',passed:outcomes[1].includes('%100')&&outcomes[1].includes('yıldızlar senden yana')}
            );
          } finally { Math.random=previousRandom; }
        }

        if (commandName === 'buyupratik') {
          await pool.query('DELETE FROM learned_spells WHERE guild_id=$1 AND user_id=$2 AND spell_key=$3', [guildId, userId, 'alev_kuresi']);
          await pool.query('DELETE FROM spell_mastery WHERE guild_id=$1 AND user_id=$2 AND spell_key=$3', [guildId, userId, 'alev_kuresi']);
          await pool.query('UPDATE users SET coins=100,mana=100 WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const before = await pool.query('SELECT coins,mana FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const lockedEffects = [];
          const lockedInteraction = makeInteraction(command, buildOptions(schema?.options, { buyu: 'alev_kuresi' }), guildId, lockedEffects);
          lockedInteraction.user.id = userId;
          lockedInteraction.member = makeMember(userId);
          await command.execute(lockedInteraction);
          const afterLocked = await pool.query('SELECT coins,mana FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const lockedMastery = await pool.query('SELECT 1 FROM spell_mastery WHERE guild_id=$1 AND user_id=$2 AND spell_key=$3', [guildId, userId, 'alev_kuresi']);
          await pool.query('INSERT INTO learned_spells(guild_id,user_id,spell_key) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [guildId, userId, 'alev_kuresi']);
          const learnedEffects = [];
          const learnedInteraction = makeInteraction(command, buildOptions(schema?.options, { buyu: 'alev_kuresi' }), guildId, learnedEffects);
          learnedInteraction.user.id = userId;
          learnedInteraction.member = makeMember(userId);
          await command.execute(learnedInteraction);
          const afterLearned = await pool.query('SELECT coins,mana FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
          const learnedMastery = await pool.query('SELECT casts,mastery_level FROM spell_mastery WHERE guild_id=$1 AND user_id=$2 AND spell_key=$3', [guildId, userId, 'alev_kuresi']);
          effects.push(...lockedEffects, ...learnedEffects);
          behavioralChecks.push(
            { name: 'Öğrenilmemiş büyü pratiği kaynak koruması', expected: 'Alev Küresi öğrenilmediyse işlem reddedilmeli; altın, mana ve ustalık kaydı değişmemeli', actual: JSON.stringify(before.rows[0]) + ' → ' + JSON.stringify(afterLocked.rows[0]), passed: lockedEffects.length > 0 && payloadTextFromEffects(lockedEffects).includes('henüz öğrenilmedi') && Number(before.rows[0].coins) === Number(afterLocked.rows[0].coins) && Number(before.rows[0].mana) === Number(afterLocked.rows[0].mana) && lockedMastery.rowCount === 0 },
            { name: 'Öğrenilmiş büyü pratiği kaynak ve ustalık kaydı', expected: 'öğrenilmiş Alev Küresi 25 altın ve 8 mana harcayıp bir kullanım kaydetmeli', actual: 'altın ' + afterLearned.rows[0]?.coins + ', mana ' + afterLearned.rows[0]?.mana + ', kullanım ' + learnedMastery.rows[0]?.casts, passed: Number(afterLearned.rows[0]?.coins) === 75 && Number(afterLearned.rows[0]?.mana) === 92 && Number(learnedMastery.rows[0]?.casts) === 1 && Number(learnedMastery.rows[0]?.mastery_level) === 0 }
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