import test from 'node:test';
import assert from 'node:assert/strict';
import { getTestLockKey, getPublicHealthPayload, getPublicHealthStatus, isAuthorizedAdmin, sendPrivateError } from './interaction-safety.js';

test('authorization accepts only exact non-empty IDs in the trusted allowlist', () => {
  const admins = new Set(['123', '456']);
  assert.equal(isAuthorizedAdmin('123', admins), true);
  assert.equal(isAuthorizedAdmin(' 123', admins), false);
  assert.equal(isAuthorizedAdmin('', admins), false);
  assert.equal(isAuthorizedAdmin(undefined, admins), false);
  assert.equal(isAuthorizedAdmin('123', ['123']), false);
});

test('test lock keys are stable and separate guilds from direct-message users', () => {
  assert.equal(getTestLockKey('guild-1', 'user-1'), 'guild:guild-1');
  assert.equal(getTestLockKey(null, 'user-1'), 'user:user-1');
  assert.equal(getTestLockKey(null, null), 'unknown-interaction');
});

test('private error replies edit a deferred response instead of sending a second reply', async () => {
  const calls = [];
  const interaction = {
    deferred: true,
    replied: false,
    async editReply(payload) { calls.push(['editReply', payload]); },
    async reply(payload) { calls.push(['reply', payload]); },
  };
  assert.equal(await sendPrivateError(interaction, 'safe error'), true);
  assert.deepEqual(calls, [['editReply', { content: 'safe error' }]]);
});

test('private error replies respond ephemerally when deferReply failed before acknowledgement', async () => {
  const calls = [];
  const interaction = {
    deferred: false,
    replied: false,
    async editReply(payload) { calls.push(['editReply', payload]); },
    async reply(payload) { calls.push(['reply', payload]); },
  };
  assert.equal(await sendPrivateError(interaction, 'safe error'), true);
  assert.deepEqual(calls, [['reply', { content: 'safe error', ephemeral: true }]]);
});

test('failed error replies are swallowed and reported without causing another unhandled rejection', async () => {
  const reported = [];
  const interaction = {
    deferred: false,
    replied: false,
    async reply() { throw new Error('interaction expired'); },
  };
  assert.equal(await sendPrivateError(interaction, 'safe error', error => reported.push(error.message)), false);
  assert.deepEqual(reported, ['interaction expired']);
});


test('public health payload reports Discord readiness without disclosing internal configuration', () => {
  assert.deepEqual(getPublicHealthPayload({ discordReady: true }), { status: 'ok', discordReady: true });
  assert.deepEqual(getPublicHealthPayload({ discordReady: false }), { status: 'ok', discordReady: false });
  assert.deepEqual(getPublicHealthPayload(), { status: 'ok', discordReady: false });
  const payload = getPublicHealthPayload({ discordReady: true });
  assert.equal('persistentMemoryConfigured' in payload, false);
  assert.equal('discordToken' in payload, false);
});


test('health endpoint status stays unready until Discord gateway is ready', () => {
  assert.equal(getPublicHealthStatus({ discordReady: false }), 503);
  assert.equal(getPublicHealthStatus({ discordReady: true }), 200);
  assert.equal(getPublicHealthStatus(), 503);
});
