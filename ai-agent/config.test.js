import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAiModel } from './config.js';

test('prefers explicit FRIEREN_MODEL setting', () => {
  assert.equal(resolveAiModel({ FRIEREN_MODEL: ' custom-free-model ' }), 'custom-free-model');
});

test('defaults to the free Groq-hosted open-weight model', () => {
  assert.equal(resolveAiModel({}), 'openai/gpt-oss-20b');
});

test('ignores legacy paid-provider model variables', () => {
  assert.equal(resolveAiModel({ OPENAI_MODEL: 'gpt-4.1-mini', FRIEREN_AI_MODEL: 'gpt-4.1' }), 'openai/gpt-oss-20b');
});
