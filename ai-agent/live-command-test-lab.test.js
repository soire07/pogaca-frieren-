import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveCommandTestRecord, summarizeLiveCommandTests, validateLiveCommandTest } from './live-command-test-lab.js';

const valid = {
  guildId: 'guild-test',
  operatorId: 'operator-test',
  command: '/daily',
  expected: '100 coins are awarded',
  observed: '100 coins were awarded in the test character',
  status: 'PASS',
  isolation: 'ISOLATED_TEST_DB',
  evidence: 'Ran /daily in the configured test guild and checked the test character balance',
};

test('live test record captures the operator-observed interaction without claiming automatic observation', () => {
  const record = createLiveCommandTestRecord(valid, { now: new Date('2026-10-29T10:00:00.000Z') });
  assert.equal(record.command, 'daily');
  assert.equal(record.evidenceType, 'operator-recorded-live-discord-interaction');
  assert.equal(record.automaticallyObserved, false);
  assert.equal(record.recordedAt, '2026-10-29T10:00:00.000Z');
});

test('PASS is rejected if database isolation has not been verified', () => {
  const result = validateLiveCommandTest({ ...valid, isolation: 'NOT_VERIFIED' });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(error => error.includes('PASS is forbidden')));
  assert.throws(() => createLiveCommandTestRecord({ ...valid, isolation: 'NOT_VERIFIED' }), /PASS is forbidden/);
});

test('failed and blocked cases may be recorded while clearly reporting isolation state', () => {
  assert.equal(createLiveCommandTestRecord({ ...valid, status: 'FAIL', isolation: 'NOT_VERIFIED' }).status, 'FAIL');
  assert.equal(createLiveCommandTestRecord({ ...valid, status: 'BLOCKED', isolation: 'NOT_VERIFIED' }).status, 'BLOCKED');
});

test('required evidence and bounded fields are enforced', () => {
  assert.equal(validateLiveCommandTest({ ...valid, evidence: '' }).valid, false);
  assert.equal(validateLiveCommandTest({ ...valid, observed: 'x'.repeat(1501) }).valid, false);
});

test('summary counts pass, fail, and blocked cases independently', () => {
  const records = [
    createLiveCommandTestRecord(valid),
    createLiveCommandTestRecord({ ...valid, status: 'FAIL' }),
    createLiveCommandTestRecord({ ...valid, status: 'BLOCKED', isolation: 'NOT_VERIFIED' }),
  ];
  assert.deepEqual(summarizeLiveCommandTests(records), { total: 3, pass: 1, fail: 1, blocked: 1 });
});
