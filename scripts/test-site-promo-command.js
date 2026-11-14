import test from 'node:test';
import assert from 'node:assert/strict';
import siteCommand from '../site.js';

test('/site komutu tanıtım embedini ve doğru web bağlantısını sunar', async () => {
  const schema = siteCommand.data.toJSON();
  assert.equal(schema.name, 'site');
  assert.match(schema.description, /site|portal/i);

  let payload;
  await siteCommand.execute({ reply: async value => { payload = value; } });
  assert.equal(payload.embeds.length, 1);
  const embed = payload.embeds[0].toJSON();
  assert.equal(embed.title, '🌙 Frieren Portalı');
  assert.match(embed.description, /frierenbot\.vercel\.app/);
  assert.equal(embed.image.url, 'https://frierenbot.vercel.app/site-banner.webp');
  assert.ok(embed.fields.length >= 3);
  assert.ok(payload.components[0].components.some(button => button.toJSON().url === 'https://frierenbot.vercel.app'));
});
