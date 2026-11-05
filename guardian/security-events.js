import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { resolveVerifiedClientIp } from '../security/client-ip.js';
import { createGuardianIncident } from './core.js';
import { upsertGuardianIncident } from './store.js';

const GENESIS_HASH = 'GENESIS';
const MAX_BODY_BYTES = 32_768;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

function canonicalJson(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

function safeText(value, max = 500) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ').trim().slice(0, max);
}

export function verifyGuardianEventSignature({
  rawBody, timestamp, signature, secret, now = Date.now(), maxSkewMs = MAX_CLOCK_SKEW_MS,
} = {}) {
  const stamp = String(timestamp || '');
  const supplied = String(signature || '').replace(/^sha256=/i, '');
  if (!/^\d{10}$/.test(stamp) || !/^[a-f0-9]{64}$/i.test(supplied)
      || typeof secret !== 'string' || secret.length < 32
      || typeof rawBody !== 'string' || rawBody.length > MAX_BODY_BYTES) return false;
  const timestampMs = Number(stamp) * 1000;
  if (!Number.isFinite(timestampMs) || Math.abs(now - timestampMs) > maxSkewMs) return false;
  const expected = createHmac('sha256', secret).update(stamp + '.' + rawBody).digest();
  const actual = Buffer.from(supplied, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function normalizeGuardianSecurityEvent(input = {}) {
  const eventId = safeText(input.eventId || input.event_id, 128);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(eventId)) throw new Error('GUARDIAN_EVENT_ID_INVALID');
  if (input.source !== 'frieren_guard') throw new Error('GUARDIAN_EVENT_SOURCE_INVALID');
  const code = safeText(input.code, 80).toUpperCase();
  if (!/^[A-Z0-9_.:-]{1,80}$/.test(code)) throw new Error('GUARDIAN_EVENT_CODE_INVALID');
  const severity = String(input.severity || '').toLowerCase();
  if (!['critical', 'high', 'medium', 'low'].includes(severity)) throw new Error('GUARDIAN_EVENT_SEVERITY_INVALID');
  const observedAt = new Date(input.observedAt || input.observed_at || Date.now());
  if (!Number.isFinite(observedAt.getTime()) || observedAt.getTime() > Date.now() + MAX_CLOCK_SKEW_MS
      || observedAt.getTime() < Date.now() - 30 * 24 * 60 * 60 * 1000) throw new Error('GUARDIAN_EVENT_TIME_INVALID');
  const base = createGuardianIncident({
    system: 'guardian',
    code,
    severity,
    title: safeText(input.title || code, 160),
    summary: safeText(input.summary || input.message || code, 1600),
    evidence: Array.isArray(input.evidence) ? input.evidence : [],
  });
  return {
    eventId,
    source: 'frieren_guard',
    system: 'guardian',
    code: base.code,
    severity: base.severity,
    title: base.title,
    summary: base.summary,
    evidence: base.evidence,
    fingerprint: base.fingerprint,
    observedAt: observedAt.toISOString(),
  };
}

export async function recordGuardianSecurityEvent(db, event, {
  clientIp = null, ipSource = 'unverified_peer',
} = {}) {
  if (!db || typeof db.connect !== 'function') throw new Error('GUARDIAN_EVENT_DATABASE_REQUIRED');
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1,$2)', [20261105, 902]);
    const duplicate = await client.query(
      'SELECT event_hash FROM owner_guardian_evidence_chain WHERE event_id=$1 LIMIT 1',
      [event.eventId]
    );
    if (duplicate.rows?.[0]) {
      await client.query('COMMIT');
      return { duplicate: true, eventHash: String(duplicate.rows[0].event_hash), incident: null };
    }
    const previousResult = await client.query(
      'SELECT event_hash FROM owner_guardian_evidence_chain ORDER BY sequence_no DESC LIMIT 1 FOR UPDATE'
    );
    const previousHash = String(previousResult.rows?.[0]?.event_hash || GENESIS_HASH);
    const safeIp = typeof clientIp === 'string' && clientIp.length <= 64 ? clientIp : null;
    const payload = {
      eventId: event.eventId,
      source: event.source,
      system: event.system,
      code: event.code,
      severity: event.severity,
      title: event.title,
      summary: event.summary,
      evidence: event.evidence,
      observedAt: event.observedAt,
      clientIp: safeIp,
      ipSource: safeText(ipSource, 32),
    };
    const eventHash = createHash('sha256').update(previousHash + '\n' + canonicalJson(payload)).digest('hex');
    await client.query(
      \`INSERT INTO owner_guardian_evidence_chain
        (event_id,source,observed_at,severity,client_ip,ip_source,payload,event_hash,previous_hash)
       VALUES($1,$2,$3,$4,$5::inet,$6,$7::jsonb,$8,$9)\`,
      [event.eventId, event.source, event.observedAt, event.severity, safeIp, payload.ipSource, JSON.stringify(payload), eventHash, previousHash]
    );
    const evidence = [
      ...event.evidence,
      { message: 'Guard event ' + event.eventId + ' · SHA-256 ' + eventHash },
      ...(safeIp ? [{ message: 'Doğrulanan ağ eş adresi (' + payload.ipSource + '): ' + safeIp }] : []),
    ].slice(0, 8);
    const incident = await upsertGuardianIncident(client, {
      system: event.system,
      code: event.code,
      severity: event.severity,
      title: event.title,
      summary: event.summary,
      evidence,
    });
    await client.query('COMMIT');
    return { duplicate: false, eventHash, incident };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release?.();
  }
}

export async function verifyGuardianEvidenceChain(db, limit = 10_000) {
  const safeLimit = Math.max(1, Math.min(Math.floor(Number(limit) || 10_000), 10_000));
  const result = await db.query(
    'SELECT sequence_no,event_id,payload,previous_hash,event_hash FROM owner_guardian_evidence_chain ORDER BY sequence_no ASC LIMIT $1',
    [safeLimit]
  );
  let previousHash = GENESIS_HASH;
  let firstInvalidSequence = null;
  let checked = 0;
  for (const row of result.rows || []) {
    checked += 1;
    const storedPrevious = String(row.previous_hash || '');
    const expectedHash = createHash('sha256').update(previousHash + '\n' + canonicalJson(row.payload)).digest('hex');
    if (storedPrevious !== previousHash || String(row.event_hash || '') !== expectedHash) {
      firstInvalidSequence = Number(row.sequence_no) || checked;
      break;
    }
    previousHash = String(row.event_hash);
  }
  return {
    valid: firstInvalidSequence === null,
    checked,
    firstInvalidSequence,
    lastHash: checked && firstInvalidSequence === null ? previousHash : null,
    truncated: checked === safeLimit,
  };
}

export async function listGuardianEvidenceEvents(db, limit = 20) {
  const safeLimit = Math.max(1, Math.min(Math.floor(Number(limit) || 20), 100));
  const result = await db.query(
    'SELECT sequence_no,event_id,source,received_at,observed_at,severity,client_ip,ip_source,event_hash FROM owner_guardian_evidence_chain ORDER BY sequence_no DESC LIMIT $1',
    [safeLimit]
  );
  return result.rows || [];
}

async function readRequestBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error('GUARDIAN_EVENT_BODY_TOO_LARGE');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  res.end(JSON.stringify(payload));
}

export async function handleGuardianSecurityEventRequest(req, res, { db, secret } = {}) {
  if (req?.method !== 'POST' || req?.url !== '/internal/guardian/security-event') return false;
  if (typeof secret !== 'string' || secret.length < 32) {
    sendJson(res, 503, { status: 'not_configured', error: 'GUARDIAN_EVENT_INGEST_NOT_CONFIGURED' });
    return true;
  }
  let rawBody;
  try { rawBody = await readRequestBody(req); }
  catch (error) {
    sendJson(res, error?.message === 'GUARDIAN_EVENT_BODY_TOO_LARGE' ? 413 : 400, { status: 'rejected', error: 'GUARDIAN_EVENT_BODY_INVALID' });
    return true;
  }
  const headers = req.headers || {};
  if (!verifyGuardianEventSignature({
    rawBody,
    timestamp: headers['x-frieren-timestamp'],
    signature: headers['x-frieren-signature'],
    secret,
  })) {
    sendJson(res, 401, { status: 'rejected', error: 'GUARDIAN_EVENT_SIGNATURE_INVALID' });
    return true;
  }
  let input;
  try { input = JSON.parse(rawBody); }
  catch {
    sendJson(res, 400, { status: 'rejected', error: 'GUARDIAN_EVENT_JSON_INVALID' });
    return true;
  }
  let event;
  try { event = normalizeGuardianSecurityEvent(input); }
  catch (error) {
    sendJson(res, 400, { status: 'rejected', error: safeText(error?.message || 'GUARDIAN_EVENT_INVALID', 80) });
    return true;
  }
  const ip = resolveVerifiedClientIp(req);
  try {
    const result = await recordGuardianSecurityEvent(db, event, ip);
    sendJson(res, result.duplicate ? 200 : 201, {
      status: result.duplicate ? 'duplicate' : 'recorded',
      eventId: event.eventId,
      eventHash: result.eventHash,
      incidentId: result.incident?.id || null,
    });
  } catch {
    sendJson(res, 503, { status: 'unavailable', error: 'GUARDIAN_EVENT_PERSISTENCE_FAILED' });
  }
  return true;
}
