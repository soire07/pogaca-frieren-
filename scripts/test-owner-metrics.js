import test from 'node:test';
import assert from 'node:assert/strict';
import { getRenderServiceMetrics } from '../owner-metrics.js';

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
