import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAiModel } from './config.js';

test('uses an explicitly configured free-provider model', () => {
  assert.equal(resolveAiModel({ FRIEREN_AI_MODEL: ' ganymede-1.1 ' }), 'ganymede-1.1');
});

test('defaults to a free model without OpenAI configuration', () => {
  assert.equal(resolveAiModel({}), 'pluto-1.2-flash');
});

test('ignores the legacy paid-provider model variable by default', () => {
  assert.equal(resolveAiModel({ OPENAI_MODEL: 'gpt-4.1-mini' }), 'pluto-1.2-flash');
});
