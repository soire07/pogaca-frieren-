import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGuardianRepairTask, processGuardianIncident, processPendingGuardianRepairDispatch } from './automation.js';

const incident = {
  id: 42,
  system: 'pogaca_frieren',
  code: 'COMMAND_TIMEOUT',
  severity: 'critical',
  title: 'Command timed out for user@example.com',
  summary: 'DISCORD_TOKEN=private-token request timed out',
};

const review = {
  status: 'proposal_only',
  confidence: 'high',
  rootCause: 'A bounded timeout is missing.',
  affectedFiles: ['commands/example.js'],
  suggestedFix: 'Add an AbortSignal timeout.',
  proposedPatch: 'diff --git a/commands/example.js b/commands/example.js',
  tests: ['Add a timeout regression test.'],
  risks: ['The upstream call may still finish after cancellation.'],
};

test('repair task is bounded and excludes raw incident summaries and credentials', () => {
  const task = buildGuardianRepairTask(incident, review);
  assert.ok(task.length <= 1200);
  assert.match(task, /Guardian incident #42/);
  assert.match(task, /A bounded timeout is missing/);
  assert.doesNotMatch(task, /private-token|user@example.com/);
  assert.doesNotMatch(task, /request timed out/);
});

test('autonomous incident handling respects the emergency stop before contacting Frieren AI', async () => {
  let requests = 0;
  let jobs = 0;
  const result = await processGuardianIncident({
    db: { query: async () => ({ rows: [{ setting_value: { enabled: true } }] }) },
    incident,
    env: { FRIEREN_AI_BRIDGE_SECRET: 'x'.repeat(48), FRIEREN_GITHUB_TOKEN: 'y'.repeat(48) },
    fetchImpl: async () => { requests += 1; throw new Error('must not request'); },
    store: {
      createGuardianReviewJob: async () => { jobs += 1; },
    },
  });
  assert.equal(result.status, 'emergency_stop');
  assert.equal(requests, 0);
  assert.equal(jobs, 0);
});

test('high-severity incidents are reviewed and dispatched to the isolated repair branch', async () => {
  const calls = [];
  const store = {
    createGuardianReviewJob: async (_db, args) => { calls.push(['create', args]); return { id: 9, status: 'queued' }; },
    finishGuardianReviewJob: async (_db, args) => { calls.push(['finishReview', args]); return true; },
    reserveGuardianRepairDispatch: async (_db, id) => { calls.push(['reserve', id]); return { id }; },
    finishGuardianRepairDispatch: async (_db, args) => { calls.push(['finishDispatch', args]); return true; },
  };
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url: String(url), options });
    if (String(url).includes('/internal/guardian-review')) {
      return { ok: true, status: 200, json: async () => review };
    }
    return { ok: true, status: 204, json: async () => ({}) };
  };
  const result = await processGuardianIncident({
    db: { query: async () => ({ rows: [{ setting_value: { enabled: false } }] }) },
    incident,
    env: {
      FRIEREN_AI_PUBLIC_URL: 'https://frieren-ai-agent.onrender.com',
      FRIEREN_AI_BRIDGE_SECRET: 'x'.repeat(48),
      FRIEREN_GITHUB_TOKEN: 'y'.repeat(48),
    },
    fetchImpl,
    store,
  });
  assert.equal(result.status, 'dispatched');
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, 'https://frieren-ai-agent.onrender.com/internal/guardian-review');
  assert.equal(requests[1].url, 'https://api.github.com/repos/soire07/pogaca-frieren-/actions/workflows/frieren-ai-self-repair.yml/dispatches');
  assert.equal(requests[1].options.headers.Authorization, 'Bearer ' + 'y'.repeat(48));
  const payload = JSON.parse(requests[1].options.body);
  assert.equal(payload.ref, 'feat/guardian-autonomous-repair-v2');
  assert.equal(payload.inputs.base_branch, 'feat/guardian-autonomous-repair-v2');
  assert.equal(payload.inputs.incident_id, '42');
  assert.ok(calls.some(([name]) => name === 'finishReview'));
  assert.ok(calls.some(([name]) => name === 'finishDispatch'));
});

test('emergency stop enabled during AI review blocks the later workflow POST', async () => {
  let stateReads = 0;
  let posts = 0;
  let reservations = 0;
  const finished = [];
  const result = await processGuardianIncident({
    db: { query: async () => ({
      rows: [{ setting_value: { enabled: ++stateReads > 1 } }],
    }) },
    incident,
    env: {
      FRIEREN_AI_BRIDGE_SECRET: 'x'.repeat(48),
      FRIEREN_GITHUB_TOKEN: 'y'.repeat(48),
    },
    fetchImpl: async (url) => {
      if (String(url).includes('/internal/guardian-review')) {
        return { ok: true, status: 200, json: async () => review };
      }
      posts += 1;
      return { ok: true, status: 204, json: async () => ({}) };
    },
    store: {
      createGuardianReviewJob: async () => ({ id: 11, status: 'queued' }),
      finishGuardianReviewJob: async () => true,
      reserveGuardianRepairDispatch: async () => { reservations += 1; return { id: 11 }; },
      finishGuardianRepairDispatch: async (_db, args) => { finished.push(args); return true; },
    },
  });
  assert.equal(result.status, 'emergency_stop');
  assert.equal(stateReads, 2);
  assert.equal(reservations, 1);
  assert.equal(posts, 0);
  assert.equal(finished[0].status, 'failed');
});

test('low-confidence or incomplete AI proposals never dispatch a repair workflow', async () => {
  let requests = 0;
  const store = {
    createGuardianReviewJob: async () => ({ id: 10, status: 'queued' }),
    finishGuardianReviewJob: async () => true,
    reserveGuardianRepairDispatch: async () => { throw new Error('must not reserve'); },
  };
  const result = await processGuardianIncident({
    db: { query: async () => ({ rows: [{ setting_value: { enabled: false } }] }) },
    incident,
    env: {
      FRIEREN_AI_BRIDGE_SECRET: 'x'.repeat(48),
      FRIEREN_GITHUB_TOKEN: 'y'.repeat(48),
    },
    fetchImpl: async () => {
      requests += 1;
      return { ok: true, status: 200, json: async () => ({ ...review, confidence: 'low' }) };
    },
    store,
  });
  assert.equal(result.status, 'reviewed_only');
  assert.equal(requests, 1);
});


test('failed repair dispatch retries from the saved AI proposal without repeating the AI review', async () => {
  const calls = [];
  const store = {
    reserveGuardianRepairDispatch: async (_db, id) => { calls.push(['reserve', id]); return { id, repair_dispatch_attempts: 2 }; },
    finishGuardianRepairDispatch: async (_db, args) => { calls.push(['finish', args]); return true; },
  };
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url: String(url), options });
    if (options.method === 'GET') return { ok: true, status: 200, json: async () => ({ workflow_runs: [] }) };
    return { ok: true, status: 204, json: async () => ({}) };
  };
  const result = await processPendingGuardianRepairDispatch({
    db: { query: async () => ({ rows: [] }) },
    job: { id: 9, result: review, repair_dispatch_attempts: 1 },
    incident,
    env: { FRIEREN_GITHUB_TOKEN: 'y'.repeat(48) },
    fetchImpl,
    store,
  });
  assert.equal(result.status, 'dispatched');
  assert.equal(requests.length, 2);
  assert.equal(requests[0].options.method, 'GET');
  assert.equal(requests[1].options.method, 'POST');
  assert.equal(requests[1].url.endsWith('/dispatches'), true);
  assert.equal(calls[0][0], 'reserve');
  assert.equal(calls[1][1].status, 'dispatched');
});

test('failed repair dispatch detects an already-started workflow and does not dispatch a duplicate', async () => {
  const calls = [];
  const store = {
    reserveGuardianRepairDispatch: async (_db, id) => ({ id }),
    finishGuardianRepairDispatch: async (_db, args) => { calls.push(args); return true; },
  };
  let posts = 0;
  const result = await processPendingGuardianRepairDispatch({
    db: { query: async () => ({ rows: [] }) },
    job: { id: 9, result: review },
    incident,
    env: { FRIEREN_GITHUB_TOKEN: 'y'.repeat(48) },
    fetchImpl: async (_url, options) => {
      if (options.method === 'GET') return { ok: true, status: 200, json: async () => ({
        workflow_runs: [{ display_title: 'Frieren AI Repair · Guardian #42', html_url: 'https://github.com/example/actions/runs/123' }],
      }) };
      posts += 1;
      return { ok: true, status: 204, json: async () => ({}) };
    },
    store,
  });
  assert.equal(result.status, 'already_dispatched');
  assert.equal(posts, 0);
  assert.equal(calls[0].status, 'dispatched');
  assert.match(calls[0].workflowUrl, /actions\/runs\/123/);
});

test('failed repair dispatch does not send when workflow reconciliation is unavailable', async () => {
  let posts = 0;
  const store = {
    reserveGuardianRepairDispatch: async (_db, id) => ({ id }),
    finishGuardianRepairDispatch: async () => true,
  };
  const result = await processPendingGuardianRepairDispatch({
    db: { query: async () => ({ rows: [] }) },
    job: { id: 9, result: review },
    incident,
    env: { FRIEREN_GITHUB_TOKEN: 'y'.repeat(48) },
    fetchImpl: async (_url, options) => {
      if (options.method === 'GET') return { ok: false, status: 503, json: async () => ({}) };
      posts += 1;
      return { ok: true, status: 204, json: async () => ({}) };
    },
    store,
  });
  assert.equal(result.status, 'reconciliation_unavailable');
  assert.equal(posts, 0);
});


test('automatic dispatch retry rechecks emergency stop after workflow reconciliation', async () => {
  let stateReads = 0;
  let posts = 0;
  const finished = [];
  const result = await processPendingGuardianRepairDispatch({
    db: { query: async () => ({
      rows: [{ setting_value: { enabled: ++stateReads > 1 } }],
    }) },
    job: { id: 12, result: review },
    incident,
    env: { FRIEREN_GITHUB_TOKEN: 'y'.repeat(48) },
    fetchImpl: async (_url, options) => {
      if (options.method === 'GET') return { ok: true, status: 200, json: async () => ({ workflow_runs: [] }) };
      posts += 1;
      return { ok: true, status: 204, json: async () => ({}) };
    },
    store: {
      reserveGuardianRepairDispatch: async () => ({ id: 12 }),
      finishGuardianRepairDispatch: async (_db, args) => { finished.push(args); return true; },
    },
  });
  assert.equal(result.status, 'emergency_stop');
  assert.equal(stateReads, 2);
  assert.equal(posts, 0);
  assert.equal(finished[0].status, 'failed');
});

test('automatic dispatch retry respects the emergency stop before reserving or contacting GitHub', async () => {
  let requests = 0;
  let reservations = 0;
  const result = await processPendingGuardianRepairDispatch({
    db: { query: async () => ({ rows: [{ setting_value: { enabled: true } }] }) },
    job: { id: 9, result: review },
    incident,
    env: { FRIEREN_GITHUB_TOKEN: 'y'.repeat(48) },
    fetchImpl: async () => { requests += 1; throw new Error('must not request'); },
    store: { reserveGuardianRepairDispatch: async () => { reservations += 1; return { id: 9 }; } },
  });
  assert.equal(result.status, 'emergency_stop');
  assert.equal(requests, 0);
  assert.equal(reservations, 0);
});
