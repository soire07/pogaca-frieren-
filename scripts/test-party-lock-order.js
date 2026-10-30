import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const encounterFiles = ['katlizindan.js', 'ortakboss.js'];

test('party encounter transactions lock user rows in a deterministic user_id order', async () => {
  for (const file of encounterFiles) {
    const source = await readFile(new URL('../' + file, import.meta.url), 'utf8');
    const lockQueries = [...source.matchAll(/FROM users\\s+WHERE guild_id=\\$1 AND user_id=ANY\\(\\$2::text\\[\\]\\)(?:\\s+ORDER BY user_id)?\\s+FOR UPDATE/g)];

    assert.equal(lockQueries.length, 2, file + ' should have one start and one settlement user-row lock query');
    for (const query of lockQueries) {
      assert.match(query[0], /ORDER BY user_id FOR UPDATE$/, file + ' must acquire overlapping party row locks in the same order');
    }
  }
});
