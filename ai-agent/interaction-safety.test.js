import test from 'node:test';
import assert from 'node:assert/strict';
import { MessageFlags } from 'discord.js';
import { getTestLockKey, getPublicHealthPayload, getPublicHealthStatus, isAuthorizedAdmin, isPrivateHealthPath, sendPrivateError } from './interaction-safety.js';

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
  assert.deepEqual(calls, [['reply', { content: 'safe error', flags: MessageFlags.Ephemeral }]]);
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


test('public health payload reports dependency readiness without exposing configuration', () => {
  const ready = {
    discordReady: true,
    memoryDatabaseReady: true,
    modelConfigured: true,
    bridgeConfigured: false,
  };
  assert.deepEqual(getPublicHealthPayload(ready), {
    status: 'ok',
    discordReady: true,
    memoryDatabaseReady: true,
    modelConfigured: true,
    bridgeConfigured: false,
  });
  const notReady = getPublicHealthPayload({ discordReady: true, memoryDatabaseReady: false, modelConfigured: true });
  assert.deepEqual(notReady, {
    status: 'not_ready',
    discordReady: true,
    memoryDatabaseReady: false,
    modelConfigured: true,
    bridgeConfigured: false,
  });
  assert.equal('discordToken' in notReady, false);
  assert.equal('databaseUrl' in notReady, false);
  assert.equal('groqApiKey' in notReady, false);
});

test('health endpoint reports ready only when Discord, memory database and model are ready', () => {
  assert.equal(getPublicHealthStatus({ discordReady: false, memoryDatabaseReady: true, modelConfigured: true }), 503);
  assert.equal(getPublicHealthStatus({ discordReady: true, memoryDatabaseReady: false, modelConfigured: true }), 503);
  assert.equal(getPublicHealthStatus({ discordReady: true, memoryDatabaseReady: true, modelConfigured: false }), 503);
  assert.equal(getPublicHealthStatus({ discordReady: true, memoryDatabaseReady: true, modelConfigured: true, bridgeConfigured: false }), 200);
  assert.equal(getPublicHealthStatus(), 503);
});



test('liveness remains healthy while dependency readiness is temporarily degraded', async () => {
  const { getPublicLivenessPayload } = await import('./interaction-safety.js');
  const payload = getPublicLivenessPayload({
    discordReady: false,
    memoryDatabaseReady: true,
    modelConfigured: true,
    bridgeConfigured: true,
  });
  assert.equal(payload.status, 'alive');
  assert.equal(payload.ready, false);
  assert.equal(payload.readiness.status, 'not_ready');
  assert.equal(payload.readiness.discordReady, false);
});


test('bridge reachability rejects missing or short credentials without making a request', async () => {
  const { checkBridgeReachability } = await import('./interaction-safety.js');
  let called = false;
  const result = await checkBridgeReachability({ baseUrl: 'https://example.test', secret: 'short', fetchImpl: async () => { called = true; } });
  assert.deepEqual(result, { reachable: false, commandCount: 0, reason: 'not_configured' });
  assert.equal(called, false);
});

test('bridge reachability authenticates catalog request and validates command count', async () => {
  const { checkBridgeReachability } = await import('./interaction-safety.js');
  let request;
  const result = await checkBridgeReachability({
    baseUrl: 'https://pogaca-frieren.onrender.com/',
    secret: 'x'.repeat(40),
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, async json() { return { service: 'pogaca-frieren', count: 68, commands: Array.from({ length: 68 }, (_, i) => ({ name: 'cmd-' + i })) }; } };
    },
  });
  assert.equal(result.reachable, true);
  assert.equal(result.commandCount, 68);
  assert.equal(request.url, 'https://pogaca-frieren.onrender.com/internal/test-catalog');
  assert.equal(request.options.headers.authorization, 'Bearer ' + 'x'.repeat(40));
});

test('bridge reachability fails closed on unauthorized or malformed catalog responses', async () => {
  const { checkBridgeReachability } = await import('./interaction-safety.js');
  const unauthorized = await checkBridgeReachability({
    baseUrl: 'https://example.test', secret: 'x'.repeat(40),
    fetchImpl: async () => ({ ok: false, status: 401 }),
  });
  assert.deepEqual(unauthorized, { reachable: false, commandCount: 0, reason: 'http_401' });
  const malformed = await checkBridgeReachability({
    baseUrl: 'https://example.test', secret: 'x'.repeat(40),
    fetchImpl: async () => ({ ok: true, async json() { return { service: 'wrong', count: 1, commands: [] }; } }),
  });
  assert.deepEqual(malformed, { reachable: false, commandCount: 0, reason: 'invalid_response' });
});


test('public liveness route is not protected while readiness and bridge diagnostics stay private', () => {
  assert.equal(isPrivateHealthPath('/live'), false);
  assert.equal(isPrivateHealthPath('/health'), true);
  assert.equal(isPrivateHealthPath('/ready'), true);
  assert.equal(isPrivateHealthPath('/bridge-health'), true);
  assert.equal(isPrivateHealthPath('/unknown'), false);
});
