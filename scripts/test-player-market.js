import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import command from '../pazar.js';
import { getCommandFeatureKeys } from '../guild-feature-settings.js';

test('player market command exposes listing, purchase, cancellation and history actions', () => {
  const json = command.data.toJSON();
  assert.equal(json.name, 'pazar');
  assert.deepEqual(json.options.map(option => option.name), ['liste','sat','al','iptal','gecmis']);
  assert.equal(getCommandFeatureKeys('pazar').includes('playerMarket'), true);
  assert.equal(getCommandFeatureKeys('pazar').includes('economy'), true);
  assert.equal(getCommandFeatureKeys('pazar').includes('trading'), true);
});

test('main startup initializes player-market and adventurer portal schemas after base RPG tables', async () => {
  const source=await readFile(new URL('../index.js',import.meta.url),'utf8');
  assert.match(source,/import \{ ensureAdventurerPlatformTables[\s\S]*?\} from '\.\/adventurer-platform\.js'/);
  assert.match(source,/import \{ ensurePlayerMarketTables \} from '\.\/player-market\.js'/);
  assert.match(source,/await initDatabase\(\);\s*await ensureAdventurerPlatformTables\(pool\);\s*await ensurePlayerMarketTables\(pool\);/);
});
