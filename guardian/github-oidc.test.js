import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { verifyGithubActionsOidcToken, GUARDIAN_OIDC_AUDIENCE } from './github-oidc.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'RS256', use: 'sig' };
const now = Date.now();
const identity = {
  iss: 'https://token.actions.githubusercontent.com',
  aud: GUARDIAN_OIDC_AUDIENCE,
  iat: Math.floor(now / 1000) - 5,
  nbf: Math.floor(now / 1000) - 5,
  exp: Math.floor(now / 1000) + 300,
  repository: 'soire07/pogaca-frieren-',
  repository_owner: 'soire07',
  ref: 'refs/heads/validation/ufakzeka-real-gguf',
  workflow_ref: 'soire07/pogaca-frieren-/.github/workflows/frieren-neural-active-gguf-eval.yml@refs/heads/validation/ufakzeka-real-gguf',
  sha: 'd'.repeat(40),
};

function tokenFor(claimOverrides = {}, headerOverrides = {}) {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test-key', ...headerOverrides })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ ...identity, ...claimOverrides })).toString('base64url');
  const signingInput = header + '.' + payload;
  return signingInput + '.' + sign('RSA-SHA256', Buffer.from(signingInput), privateKey).toString('base64url');
}

function fetchJwks() {
  return async url => {
    assert.equal(url, 'https://token.actions.githubusercontent.com/.well-known/jwks');
    return { ok: true, json: async () => ({ keys: [jwk] }) };
  };
}

test('GitHub Actions OIDC accepts the pinned repository, ref, workflow, audience and signature', async () => {
  const claims = await verifyGithubActionsOidcToken(tokenFor(), { fetchImpl: fetchJwks(), now });
  assert.equal(claims.sha, identity.sha);
});

for (const [label, overrides] of [
  ['wrong repository', { repository: 'attacker/other-repo' }],
  ['wrong branch', { ref: 'refs/heads/main' }],
  ['wrong workflow', { workflow_ref: 'soire07/pogaca-frieren-/.github/workflows/other.yml@refs/heads/validation/ufakzeka-real-gguf' }],
  ['wrong audience', { aud: 'some-other-service' }],
  ['expired token', { exp: Math.floor(now / 1000) - 1 }],
]) {
  test('GitHub Actions OIDC rejects ' + label, async () => {
    await assert.rejects(
      verifyGithubActionsOidcToken(tokenFor(overrides), { fetchImpl: fetchJwks(), now }),
    );
  });
}

test('GitHub Actions OIDC rejects an invalid signature', async () => {
  const forged = tokenFor({}, { kid: 'unknown-key' });
  await assert.rejects(verifyGithubActionsOidcToken(forged, { fetchImpl: fetchJwks(), now }));
});
