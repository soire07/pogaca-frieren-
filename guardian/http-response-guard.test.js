import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldSkipFallbackResponse } from './http-response-guard.js';

test('skips fallback when response headers have already been sent', () => {
  assert.equal(shouldSkipFallbackResponse({ headersSent: true, writableEnded: false }), true);
});

test('skips fallback when response has already ended', () => {
  assert.equal(shouldSkipFallbackResponse({ headersSent: false, writableEnded: true }), true);
});

test('allows fallback while response is still writable', () => {
  assert.equal(shouldSkipFallbackResponse({ headersSent: false, writableEnded: false }), false);
});

test('safely allows fallback for a missing response object', () => {
  assert.equal(shouldSkipFallbackResponse(null), false);
});
