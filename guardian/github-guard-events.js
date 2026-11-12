import { verifyGithubActionsOidcToken } from './github-oidc.js';
import { normalizeGuardianSecurityEvent, recordGuardianSecurityEvent } from './security-events.js';

const MAX_BODY_BYTES = 32_768;
const OIDC_AUDIENCE = 'frieren-guard-security';
const EXPECTED_IDENTITY = {
  repository: 'soire07/pogaca-frieren-',
  repository_owner: 'soire07',
  ref: 'refs/heads/main',
  workflow_ref: 'soire07/pogaca-frieren-/.github/workflows/frieren-guard-external.yml@refs/heads/main',
};

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > MAX_BODY_BYTES) throw new Error('GUARDIAN_EVENT_BODY_TOO_LARGE');
    chunks.push(bytes);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function bearerToken(value) {
  const match = /^Bearer\\s+(.+)$/i.exec(String(value || ''));
  return match ? match[1].trim() : '';
}

export async function handleGithubGuardSecurityEventRequest(req, res, {
  db,
  fetchImpl = fetch,
  verifyToken = verifyGithubActionsOidcToken,
} = {}) {
  if (req?.url !== '/internal/guardian/github-actions-event') return false;
  if (req?.method !== 'POST') {
    sendJson(res, 405, { status: 'rejected', error: 'METHOD_NOT_ALLOWED' });
    return true;
  }
  if (!String(req.headers?.['content-type'] || '').toLowerCase().startsWith('application/json')) {
    sendJson(res, 415, { status: 'rejected', error: 'APPLICATION_JSON_REQUIRED' });
    return true;
  }

  let claims;
  try {
    claims = await verifyToken(bearerToken(req.headers?.authorization), {
      audience: OIDC_AUDIENCE,
      expectedIdentity: EXPECTED_IDENTITY,
      fetchImpl,
    });
  } catch {
    sendJson(res, 401, { status: 'rejected', error: 'GITHUB_ACTIONS_IDENTITY_INVALID' });
    return true;
  }

  let input;
  try {
    const rawBody = await readBody(req);
    input = JSON.parse(rawBody);
  } catch (error) {
    const tooLarge = error?.message === 'GUARDIAN_EVENT_BODY_TOO_LARGE';
    sendJson(res, tooLarge ? 413 : 400, {
      status: 'rejected',
      error: tooLarge ? 'GUARDIAN_EVENT_BODY_TOO_LARGE' : 'GUARDIAN_EVENT_JSON_INVALID',
    });
    return true;
  }

  if (String(input?.sourceSha || '') !== String(claims.sha || '')) {
    sendJson(res, 401, { status: 'rejected', error: 'GITHUB_ACTIONS_COMMIT_MISMATCH' });
    return true;
  }

  let event;
  try {
    event = normalizeGuardianSecurityEvent(input);
    event.sender = 'github_actions';
  } catch (error) {
    sendJson(res, 400, { status: 'rejected', error: String(error?.message || 'GUARDIAN_EVENT_INVALID').slice(0, 80) });
    return true;
  }

  try {
    const result = await recordGuardianSecurityEvent(db, event);
    sendJson(res, result.duplicate ? 200 : 201, {
      status: result.duplicate ? 'duplicate' : 'recorded',
      sender: 'github_actions',
      eventType: event.eventType,
      eventId: event.eventId,
      eventHash: result.eventHash,
      incidentId: result.incident?.id || null,
    });
  } catch {
    sendJson(res, 503, { status: 'unavailable', error: 'GUARDIAN_EVENT_PERSISTENCE_FAILED' });
  }
  return true;
}
