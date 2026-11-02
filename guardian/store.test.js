import test from 'node:test';
import assert from 'node:assert/strict';
import {
  upsertGuardianIncident,
  createGuardianReviewJob,
  finishGuardianReviewJob,
  resolveGuardianIncident,
  reserveGuardianRepairDispatch,
  listPendingGuardianRepairDispatches,
  finishGuardianRepairDispatch,
  updateGuardianRepairStatus,
  getGuardianMonitorState,
} from './store.js';

test('Guardian incident upsert deduplicates repeated evidence and bounds evidence history', async () => {
  let call;
  const db = { query: async (sql, params) => {
    call = { sql, params };
    return { rows: [{ id: 12, fingerprint: params[0], occurrence_count: 2 }] };
  } };
  const result = await upsertGuardianIncident(db, {
    system: 'pogaca_frieren', code: 'RPG_TIMEOUT',
    title: 'Boss timeout', summary: 'Boss action timed out',
    evidence: [{ message: 'Owner error log ID 17' }],
  });
  assert.equal(result.id, 12);
  assert.match(call.sql, /ON CONFLICT\(fingerprint\) DO UPDATE/);
  assert.match(call.sql, /owner_guardian_incidents\.evidence @> EXCLUDED\.evidence/);
  assert.equal((call.sql.match(/\bevidence\s*=/g) || []).length, 1, 'Guardian upsert must assign evidence exactly once');
  assert.match(call.sql, /occurrence_count=owner_guardian_incidents\.occurrence_count \+ CASE/);
  assert.match(call.sql, /LIMIT 8/);
  assert.match(call.sql, /jsonb_array_elements/);
  assert.equal(call.params[1], 'pogaca_frieren');
});

test('Guardian review reservation and queue insertion are atomic', async () => {
  const statements = [];
  const db = { query: async (sql, params) => {
    statements.push({ sql, params });
    if (sql.includes('WITH stale AS')) return { rows: [] };
    if (sql.includes('SELECT * FROM owner_guardian_jobs')) return { rows: [] };
    if (sql.includes('WITH reserved AS')) return { rows: [{ id: 8, incident_id: 4, agent: 'frieren_ai', status: 'queued' }] };
    throw new Error('Unexpected Guardian query');
  } };
  const job = await createGuardianReviewJob(db, { incidentId: 4, actorId: '1553794496234262641' });
  assert.equal(job.id, 8);
  assert.match(statements[2].sql, /WITH reserved AS/);
  assert.match(statements[2].sql, /review_attempts=review_attempts\+1/);
  assert.match(statements[2].sql, /ON CONFLICT \(incident_id,agent\)/);
  assert.doesNotMatch(statements[2].sql, /SELECT id,review_attempts/);
  assert.equal(statements.length, 3);
});

test('Guardian review recovers abandoned queued jobs after the bounded request timeout', async () => {
  const calls = [];
  const db = { query: async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('WITH stale AS')) return { rows: [] };
    if (sql.includes('SELECT * FROM owner_guardian_jobs')) return { rows: [{ id: 9, incident_id: 4, status: 'queued' }] };
    throw new Error('Unexpected Guardian query');
  } };
  const job = await createGuardianReviewJob(db, { incidentId: 4, actorId: 'owner' });
  assert.equal(job.id, 9);
  assert.equal(job.reused, true);
  assert.match(calls[0].sql, /status='failed'/);
  assert.match(calls[0].sql, /COALESCE\(started_at,created_at\) < NOW\(\)-INTERVAL '5 minutes'/);
  assert.match(calls[0].sql, /status='open'/);
  assert.match(calls[0].sql, /last_review_at=NULL/, 'stale recovery must clear the cooldown so a retry can be reserved');
  assert.equal(calls.length, 2);
});

test('Guardian review reuses a current active job without consuming another attempt', async () => {
  let calls = 0;
  const db = { query: async sql => {
    calls += 1;
    if (sql.includes('WITH stale AS')) return { rows: [] };
    assert.match(sql, /SELECT \* FROM owner_guardian_jobs/);
    return { rows: [{ id: 10, incident_id: 4, status: 'running' }] };
  } };
  const job = await createGuardianReviewJob(db, { incidentId: 4, actorId: 'owner' });
  assert.equal(job.id, 10);
  assert.equal(job.reused, true);
  assert.equal(calls, 2);
});

test('Guardian review completion atomically stores proposal and advances incident status', async () => {
  let call;
  const db = { query: async (sql, params) => {
    call = { sql, params };
    return { rows: [{ incident_id: 4 }] };
  } };
  assert.equal(await finishGuardianReviewJob(db, {
    jobId: 8, status: 'completed', result: { status: 'proposal_only', applied: false },
  }), true);
  assert.match(call.sql, /WITH changed AS/);
  assert.match(call.sql, /incident_update AS/);
  assert.match(call.sql, /finished_at=NOW/);
  assert.equal(call.params[3], 'awaiting_approval');
  assert.deepEqual(JSON.parse(call.params[2]), { status: 'proposal_only', applied: false });
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

test('Guardian repair workflow dispatch is reserved once and records its workflow link', async () => {
  const calls = [];
  const db = { query: async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes("repair_dispatch_status='dispatching'")) {
      return { rows: [{ id: 8, status: 'completed', repair_dispatch_status: 'dispatching' }] };
    }
    if (sql.includes('SET repair_dispatch_status=$2')) return { rows: [{ id: 8 }] };
    throw new Error('Unexpected Guardian dispatch query');
  } };
  const reserved = await reserveGuardianRepairDispatch(db, 8);
  assert.equal(reserved.id, 8);
  assert.match(calls[0].sql, /repair_dispatch_status IN/);
  assert.equal(await finishGuardianRepairDispatch(db, {
    jobId: 8, status: 'dispatched',
    workflowUrl: 'https://github.com/soire07/pogaca-frieren-/actions/workflows/frieren-ai-self-repair.yml',
  }), true);
  assert.equal(calls[1].params[1], 'dispatched');
  assert.match(calls[1].params[2], /frieren-ai-self-repair\.yml/);
});

test('Guardian PR status refresh persists workflow and CI evidence only for dispatched jobs', async () => {
  let params;
  const db = { query: async (sql, values) => {
    params = values;
    assert.match(sql, /repair_dispatch_status='dispatched'/);
    return { rows: [{ id: 8 }] };
  } };
  assert.equal(await updateGuardianRepairStatus(db, {
    jobId: 8, runId: 123, runUrl: 'https://github.com/actions/runs/123',
    runStatus: 'completed', runConclusion: 'success',
    prNumber: 44, prUrl: 'https://github.com/soire07/pogaca-frieren-/pull/44',
    prState: 'open', checksStatus: 'success',
  }), true);
  assert.equal(params[1], 123);
  assert.equal(params[8], 'success');
});

test('Guardian monitor state can be read for independent heartbeat display', async () => {
  const db = { query: async sql => {
    assert.match(sql, /last_tick_at/);
    return { rows: [{ monitor_key: 'owner_error_logs', last_seen_error_id: '22', last_tick_at: '2026-11-02T10:00:00Z', last_error: null }] };
  } };
  const state = await getGuardianMonitorState(db);
  assert.equal(state.last_seen_error_id, '22');
  assert.equal(state.last_error, null);
});


test('Guardian quality report storage is idempotent and keeps bounded history', async () => {
  const calls = [];
  const db = { query: async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('INSERT INTO owner_guardian_quality_reports')) {
      return { rows: [{ id: 7, report_sha256: params[0], artifact_sha256: params[1], decision: params[3] }] };
    }
    if (sql.includes('DELETE FROM owner_guardian_quality_reports')) return { rowCount: 0, rows: [] };
    throw new Error('Unexpected Guardian quality query');
  } };
  const { saveGuardianQualityReport } = await import('./store.js');
  const report = { model_backend: 'ufakzeka', artifact_sha256: 'a'.repeat(64), decision: 'NOT READY', blocking_reasons: ['missing_scores'] };
  const saved = await saveGuardianQualityReport(db, { report, reportSha256: 'b'.repeat(64) });
  assert.equal(saved.id, 7);
  assert.match(calls[0].sql, /ON CONFLICT\(report_sha256\) DO UPDATE/);
  assert.match(calls[1].sql, /LIMIT 50/);
  assert.equal(calls[0].params[0], 'b'.repeat(64));
});


test('Guardian repair dispatch reservation is bounded and reclaims stale dispatch leases', async () => {
  let sql = '';
  const db = { query: async statement => { sql = statement; return { rows: [{ id: 8, repair_dispatch_attempts: 2 }] }; } };
  const reserved = await reserveGuardianRepairDispatch(db, 8);
  assert.equal(reserved.repair_dispatch_attempts, 2);
  assert.match(sql, /repair_dispatch_attempts=repair_dispatch_attempts\+1/);
  assert.match(sql, /repair_dispatch_attempts < 3/);
  assert.match(sql, /repair_dispatch_status='dispatching'.*INTERVAL '15 minutes'/s);
});

test('Guardian retry scan selects only bounded failed or stale dispatches with saved proposals', async () => {
  let params;
  const db = { query: async (sql, values) => {
    params = values;
    assert.match(sql, /repair_dispatch_status='failed'/);
    assert.match(sql, /repair_dispatch_status='dispatching'/);
    assert.match(sql, /repair_dispatch_attempts < 3/);
    assert.match(sql, /status='awaiting_approval'/);
    assert.match(sql, /j\.result/);
    return { rows: [{ id: 8, result: { status: 'proposal_only' }, incident_id: 4 }] };
  } };
  const rows = await listPendingGuardianRepairDispatches(db, 100);
  assert.deepEqual(params, [25]);
  assert.equal(rows[0].id, 8);
});
