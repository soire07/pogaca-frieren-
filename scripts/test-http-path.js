import test from 'node:test';
import assert from 'node:assert/strict';
import { getRequestPathname } from '../http-path.js';

test('matches the AI health route when the URL contains a tracking query parameter', () => {
  assert.equal(getRequestPathname('/ai-health?utm_source=chatgpt.com'), '/ai-health');
});

test('preserves the pathname for a plain health route', () => {
  assert.equal(getRequestPathname('/ai-health'), '/ai-health');
});

test('does not confuse a different route with the AI health route', () => {
  assert.equal(getRequestPathname('/health?utm_source=chatgpt.com'), '/health');
});
