import test from 'node:test';
import assert from 'node:assert/strict';
import { getRenderServiceMetrics, normalizeRenderMetricRange } from '../owner-metrics.js';

test('Render metrics send the selected account API key to every metrics endpoint', async () => {
  const requested = [];
  const timestamp = '2026-10-31T18:00:00.000Z';
  const payload = value => [{
    labels: [{ field: 'instance', value: 'instance-1' }],
    values: [{ timestamp, value }]
  }];
  const result = await getRenderServiceMetrics({
    apiKey: 'frieren-ai-account-key',
    resourceId: 'srv-dbj192flk1mc73805ia0',
    now: Date.parse(timestamp),
    fetchImpl: async (url, options) => {
      requested.push({ url: String(url), authorization: options.headers.Authorization });
      const endpoint = new URL(url).pathname.split('/').at(-1);
      const values = { cpu: 0.5, 'cpu-limit': 1, memory: 512, 'memory-limit': 1024 };
      return { ok: true, status: 200, json: async () => payload(values[endpoint]) };
    }
  });

  assert.equal(result.status, 'available');
  assert.equal(requested.length, 4);
  assert.ok(requested.every(item => item.authorization === 'Bearer frieren-ai-account-key'));
  assert.ok(requested.every(item => item.url.includes('resource=srv-dbj192flk1mc73805ia0')));
});

test('Render metrics support bounded 1h, 6h and 24h windows with coarser sampling', async () => {
  const requested = [];
  const now = Date.parse('2026-11-05T12:00:00.000Z');
  const payload = value => [{ labels: [{ field: 'instance', value: 'instance-1' }], values: [{ timestamp: new Date(now).toISOString(), value }] }];
  const result = await getRenderServiceMetrics({
    apiKey: 'test-key', resourceId: 'srv-test', now, range: '24h',
    fetchImpl: async url => {
      requested.push(new URL(url));
      const name = new URL(url).pathname.split('/').at(-1);
      return { ok: true, json: async () => payload({ cpu: 0.5, 'cpu-limit': 1, memory: 512, 'memory-limit': 1024 }[name]) };
    }
  });
  assert.equal(result.status, 'available');
  assert.equal(result.range, '24h');
  assert.equal(result.rangeLabel, 'Son 24 saat');
  assert.equal(result.resolutionSeconds, 900);
  assert.equal(requested.length, 4);
  assert.ok(requested.every(url => url.searchParams.get('resolutionSeconds') === '900'));
  assert.ok(requested.every(url => Date.parse(url.searchParams.get('endTime')) - Date.parse(url.searchParams.get('startTime')) === 24 * 60 * 60 * 1000));
});

test('Render metrics reject unknown time windows and fall back to the safe one-hour default', () => {
  assert.equal(normalizeRenderMetricRange('6h'), '6h');
  assert.equal(normalizeRenderMetricRange('24h'), '24h');
  assert.equal(normalizeRenderMetricRange('invalid'), '1h');
});
