import test from 'node:test';
import assert from 'node:assert/strict';
import arenaCommand, { handleArenaInteraction } from '../arena.js';

test('arena slash command exposes queue join, status and leave subcommands', () => {
  const schema = arenaCommand.data.toJSON();
  assert.equal(schema.name, 'arena');
  assert.deepEqual(schema.options.map(option => option.name), ['katil', 'durum', 'ayril', 'siralam']);
  assert.ok(schema.options.every(option => option.type === 1));
});

test('arena interaction router ignores non-button interactions and unrelated buttons', async () => {
  assert.equal(await handleArenaInteraction({ isButton: () => false }), false);
  assert.equal(await handleArenaInteraction({ isButton: () => true, customId: 'market_open' }), false);
});
