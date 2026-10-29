const VALID_STATUSES = new Set(['PASS', 'FAIL', 'BLOCKED']);
const VALID_ISOLATION = new Set(['READ_ONLY', 'ISOLATED_TEST_DB', 'NOT_VERIFIED']);

export function validateLiveCommandTest(input) {
  const errors = [];
  const requiredText = ['guildId', 'operatorId', 'command', 'expected', 'observed', 'evidence'];
  for (const key of requiredText) {
    if (typeof input?.[key] !== 'string' || !input[key].trim()) errors.push(key + ' is required');
  }
  for (const key of ['command', 'expected', 'observed', 'evidence']) {
    if (typeof input?.[key] === 'string' && input[key].length > 1500) errors.push(key + ' exceeds 1500 characters');
  }
  if (!VALID_STATUSES.has(input?.status)) errors.push('status must be PASS, FAIL, or BLOCKED');
  if (!VALID_ISOLATION.has(input?.isolation)) errors.push('isolation must be READ_ONLY, ISOLATED_TEST_DB, or NOT_VERIFIED');
  if (input?.status === 'PASS' && !['READ_ONLY', 'ISOLATED_TEST_DB'].includes(input?.isolation)) {
    errors.push('PASS is forbidden until the command is read-only or isolated from production data');
  }
  return { valid: errors.length === 0, errors };
}

export function createLiveCommandTestRecord(input, { now = new Date() } = {}) {
  const validation = validateLiveCommandTest(input);
  if (!validation.valid) {
    const error = new Error('Invalid live command test record: ' + validation.errors.join('; '));
    error.validationErrors = validation.errors;
    throw error;
  }
  return {
    schemaVersion: 1,
    evidenceType: 'operator-recorded-live-discord-interaction',
    automaticallyObserved: false,
    recordedAt: now.toISOString(),
    guildId: input.guildId.trim(),
    operatorId: input.operatorId.trim(),
    command: input.command.trim().replace(/^\//, ''),
    expected: input.expected.trim(),
    observed: input.observed.trim(),
    status: input.status,
    isolation: input.isolation,
    evidence: input.evidence.trim(),
  };
}

export function summarizeLiveCommandTests(records) {
  const summary = { total: records.length, pass: 0, fail: 0, blocked: 0 };
  for (const record of records) {
    if (record.status === 'PASS') summary.pass++;
    else if (record.status === 'FAIL') summary.fail++;
    else summary.blocked++;
  }
  return summary;
}
