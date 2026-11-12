import { ActivityType } from 'discord.js';

const WATCHING_ACTIVITY = Object.freeze({
  name: "Frieren: Beyond Journey's End Season 6",
  type: ActivityType.Watching,
});

export function buildPresenceActivities() {
  return [WATCHING_ACTIVITY];
}
