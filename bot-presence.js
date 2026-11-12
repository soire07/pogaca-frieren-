import { ActivityType } from 'discord.js';

export function buildPresenceActivities(guildCount) {
  const parsedCount = Number(guildCount);
  const count = Number.isFinite(parsedCount) ? Math.max(0, Math.floor(parsedCount)) : 0;
  const serverLabel = count === 1 ? 'Discord server' : 'Discord servers';

  return [
    { name: `${count} ${serverLabel}`, type: ActivityType.Watching },
    { name: 'Frieren RPG', type: ActivityType.Playing },
    { name: "Himmel's memories", type: ActivityType.Listening },
    { name: 'the Magic Arena', type: ActivityType.Competing },
  ];
}
