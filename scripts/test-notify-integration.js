import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnimeNewsDigestWorker } from '../integrations/notify/anime-news-worker.js';

const permissionFlags = { ViewChannel: 'ViewChannel', SendMessages: 'SendMessages', EmbedLinks: 'EmbedLinks' };
const digest = { guild_id: '1539562273197260860', channel_id: '223456789012345678', items: [{ title: 'Frieren news' }] };

function setup({ channelGuildId = digest.guild_id, permissions = true, fetchError = null, sendError = null } = {}) {
  const calls = [];
  const db = { async query() { return { rows: [] }; } };
  const channel = {
    guildId: channelGuildId,
    isTextBased: () => true,
    permissionsFor: () => ({ has: requested => permissions && requested.length === 3 }),
    async send(payload) { calls.push(['send', payload]); if (sendError) throw sendError; }
  };
  const client = {
    isReady: () => true,
    user: { id: 'bot-id' },
    channels: { async fetch() { if (fetchError) throw fetchError; return channel; } }
  };
  const deps = {
    db, permissionFlags,
    pollFeed: async () => ({ fetched: 1, inserted: 1, failures: [] }),
    claimDigests: async () => [digest],
    translateItems: async (_db, items) => items,
    buildEmbeds: items => items.map(item => ({ title: item.title })),
    markSent: async (_db, guildId) => calls.push(['sent', guildId]),
    releaseClaim: async (_db, guildId) => calls.push(['released', guildId]),
    disableChannel: async (_db, guildId) => calls.push(['disabled', guildId]),
    logger: { warn() {}, error() {} }
  };
  return { calls, client, worker: createAnimeNewsDigestWorker(deps) };
}

test('Notify worker sends one digest with mentions disabled and marks it sent', async () => {
  const { calls, client, worker } = setup();
  await worker(client);
  assert.deepEqual(calls, [
    ['send', { embeds: [{ title: 'Frieren news' }], allowedMentions: { parse: [] } }],
    ['sent', digest.guild_id]
  ]);
});

test('Notify worker refuses to deliver into a channel belonging to another guild', async () => {
  const { calls, client, worker } = setup({ channelGuildId: '999999999999999999' });
  await worker(client);
  assert.equal(calls.some(([kind]) => kind === 'send'), false);
  assert.deepEqual(calls, [['released', digest.guild_id]]);
});

test('Notify worker releases the claim when channel permissions are missing', async () => {
  const { calls, client, worker } = setup({ permissions: false });
  await worker(client);
  assert.equal(calls.some(([kind]) => kind === 'send'), false);
  assert.deepEqual(calls, [['released', digest.guild_id]]);
});

test('Notify worker disables a deleted channel and releases its claim', async () => {
  const { calls, client, worker } = setup({ fetchError: Object.assign(new Error('unknown channel'), { code: 10003 }) });
  await worker(client);
  assert.deepEqual(calls, [['disabled', digest.guild_id], ['released', digest.guild_id]]);
});

test('Notify worker releases a failed delivery so it can be retried', async () => {
  const { calls, client, worker } = setup({ sendError: new Error('temporary failure') });
  await worker(client);
  assert.deepEqual(calls, [['send', { embeds: [{ title: 'Frieren news' }], allowedMentions: { parse: [] } }], ['released', digest.guild_id]]);
});

test('Notify worker does not poll or claim when Discord client is not ready', async () => {
  const { calls, worker } = setup();
  await worker({ isReady: () => false });
  assert.deepEqual(calls, []);
});

test('Notify worker prevents overlapping sweeps', async () => {
  let releasePoll;
  let polls = 0;
  const deps = {
    db: {}, permissionFlags,
    pollFeed: async () => { polls++; await new Promise(resolve => { releasePoll = resolve; }); return { failures: [] }; },
    claimDigests: async () => [], translateItems: async (_db, items) => items, buildEmbeds: () => [],
    markSent: async () => {}, releaseClaim: async () => {}, disableChannel: async () => {},
    logger: { warn() {}, error() {} }
  };
  const worker = createAnimeNewsDigestWorker(deps);
  const client = { isReady: () => true };
  const first = worker(client);
  await new Promise(resolve => setImmediate(resolve));
  await worker(client);
  assert.equal(polls, 1);
  releasePoll();
  await first;
});
