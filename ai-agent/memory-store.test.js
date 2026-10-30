import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore, memoryStoreInternals, shouldUseConversationHistory } from './memory-store.js';
import { extractAutomaticMemories } from './memory-extractor.js';
import { formatConversationContext } from './conversation-context.js';

class FakePool {
  constructor(options) {
    this.options = options;
    this.calls = [];
    this.rows = [];
    this.conversationRows = [];
    this.nextConversationId = 1;
    FakePool.instance = this;
  }
  async query(sql, params = []) {
    this.calls.push({ sql, params });
    if (sql.includes('INSERT INTO frieren_ai_conversation')) {
      const [userId, conversationId, role, content] = params;
      this.conversationRows.push({ id: this.nextConversationId++, user_id: userId, conversation_id: conversationId, role, content });
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('SELECT role, content FROM frieren_ai_conversation')) {
      const [userId, conversationId, limit] = params;
      return { rows: this.conversationRows.filter(row => row.user_id === userId && row.conversation_id === conversationId).slice(-limit).reverse().map(({ role, content }) => ({ role, content })), rowCount: 0 };
    }
    if (sql.includes('DELETE FROM frieren_ai_conversation')) {
      const [userId, conversationId] = params;
      const keep = new Set(this.conversationRows.filter(row => row.user_id === userId && row.conversation_id === conversationId).slice(-80).map(row => row.id));
      this.conversationRows = this.conversationRows.filter(row => row.user_id !== userId || row.conversation_id !== conversationId || keep.has(row.id));
      return { rows: [], rowCount: 0 };
    }
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

test('relevant memories rank matching keywords and return no unrelated entries', async () => {
  const store = createMemoryStore('postgres://test', { PoolClass: FakePool });
  await store.save('user-a', 'project', 'Frieren RPG game');
  await store.save('user-a', 'style', 'Prefer short Turkish answers');
  const matched = await store.relevant('user-a', 'Frieren game project');
  assert.equal(matched[0].memory_key, 'project');
  const fallback = await store.relevant('user-a', 'unrelatedxyz');
  assert.deepEqual(fallback, []);
});

test('saving the same key updates only that user’s existing memory', async () => {
  const store = createMemoryStore('postgres://test', { PoolClass: FakePool });
  await store.save('user-a', 'preference', 'short answers');
  await store.save('user-b', 'preference', 'long answers');
  await store.save('user-a', 'preference', 'Turkish answers');
  assert.deepEqual((await store.list('user-a')).map(row => row.memory_value), ['Turkish answers']);
  assert.deepEqual((await store.list('user-b')).map(row => row.memory_value), ['long answers']);
});

test('deleting a key owned by another user cannot delete that user’s memory', async () => {
  const store = createMemoryStore('postgres://test', { PoolClass: FakePool });
  await store.save('user-a', 'private', 'A secret test phrase');
  await store.save('user-b', 'private', 'B private phrase');
  assert.equal(await store.remove('user-a', 'private'), true);
  assert.deepEqual((await store.list('user-b')).map(row => row.memory_value), ['B private phrase']);
  assert.equal(await store.remove('user-a', 'private'), false);
});

test('database errors are propagated to the caller rather than converted into success', async () => {
  class FailingPool extends FakePool {
    async query(sql, params = []) {
      if (sql.includes('INSERT INTO')) throw new Error('synthetic database failure');
      return super.query(sql, params);
    }
  }
  const store = createMemoryStore('postgres://test', { PoolClass: FailingPool });
  await assert.rejects(store.save('user-a', 'project', 'test'), /synthetic database failure/);
});

test('save trims input and rejects empty user IDs, keys and values before database writes', async () => {
  const store = createMemoryStore('postgres://test', { PoolClass: FakePool });
  await assert.rejects(store.save('   ', 'project', 'value'), /user ID is required/i);
  await assert.rejects(store.save('user-a', '   ', 'value'), /key must not be empty/i);
  await assert.rejects(store.save('user-a', 'project', '   '), /value must not be empty/i);
  assert.equal(FakePool.instance.calls.some(call => call.sql.includes('INSERT INTO')), false);
});

test('save rejects keys and values beyond the documented schema limits', async () => {
  const store = createMemoryStore('postgres://test', { PoolClass: FakePool });
  await assert.rejects(store.save('user-a', 'k'.repeat(61), 'value'), /key must be at most 60 characters/i);
  await assert.rejects(store.save('user-a', 'key', 'v'.repeat(501)), /value must be at most 500 characters/i);
  assert.equal(FakePool.instance.calls.some(call => call.sql.includes('INSERT INTO')), false);
});


test('memory keyword normalization preserves words and removes Turkish diacritics correctly', () => {
  const words = memoryStoreInternals.normalizeWords('Frieren Türkçe büyü');
  assert.deepEqual([...words].sort(), ['buyu', 'frieren', 'turkce']);
});


test('conversation history persists in order and is isolated per Discord user', async () => {
  const store = createMemoryStore('postgres://test', { PoolClass: FakePool });
  await store.addConversationTurn('user-a', 'guild:channel-1', 'user', 'Elara adlı karakterimiz var.');
  await store.addConversationTurn('user-a', 'guild:channel-1', 'assistant', 'Elara hikâyenin kahramanı.');
  await store.addConversationTurn('user-a', 'guild:channel-2', 'user', 'Başka bir hikâye.');
  await store.addConversationTurn('user-b', 'guild:channel-1', 'user', 'Başka bir kullanıcı.');
  assert.deepEqual(await store.getConversationHistory('user-a', 'guild:channel-1'), [
    { role: 'user', content: 'Elara adlı karakterimiz var.' },
    { role: 'assistant', content: 'Elara hikâyenin kahramanı.' },
  ]);
  assert.deepEqual(await store.getConversationHistory('user-a', 'guild:channel-2'), [
    { role: 'user', content: 'Başka bir hikâye.' },
  ]);
  assert.deepEqual(await store.getConversationHistory('user-b', 'guild:channel-1'), [
    { role: 'user', content: 'Başka bir kullanıcı.' },
  ]);
});


test('memory recall questions return recent user-owned memories even without keyword overlap', async () => {
  const store = createMemoryStore('postgres://test', { PoolClass: FakePool });
  await store.save('user-a', 'favorite_color', 'Purple');
  await store.save('user-a', 'story_character', 'Elara and a purple dragon named Gölge');
  await store.save('user-b', 'private_note', 'Only user B can see this');
  const recalled = await store.relevant('user-a', 'Benim hakkımda kayıtlı olan tüm anılarını listele.');
  assert.equal(recalled.length, 2);
  assert.ok(recalled.some(row => row.memory_key === 'favorite_color'));
  assert.ok(recalled.some(row => row.memory_key === 'story_character'));
  assert.ok(recalled.every(row => row.memory_value !== 'Only user B can see this'));
});

test('memory relevance prioritizes meaningful matches over common Turkish filler words', async () => {
  const store = createMemoryStore('postgres://test', { PoolClass: FakePool });
  await store.save('user-a', 'project', 'Frieren RPG game');
  await store.save('user-a', 'style', 'Prefer short Turkish answers');
  const matched = await store.relevant('user-a', 'Ben bana ne demiştim, Frieren projesi hakkında?');
  assert.equal(matched[0].memory_key, 'project');
  assert.deepEqual(await store.relevant('user-a', 've ama için'), []);
  assert.deepEqual(await store.relevant('user-a', 'Bellek nasıl çalışıyor?'), []);
});

test('automatic memory extraction captures explicit favorite facts', () => {
  assert.deepEqual(extractAutomaticMemories('En sevdiğim renk mor.'), [
    { key: 'favori_renk', value: 'En sevdiği renk: mor.' }
  ]);
});

test('automatic memory extraction captures clear identity and story statements', () => {
  assert.deepEqual(extractAutomaticMemories('Benim adım Deniz.'), [
    { key: 'kullanici_adi', value: 'Kullanıcının adı: Deniz.' }
  ]);
  const story = extractAutomaticMemories('Elara karakterimiz karanlık ormanlardan korkuyor ve Gölge adlı mor bir ejderhası var.');
  assert.equal(story.length, 1);
  assert.match(story[0].value, /Elara karakterimiz/);
});

test('automatic memory extraction ignores questions and sensitive-looking content', () => {
  assert.deepEqual(extractAutomaticMemories('En sevdiğim renk mor mu?'), []);
  assert.deepEqual(extractAutomaticMemories('Bugün nasılsın?'), []);
  assert.deepEqual(extractAutomaticMemories('Şifrem 12345, bunu hatırla.'), []);
});


test('automatic memory extraction captures explicit hobby and game preferences', () => {
  const game = extractAutomaticMemories('Ben Minecraft oynamayı seviyorum.');
  assert.equal(game.length, 1);
  assert.equal(game[0].key, 'tercih_oyun');
  assert.match(game[0].value, /Minecraft/i);

  const hobby = extractAutomaticMemories('Hobim dijital çizim yapmak.');
  assert.equal(hobby.length, 1);
  assert.equal(hobby[0].key, 'hobi');
  assert.match(hobby[0].value, /dijital çizim/i);
});

test('automatic memory extraction captures a clearly stated ongoing project and goal', () => {
  const project = extractAutomaticMemories('Şu sıralar Frieren AI üzerinde çalışıyorum.');
  assert.equal(project.length, 1);
  assert.equal(project[0].key, 'proje_frieren_ai');
  assert.match(project[0].value, /Frieren AI/i);

  const goal = extractAutomaticMemories('Hedefim Discord botumu geliştirmek.');
  assert.equal(goal.length, 1);
  assert.equal(goal[0].key, 'hedef');
  assert.match(goal[0].value, /Discord botumu geliştirmek/i);
});

test('automatic memory extraction blocks sensitive terms with Turkish suffixes', () => {
  for (const message of [
    'Şifrem 12345, bunu hatırla.',
    'API key değerim abc123456789.',
    'Ev adresim İstanbul merkezde.',
    'Hastalığım hakkında kayıt tut.',
    'Telefon numaram 5551234567.'
  ]) {
    assert.deepEqual(extractAutomaticMemories(message), [], message);
  }
});

test('automatic memory extraction does not invent facts from casual mentions', () => {
  assert.deepEqual(extractAutomaticMemories('Bugün kaplumbağa gördüm.'), []);
  assert.deepEqual(extractAutomaticMemories('Minecraft çok popüler bir oyun.'), []);
});


test('deleted specific facts cannot be recovered from conversation history', () => {
  assert.equal(shouldUseConversationHistory('Benim en sevdiğim yemek neydi?', []), false);
  assert.equal(shouldUseConversationHistory('Benim en sevdiğim yemek neydi?', [{ memory_key: 'favori_yemek', memory_value: 'mantı' }]), true);
  assert.equal(shouldUseConversationHistory('Benim hakkımda kayıtlı olan tüm anılarını listele.', []), false);
  assert.equal(shouldUseConversationHistory('Bugün nasılsın?', []), true);
});


test('personal favorite memories do not contaminate fictional character facts', async () => {
  const store = createMemoryStore('postgres://test', { PoolClass: FakePool });
  await store.save('user-a', 'favori_hayvan', 'En sevdiği hayvan: kaplumbağa.');
  assert.deepEqual(await store.relevant('user-a', "Arven'in en sevdiği hayvan kurt. Hikâyeye kurt ekleyelim."), []);
  const personalRecall = await store.relevant('user-a', 'Benim en sevdiğim hayvan neydi?');
  assert.equal(personalRecall.length, 1);
  assert.equal(personalRecall[0].memory_key, 'favori_hayvan');
});


test('story facts from earlier turns are surfaced as authoritative context for follow-up questions', () => {
  const context = formatConversationContext([
    { role: 'user', content: 'Arven 19 yaşında, eski bir kütüphanede yaşıyor. Yolculuğa kayıp kardeşini bulmak için çıktı. En sevdiği hayvan kurt.' },
    { role: 'assistant', content: 'Arven profilini anladım.' },
    { role: 'user', content: 'Arven neden yolculuğa çıkmıştı ve nerede yaşıyordu?' },
  ]);
  assert.match(context, /eski bir kütüphanede yaşıyor/i);
  assert.match(context, /kayıp kardeşini bulmak için çıktı/i);
  assert.match(context, /KULLANICI:/);
  assert.match(context, /BAĞLAM KURALI:/);
  assert.doesNotMatch(context, /kaplumbağa/i);
});

test('conversation context ignores invalid turns and keeps opening plus recent messages', () => {
  const history = Array.from({ length: 20 }, (_, index) => ({
    role: 'user',
    content: 'turn-' + index,
  }));
  history.push({ role: 'system', content: 'untrusted role' });
  const context = formatConversationContext(history);
  assert.match(context, /turn-0/);
  assert.match(context, /turn-3/);
  assert.doesNotMatch(context, /turn-5/);
  assert.match(context, /turn-19/);
  assert.doesNotMatch(context, /untrusted role/);
});


test('conversation history retains up to 80 turns independently per channel', async () => {
  const store = createMemoryStore('postgres://test', { PoolClass: FakePool });
  for (let index = 0; index < 90; index++) {
    await store.addConversationTurn('user-a', 'guild:long-story', 'user', 'turn-' + index);
  }
  const history = await store.getConversationHistory('user-a', 'guild:long-story');
  assert.equal(history.length, 80);
  assert.equal(history[0].content, 'turn-10');
  assert.equal(history.at(-1).content, 'turn-89');
  assert.deepEqual(await store.getConversationHistory('user-a', 'guild:other'), []);
});

test('long conversation context preserves opening story facts and newest turns', () => {
  const history = [
    { role: 'user', content: 'Arven eski bir kütüphanede yaşıyor ve kayıp kardeşini arıyor.' },
    { role: 'assistant', content: 'Arven profilini kaydettim.' },
    ...Array.from({ length: 20 }, (_, index) => ({ role: 'user', content: 'Ara sohbet mesajı ' + index })),
    { role: 'user', content: 'Arven bugün kuzeye ulaştı.' },
  ];
  const context = formatConversationContext(history);
  assert.match(context, /eski bir kütüphanede/i);
  assert.match(context, /kayıp kardeşini arıyor/i);
  assert.match(context, /Arven bugün kuzeye ulaştı/i);
  assert.doesNotMatch(context, /Ara sohbet mesajı 5/);
});
