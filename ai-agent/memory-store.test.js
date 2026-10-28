import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from './memory-store.js';

class FakePool {
  constructor(options) {
    this.options = options;
    this.calls = [];
    this.rows = [];
    FakePool.instance = this;
  }
  async query(sql, params = []) {
    this.calls.push({ sql, params });
    if (sql.includes('INSERT INTO frieren_ai_memories')) {
      const [userId, key, value] = params;
      const row = { memory_key: key, memory_value: value, updated_at: new Date(0) };
      this.rows = this.rows.filter(item => !(item.user_id === userId && item.memory_key === key));
      this.rows.push({ ...row, user_id: userId });
      return { rows: [row], rowCount: 1 };
    }
    if (sql.includes('SELECT memory_key')) {
      return {
        rows: this.rows.filter(item => item.user_id === params[0])
          .map(({ memory_key, memory_value, updated_at }) => ({ memory_key, memory_value, updated_at })),
        rowCount: 0,
      };
    }
    if (sql.includes('DELETE FROM frieren_ai_memories')) {
      const before = this.rows.length;
      this.rows = this.rows.filter(item => {
        if (item.user_id !== params[0]) return true;
        if (params.length > 1 && item.memory_key !== params[1]) return true;
        return false;
      });
      return { rows: [], rowCount: before - this.rows.length };
    }
    return { rows: [], rowCount: 0 };
  }
  async end() {}
}

test('save uses a parameterized query and scopes records to a user', async () => {
  const store = createMemoryStore('postgres://test', { PoolClass: FakePool });
  await store.save('user-a', 'project', 'Frieren RPG');
  const insert = FakePool.instance.calls.find(call => call.sql.includes('INSERT INTO'));
  assert.deepEqual(insert.params, ['user-a', 'project', 'Frieren RPG']);
  assert.match(insert.sql, /ON CONFLICT/);
});

test('list, delete and clear are always scoped to the supplied user id', async () => {
  const store = createMemoryStore('postgres://test', { PoolClass: FakePool });
  await store.save('user-a', 'project', 'Frieren RPG');
  await store.save('user-b', 'project', 'Different project');
  assert.equal((await store.list('user-a')).length, 1);
  assert.equal(await store.remove('user-a', 'project'), true);
  assert.equal((await store.list('user-b')).length, 1);
  assert.equal(await store.clear('user-b'), 1);
  assert.equal((await store.list('user-b')).length, 0);
});

test('relevant memories rank matching keywords and fall back to recent entries', async () => {
  const store = createMemoryStore('postgres://test', { PoolClass: FakePool });
  await store.save('user-a', 'project', 'Frieren RPG game');
  await store.save('user-a', 'style', 'Prefer short Turkish answers');
  const matched = await store.relevant('user-a', 'Frieren game project');
  assert.equal(matched[0].memory_key, 'project');
  const fallback = await store.relevant('user-a', 'unrelatedxyz');
  assert.equal(fallback.length, 2);
});
