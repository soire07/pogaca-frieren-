import test from 'node:test';
import assert from 'node:assert/strict';
import { checkModerationPermissions } from './moderation-safety.js';

const makeInteraction = ({ guildId = 'guild-1', guild = true, actor = true, bot = true } = {}) => ({
  guildId,
  guild: guild ? { members: { me: { permissions: { has: bit => bot && bit === 8 } } } } : null,
  memberPermissions: { has: bit => actor && bit === 8 },
});

test('moderation access requires a guild context', () => {
  const result = checkModerationPermissions(makeInteraction({ guildId: null, guild: false }), 8);
  assert.equal(result.ok, false);
  assert.match(result.reason, /sunucuda/);
});

test('moderation access rejects a user without the required permission', () => {
  const result = checkModerationPermissions(makeInteraction({ actor: false }), 8);
  assert.equal(result.ok, false);
  assert.match(result.reason, /moderasyon iznine/);
});

test('moderation access rejects when the bot lacks the required permission', () => {
  const result = checkModerationPermissions(makeInteraction({ bot: false }), 8);
  assert.equal(result.ok, false);
  assert.match(result.reason, /Botun gerekli izni/);
});

test('moderation access accepts only when actor and bot both have the permission', () => {
  assert.deepEqual(checkModerationPermissions(makeInteraction(), 8), { ok: true, reason: '' });
});
