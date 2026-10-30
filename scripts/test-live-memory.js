import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createMemoryStore } from '../ai-agent/memory-store.js';

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  console.log('CANLI POSTGRESQL TESTİ: ATLANDI (DATABASE_URL yapılandırılmamış).');
  process.exit(2);
}

const suffix = randomUUID();
const userA = 'frieren-live-test-a-' + suffix;
const userB = 'frieren-live-test-b-' + suffix;
const key = 'live-check-' + suffix.slice(0, 12);
const store = createMemoryStore(connectionString);
let failed = false;

try {
  await store.save(userA, key, 'temporary-test-value-a');
  await store.save(userB, key, 'temporary-test-value-b');
  const aInitial = await store.list(userA);
  const bInitial = await store.list(userB);
  assert.equal(aInitial.length, 1, 'User A should only see their temporary test row');
  assert.equal(bInitial.length, 1, 'User B should only see their temporary test row');
  assert.equal(aInitial[0].memory_value, 'temporary-test-value-a');
  assert.equal(bInitial[0].memory_value, 'temporary-test-value-b');
  console.log('PASS: canlı PostgreSQL kayıt ekleme ve kullanıcı izolasyonu');

  await store.save(userA, key, 'temporary-test-value-a-updated');
  assert.equal((await store.list(userA))[0]?.memory_value, 'temporary-test-value-a-updated');
  assert.equal((await store.list(userB))[0]?.memory_value, 'temporary-test-value-b');
  console.log('PASS: aynı anahtarı güncelleme diğer kullanıcıyı etkilemiyor');

  assert.equal(await store.remove(userA, key), true);
  assert.equal((await store.list(userA)).length, 0);
  assert.equal((await store.list(userB))[0]?.memory_value, 'temporary-test-value-b');
  console.log('PASS: kayıt silme yalnızca ilgili kullanıcıyı etkiliyor');

  assert.equal(await store.clear(userB), 1);
  assert.equal((await store.list(userB)).length, 0);
  console.log('PASS: kullanıcı belleğini temizleme');
  console.log('CANLI POSTGRESQL TESTİ: BAŞARILI');
} catch (error) {
  failed = true;
  console.error('FAIL: canlı PostgreSQL bellek testi başarısız (' + (error?.name || 'Error') + '). Ayrıntılar güvenlik için gizlendi.');
} finally {
  try {
    await store.clear(userA);
    await store.clear(userB);
  } catch {
    failed = true;
    console.error('FAIL: geçici test kayıtlarının temizliği doğrulanamadı.');
  }
  try {
    await store.close();
  } catch {
    failed = true;
    console.error('FAIL: veritabanı bağlantısı düzgün kapatılamadı.');
  }
}

if (failed) process.exitCode = 1;
