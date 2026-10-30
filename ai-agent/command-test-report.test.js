import test from 'node:test';
import assert from 'node:assert/strict';
import { formatCommandTestResult } from './command-test-report.js';

test('command report displays behavioral database assertions and evidence type', () => {
  const formatted = formatCommandTestResult({
    command: 'buyupratik',
    status: 'PASS',
    expected: 'coins 75; mana 92',
    actual: 'coins 75; mana 92',
    evidenceType: 'synthetic-discord-interaction+isolated-postgresql-state-assertions',
    behavioralChecks: [
      { name: 'Altın bakiyesi', expected: '100 → 75', actual: '100 → 75', passed: true },
      { name: 'Mana bakiyesi', expected: '100 → 92', actual: '100 → 92', passed: true }
    ]
  });
  assert.match(formatted, /Altın bakiyesi/);
  assert.match(formatted, /Mana bakiyesi/);
  assert.match(formatted, /isolated-postgresql-state-assertions/);
});

test('command report keeps inconclusive results visually distinct from PASS', () => {
  const formatted = formatCommandTestResult({ command: 'envanter', status: 'INCONCLUSIVE', actual: 'Yanıt alındı' });
  assert.match(formatted, /INCONCLUSIVE/);
  assert.doesNotMatch(formatted, /✅/);
});
