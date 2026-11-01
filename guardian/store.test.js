import test from 'node:test';
import assert from 'node:assert/strict';
import {
  upsertGuardianIncident,
  createGuardianReviewJob,
  finishGuardianReviewJob,
  resolveGuardianIncident,
} from './store.js';

test('Guardian incident upsert uses a stable fingerprint and increments occurrences atomically', async () => {
  let call;
  const db = { query: async (sql, params) => {
    call = { sql, params };
    return { rows: [{ id: 12, fingerprint: params[0], occurrence_count: 2 }] };
  } };
  const result = await upsertGuardianIncident(db, {
    system: 'pogaca_frieren', code: 'RPG_TIMEOUT',
    title: 'Boss timeout', summary: 'Boss action timed out',
  });
  assert.equal(result.id, 12);
  assert.match(call.sql, /ON CONFLICT\(fingerprint\) DO UPDATE/);
  assert.match(call.sql, /occurrence_count=owner_guardian_incidents\.occurrence_count\+1/);
  assert.equal(call.params[1], 'pogaca_frieren');
});

test('Guardian review job enforces cooldown and creates one active Frieren AI job', async () => {
  const statements = [];
  const db = { query: async (sql, params) => {
    statements.push(sql);
    if (sql.includes('SELECT * FROM owner_guardian_jobs')) return { rows: [] };
    if (sql.includes('SELECT id,review_attempts')) return { rows: [{ id: 4, review_attempts: 0, last_review_at: null, status: 'open' }] };
    if (sql.includes('UPDATE owner_guardian_incidents')) return { rowCount: 1, rows: [{ id: 4 }] };
    if (sql.includes('INSERT INTO owner_guardian_jobs')) return { rows: [{ id: 8, incident_id: 4, agent: 'frieren_ai', status: 'queued' }] };
    throw new Error('Unexpected Guardian query');
  } };
  const job = await createGuardianReviewJob(db, { incidentId: 4, actorId: '1553794496234262641' });
  assert.equal(job.id, 8);
  assert.ok(statements.some(sql => sql.includes('review_attempts < 3')));
  assert.ok(statements.some(sql => sql.includes('ON CONFLICT (incident_id,agent)')));
});

test('Guardian review completion stores a proposal and moves incident to approval review', async () => {
  const calls = [];
  const db = { query: async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('UPDATE owner_guardian_jobs')) return { rows: [{ incident_id: 4 }] };
    if (sql.includes('UPDATE owner_guardian_incidents')) return { rowCount: 1, rows: [] };
    throw new Error('Unexpected Guardian query');
  } };
  assert.equal(await finishGuardianReviewJob(db, {
    jobId: 8, status: 'completed', result: { status: 'proposal_only', applied: false },
  }), true);
  assert.match(calls[0].sql, /finished_at=NOW/);
  assert.match(calls[1].sql, /awaiting_approval/);
  assert.deepEqual(JSON.parse(calls[0].params[2]), { status: 'proposal_only', applied: false });
});

test('Guardian resolution writes an audit record in the same SQL statement', async () => {
  let sql = '';
  const db = { query: async statement => {
    sql = statement;
    return { rows: [{ id: 4 }] };
  } };
  const result = await resolveGuardianIncident(db, { incidentId: 4, actorId: '1553794496234262641' });
  assert.equal(result.id, 4);
  assert.match(sql, /guardian\.incident\.resolve/);
  assert.match(sql, /WITH changed AS/);
});
