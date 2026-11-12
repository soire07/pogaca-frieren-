import test from 'node:test';
import assert from 'node:assert/strict';
import { ActivityType } from 'discord.js';
import { buildPresenceActivities } from '../bot-presence.js';

test('bot presence stays on the requested Frieren anime Watching activity', () => {
  assert.deepEqual(buildPresenceActivities(), [{
    name: "Frieren: Beyond Journey's End Season 6",
    type: ActivityType.Watching,
  }]);
});

test('presence exposes one static activity and does not advertise a fake join action', () => {
  const activities = buildPresenceActivities();

  assert.equal(activities.length, 1);
  assert.equal('buttons' in activities[0], false);
  assert.equal('url' in activities[0], false);
});
