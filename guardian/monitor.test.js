import test from 'node:test';
import assert from 'node:assert/strict';
import { scanNewOwnerErrors } from './monitor.js';

test('local monitor processes only unseen error rows and advances its cursor', async () => {
  let selectParams;
  const db = {
    query: async (sql, values) => {
      if (sql.includes('SELECT id,scope,error_type')) {
        selectParams = values;
        return { rows: [
          { id: 4, scope: '/frieren-ai', error_type: 'TimeoutError', error_message: 'AI timed out', created_at: '2026-11-02T10:00:00Z' },
          { id: 5, scope: '/owner', error_type: 'PanelError', error_message: 'Panel failed', created_at: '2026-11-02T10:01:00Z' },
        ] };
      }
      return { rows: [] };
    },
  };
  const result = await scanNewOwnerErrors(db, 3);
  assert.deepEqual(selectParams, [3, 50]);
  assert.deepEqual(result, { lastSeenErrorId: 5, recorded: 2 });
});
