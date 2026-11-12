import test from 'node:test';
import assert from 'node:assert/strict';
import { ActivityType } from 'discord.js';
import { buildPresenceActivities } from '../bot-presence.js';

test('presence rotation reports the actual cached Discord server count', () => {
  const activities = buildPresenceActivities(8);

  assert.equal(activities[0].name, '8 Discord servers');
  assert.equal(activities[0].type, ActivityType.Watching);
});

test('presence rotation uses the singular label for one server', () => {
  assert.equal(buildPresenceActivities(1)[0].name, '1 Discord server');
});

test('presence rotation includes distinct Frieren-themed activity types', () => {
  const activities = buildPresenceActivities(3);

  assert.deepEqual(
    activities.slice(1).map(activity => activity.type),
    [ActivityType.Playing, ActivityType.Listening, ActivityType.Competing],
  );
  assert.deepEqual(
    activities.slice(1).map(activity => activity.name),
    ['Frieren RPG', "Himmel's memories", 'the Magic Arena'],
  );
});

test('presence rotation safely normalizes invalid and negative server counts', () => {
  assert.equal(buildPresenceActivities(-4)[0].name, '0 Discord servers');
  assert.equal(buildPresenceActivities('not-a-number')[0].name, '0 Discord servers');
  assert.equal(buildPresenceActivities(2.9)[0].name, '2 Discord servers');
});
