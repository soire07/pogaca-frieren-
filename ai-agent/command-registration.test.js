import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCommandNames } from './command-test-input.js';
import { readFile } from 'node:fs/promises';
import { registerCommandsIfChanged, getFrierenAiCommandRoute, FRIEREN_AI_TEST_GUILD_ID } from './command-registration-target.js';

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
  for (const name of ['status', 'frieren-test', 'frieren-ai', 'frieren-bellek', 'frieren-komut-denetle']) {
    assert.match(runtime, new RegExp(`setName\\(['"]${name}['"]\\)`), `runtime is missing /${name}`);
    assert.match(manual, new RegExp(`setName\\(['"]${name}['"]\\)`), `manual registration is missing /${name}`);
  }
});

test('registration exposes only the four Frieren AI root commands and four memory subcommands', () => {
  assert.ok(manual.includes(".setName('status')"), 'registration must include /status');
  for (const name of ['kaydet', 'listele', 'sil', 'temizle']) {
    assert.match(manual, new RegExp(`setName\\(['\"]${name}['\"]\\)`), `registration is missing memory subcommand ${name}`);
  }
  for (const name of ['yardim', 'rehber', 'karakter']) {
    assert.doesNotMatch(manual, new RegExp(`setName\\(['\"]${name}['\"]\\)`), `registration must not publish unrelated /${name}`);
    assert.doesNotMatch(runtime, new RegExp(`setName\\(['\"]${name}['\"]\\)`), `runtime must not define unrelated /${name}`);
  }
  assert.match(manual, /const required = \['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_GUILD_ID'\]/);
  assert.match(manual, /const botUser = await rest\.get\(Routes\.user\(\)\)/);
  assert.match(manual, /const TEST_GUILD_ID = FRIEREN_AI_TEST_GUILD_ID/);
  assert.equal(FRIEREN_AI_TEST_GUILD_ID, '1564945192803639356');
  assert.match(manual, /configuredGuildId !== TEST_GUILD_ID/);
  assert.match(manual, /registerCommandsIfChanged/);
  assert.match(runtime, /registerCommandsIfChanged/);
  assert.match(manual, /const TEST_GUILD_ID = '1564945192803639356'/);
  assert.doesNotMatch(manual, /Routes\.applicationCommands\(/, 'global command registration must remain disabled');
});


test('command test input accepts multiple comma-separated targets and removes duplicates', () => {
  assert.deepEqual(parseCommandNames('katlizindan, ortakboss, /katlizindan'), ['katlizindan', 'ortakboss']);
  assert.deepEqual(parseCommandNames(' /katlizindan ; ortakboss '), ['katlizindan', 'ortakboss']);
  assert.deepEqual(parseCommandNames('   '), []);
  assert.throws(() => parseCommandNames('invalid name'), /Geçersiz komut adı/);
});


test('runtime and manual registration use the same fixed test-guild route', () => {
  assert.equal(
    getFrierenAiCommandRoute(' app-id '),
    '/applications/app-id/guilds/1564945192803639356/commands'
  );
  assert.throws(() => getFrierenAiCommandRoute(' '), /DISCORD_CLIENT_ID is required/);
});

test('command registration skips Discord writes when remote definitions already match', async () => {
  let putCount = 0;
  const commands = [{ type: 1, name: 'frieren-ai', description: 'Analyze code', options: [] }];
  const rest = {
    get: async () => [{
      id: 'remote-id', application_id: 'app-id', guild_id: 'guild-id', version: '1',
      type: 1, name: 'frieren-ai', description: 'Analyze code', options: []
    }],
    put: async () => { putCount += 1; }
  };
  const result = await registerCommandsIfChanged(rest, '/test-guild/commands', commands);
  assert.deepEqual(result, { changed: false, count: 1 });
  assert.equal(putCount, 0);
});

test('command registration writes exactly once when a command definition changes', async () => {
  let putCount = 0;
  let payload = null;
  const commands = [{ type: 1, name: 'frieren-ai', description: 'New description', options: [] }];
  const rest = {
    get: async () => [{ type: 1, name: 'frieren-ai', description: 'Old description', options: [] }],
    put: async (_route, body) => { putCount += 1; payload = body; }
  };
  const result = await registerCommandsIfChanged(rest, '/test-guild/commands', commands);
  assert.deepEqual(result, { changed: true, count: 1 });
  assert.equal(putCount, 1);
  assert.deepEqual(payload, { body: commands });
});

test('command registration fails closed if Discord does not return an array', async () => {
  let putCount = 0;
  const rest = {
    get: async () => ({ message: 'unexpected response' }),
    put: async () => { putCount += 1; }
  };
  await assert.rejects(
    registerCommandsIfChanged(rest, '/test-guild/commands', []),
    /invalid command list/
  );
  assert.equal(putCount, 0);
});
