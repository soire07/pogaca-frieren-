import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAiModel } from './config.js';

test('prefers FRIEREN_AI_MODEL when both model variables are set', () => {
  assert.equal(resolveAiModel({ FRIEREN_AI_MODEL: ' gpt-custom ', OPENAI_MODEL: 'gpt-legacy' }), 'gpt-custom');
});

test('supports the legacy OPENAI_MODEL variable', () => {
  assert.equal(resolveAiModel({ OPENAI_MODEL: ' gpt-legacy ' }), 'gpt-legacy');
});

test('falls back when model variables are missing or blank', () => {
  assert.equal(resolveAiModel({}), 'gpt-4.1-mini');
  assert.equal(resolveAiModel({ FRIEREN_AI_MODEL: '  ', OPENAI_MODEL: '' }), 'gpt-4.1-mini');
});
