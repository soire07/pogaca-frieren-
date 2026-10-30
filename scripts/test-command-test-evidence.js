import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCommandEvidence } from './command-test-evidence.js';

test('a command is PASS only when every command-specific behavior assertion passes', () => {
  const result = buildCommandEvidence({
    responseCount: 2,
    behavioralChecks: [
      { name: 'coins', expected: '75', actual: '75', passed: true },
      { name: 'mana', expected: '92', actual: '92', passed: true }
    ]
  });
  assert.equal(result.status, 'PASS');
});

test('a response without behavioral assertions remains INCONCLUSIVE', () => {
  const result = buildCommandEvidence({ responseCount: 1 });
  assert.equal(result.status, 'INCONCLUSIVE');
  assert.match(result.comparison, /davranış kanıtı yok/);
});

test('any failed behavioral assertion makes the command FAIL', () => {
  const result = buildCommandEvidence({
    responseCount: 1,
    behavioralChecks: [
      { name: 'coins', expected: '75', actual: '75', passed: true },
      { name: 'mana', expected: '92', actual: '100', passed: false }
    ]
  });
  assert.equal(result.status, 'FAIL');
  assert.match(result.detail, /mana/);
});

test('no response and no behavioral assertion is a failure, not a pass', () => {
  assert.equal(buildCommandEvidence({}).status, 'FAIL');
});
