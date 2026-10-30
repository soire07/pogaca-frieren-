import test from 'node:test';
import assert from 'node:assert/strict';
import { formatConversationContext } from './conversation-context.js';

test('fictional character profiles are not treated as the Discord user', () => {
  const context = formatConversationContext([
    { role: 'user', content: 'Eldrin 24 yaşında. Bir sahil kasabasında yaşıyor. Amacı kayıp bir haritayı bulmak.' },
  ]);

  assert.match(context, /Tanıtılan karakter kullanıcı değildir/u);
  assert.match(context, /karakterden üçüncü şahısla söz et/u);
  assert.match(context, /karakter özelliklerini kullanıcıya atfetme/u);
  assert.match(context, /Her karakter için ayrı bir profil tut/u);
  assert.match(context, /Bu amaçları asla birbirine aktarma/u);
});

test('character facts stay attached to their named character and unknown fields stay unknown', () => {
  const context = formatConversationContext([
    { role: 'user', content: 'Arven kayıp kardeşini arıyor. Eldrin kayıp haritayı arıyor.' },
  ]);

  assert.match(context, /yalnızca aynı cümlede veya açık bir gönderimde adı belirtilen karaktere bağla/u);
  assert.match(context, /Arven'in kayıp kardeşini arama amacı yalnızca Arven'e/u);
  assert.match(context, /Eldrin'in kayıp haritayı arama amacı yalnızca Eldrin'e/u);
  assert.match(context, /yaş, yer veya hayvan tercihi tahmin etme/u);
  assert.match(context, /bilinmiyor kabul et/u);
});

test('assistant-generated false facts are excluded from factual conversation context', () => {
  const context = formatConversationContext([
    { role: 'user', content: 'Arven 19 yaşında, kayıp kardeşini arıyor ve en sevdiği hayvan kedidir.' },
    { role: 'assistant', content: 'Arven eski kütüphanede yaşıyor ve en sevdiği hayvan kurttur.' },
    { role: 'user', content: 'Arven hakkında bildiklerini özetle.' },
  ]);

  assert.match(context, /Arven 19 yaşında/u);
  assert.doesNotMatch(context, /eski kütüphanede/u);
  assert.doesNotMatch(context, /kurttur/u);
  assert.match(context, /yalnızca kullanıcı mesajları/u);
});

test('assistant-only history does not establish character facts', () => {
  const context = formatConversationContext([
    { role: 'assistant', content: 'Eldrin eski bir kalede yaşıyor.' },
  ]);

  assert.equal(context, '');
});
