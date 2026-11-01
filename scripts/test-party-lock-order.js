import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const encounterFiles = ['katlizindan.js', 'ortakboss.js'];

test('party encounter transactions lock user rows in a deterministic user_id order', async () => {
  const rewards = await readFile(new URL('../rpg-reward-transactions.js', import.meta.url), 'utf8');
  for (const file of encounterFiles) {
    const source = await readFile(new URL('../' + file, import.meta.url), 'utf8');
    const lockQueries = [...source.matchAll(/FROM users\s+WHERE guild_id=\$1 AND user_id=ANY\(\$2::text\[\]\)(?:\s+ORDER BY user_id)?\s+FOR UPDATE/g)];
    assert.equal(lockQueries.length, 1, file + ' should keep its start-phase player-row lock; settlement lock is in the shared helper');
    assert.match(lockQueries[0][0], /ORDER BY user_id FOR UPDATE$/, file + ' start lock must be deterministic');
    assert.ok(source.includes(file === 'katlizindan.js' ? 'settleDungeonRewards' : 'settleRaidRewards'));
  }
  assert.equal((rewards.match(/ORDER BY user_id FOR UPDATE/g) || []).length, 2,
    'both production settlement helpers must lock party users in deterministic order');
});

