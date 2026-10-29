import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [runtime, manual] = await Promise.all([
  readFile(new URL('./index.js', import.meta.url), 'utf8'),
  readFile(new URL('./register-commands.js', import.meta.url), 'utf8'),
]);

test('manual registration keeps the required /frieren-test target option', () => {
  const command = manual.match(/new SlashCommandBuilder\(\)[\s\S]*?\.setName\('frieren-test'\)([\s\S]*?)\.toJSON\(\)/);
  assert.ok(command, 'manual registration must include /frieren-test');
  assert.match(command[1], /setName\('hedef'\)/);
  assert.match(command[1], /setRequired\(true\)/);
  assert.match(runtime, /setName\('hedef'\)[\s\S]*?setRequired\(true\)/);
});

test('manual registration includes every diagnostic slash command handled by runtime', () => {
  for (const name of ['frieren-test', 'frieren-ai', 'frieren-bellek', 'frieren-komut-denetle', 'status']) {
    assert.match(runtime, new RegExp(`setName\\(['"]${name}['"]\\)`), `runtime is missing /${name}`);
    assert.match(manual, new RegExp(`setName\\(['"]${name}['"]\\)`), `manual registration is missing /${name}`);
  }
});


test('runtime and manual registration are pinned to the test guild, never global commands', () => {
  assert.match(runtime, /FRIEREN_AI_TEST_GUILD_ID/);
  assert.match(manual, /FRIEREN_AI_TEST_GUILD_ID/);
  assert.doesNotMatch(runtime, /Routes\\.applicationCommands\\(/);
  assert.doesNotMatch(manual, /Routes\\.applicationCommands\\(/);
  assert.match(runtime, /getFrierenAiCommandRoute/);
  assert.match(manual, /getFrierenAiCommandRoute/);
});
