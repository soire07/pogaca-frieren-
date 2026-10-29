import test from 'node:test';
import assert from 'node:assert/strict';

import market, { marketItems, renderMarketItem, renderPurchaseResult, buyMarketItem } from '../market.js';
import npc from '../npc.js';
import sans from '../sans.js';
import saril from '../saril.js';
import siralama from '../siralama.js';
import takasteklif from '../takasteklif.js';
import uyar from '../uyar.js';

function interaction(overrides = {}) {
  const calls = { reply: [], deferReply: [], editReply: [] };
  const base = {
    guildId: 'guild-1',
    user: { id: 'user-1', username: 'Tester', tag: 'Tester#0001', toString: () => '<@user-1>' },
    options: {
      getString: () => null,
      getInteger: () => 1,
      getUser: () => ({ id: 'target-1', bot: false, tag: 'Target#0001', toString: () => '<@target-1>' }),
    },
    reply: async value => { calls.reply.push(value); return value; },
    deferReply: async value => { calls.deferReply.push(value); },
    editReply: async value => { calls.editReply.push(value); return value; },
    ...overrides,
  };
  return { interaction: base, calls };
}

test('/market DM kullanımlarını veritabanına erişmeden reddeder', async () => {
  const { interaction: i, calls } = interaction({ guildId: null });
  await market.execute(i);
  assert.equal(calls.reply.length, 1);
  assert.match(calls.reply[0].content, /yalnızca sunucularda/i);
});

test('market katalog kimlikleri benzersizdir ve fiyatlar pozitif tam sayıdır', () => {
  assert.ok(marketItems.length >= 16);
  assert.equal(new Set(marketItems.map(item => item.id)).size, marketItems.length);
  for (const item of marketItems) {
    assert.ok(item.id && item.name && item.category, 'market öğesinin temel alanları olmalı');
    assert.ok(Number.isInteger(item.price) && item.price > 0, item.id + ' fiyatı pozitif tam sayı olmalı');
  }
});

test('market eşya detayları bilinmeyen kimlikleri reddeder ve geçerli öğeye kullanıcıya özel satın alma düğmesi üretir', () => {
  assert.equal(renderMarketItem('not-a-real-item', 1000, 'user-1'), null);
  const item = marketItems[0];
  const view = renderMarketItem(item.id, 1000, 'user-1');
  assert.ok(view.embeds.length === 1);
  assert.ok(view.components.length === 1);
  const customIds = view.components[0].components.map(button => button.data.custom_id);
  assert.ok(customIds.includes('market_buy:' + item.id + ':user-1'));
  assert.ok(customIds.includes('market_back:user-1'));
});

test('market satın alma sonucu bilinmeyen öğe için oluşturulmaz ve doğru bakiye gösterilir', () => {
  assert.equal(renderPurchaseResult('missing-item', 0, 'user-1'), null);
  const item = marketItems[0];
  const view = renderPurchaseResult(item.id, 123, 'user-1');
  assert.match(view.embeds[0].data.description, /123/);
  assert.ok(view.components[0].components.every(button => button.data.custom_id.endsWith(':user-1')));
});

test('market bilinmeyen ürün satın alımında işlem başlatmadan başarısız döner', async () => {
  const result = await buyMarketItem('guild-1', 'user-1', 'missing-item');
  assert.deepEqual(result, { ok: false, message: 'Bu eşya markette bulunamadı.' });
});

test('/npc DM kullanımlarını yanıtlar ve DB akışını başlatmaz', async () => {
  const { interaction: i, calls } = interaction({ guildId: null });
  await npc.execute(i);
  assert.equal(calls.reply.length, 1);
  assert.match(calls.reply[0].content, /yalnızca sunucularda/i);
  assert.equal(calls.deferReply.length, 0);
});

test('/sans şans yüzdesini 0 ile 100 arasında üretir ve sonucu kullanıcıya yanıtlar', async () => {
  const originalRandom = Math.random;
  try {
    Math.random = () => 0;
    const low = interaction();
    await sans.execute(low.interaction);
    assert.match(String(low.calls.reply[0]), /%0\b/);
    assert.match(String(low.calls.reply[0]), /eğlence amaçlıdır/i);

    Math.random = () => 0.999999;
    const high = interaction();
    await sans.execute(high.interaction);
    assert.match(String(high.calls.reply[0]), /%100\b/);
  } finally {
    Math.random = originalRandom;
  }
});

test('/saril seçilen kullanıcıya dostça destek mesajı gönderir', async () => {
  const { interaction: i, calls } = interaction();
  await saril.execute(i);
  assert.equal(calls.reply.length, 1);
  assert.match(calls.reply[0], /Fern onaylı, dostça bir destek mesajı/);
  assert.match(calls.reply[0], /target-1/);
});

test('/siralama DM kullanımını veritabanı sorgusu yapmadan reddeder', async () => {
  const { interaction: i, calls } = interaction({ guildId: null });
  await siralama.execute(i);
  assert.equal(calls.reply.length, 1);
  assert.match(calls.reply[0].content, /yalnızca sunucularda/i);
  assert.equal(calls.deferReply.length, 0);
});

test('/takasteklif DM kullanımını veritabanı bağlantısından önce reddeder', async () => {
  const { interaction: i, calls } = interaction({ guildId: null });
  await takasteklif.execute(i);
  assert.equal(calls.reply.length, 1);
  assert.match(calls.reply[0].content, /yalnızca sunucularda/i);
});

test('/takasteklif kendi hesabına takası veritabanına bağlanmadan reddeder', async () => {
  const { interaction: i, calls } = interaction({
    options: {
      getUser: () => ({ id: 'user-1', bot: false }),
      getString: () => 'Frieren',
      getInteger: () => 1,
    },
  });
  await takasteklif.execute(i);
  assert.equal(calls.reply.length, 1);
  assert.match(calls.reply[0].content, /Kendine veya botlara/i);
});

test('/takasteklif bot hesabına takası veritabanına bağlanmadan reddeder', async () => {
  const { interaction: i, calls } = interaction({
    options: {
      getUser: () => ({ id: 'bot-1', bot: true }),
      getString: () => 'Frieren',
      getInteger: () => 1,
    },
  });
  await takasteklif.execute(i);
  assert.equal(calls.reply.length, 1);
  assert.match(calls.reply[0].content, /Kendine veya botlara/i);
});

test('/uyar yetkisiz veya DM etkileşiminde veritabanına yazmadan reddeder', async () => {
  const { interaction: i, calls } = interaction({ guildId: null, guild: null });
  await uyar.execute(i);
  assert.equal(calls.reply.length, 1);
  assert.match(calls.reply[0].content, /yalnızca sunucuda kullanılabilir/i);
});
