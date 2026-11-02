import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(new URL('../.github/workflows/frieren-ai-self-repair.yml', import.meta.url), 'utf8');

test('Guardian repair workflow declares the incident ID used for PR reconciliation', () => {
  assert.match(workflow, /incident_id:\s*\n\s+description:/);
  assert.match(workflow, /incident_id:\s*\n\s+description:[^\n]*\n\s+required:\s*false\n\s+type:\s*string/);
  assert.match(workflow, /branch:\s*ai-repair\/guardian-\$\{\{ inputs\.incident_id \|\| github\.run_id \}\}/);
  assert.match(workflow, /Guardian incident #\$\{\{ inputs\.incident_id \|\| github\.run_id \}\}/);
});

test('Guardian repair workflow keeps PR-only permissions and never auto-merges', () => {
  assert.match(workflow, /permissions:\s*\n\s+contents:\s*write\n\s+pull-requests:\s*write/);
  assert.doesNotMatch(workflow, /gh pr merge|auto-merge|render deploy|trigger_deploy/i);
});
