import test from 'node:test';
import assert from 'node:assert/strict';
import { approveGuardianRepair, getGuardianProposalFingerprint } from './store.js';
import { processGuardianIncident, processPendingGuardianRepairDispatch } from './automation.js';

const incident = {
  id: 990042,
  system: 'guardian_synthetic_test',
  code: 'SYNTHETIC_REPAIR_E2E',
  severity: 'critical',
  title: 'Synthetic Guardian repair test',
  summary: 'Disposable fixture only; no player or production incident data.',
  evidence: [{ type: 'synthetic', source: 'automated-test' }],
};

const proposal = {
  status: 'proposal_only',
  confidence: 'high',
  rootCause: 'A deterministic synthetic fixture exposes a missing guard.',
  affectedFiles: ['guardian/automation.test.js'],
  suggestedFix: 'Add a bounded guard and preserve the owner approval boundary.',
  proposedPatch: 'diff --git a/guardian/automation.test.js b/guardian/automation.test.js',
  tests: ['Verify owner approval fingerprint and isolated dispatch.'],
  risks: ['Synthetic fixture only; no live files are changed.'],
};

function createFixtureDb({ emergencyReads = [] } = {}) {
  const state = {
    emergencyReads: [...emergencyReads],
    emergencyReadCount: 0,
    incident: { ...incident, status: 'open' },
    job: {
      id: 990043,
      incident_id: incident.id,
      status: 'queued',
      result: null,
      repair_dispatch_status: 'not_requested',
      repair_dispatch_attempts: 0,
      repair_approved_by: null,
      repair_approval_fingerprint: null,
    },
  };

  const db = {
    async query(sql, params = []) {
      if (sql.includes("SELECT setting_value FROM owner_settings")) {
        const index = Math.min(state.emergencyReadCount++, state.emergencyReads.length - 1);
        return { rows: [{ setting_value: { enabled: state.emergencyReads[index] === true } }] };
      }
      if (sql.includes('SELECT j.result,j.status,j.repair_dispatch_status')) {
        return { rows: [{
          result: state.job.result,
          status: state.job.status,
          repair_dispatch_status: state.job.repair_dispatch_status,
          incident_status: state.incident.status,
        }] };
      }
      if (sql.includes('WITH changed AS (') && sql.includes('guardian.repair.owner_approved')) {
        const [jobId, actorId, fingerprint] = params;
        if (Number(jobId) !== state.job.id || state.job.status !== 'completed'
          || state.incident.status !== 'awaiting_approval'
          || state.job.repair_dispatch_status !== 'not_requested'
          || fingerprint !== getGuardianProposalFingerprint(state.job.result)
          || state.emergencyReads[state.emergencyReadCount - 1] === true) return { rows: [] };
        state.job.repair_approved_by = String(actorId);
        state.job.repair_approval_fingerprint = fingerprint;
        state.job.repair_approved_at = '2026-11-05T00:00:00.000Z';
        return { rows: [{ ...state.job }] };
      }
      if (sql.includes('UPDATE owner_guardian_jobs AS j SET')) {
        const [jobId, fingerprint] = params;
        if (Number(jobId) !== state.job.id
          || state.job.repair_approved_by == null
          || state.job.repair_approval_fingerprint !== fingerprint
          || fingerprint !== getGuardianProposalFingerprint(state.job.result)
          || state.incident.status !== 'awaiting_approval'
          || state.job.status !== 'completed'
          || state.job.repair_dispatch_attempts >= 3
          || ['dispatching', 'dispatched'].includes(state.job.repair_dispatch_status)
          || state.emergencyReads[state.emergencyReadCount - 1] === true) return { rows: [] };
        state.job.repair_dispatch_status = 'dispatching';
        state.job.repair_dispatch_attempts += 1;
        return { rows: [{ ...state.job }] };
      }
      if (sql.includes('UPDATE owner_guardian_jobs SET repair_dispatch_status=$2')) {
        const [jobId, status, workflowUrl] = params;
        if (Number(jobId) !== state.job.id || state.job.repair_dispatch_status !== 'dispatching') return { rows: [] };
        state.job.repair_dispatch_status = status;
        if (workflowUrl) state.job.repair_workflow_url = workflowUrl;
        return { rows: [{ id: state.job.id }] };
      }
      if (sql.includes('INSERT INTO owner_audit_logs')) return { rows: [{ id: 1 }] };
      throw new Error('UNEXPECTED_SYNTHETIC_DB_QUERY: ' + sql.slice(0, 90));
    },
  };
  return { db, state };
}

async function prepareApprovedSyntheticJob(fixture) {
  const reviewResult = await processGuardianIncident({
    db: fixture.db,
    incident,
    env: {
      FRIEREN_AI_PUBLIC_URL: 'https://frieren-ai.invalid',
      FRIEREN_AI_BRIDGE_SECRET: 'synthetic-bridge-secret-'.padEnd(48, 'x'),
      FRIEREN_GITHUB_TOKEN: 'synthetic-github-token-'.padEnd(48, 'y'),
    },
    fetchImpl: async url => {
      assert.equal(String(url), 'https://frieren-ai.invalid/internal/guardian-review');
      return { ok: true, status: 200, json: async () => proposal };
    },
    store: {
      createGuardianReviewJob: async () => ({ ...fixture.state.job }),
      finishGuardianReviewJob: async (_db, args) => {
        fixture.state.job.status = 'completed';
        fixture.state.job.result = args.result;
        fixture.state.incident.status = 'awaiting_approval';
        return true;
      },
    },
  });
  assert.equal(reviewResult.status, 'proposal_ready');
  assert.equal(reviewResult.approvalRequired, true);
  assert.equal(fixture.state.job.repair_dispatch_status, 'not_requested');
  const approval = await approveGuardianRepair(fixture.db, {
    jobId: fixture.state.job.id,
    actorId: 'synthetic-owner-1553794496234262641',
  });
  assert.ok(approval);
  assert.equal(approval.repair_approval_fingerprint, getGuardianProposalFingerprint(proposal));
  return fixture.state.job;
}

test('synthetic Guardian event → AI proposal → owner fingerprint approval → isolated workflow dispatch', async () => {
  const fixture = createFixtureDb();
  const job = await prepareApprovedSyntheticJob(fixture);
  const requests = [];
  const dispatch = await processPendingGuardianRepairDispatch({
    db: fixture.db,
    job,
    incident,
    env: { FRIEREN_GITHUB_TOKEN: 'synthetic-github-token-'.padEnd(48, 'y') },
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), options });
      if (options.method === 'GET') return { ok: true, status: 200, json: async () => ({ workflow_runs: [], total_count: 0 }) };
      return { ok: true, status: 204, json: async () => ({}) };
    },
  });

  assert.equal(dispatch.status, 'dispatched');
  assert.equal(fixture.state.job.repair_dispatch_status, 'dispatched');
  assert.equal(requests.length, 2);
  assert.equal(requests[0].options.method, 'GET');
  assert.equal(requests[1].options.method, 'POST');
  const payload = JSON.parse(requests[1].options.body);
  assert.equal(payload.ref, 'guardian-isolated-repair-test-v2');
  assert.equal(payload.inputs.base_branch, 'guardian-isolated-repair-test-v2');
  assert.equal(payload.inputs.incident_id, String(incident.id));
  assert.equal(payload.inputs.mode, 'repair');

  const duplicate = await processPendingGuardianRepairDispatch({
    db: fixture.db, job, incident,
    env: { FRIEREN_GITHUB_TOKEN: 'synthetic-github-token-'.padEnd(48, 'y') },
    fetchImpl: async () => { throw new Error('duplicate dispatch must not reach GitHub'); },
  });
  assert.equal(duplicate.status, 'dispatch_not_reserved');
});

test('synthetic proposal mutation invalidates the saved owner approval fingerprint', async () => {
  const fixture = createFixtureDb();
  const job = await prepareApprovedSyntheticJob(fixture);
  job.result = { ...job.result, suggestedFix: 'changed after owner approval' };
  let requests = 0;
  const result = await processPendingGuardianRepairDispatch({
    db: fixture.db, job, incident,
    env: { FRIEREN_GITHUB_TOKEN: 'synthetic-github-token-'.padEnd(48, 'y') },
    fetchImpl: async () => { requests += 1; throw new Error('stale approval must not dispatch'); },
  });
  assert.equal(result.status, 'approval_required');
  assert.equal(requests, 0);
  assert.equal(fixture.state.job.repair_dispatch_status, 'not_requested');
});

test('synthetic emergency stop blocks dispatch after workflow reconciliation', async () => {
  const fixture = createFixtureDb({ emergencyReads: [false, false, true] });
  const job = await prepareApprovedSyntheticJob(fixture);
  const requests = [];
  const result = await processPendingGuardianRepairDispatch({
    db: fixture.db, job, incident,
    env: { FRIEREN_GITHUB_TOKEN: 'synthetic-github-token-'.padEnd(48, 'y') },
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), options });
      if (options.method === 'GET') return { ok: true, status: 200, json: async () => ({ workflow_runs: [], total_count: 0 }) };
      return { ok: true, status: 204, json: async () => ({}) };
    },
  });
  assert.equal(result.status, 'emergency_stop');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].options.method, 'GET');
  assert.equal(fixture.state.job.repair_dispatch_status, 'failed');
});
