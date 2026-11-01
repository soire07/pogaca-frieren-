import {
  createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual
} from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TOTP_STEP_MS = 30_000;

function encodeBase32(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function decodeBase32(value) {
  const normalized = String(value || '').toUpperCase().replace(/=+$/g, '');
  if (!normalized || !/^[A-Z2-7]+$/.test(normalized)) throw new Error('INVALID_TOTP_SECRET');
  let bits = 0;
  let buffer = 0;
  const output = [];
  for (const char of normalized) {
    buffer = (buffer << 5) | BASE32_ALPHABET.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      output.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

function encryptionKey(sessionSecret) {
  if (typeof sessionSecret !== 'string' || sessionSecret.length < 32) throw new Error('INVALID_TOTP_ENCRYPTION_KEY');
  return createHash('sha256').update('frieren-owner-totp-v1:', 'utf8').update(sessionSecret, 'utf8').digest();
}

export function generateTotpSecret() {
  return encodeBase32(randomBytes(20));
}

export function encryptTotpSecret(secret, sessionSecret) {
  const key = encryptionKey(sessionSecret);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(secret), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map(part => part.toString('base64url')).join('.');
}

export function decryptTotpSecret(encrypted, sessionSecret) {
  const parts = String(encrypted || '').split('.');
  if (parts.length !== 3) throw new Error('INVALID_ENCRYPTED_TOTP_SECRET');
  const [iv, tag, ciphertext] = parts.map(part => Buffer.from(part, 'base64url'));
  if (iv.length !== 12 || tag.length !== 16 || ciphertext.length < 16) throw new Error('INVALID_ENCRYPTED_TOTP_SECRET');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(sessionSecret), iv);
  decipher.setAuthTag(tag);
  const secret = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  decodeBase32(secret);
  return secret;
}

export function createTotpCode(secret, timestamp = Date.now()) {
  if (!Number.isFinite(timestamp) || timestamp < 0) throw new Error('INVALID_TOTP_TIMESTAMP');
  const counter = BigInt(Math.floor(timestamp / TOTP_STEP_MS));
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(counter);
  const digest = createHmac('sha1', decodeBase32(secret)).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, '0');
}

export function verifyTotpCode(secret, code, timestamp = Date.now(), window = 1) {
  const supplied = String(code || '').trim();
  if (!/^\d{6}$/.test(supplied) || !Number.isFinite(timestamp)) return false;
  const boundedWindow = Math.max(0, Math.min(1, Math.floor(Number(window) || 0)));
  const candidate = Buffer.from(supplied);
  for (let offset = -boundedWindow; offset <= boundedWindow; offset += 1) {
    const expected = Buffer.from(createTotpCode(secret, timestamp + offset * TOTP_STEP_MS));
    if (candidate.length === expected.length && timingSafeEqual(candidate, expected)) return true;
  }
  return false;
}

export function createTotpUri(secret, account = 'owner') {
  const label = encodeURIComponent('Frieren Owner:' + String(account).slice(0, 120));
  const query = new URLSearchParams({
    secret: String(secret),
    issuer: 'Frieren Owner',
    algorithm: 'SHA1',
    digits: '6',
    period: '30'
  });
  return 'otpauth://totp/' + label + '?' + query.toString();
}

export function generateTotpRecoveryCodes(count = 8) {
  const boundedCount = Math.max(4, Math.min(12, Math.floor(Number(count) || 8)));
  return Array.from({ length: boundedCount }, () => randomBytes(8).toString('hex').toUpperCase());
}

export function hashTotpRecoveryCode(code) {
  const normalized = String(code || '').replace(/[\\s-]/g, '').toUpperCase();
  if (!/^[A-F0-9]{16}$/.test(normalized)) return null;
  return createHash('sha256').update('frieren-owner-recovery-v1:', 'utf8').update(normalized, 'utf8').digest('hex');
}
