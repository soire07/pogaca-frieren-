import test from 'node:test';
import assert from 'node:assert/strict';
import { createOwnerSession, verifyOwnerSession } from '../owner-dashboard.js';

const secret = 'test-session-secret-that-is-at-least-32-characters-long';
const ownerId = '1553794496234262641';

test('owner session accepts a valid signed session for the configured owner', () => {
  const token = createOwnerSession(secret, 2_000);
  assert.equal(verifyOwnerSession(token, secret, 1_000), true);
});

test('owner session rejects expired sessions', () => {
  const token = createOwnerSession(secret, 999);
  assert.equal(verifyOwnerSession(token, secret, 1_000), false);
});

test('owner session rejects tampered signatures', () => {
  const token = createOwnerSession(secret, 2_000);
  const tampered = token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a');
  assert.equal(verifyOwnerSession(tampered, secret, 1_000), false);
});

test('owner session rejects tokens signed with another secret', () => {
  const token = createOwnerSession(secret, 2_000);
  assert.equal(verifyOwnerSession(token, 'different-secret-that-is-also-long-enough', 1_000), false);
});

test('owner session rejects an invalid or short signing secret', () => {
  const token = createOwnerSession(secret, 2_000);
  assert.equal(verifyOwnerSession(token, 'short', 1_000), false);
});
