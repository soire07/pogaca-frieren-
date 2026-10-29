import { withIsolatedTestSchema, ensureUser } from '../database/db.js';

const TEST_GUILD_PREFIX = 'frieren-test-guild-';
const TEST_USER_PREFIX = '900000000000';

function sampleValue(option) {
  if (option.type === 1 || option.type === 2) return undefined;
  switch (option.type) {
    case 3: return option.choices?.[0]?.value ?? 'test';
    case 4: return option.min_value ?? 1;
    case 5: return true;
    case 6: return { id: '900000000000000001', username: 'FrierenTest', tag: 'FrierenTest#0001', bot: false, toString() { return '<@900000000000000001>'; } };
    case 7: return fakeChannel();
    case 8: return { id: '900000000000000002', name: 'test-role', members: new Map(), toString() { return '<@&900000000000000002>'; } };
    case 9: return { id: '900000000000000003', username: 'FrierenTest', toString() { return '<@900000000000000003>'; } };
    case 10: return option.min_value ?? 1;
    case 11: return null;
    default: return undefined;
  }
}
function fakeChannel() {
  return { id: '900000000000000004', name: 'test-channel', isTextBased: () => true, send: async () => ({ id: 'test-message' }), toString() { return '<#900000000000000004>'; } };
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
    displayName: 'FrierenTest', nickname: null, roles, permissions: { has: () => true },
    ban: async () => ({ simulated: true }), kick: async () => ({ simulated: true }),
    timeout: async () => ({ simulated: true }), setNickname: async () => ({ simulated: true }),
    communicationDisabledUntilTimestamp: null, toString() { return '<@' + id + '>'; }
  };
}
function makeInteraction(command, options, guildId, effects) {
  const user = { id: '900000000000000001', username: 'FrierenTest', tag: 'FrierenTest#0001', bot: false, displayAvatarURL: () => '', toString() { return '<@' + this.id + '>'; } };
  const member = makeMember(user.id);
  const channel = fakeChannel();
  const guild = {
    id: guildId, name: 'Frieren Isolated Test Guild', memberCount: 1,
    members: { cache: new Map([[user.id, member]]), fetch: async (id) => makeMember(typeof id === 'string' ? id : user.id) },
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
        const options = buildOptions(schema?.options, { user: undefined });
        const interaction = makeInteraction(command, options, guildId, effects);
        interaction.user.id = userId;
        interaction.member = makeMember(userId);
        await command.execute(interaction);
        const responded = effects.length > 0;
        const expected = 'Komut işleyicisi hata atmadan tamamlanmalı ve en az bir Discord yanıtı/etkisi üretmeli.';
        const actual = responded
          ? 'İşleyici tamamlandı; ' + effects.length + ' yanıt/etki kaydedildi.'
          : 'İşleyici tamamlandı ancak yanıt/etki kaydedilmedi.';
        results.push({
          command: schema?.name || 'unknown',
          status: responded ? 'PASS' : 'FAIL',
          expected,
          actual,
          comparison: responded ? 'MATCH: temel işleyici sözleşmesi sağlandı' : 'MISMATCH: beklenen yanıt/etki yok',
          evidenceType: 'handler-executed-with-synthetic-discord-interaction',
          automaticallyObserved: true,
          responseCount: effects.length,
          responses: effects.slice(0, 4),
          error: responded ? null : 'Komut tamamlandı ancak yanıt/etki kaydedilmedi.'
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
      note: 'This validates command handler execution and recorded response, not Discord API delivery or semantic correctness of every feature. Commands that require external Discord state may fail due to fixture limits.',
      summary: {
        total: results.length,
        pass: results.filter(x => x.status === 'PASS').length,
        fail: results.filter(x => x.status === 'FAIL').length,
        blocked: 0
      },
      results
    };
  });
}
