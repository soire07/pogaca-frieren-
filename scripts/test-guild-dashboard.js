import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasManageGuildPermission,
  filterManageableGuilds,
  createGuildOAuthState,
  verifyGuildOAuthState,
  encryptDiscordOAuthToken,
  decryptDiscordOAuthToken,
  GUILD_FEATURE_CATALOG,
} from '../guild-dashboard.js';

const secret = 'frieren-guild-dashboard-test-secret-at-least-32-characters';
const owner = 'site_123e4567-e89b-12d3-a456-426614174000';

test('Discord guild permission checks accept Manage Guild and Administrator only', () => {
  assert.equal(hasManageGuildPermission('32'), true);
  assert.equal(hasManageGuildPermission('8'), true);
  assert.equal(hasManageGuildPermission('40'), true);
  assert.equal(hasManageGuildPermission('0'), false);
  assert.equal(hasManageGuildPermission('4'), false);
  assert.equal(hasManageGuildPermission('not-a-number'), false);
  assert.equal(hasManageGuildPermission(null), false);
});

test('guild list filters inaccessible guilds and marks whether Frieren bot is present', () => {
  const result = filterManageableGuilds([
    { id: '1539562273197260860', name: 'Main', permissions: '32', icon: 'abc' },
    { id: '1564945192803639356', name: 'Test', permissions: '8', icon: null },
    { id: '1564945192803639357', name: 'No access', permissions: '4' },
    { id: 'invalid', name: 'Invalid', permissions: '32' },
  ], new Set(['1539562273197260860']));
  assert.deepEqual(result.map(g => [g.id, g.botPresent]), [
    ['1539562273197260860', true],
    ['1564945192803639356', false],
  ]);
});

test('Discord OAuth state is account-bound, signed, and expires', () => {
  const now = 1_800_000_000_000;
  const state = createGuildOAuthState(owner, secret, now);
  assert.equal(verifyGuildOAuthState(state, owner, secret, now + 1000), true);
  assert.equal(verifyGuildOAuthState(state, 'site_other-account', secret, now + 1000), false);
  assert.equal(verifyGuildOAuthState(state, owner, 'another-secret-that-is-long-enough', now + 1000), false);
  assert.equal(verifyGuildOAuthState(state, owner, secret, now + 11 * 60 * 1000), false);
  assert.equal(verifyGuildOAuthState(state + 'x', owner, secret, now + 1000), false);
});

test('Discord OAuth tokens are encrypted at rest and authenticated on decrypt', () => {
  const encrypted = encryptDiscordOAuthToken('discord-access-token', secret);
  assert.notEqual(encrypted, 'discord-access-token');
  assert.equal(decryptDiscordOAuthToken(encrypted, secret), 'discord-access-token');
  assert.throws(() => decryptDiscordOAuthToken(encrypted, 'another-secret-that-is-long-enough'), /INVALID_DISCORD_TOKEN_CIPHERTEXT/);
  assert.throws(() => decryptDiscordOAuthToken(encrypted + 'x', secret), /INVALID_DISCORD_TOKEN_CIPHERTEXT/);
});

test('guild dashboard catalog only exposes working toggles and labels future entertainment modules as planned', () => {
  const active = GUILD_FEATURE_CATALOG.filter(feature => feature.status === 'ready');
  const planned = GUILD_FEATURE_CATALOG.filter(feature => feature.status === 'planned');
  assert.ok(active.some(feature => feature.key === 'animeQuiz'));
  assert.ok(active.some(feature => feature.key === 'collection'));
  assert.ok(active.some(feature => feature.key === 'dailyRewards'));
  assert.ok(planned.some(feature => feature.id === 'pets'));
  assert.ok(planned.some(feature => feature.id === 'fishing'));
  assert.ok(planned.some(feature => feature.id === 'miniGames'));
  assert.ok(planned.every(feature => !feature.key));
});
