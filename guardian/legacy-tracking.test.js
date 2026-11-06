import test from 'node:test';
import assert from 'node:assert/strict';
import { refreshGuardianRepairTracking } from './automation.js';

test('legacy Guardian dispatches reconcile by audited branch and dispatch timestamp', async () => {
  const dispatchAt = '2026-11-05T11:23:23.106Z';
  const requests = [];
  const updates = [];
  const result = await refreshGuardianRepairTracking({
    db: {
      query: async () => ({ rows: [{ base_branch: 'guardian-isolated-repair-test' }] }),
    },
    job: { id: 70, repair_dispatch_status: 'dispatched', repair_dispatch_at: dispatchAt },
    incident: { id: 42 },
    env: { FRIEREN_GITHUB_TOKEN: 'x'.repeat(40) },
    store: {
      updateGuardianRepairStatus: async (_db, value) => { updates.push(value); return true; },
    },
    fetchImpl: async url => {
      requests.push(String(url));
      if (String(url).includes('/actions/workflows/')) {
        return {
          ok: true,
          json: async () => ({
            total_count: 1,
            workflow_runs: [{
              id: 7001,
              display_title: 'Frieren AI Safe Self-Repair',
              status: 'completed',
              conclusion: 'failure',
              created_at: '2026-11-05T11:23:24.000Z',
              html_url: 'https://github.com/soire07/pogaca-frieren-/actions/runs/7001',
            }],
          }),
        };
      }
      return { ok: true, json: async () => [] };
    },
  });
  assert.equal(result.status, 'refreshed');
  assert.equal(result.runId, 7001);
  assert.equal(result.checksStatus, 'failure');
  assert.match(requests[0], /branch=guardian-isolated-repair-test/);
  assert.match(requests[1], /base=guardian-isolated-repair-test/);
  assert.equal(updates[0].retryable, true);
});

test('Guardian tracking rejects an unaudited branch', async () => {
  const result = await refreshGuardianRepairTracking({
    db: { query: async () => ({ rows: [{ base_branch: 'attacker-controlled-branch' }] }) },
    job: { id: 71, repair_dispatch_status: 'dispatched', repair_dispatch_at: '2026-11-05T11:23:23.106Z' },
    incident: { id: 43 },
    env: { FRIEREN_GITHUB_TOKEN: 'x'.repeat(40) },
    fetchImpl: async () => { throw new Error('must not fetch'); },
    store: { updateGuardianRepairStatus: async () => true },
  });
  assert.equal(result.status, 'tracking_failed');
  assert.equal(result.reason, 'GUARDIAN_REPAIR_BRANCH_UNSUPPORTED');
});
