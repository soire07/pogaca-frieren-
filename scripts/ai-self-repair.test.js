import test from 'node:test';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import {
  isAllowedRepairPath,
  isApprovedIndexRepairTask,
  extractUnifiedDiff,
  validatePatchPaths,
  generateRepairPatch,
  generateRepairPatchWithRetry,
  verifyGroqConnection,
  applyRepairPatch,
  formatRepairFilesOutput,
  collectRepairContext,
} from './ai-self-repair.js';

const validPatch = [
  'diff --git a/rpg-mechanics.js b/rpg-mechanics.js',
  'index 1111111..2222222 100644',
  '--- a/rpg-mechanics.js',
  '+++ b/rpg-mechanics.js',
  '@@ -1 +1 @@',
  '-const ready = false;',
  '+const ready = true;',
].join('\n');

const approvedIndexTask = [
  'Guardian incident #4 · pogaca_frieren · ERR_HTTP_HEADERS_SENT',
  'İlgili dosyalar: index.js',
].join('\n');

const validIndexPatch = [
  'diff --git a/index.js b/index.js',
  'index 1111111..2222222 100644',
  '--- a/index.js',
  '+++ b/index.js',
  '@@ -1 +1 @@',
  '-const ready = false;',
  '+const ready = true;',
].join('\n');

test('repair path allowlist accepts approved source, AI review, Guardian and test files only', () => {
  assert.equal(isAllowedRepairPath('rpg-mechanics.js'), true);
  assert.equal(isAllowedRepairPath('ai-agent/owner-scenario-report.js'), true);
  assert.equal(isAllowedRepairPath('ai-agent/guardian-review.js'), true);
  assert.equal(isAllowedRepairPath('guardian/automation.js'), true);
  assert.equal(isAllowedRepairPath('guardian/automation.test.js'), true);
  assert.equal(isAllowedRepairPath('guardian/core.js'), true);
  assert.equal(isAllowedRepairPath('scripts/test-owner-dashboard.js'), true);
  assert.equal(isAllowedRepairPath('scripts/ai-self-repair.js'), false);
  assert.equal(isAllowedRepairPath('owner-dashboard.js'), false);
  assert.equal(isAllowedRepairPath('ai-agent/index.js'), false);
  assert.equal(isAllowedRepairPath('ai-agent/memory-store.js'), false);
  assert.equal(isAllowedRepairPath('guardian/../index.js'), false);
  assert.equal(isAllowedRepairPath('guardian/.env.js'), false);
  assert.equal(isAllowedRepairPath('package.json'), false);
  assert.equal(isAllowedRepairPath('.env.js'), false);
  assert.equal(isAllowedRepairPath('ai-agent/config.js'), false);
  assert.equal(isAllowedRepairPath('database/migrations/001.js'), false);
  assert.equal(isAllowedRepairPath('../index.js'), false);
  assert.equal(isAllowedRepairPath('index.js'), false);
});

test('index.js exception is restricted to the exact approved Guardian incident and file set', () => {
  assert.equal(isApprovedIndexRepairTask(approvedIndexTask, '4'), true);
  assert.equal(isApprovedIndexRepairTask(approvedIndexTask, '5'), false);
  assert.equal(isApprovedIndexRepairTask(approvedIndexTask.replace('ERR_HTTP_HEADERS_SENT', 'OTHER_ERROR'), '4'), false);
  assert.equal(isAllowedRepairPath('index.js'), false);
  assert.deepEqual(validatePatchPaths(validIndexPatch, { task: approvedIndexTask, incidentId: '4' }), ['index.js']);
  assert.throws(() => validatePatchPaths(validIndexPatch, { task: approvedIndexTask, incidentId: '5' }), {
    message: 'REPAIR_PATH_NOT_ALLOWED',
  });
  assert.throws(() => validatePatchPaths(validIndexPatch + '\n' + validPatch, {
    task: approvedIndexTask, incidentId: '4',
  }), { message: 'REPAIR_APPROVED_INDEX_SCOPE_VIOLATION' });
  assert.equal(
    formatRepairFilesOutput(['index.js'], { task: approvedIndexTask, incidentId: '4' }),
    'repair_files<<REPAIR_FILES\nindex.js\nREPAIR_FILES\n',
  );
  assert.throws(() => formatRepairFilesOutput(['index.js']), {
    message: 'REPAIR_OUTPUT_FILE_SET_INVALID',
  });
});

test('repair diff parser extracts a fenced unified diff and validates file paths', () => {
  const patch = extractUnifiedDiff('Patch proposal:\n```diff\n' + validPatch + '\n```');
  assert.equal(validatePatchPaths(patch)[0], 'rpg-mechanics.js');
});

test('repair diff rejects package, workflow, migration and path traversal changes', () => {
  const unsafe = [
    'diff --git a/.github/workflows/deploy.yml b/.github/workflows/deploy.yml',
    '--- a/.github/workflows/deploy.yml',
    '+++ b/.github/workflows/deploy.yml',
    '@@ -1 +1 @@',
    '-old',
    '+new',
  ].join('\n');
  assert.throws(() => validatePatchPaths(unsafe), { message: 'REPAIR_PATH_NOT_ALLOWED' });
  assert.throws(() => validatePatchPaths(validPatch.replaceAll('rpg-mechanics.js', '../.env')), {
    message: 'REPAIR_PATH_NOT_ALLOWED',
  });
});

test('repair diff is bounded to four files and rejects binary or rename patches', () => {
  const binary = validPatch + '\ndiff --git a/ai-agent/owner-scenario-report.js b/ai-agent/owner-scenario-report.js\nGIT binary patch\n';
  assert.throws(() => validatePatchPaths(binary), { message: 'REPAIR_PATCH_FEATURE_NOT_ALLOWED' });
  const many = Array.from({ length: 5 }, (_, i) =>
    'diff --git a/file' + i + '.js b/file' + i + '.js\n--- a/file' + i + '.js\n+++ b/file' + i + '.js\n@@ -1 +1 @@\n-a\n+b'
  ).join('\n');
  assert.throws(() => validatePatchPaths(many), { message: 'REPAIR_FILE_COUNT_INVALID' });
});


test('repair patch rejects newly created files because proposals may only update existing files', () => {
  const newFile = [
    'diff --git a/ai-agent/new-helper.js b/ai-agent/new-helper.js',
    'new file mode 100644',
    '--- /dev/null',
    '+++ b/ai-agent/new-helper.js',
    '@@ -0,0 +1 @@',
    '+export const helper = true;',
  ].join('\n');
  assert.throws(() => validatePatchPaths(newFile), { message: 'REPAIR_PATCH_FEATURE_NOT_ALLOWED' });
});

test('repair patch rejects incomplete file headers without both existing-file sides', () => {
  const incomplete = [
    'diff --git a/rpg-mechanics.js b/rpg-mechanics.js',
    '+++ b/rpg-mechanics.js',
    '@@ -1 +1 @@',
    '+const ready = true;',
  ].join('\n');
  assert.throws(() => validatePatchPaths(incomplete), { message: 'REPAIR_PATCH_MUST_UPDATE_EXISTING_FILE' });
});

test('repair patch generation requires the shared configured model client', async () => {
  await assert.rejects(
    generateRepairPatch({ task: 'repair a bug', apiKey: 'should-not-enable-fallback', context: 'source' }),
    { message: 'AI_MODEL_CLIENT_REQUIRED' },
  );
});

test('repair patch generation uses the injected client and validates the returned diff', async () => {
  let request;
  const client = {
    chat: {
      completions: {
        async create(options) {
          request = options;
          return { choices: [{ message: { content: validPatch }, finish_reason: 'stop' }] };
        },
      },
    },
  };
  const result = await generateRepairPatch({
    task: 'fix the readiness check',
    client,
    model: 'openai/gpt-oss-20b',
    context: 'const ready = false;',
  });
  assert.deepEqual(result.files, ['rpg-mechanics.js']);
  assert.equal(result.patch, validPatch + '\n');
  assert.equal(request.model, 'openai/gpt-oss-20b');
  assert.equal(request.temperature, 0.1);
  assert.equal(request.max_completion_tokens, 8192);
  assert.equal(request.messages[1].content.includes('fix the readiness check'), true);
  assert.equal(request.messages[1].content.includes('const ready = false;'), true);
});


test('Groq repair retries once when a structurally valid diff fails git apply --check', async () => {
  const requests = [];
  let completion = 0;
  let applyChecks = 0;
  const client = {
    chat: { completions: { async create(options) {
      requests.push(options);
      completion += 1;
      const patch = completion === 1
        ? validPatch.replace('@@ -1 +1 @@', '@@ -99 +99 @@')
        : validPatch;
      return { choices: [{ message: { content: patch }, finish_reason: 'stop' }] };
    } } },
  };
  const execFile = (args) => {
    if (args[0] === 'status' && args[1] === '--porcelain') return '';
    if (args[0] === 'apply' && args[1] === '--check') {
      applyChecks += 1;
      if (applyChecks === 1) throw new Error('patch does not apply: source context mismatch');
      return '';
    }
    if (args[0] === 'status') return ' M rpg-mechanics.js\\n';
    return '';
  };
  const proposal = await generateRepairPatchWithRetry({
    task: 'fix the readiness check',
    client,
    context: 'const ready = false;',
    execFile,
    maxAttempts: 2,
  });
  assert.deepEqual(proposal.files, ['rpg-mechanics.js']);
  assert.equal(completion, 2);
  assert.equal(applyChecks, 2);
  assert.match(requests[1].messages[1].content, /Önceki diff doğrulama hatası/);
  assert.match(requests[1].messages[1].content, /git apply --check/);
});

test('repair patch generation rejects provider-truncated output before parsing or applying it', async () => {
  let calls = 0;
  const client = { chat: { completions: { async create() {
    calls += 1;
    return { choices: [{ message: { content: validPatch.slice(0, -20) }, finish_reason: 'length' }] };
  } } } };
  await assert.rejects(
    generateRepairPatch({ task: 'fix a bug', client, context: 'source' }),
    { message: 'REPAIR_DIFF_TRUNCATED' },
  );
  assert.equal(calls, 1);
});

test('repair patch generation rejects non-terminal or malformed provider responses', async () => {
  for (const response of [
    { choices: [{ message: { content: validPatch }, finish_reason: 'tool_calls' }] },
    { choices: [{ message: { content: 'diff output was cut off' }, finish_reason: 'stop' }] },
  ]) {
    const client = { chat: { completions: { async create() { return response; } } } };
    await assert.rejects(generateRepairPatch({ task: 'fix a bug', client, context: 'source' }));
  }
});

test('repair patch generation rejects model output without a safe diff', async () => {
  const client = {
    chat: { completions: { async create() {
      return { choices: [{ message: { content: 'REPAIR_CONTEXT_INSUFFICIENT' }, finish_reason: 'stop' }] };
    } } },
  };
  await assert.rejects(
    generateRepairPatch({ task: 'fix a bug', client, context: 'limited context' }),
    { message: 'REPAIR_CONTEXT_INSUFFICIENT' },
  );
});


test('repair patch refuses to run when the isolated worktree is already dirty', () => {
  const calls = [];
  const execFile = (args) => {
    calls.push(args);
    if (args[0] === 'status') return ' M unrelated.js\n';
    throw new Error('PATCH_MUST_NOT_BE_APPLIED');
  };
  assert.throws(() => applyRepairPatch(validPatch, { execFile }), {
    message: 'REPAIR_WORKTREE_NOT_CLEAN',
  });
  assert.deepEqual(calls, [['status', '--porcelain', '--untracked-files=all']]);
});

test('approved index repair applies only index.js inside the isolated workflow workspace', () => {
  const calls = [];
  const execFile = (args) => {
    calls.push(args);
    if (args[0] === 'status' && args[1] === '--porcelain') return '';
    if (args[0] === 'status') return ' M index.js\n';
    return '';
  };
  assert.deepEqual(applyRepairPatch(validIndexPatch, {
    execFile, task: approvedIndexTask, incidentId: '4',
  }), ['index.js']);
  assert.throws(() => applyRepairPatch(validIndexPatch, { execFile: () => '' }), {
    message: 'REPAIR_PATH_NOT_ALLOWED',
  });
});

test('repair patch accepts only the exact validated file set', () => {
  const calls = [];
  const execFile = (args) => {
    calls.push(args);
    if (args[0] === 'status' && args[1] === '--porcelain') return '';
    if (args[0] === 'status') return ' M rpg-mechanics.js\n';
    return '';
  };
  assert.deepEqual(applyRepairPatch(validPatch, { execFile }), ['rpg-mechanics.js']);
  assert.deepEqual(calls.map(args => args[0]), ['status', 'apply', 'apply', 'diff', 'status']);
});

test('repair patch rejects additional allowed files changed outside the proposal', () => {
  const execFile = (args) => {
    if (args[0] === 'status' && args[1] === '--porcelain') return '';
    if (args[0] === 'status') return ' M rpg-mechanics.js\n M unrelated.js\n';
    return '';
  };
  assert.throws(() => applyRepairPatch(validPatch, { execFile }), {
    message: 'REPAIR_CHANGED_FILE_SET_MISMATCH',
  });
});

test('repair workflow output contains only the exact validated file paths', () => {
  assert.equal(
    formatRepairFilesOutput(['scripts/repair-a.js', 'rpg-mechanics.js']),
    'repair_files<<REPAIR_FILES\nrpg-mechanics.js\nscripts/repair-a.js\nREPAIR_FILES\n',
  );
  assert.throws(() => formatRepairFilesOutput(['rpg-mechanics.js', '../package.json']), {
    message: 'REPAIR_OUTPUT_FILE_SET_INVALID',
  });
  assert.throws(() => formatRepairFilesOutput(['rpg-mechanics.js', 'rpg-mechanics.js']), {
    message: 'REPAIR_OUTPUT_FILE_SET_INVALID',
  });
  assert.throws(() => formatRepairFilesOutput([]), {
    message: 'REPAIR_OUTPUT_FILE_SET_INVALID',
  });
});


test('Groq validation accepts a valid assistant completion without requiring an exact sentinel', async () => {
  let request;
  const client = { chat: { completions: { async create(options) { request = options; return { choices: [{ message: { role: 'assistant', content: 'The connection is working.' }, finish_reason: 'stop' }] }; } } } };
  assert.equal(await verifyGroqConnection({ client }), true);
  assert.equal(request.max_completion_tokens, 128);
  assert.equal(request.messages[0].role, 'user');
});

test('Groq validation accepts reasoning-only responses from reasoning models', async () => {
  const client = { chat: { completions: { async create() { return { choices: [{ message: { role: 'assistant', content: null, reasoning: 'Connection check completed.' }, finish_reason: 'stop' }] }; } } } };
  assert.equal(await verifyGroqConnection({ client }), true);
});

test('Groq validation rejects malformed or empty completion responses', async () => {
  for (const response of [null, {}, { choices: [] }, { choices: [{ message: { role: 'user', content: 'no' }, finish_reason: 'stop' }] }, { choices: [{ message: { role: 'assistant', content: '' }, finish_reason: 'stop' }] }]) {
    const client = { chat: { completions: { async create() { return response; } } } };
    await assert.rejects(verifyGroqConnection({ client }), { message: 'GROQ_VALIDATION_RESPONSE_INVALID' });
  }
});



test('repair context prioritizes exact allowlisted affected files from Guardian review tasks', async () => {
  const files = {
    'guardian/automation.js': 'export function dispatchRepair() { return true; }',
    'ai-agent/owner-scenario-report.js': 'export function guardianIncidentSummary() { return true; }',
  };
  const context = await collectRepairContext(
    'Guardian incident #42\nİlgili dosyalar: guardian/automation.js, ../package.json, .env.js',
    {
      execFile: () => Object.keys(files).join('\0') + '\0',
      statImpl: async path => ({ isFile: () => true, size: files[path].length }),
      readFileImpl: async path => files[path],
    },
  );
  assert.ok(context.indexOf('### guardian/automation.js') >= 0);
  assert.ok(context.indexOf('### guardian/automation.js') < context.indexOf('### ai-agent/owner-scenario-report.js'));
  assert.doesNotMatch(context, /package.json|\.env/);
});

test('approved index incident reads only index.js and cannot broaden protected context', async () => {
  const files = {
    'index.js': 'createServer((req, res) => { res.end("ok"); });',
    'owner-dashboard.js': 'export async function handleOwnerDashboardRequest() {}',
    'guardian/automation.js': 'export function dispatchRepair() {}',
  };
  const context = await collectRepairContext(approvedIndexTask, {
    incidentId: '4',
    execFile: () => Object.keys(files).join('\0') + '\0',
    statImpl: async path => ({ isFile: () => true, size: files[path].length }),
    readFileImpl: async path => files[path],
  });
  assert.match(context, /### index\.js/);
  assert.doesNotMatch(context, /owner-dashboard|guardian\/automation/);
  await assert.rejects(collectRepairContext(approvedIndexTask, {
    incidentId: '5',
    execFile: () => 'index.js\0',
    statImpl: async () => ({ isFile: () => true, size: 20 }),
    readFileImpl: async () => 'unrelated source',
  }), { message: 'REPAIR_CONTEXT_NOT_FOUND' });
});

test('repair context still rejects tasks with no matching tracked source files', async () => {
  await assert.rejects(
    collectRepairContext('unmatched xyzzy request', {
      execFile: () => 'guardian/automation.js\0',
      statImpl: async () => ({ isFile: () => true, size: 10 }),
      readFileImpl: async () => 'const unrelated = true;',
    }),
    { message: 'REPAIR_CONTEXT_NOT_FOUND' },
  );
});

test('repair workflow rejects an empty task before checkout and dependency installation', async () => {
  const workflow = await readFile(new URL('../.github/workflows/frieren-ai-self-repair.yml', import.meta.url), 'utf8');
  assert.match(workflow, /name: Require a repair task when repair mode is selected/);
  assert.match(workflow, /if: inputs\.mode == 'repair'/);
  assert.match(workflow, /REPAIR_TASK: \$\{\{ inputs\.task \}\}/);
  assert.match(workflow, /tr -d '\[:space:\]+'/);
  assert.ok(workflow.indexOf('name: Require a repair task') < workflow.indexOf('name: Checkout requested base branch'));
  assert.ok(workflow.indexOf('name: Require a repair task') < workflow.indexOf('name: Install dependencies'));
});
