import { Routes } from 'discord.js';

export const FRIEREN_AI_TEST_GUILD_ID = '1564945192803639356';

export function getFrierenAiCommandRoute(clientId) {
  if (typeof clientId !== 'string' || !clientId.trim()) {
    throw new Error('DISCORD_CLIENT_ID is required to register Frieren AI commands.');
  }
  return Routes.applicationGuildCommands(clientId.trim(), FRIEREN_AI_TEST_GUILD_ID);
}
