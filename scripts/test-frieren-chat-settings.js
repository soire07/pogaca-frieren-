import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_FRIEREN_CHAT_SETTINGS,
  normalizeFrierenChatSettings,
  getFrierenChatSettings,
  updateFrierenChatSettings
} from '../frieren-chat-settings.js';

test('Frieren chat settings normalize unknown values to safe defaults', () => {
  assert.deepEqual(normalizeFrierenChatSettings({ enabled: false, style: 'unknown', responseLength: 'huge', loreFocus: 'yes' }), {
    ...DEFAULT_FRIEREN_CHAT_SETTINGS,
    enabled: false
  });
});

test('Frieren chat settings load from the owner settings record', async () => {
  let params;
  const db = { query: async (_sql, values) => {
    params = values;
    return { rows: [{ setting_value: { enabled: false, style: 'warm', responseLength: 'balanced', loreFocus: false } }] };
  } };
  const settings = await getFrierenChatSettings(db);
  assert.deepEqual(params, ['frieren_chat_settings']);
  assert.deepEqual(settings, { enabled: false, style: 'warm', responseLength: 'balanced', loreFocus: false });
});

test('Frieren chat settings persist validated values and write an owner audit record atomically', async () => {
  let call;
  const db = { query: async (sql, params) => {
    call = { sql, params };
    return { rows: [{ setting_value: JSON.parse(params[0]) }] };
  } };
  const settings = { enabled: true, style: 'witty', responseLength: 'detailed', loreFocus: true };
  const saved = await updateFrierenChatSettings(db, settings, '1553794496234262641');
  assert.deepEqual(saved, settings);
  assert.match(call.sql, /INSERT INTO owner_settings/);
  assert.match(call.sql, /INSERT INTO owner_audit_logs/);
  assert.deepEqual(JSON.parse(call.params[0]), settings);
});

test('Frieren chat settings reject invalid styles and actors before touching the database', async () => {
  let called = false;
  const db = { query: async () => { called = true; return { rows: [] }; } };
  await assert.rejects(updateFrierenChatSettings(db, { enabled: true, style: 'custom prompt', responseLength: 'concise', loreFocus: true }, '1553794496234262641'), /INVALID_FRIEREN_CHAT_SETTINGS/);
  await assert.rejects(updateFrierenChatSettings(db, { enabled: true, style: 'calm', responseLength: 'concise', loreFocus: true }, 'bad'), /INVALID_OWNER_ACTOR/);
  assert.equal(called, false);
});
