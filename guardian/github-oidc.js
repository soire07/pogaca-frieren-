import { createPublicKey, verify as verifySignature } from 'node:crypto';

const ISSUER = 'https://token.actions.githubusercontent.com';
const JWKS_URL = ISSUER + '/.well-known/jwks';
export const GUARDIAN_OIDC_AUDIENCE = 'frieren-neural-guardian';

function decodePart(value) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

export async function verifyGithubActionsOidcToken(token, {
  audience = GUARDIAN_OIDC_AUDIENCE,
  fetchImpl = fetch,
  now = Date.now(),
} = {}) {
  if (typeof token !== 'string' || token.length < 100 || token.length > 16_384) {
    throw new Error('OIDC_TOKEN_INVALID');
  }
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('OIDC_TOKEN_INVALID');

  let header;
  let claims;
  let signature;
  try {
    header = decodePart(parts[0]);
    claims = decodePart(parts[1]);
    signature = Buffer.from(parts[2], 'base64url');
  } catch {
    throw new Error('OIDC_TOKEN_INVALID');
  }
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid) {
    throw new Error('OIDC_TOKEN_ALGORITHM_INVALID');
  }
  if (claims.iss !== ISSUER) throw new Error('OIDC_ISSUER_INVALID');
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(audience)) throw new Error('OIDC_AUDIENCE_INVALID');
  const nowSeconds = Math.floor(now / 1000);
  if (!Number.isFinite(claims.exp) || claims.exp <= nowSeconds
      || (Number.isFinite(claims.nbf) && claims.nbf > nowSeconds + 30)) {
    throw new Error('OIDC_TOKEN_EXPIRED_OR_NOT_YET_VALID');
  }
  if (claims.repository !== 'soire07/pogaca-frieren-'
      || claims.repository_owner !== 'soire07'
      || claims.ref !== 'refs/heads/validation/ufakzeka-real-gguf'
      || claims.workflow_ref !== 'soire07/pogaca-frieren-/.github/workflows/frieren-neural-active-gguf-eval.yml@refs/heads/validation/ufakzeka-real-gguf'
      || !/^[a-f0-9]{40}$/i.test(String(claims.sha || ''))) {
    throw new Error('OIDC_WORKFLOW_IDENTITY_INVALID');
  }

  const response = await fetchImpl(JWKS_URL, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('OIDC_JWKS_UNAVAILABLE');
  const jwks = await response.json();
  const jwk = Array.isArray(jwks.keys) ? jwks.keys.find(key => key.kid === header.kid && key.kty === 'RSA') : null;
  if (!jwk) throw new Error('OIDC_SIGNING_KEY_NOT_FOUND');

  let valid = false;
  try {
    const key = createPublicKey({ key: jwk, format: 'jwk' });
    valid = verifySignature('RSA-SHA256', Buffer.from(parts[0] + '.' + parts[1]), key, signature);
  } catch {
    valid = false;
  }
  if (!valid) throw new Error('OIDC_SIGNATURE_INVALID');
  return claims;
}
