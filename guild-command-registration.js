import { Routes } from 'discord.js';

const SNOWFLAKE = /^\\d{17,20}$/;
const GLOBAL_COMMAND_NAMES = new Set(['haberleri-ayarla', 'haberleri-kapat']);
const PROTECTED_GUILD_IDS = new Set([
  '1539562273197260860',
  '1564945192803639356'
]);

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value)
      .filter(key => !['id', 'application_id', 'guild_id', 'version'].includes(key))
      .sort()
      .map(key => [key, stableValue(value[key])]));
  }
  return value;
}

function matchesDesired(existing, desired) {
  const current = stableValue(existing);
  const wanted = stableValue(desired);
  return Object.entries(wanted).every(([key, value]) => {
    if (value === undefined) return true;
    if (Array.isArray(value)) return Array.isArray(current[key]) && JSON.stringify(current[key]) === JSON.stringify(value);
    if (value && typeof value === 'object') return Boolean(current[key]) && matchesDesired(current[key], value);
    return current[key] === value || (value == null && current[key] == null);
  });
}

export async function registerGuildCommands({ guildId, applicationId, commands, rest }) {
  const id = String(guildId || '');
  const appId = String(applicationId || '');
  if (!SNOWFLAKE.test(id) || !SNOWFLAKE.test(appId) || !Array.isArray(commands) || !rest?.get || !rest?.put) {
    throw new Error('INVALID_GUILD_COMMAND_REGISTRATION');
  }
  if (PROTECTED_GUILD_IDS.has(id)) return { status: 'protected_guild', count: 0 };

  const desired = commands
    .filter(command => command?.data?.toJSON && !GLOBAL_COMMAND_NAMES.has(command.data.name))
    .map(command => command.data.toJSON());
  const names = desired.map(command => command.name);
  if (!desired.length || names.some((name, index) => names.indexOf(name) !== index)) {
    throw new Error('INVALID_GUILD_COMMAND_DEFINITIONS');
  }

  const route = Routes.applicationGuildCommands(appId, id);
  const existing = await rest.get(route);
  const byName = new Map((Array.isArray(existing) ? existing : []).map(command => [command.name, command]));
  const unchanged = Array.isArray(existing) && existing.length === desired.length
    && desired.every(command => byName.has(command.name) && matchesDesired(byName.get(command.name), command));
  if (unchanged) return { status: 'unchanged', count: desired.length };

  await rest.put(route, { body: desired });
  return { status: 'registered', count: desired.length };
}
