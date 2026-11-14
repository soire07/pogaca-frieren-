import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./live-command-test.js', import.meta.url), 'utf8');

function branchFor(name) {
  const marker = "if (commandName === '" + name + "')";
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, 'missing command audit branch: ' + name);
  const next = source.indexOf("\n        } else if (commandName === '", start + marker.length);
  const fallback = source.indexOf("\n        }\n\n        const evidence = buildCommandEvidence", start + marker.length);
  const end = next === -1 ? fallback : fallback === -1 ? next : Math.min(next, fallback);
  assert.notEqual(end, -1, 'could not isolate command audit branch: ' + name);
  return source.slice(start, end);
}

const contracts = [
  { name: 'bahce', actions: ["__subcommand: 'tohum-ek'", "__subcommand: 'hasat'"], forbidden: ['plantSeed(', 'harvestFarm('] },
  { name: 'balik', actions: ["__subcommand: 'avlan'", 'getFishCollection(pool'], forbidden: ['fishAtZone('] },
  { name: 'karakteristek', actions: ["__subcommand: 'ekle'", 'character: \'Frieren\''], forbidden: ['setCharacterWishlist('] },
  { name: 'loncaoyun', actions: ["__subcommand: 'baslat'", 'handleGuildGameInteraction('], forbidden: ['startGuildMiniGame(', 'answerGuildMiniGame('] },
  { name: 'pazar', actions: ["__subcommand: 'sat'", "__subcommand: 'iptal'"], forbidden: ['createPlayerMarketListing(', 'cancelPlayerMarketListing('] },
  { name: 'sera', actions: ["__subcommand: 'ekim'", "__subcommand: 'hasat'"], forbidden: ['plantSeed(', 'harvestFarm('] },
  { name: 'sosyal', actions: ["__subcommand: 'arkadas-iste'", "__subcommand: 'arkadas-kabul'", "__subcommand: 'hediye'", "__subcommand: 'itibar-ver'"], forbidden: ['createFriendRequest(', 'respondFriendRequest(', 'sendCoinGift(', 'commendPlayer('] },
  { name: 'yaratik', actions: ["__subcommand: 'istek-ekle'", "__subcommand: 'istekler'"], forbidden: ['maybeSpawnCreature(', 'claimCreature(', 'setCreatureWishlist('] },
  { name: 'yasam', actions: ["__subcommand: 'paylasim'"], forbidden: ['setHomeVisibility('] },
  { name: 'yoldas', actions: ["__subcommand: 'sahiplen'", "__subcommand: 'besle'"], forbidden: ['adoptCompanion(', 'careForCompanion('] }
];

test('command audit executes domain actions through the actual slash handlers', () => {
  const failures = [];
  for (const contract of contracts) {
    const body = branchFor(contract.name);
    if (!body.includes('await command.execute')) failures.push(contract.name + ': slash handler is not executed');
    for (const action of contract.actions) {
      if (!body.includes(action)) failures.push(contract.name + ': missing command scenario ' + action);
    }
    for (const directCall of contract.forbidden) {
      if (body.includes(directCall)) failures.push(contract.name + ': bypasses slash handler with direct service call ' + directCall);
    }
  }
  assert.deepEqual(failures, [], failures.join('\n'));
});
