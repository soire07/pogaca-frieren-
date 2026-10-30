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
});
