import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { collectCodeContext } from './code-context.js';
import { normalizeGuardianReviewIncident, parseGuardianReview, reviewGuardianIncident } from './guardian-review.js';

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
    affectedFiles: ['ai-agent/index.js', '../.env', '/etc/passwd', 'C:\\Windows\\system.ini', '\\\\server\\share\\secret.txt'],
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
      { file: 'C:\\Windows\\system.ini', message: 'absolute Windows path' },
      { file: '\\\\server\\share\\secret.txt', message: 'UNC path' },
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

test('Guardian review busy lock is not set by ordinary scenario tests and is released by review finally', async () => {
  const source = await readFile(new URL('./index.js', import.meta.url), 'utf8');
  const scenarioStart = source.indexOf("if (req.url === '/internal/test-scenario'");
  const guardianStart = source.indexOf("if (req.url === '/internal/guardian-review'");
  assert.ok(scenarioStart >= 0 && guardianStart > scenarioStart);
  const scenarioRoute = source.slice(scenarioStart, guardianStart);
  const guardianRoute = source.slice(guardianStart);
  assert.doesNotMatch(scenarioRoute, /guardianReviewInProgress\s*=\s*true/);
  assert.match(guardianRoute, /guardianReviewInProgress\s*=\s*true/);
  assert.match(guardianRoute, /finally\s*\{\s*guardianReviewInProgress\s*=\s*false/);
});

test('Guardian review requests valid JSON and preserves the required test plan fields', async () => {
  let request;
  const result = await reviewGuardianIncident({
    groq: {
      chat: {
        completions: {
          create: async value => {
            request = value;
            return { choices: [{ message: { content: JSON.stringify({
              rootCause: 'A regression assertion is missing.',
              confidence: 'high',
              affectedFiles: ['guardian/automation.test.js'],
              suggestedFix: 'Add the missing assertion.',
              proposedPatch: '',
              tests: ['Assert the affected file appears in the repair task.'],
              risks: ['Test-only change.'],
            }) } }] };
          },
        },
      },
    },
    model: 'openai/gpt-oss-20b',
    incident: {
      system: 'guardian',
      code: 'TEST_COVERAGE_GAP',
      title: 'Missing affected-file regression assertion',
      summary: 'The existing test does not assert affected-file rendering.',
    },
    collectCodeContext: async () => '### guardian/automation.test.js\\nExisting tests',
  });
  assert.deepEqual(request.response_format, { type: 'json_object' });
  assert.equal(request.reasoning_format, 'hidden');
  assert.deepEqual(result.tests, ['Assert the affected file appears in the repair task.']);
  assert.deepEqual(result.affectedFiles, ['guardian/automation.test.js']);
});

test('Guardian Groq self-test is admin-only and cannot dispatch repairs', async () => {
  const source = await readFile(new URL('./index.js', import.meta.url), 'utf8');
  const registration = await readFile(new URL('./register-commands.js', import.meta.url), 'utf8');
  assert.match(source, /setName\('frieren-guardian-test'\)/);
  assert.match(registration, /setName\('frieren-guardian-test'\)/);
  assert.match(source, /'frieren-guardian-test'\]\)/);
  const start = source.indexOf("if (interaction.commandName === 'frieren-guardian-test')");
  const end = source.indexOf("if (interaction.commandName === 'frieren-ai')", start);
  assert.ok(start >= 0 && end > start);
  const handler = source.slice(start, end);
  assert.match(handler, /reviewGuardianIncident\(/);
  assert.match(handler, /finally\s*\{\s*guardianReviewInProgress\s*=\s*false/);
  assert.doesNotMatch(handler, /processGuardianIncident|processPendingGuardianRepairDispatch|api\.github\.com|workflow_dispatch/);
});


test('Guardian review records the exact source commit, context files and context hash', async () => {
  const expectedHash = 'b'.repeat(64);
  let prompt;
  const result = await reviewGuardianIncident({
    groq: { chat: { completions: { create: async request => { prompt = request; return ({ choices: [{ message: { content: JSON.stringify({
      rootCause: 'A missing test guard.', confidence: 'high', affectedFiles: ['guardian/automation.test.js'],
      suggestedFix: 'No change until verified.', proposedPatch: '', tests: [], risks: [],
    }) } }] }); } } } },
    model: 'test-model',
    incident: { system: 'guardian', code: 'TEST_GAP', title: 'Guardian review', summary: 'Check existing test coverage.' },
    collectCodeContext: async () => ({
      text: 'FILE: guardian/automation.test.js\\nexisting regression test',
      files: ['guardian/automation.test.js', 'guardian/automation.js'],
      contextHash: expectedHash,
      sourceCommitSha: 'c'.repeat(40),
    }),
  });
  assert.deepEqual(result.sourceContextFiles, ['guardian/automation.test.js', 'guardian/automation.js']);
  assert.equal(result.sourceContextHash, expectedHash);
  assert.equal(result.sourceCommitSha, 'c'.repeat(40));
  const userPrompt = JSON.parse(prompt.messages[1].content);
  assert.ok(userPrompt.sourceContext.includes('guardian/automation.test.js'));
  assert.ok(userPrompt.constraints.some(rule => rule.includes('aynı davranışı zaten doğruluyorsa')));
});

test('actual Guardian context collector includes implementation and tests, redacts secrets and hashes exact context', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'frieren-guardian-context-'));
  try {
    for (const dir of ['guardian', 'ai-agent']) await mkdir(path.join(rootDir, dir), { recursive: true });
    const files = [
      'guardian/automation.js',
      'guardian/automation.test.js',
      'ai-agent/guardian-review.js',
      'ai-agent/guardian-review.test.js',
      'ai-agent/code-context.js',
    ];
    for (const file of files) {
      await writeFile(path.join(rootDir, file), 'const DATABASE_URL="postgres://secret-value";\\nconst FRIEREN_API_TOKEN="frieren-token-secret";\\nconst GITHUB_TOKEN="github-token-secret";\\nconst SIGNING_PRIVATE_KEY="private-key-secret";\\n// ' + file + '\\n');
    }
    const context = await collectCodeContext({
      rootDir,
      question: 'guardian incident affectedFiles regression test',
      sourceCommitSha: 'd'.repeat(40),
      budget: 3600,
    });
    for (const file of files) {
      assert.ok(context.files.includes(file), 'missing mandatory context file: ' + file);
      assert.ok(context.text.includes('FILE: ' + file));
    }
    assert.doesNotMatch(context.text, /secret-value|frieren-token-secret|github-token-secret|private-key-secret/);
    assert.match(context.contextHash, /^[a-f0-9]{64}$/);
    assert.equal(context.sourceCommitSha, 'd'.repeat(40));
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
