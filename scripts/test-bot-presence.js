import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ActivityType } from 'discord.js';
import { FRIEREN_WATCHING_ACTIVITY } from '../bot-presence.js';

test('bot presence displays the requested Frieren Season 6 Watching activity', () => {
  assert.deepEqual(FRIEREN_WATCHING_ACTIVITY, {
    name: "Frieren: Beyond Journey's End Season 6",
    type: ActivityType.Watching,
  });
});

test('the static Watching activity does not claim to provide a fake Join action', () => {
  assert.equal('buttons' in FRIEREN_WATCHING_ACTIVITY, false);
  assert.equal('url' in FRIEREN_WATCHING_ACTIVITY, false);
});

test('the production Discord entrypoint imports the configured activity before ClientReady', async () => {
  const entrypoint = await readFile(new URL('../index.js', import.meta.url), 'utf8');
  assert.match(entrypoint, /import\s*\{\s*FRIEREN_WATCHING_ACTIVITY\s*\}\s*from\s*['"]\.\/bot-presence\.js['"]/);
});
