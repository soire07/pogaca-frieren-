import test from 'node:test';
import assert from 'node:assert/strict';
import { ActivityType } from 'discord.js';
import { FRIEREN_WATCHING_ACTIVITY } from '../bot-presence.js';

test('bot presence displays the requested Frieren Season 6 Watching activity', () => {
  assert.deepEqual(FRIEREN_WATCHING_ACTIVITY, {
    name: "Frieren: Beyond Journey's End Season 6",
    type: ActivityType.Watching,
  });
});

test('the static Watching activity does not claim to provide a fake Join action', () => {
  assert.equal('buttons' in FRIEREN_WATCHING_ACTIVITY, false);
  assert.equal('url' in FRIEREN_WATCHING_ACTIVITY, false);
});
