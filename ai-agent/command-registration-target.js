import { Routes } from 'discord.js';

export const FRIEREN_AI_TEST_GUILD_ID = '1564945192803639356';

export function getFrierenAiCommandRoute(clientId) {
  if (typeof clientId !== 'string' || !clientId.trim()) {
    throw new Error('DISCORD_CLIENT_ID is required to register Frieren AI commands.');
  }
  return Routes.applicationGuildCommands(clientId.trim(), FRIEREN_AI_TEST_GUILD_ID);
}

function matchesExpected(expected, actual) {
  if (Array.isArray(expected)) {
    return Array.isArray(actual)
      && expected.length === actual.length
      && expected.every((value, index) => matchesExpected(value, actual[index]));
  }
  if (expected && typeof expected === 'object') {
    if (!actual || typeof actual !== 'object' || Array.isArray(actual)) return false;
    return Object.entries(expected).every(([key, value]) =>
      Object.hasOwn(actual, key) && matchesExpected(value, actual[key]));
  }
  return Object.is(expected, actual);
}

export async function registerCommandsIfChanged(rest, route, commands) {
  const existing = await rest.get(route);
  const existingByName = new Map(existing.map(command => [command.name, command]));
  const unchanged = existing.length === commands.length
    && commands.every(command => {
      const remote = existingByName.get(command.name);
      return remote && matchesExpected(command, remote);
    });

  if (unchanged) return { changed: false, count: existing.length };

  await rest.put(route, { body: commands });
  return { changed: true, count: commands.length };
}
