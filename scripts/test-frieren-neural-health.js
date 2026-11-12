import test from 'node:test';
import assert from 'node:assert/strict';
import { getFrierenNeuralHealthResponse } from '../frieren-neural-health.js';

test('Neural health resolves the shared endpoint base when the configured URL ends in /generate', async () => {
  let requested;
  const result = await getFrierenNeuralHealthResponse({
    env: { FRIEREN_NEURAL_API_URL: 'https://neural.example.test/v1/generate?discard=1' },
    fetchImpl: async (url, options) => {
      requested = { url, options };
      return { status: 200, text: async () => JSON.stringify({ status: 'ready', model: 'test-model' }) };
    }
  });
  assert.equal(requested.url, 'https://neural.example.test/v1/health');
  assert.equal(requested.options.method, 'GET');
  assert.deepEqual(result, { status: 200, payload: { status: 'ready', model: 'test-model', service: 'frieren-neural' } });
});

test('Neural health refuses insecure remote URLs and URLs containing credentials', async () => {
  let called = false;
  const fetchImpl = async () => { called = true; };
  assert.equal((await getFrierenNeuralHealthResponse({
    env: { FRIEREN_NEURAL_API_URL: 'http://neural.example.test' }, fetchImpl
  })).payload.reason, 'invalid_neural_service_url');
  assert.equal((await getFrierenNeuralHealthResponse({
    env: { FRIEREN_NEURAL_API_URL: 'https://user:pass@neural.example.test' }, fetchImpl
  })).payload.reason, 'invalid_neural_service_url');
  assert.equal(called, false);
});

test('Neural health fails closed when no central service URL is configured', async () => {
  const result = await getFrierenNeuralHealthResponse({ env: {}, fetchImpl: async () => { throw new Error('unexpected'); } });
  assert.equal(result.status, 503);
  assert.deepEqual(result.payload, {
    status: 'not_ready', service: 'frieren-neural', reason: 'neural_service_not_configured'
  });
});

test('Neural health rejects malformed or oversized upstream payloads', async () => {
  const malformed = await getFrierenNeuralHealthResponse({
    env: { FRIEREN_NEURAL_API_URL: 'https://neural.example.test' },
    fetchImpl: async () => ({ status: 200, text: async () => 'not-json' })
  });
  assert.equal(malformed.status, 502);
  assert.equal(malformed.payload.reason, 'invalid_health_response');
  const oversized = await getFrierenNeuralHealthResponse({
    env: { FRIEREN_NEURAL_API_URL: 'https://neural.example.test' },
    fetchImpl: async () => ({ status: 200, text: async () => 'x'.repeat(16_385) })
  });
  assert.equal(oversized.status, 502);
  assert.equal(oversized.payload.reason, 'health_response_too_large');
});

test('Neural health converts upstream failures into a bounded not-ready result', async () => {
  const result = await getFrierenNeuralHealthResponse({
    env: { FRIEREN_NEURAL_API_URL: 'https://neural.example.test' },
    fetchImpl: async () => { throw new Error('network failure'); }
  });
  assert.equal(result.status, 503);
  assert.equal(result.payload.reason, 'neural_service_unreachable');
});


test('legacy /ai-health alias can use cheap Neural liveness instead of loading model weights', async () => {
  let requested;
  const result = await getFrierenNeuralHealthResponse({
    env: { FRIEREN_NEURAL_API_URL: 'https://neural.example.test/generate' },
    healthPath: 'live',
    fetchImpl: async url => {
      requested = url;
      return { status: 200, text: async () => JSON.stringify({ status: 'alive', service: 'frieren-neural' }) };
    }
  });
  assert.equal(requested, 'https://neural.example.test/live');
  assert.equal(result.status, 200);
  assert.equal(result.payload.status, 'alive');
});
