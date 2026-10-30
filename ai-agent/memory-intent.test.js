import test from 'node:test';
import assert from 'node:assert/strict';
import { isExplicitMemoryOverviewQuestion } from './memory-intent.js';

test('character knowledge overview is not mistaken for a persistent-memory listing', () => {
  assert.equal(isExplicitMemoryOverviewQuestion('Arven ve Eldrin hakkında bildiğin tüm bilgileri ayrı ayrı anlat.'), false);
  assert.equal(isExplicitMemoryOverviewQuestion('Arven ve Eldrin hakkında bildiğin tüm bilgileri anlat. Kalıcı belleğini listeleme.'), false);
});

test('explicit persistent-memory listing requests are recognized', () => {
  assert.equal(isExplicitMemoryOverviewQuestion('Kalıcı belleğinde kayıtlı anıları listele.'), true);
  assert.equal(isExplicitMemoryOverviewQuestion('Benim hakkımda kayıtlı olan tüm anılarını listele.'), true);
  assert.equal(isExplicitMemoryOverviewQuestion('Bellek kayıtlarımı göster.'), true);
});

test('ordinary questions mentioning a memory-like word are not treated as listings', () => {
  assert.equal(isExplicitMemoryOverviewQuestion('Arvenin anılarını anlat.'), false);
  assert.equal(isExplicitMemoryOverviewQuestion('Bana verdiğin tüm bilgileri anlat.'), false);
});
