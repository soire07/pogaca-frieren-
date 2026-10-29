import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerCommandsIfChanged } from './command-registration-target.js';

const [runtime, manual, target] = await Promise.all([
  readFile(new URL('./index.js', import.meta.url), 'utf8'),
  readFile(new URL('./register-commands.js', import.meta.url), 'utf8'),
  readFile(new URL('./command-registration-target.js', import.meta.url), 'utf8'),
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
  assert.equal(runtime.includes('Routes.applicationCommands('), false);
  assert.equal(manual.includes('Routes.applicationCommands('), false);
  assert.match(runtime, /getFrierenAiCommandRoute/);
  assert.match(manual, /getFrierenAiCommandRoute/);
  assert.match(target, /FRIEREN_AI_TEST_GUILD_ID = '1564945192803639356'/);
  assert.match(target, /Routes\.applicationGuildCommands\(clientId\.trim\(\), FRIEREN_AI_TEST_GUILD_ID\)/);
});


test('command registration skips Discord writes when existing definitions already match', async () => {
  let putCount = 0;
  const rest = {
    get: async () => [{
      id: 'remote-id',
      application_id: 'application-id',
      type: 1,
      name: 'status',
      description: 'Status',
      options: [],
    }],
    put: async () => { putCount += 1; },
  };
  const result = await registerCommandsIfChanged(rest, '/test-guild/commands', [
    { name: 'status', description: 'Status', options: [] },
  ]);
  assert.deepEqual(result, { changed: false, count: 1 });
  assert.equal(putCount, 0);
});

test('command registration updates Discord only when a command definition differs', async () => {
  let putCount = 0;
  let payload = null;
  const rest = {
    get: async () => [{ name: 'status', description: 'Old description', options: [] }],
    put: async (_route, body) => { putCount += 1; payload = body; },
  };
  const desired = [{ name: 'status', description: 'New description', options: [] }];
  const result = await registerCommandsIfChanged(rest, '/test-guild/commands', desired);
  assert.deepEqual(result, { changed: true, count: 1 });
  assert.equal(putCount, 1);
  assert.deepEqual(payload, { body: desired });
});
