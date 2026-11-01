import { randomInt } from 'node:crypto';

export function createIsolatedTestRunContext(commandCount, runId = String(randomInt(0, 1_000_000_000_000)).padStart(12, '0')) {
  if (!Number.isSafeInteger(commandCount) || commandCount < 1 || commandCount > 999) {
    throw new Error('INVALID_TEST_COMMAND_COUNT');
  }
  if (typeof runId !== 'string' || !/^[a-zA-Z0-9_-]{1,32}$/.test(runId)) {
    throw new Error('INVALID_TEST_RUN_ID');
  }

  const guildIds = Array.from({ length: commandCount }, (_, index) =>
    '91' + runId + String(index + 1).padStart(3, '0')
  );

  return {
    runId,
    guildIds,
    userId(index) {
      if (!Number.isSafeInteger(index) || index < 1 || index > commandCount) {
        throw new Error('INVALID_TEST_USER_SEQUENCE');
      }
      return '90' + runId + String(index).padStart(6, '0');
    },
    coopUserPrefix: '90' + runId
  };
}
