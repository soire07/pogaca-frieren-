import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateTotpSecret, encryptTotpSecret, decryptTotpSecret,
  createTotpCode, verifyTotpCode, createTotpUri
} from '../owner-totp.js';

const key = 'owner-session-secret-for-totp-tests-at-least-32-chars';

test('TOTP secret generation returns a valid Base32 secret with sufficient entropy', () => {
  const secret = generateTotpSecret();
  assert.match(secret, /^[A-Z2-7]{32,}$/);
  assert.notEqual(secret, generateTotpSecret());
});

test('TOTP secret encryption is authenticated and decrypts only with the right key', () => {
  const secret = generateTotpSecret();
  const encrypted = encryptTotpSecret(secret, key);
  assert.notEqual(encrypted, secret);
  assert.equal(decryptTotpSecret(encrypted, key), secret);
  assert.throws(() => decryptTotpSecret(encrypted, 'different-session-secret-that-is-long-enough'));
  assert.throws(() => decryptTotpSecret(encrypted + 'tampered', key));
});

test('TOTP codes follow RFC 6238 SHA-1 six-digit time-step behavior', () => {
  assert.equal(createTotpCode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 59_000), '287082');
  assert.equal(createTotpCode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 1_111_111_109_000), '081804');
});

test('TOTP verification accepts the current 30-second step and one-step clock skew', () => {
  const secret = generateTotpSecret();
  const now = 1_800_000_000_000;
  assert.equal(verifyTotpCode(secret, createTotpCode(secret, now), now), true);
  assert.equal(verifyTotpCode(secret, createTotpCode(secret, now - 30_000), now), true);
  assert.equal(verifyTotpCode(secret, createTotpCode(secret, now + 30_000), now), true);
});

test('TOTP verification rejects malformed, incorrect, and far-future codes', () => {
  const secret = generateTotpSecret();
  const now = 1_800_000_000_000;
  assert.equal(verifyTotpCode(secret, '12x456', now), false);
  assert.equal(verifyTotpCode(secret, '12345', now), false);
  assert.equal(verifyTotpCode(secret, createTotpCode(secret, now + 120_000), now), false);
});

test('TOTP URI encodes issuer and account label without leaking extra parameters', () => {
  const uri = createTotpUri('ABC234', 'owner@example.com');
  assert.match(uri, /^otpauth:\/\/totp\//);
  assert.match(uri, /secret=ABC234/);
  assert.match(uri, /issuer=Frieren%20Owner/);
  assert.match(uri, /algorithm=SHA1/);
  assert.match(uri, /digits=6/);
});
