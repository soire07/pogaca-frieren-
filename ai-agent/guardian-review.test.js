import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeGuardianReviewIncident, parseGuardianReview } from './guardian-review.js';

test('Guardian review input accepts only known systems and redacts secrets', () => {
  const incident = normalizeGuardianReviewIncident({
    system: 'frieren_ai',
    code: 'MODEL_TIMEOUT',
    title: 'Model timeout',
    summary: 'FRIEREN_API_TOKEN=private-value',
    evidence: [{ file: 'ai-agent/index.js', line: 10, message: 'request timed out' }],
  });
  assert.equal(incident.system, 'frieren_ai');
  assert.doesNotMatch(incident.summary, /private-value/);
  assert.throws(() => normalizeGuardianReviewIncident({
    system: 'other', title: 'x', summary: 'y',
  }), { message: 'INVALID_GUARDIAN_INCIDENT' });
});

test('Guardian review parser returns a proposal that is never marked applied', () => {
  const result = parseGuardianReview(JSON.stringify({
    rootCause: 'Missing timeout guard.',
    confidence: 'medium',
    affectedFiles: ['ai-agent/index.js', '../.env', '/etc/passwd', 'C:\\\\Windows\\\\system.ini', '\\\\\\\\server\\\\share\\\\secret.txt'],
    suggestedFix: 'Add a bounded timeout.',
    proposedPatch: 'diff --git a/ai-agent/index.js b/ai-agent/index.js',
    tests: ['Add timeout regression test.'],
    risks: ['Existing retries may overlap.'],
  }));
  assert.equal(result.status, 'proposal_only');
  assert.equal(result.applied, false);
  assert.equal(result.requiresHumanReview, true);
  assert.deepEqual(result.affectedFiles, ['ai-agent/index.js']);
  const incident = normalizeGuardianReviewIncident({
    system: 'frieren_ai', title: 'Path test', summary: 'Evidence paths',
    evidence: [
      { file: 'src/guardian.js', message: 'safe' },
      { file: 'C:\\\\Windows\\\\system.ini', message: 'absolute Windows path' },
      { file: '\\\\\\\\server\\\\share\\\\secret.txt', message: 'UNC path' },
    ],
  });
  assert.deepEqual(incident.evidence.map(item => item.file), ['src/guardian.js']);
  assert.equal(result.confidence, 'medium');
});

test('Guardian review parser rejects non-JSON model output', () => {
  assert.throws(() => parseGuardianReview('I think the bug is in a timeout.'), {
    message: 'GUARDIAN_REVIEW_INVALID_JSON',
  });
});

test('Guardian review parser rejects JSON null and arrays instead of crashing or accepting them', () => {
  for (const output of ['null', '[]']) {
    assert.throws(() => parseGuardianReview(output), {
      message: 'GUARDIAN_REVIEW_INVALID_JSON_SHAPE',
    });
  }
});

test('Guardian review busy lock is not set by ordinary scenario tests and is released by review finally', async () => {
  const source = await readFile(new URL('./index.js', import.meta.url), 'utf8');
  const scenarioStart = source.indexOf("if (req.url === '/internal/test-scenario'");
  const guardianStart = source.indexOf("if (req.url === '/internal/guardian-review'");
  assert.ok(scenarioStart >= 0 && guardianStart > scenarioStart);
  const scenarioRoute = source.slice(scenarioStart, guardianStart);
  const guardianRoute = source.slice(guardianStart);
  assert.doesNotMatch(scenarioRoute, /guardianReviewInProgress\\s*=\\s*true/);
  assert.match(guardianRoute, /guardianReviewInProgress\\s*=\\s*true/);
  assert.match(guardianRoute, /finally\\s*\\{\\s*guardianReviewInProgress\\s*=\\s*false/);
});
