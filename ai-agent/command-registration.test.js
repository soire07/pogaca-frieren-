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
  for (const name of ['frieren-test', 'frieren-ai', 'frieren-bellek', 'frieren-komut-denetle']) {
    assert.match(runtime, new RegExp(`setName\\(['"]${name}['"]\\)`), `runtime is missing /${name}`);
    assert.match(manual, new RegExp(`setName\\(['"]${name}['"]\\)`), `manual registration is missing /${name}`);
  }
});

test('registration exposes only the four Frieren AI root commands and four memory subcommands', () => {
  for (const name of ['kaydet', 'listele', 'sil', 'temizle']) {
    assert.match(manual, new RegExp(`setName\\(['\"]${name}['\"]\\)`), `registration is missing memory subcommand ${name}`);
  }
  for (const name of ['yardim', 'rehber', 'karakter']) {
    assert.doesNotMatch(manual, new RegExp(`setName\\(['\"]${name}['\"]\\)`), `registration must not publish unrelated /${name}`);
  }
  assert.match(manual, /const required = \['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_GUILD_ID'\]/);
  assert.match(manual, /const TEST_GUILD_ID = '1564945192803639356'/);
  assert.doesNotMatch(manual, /Routes\.applicationCommands\(/, 'global command registration must remain disabled');
});
