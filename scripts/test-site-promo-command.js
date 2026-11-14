import test from 'node:test';
import assert from 'node:assert/strict';
import siteCommand from '../site.js';

test('/site komutu tanıtım embedini ve tek web bağlantısını sunar', async () => {
  const schema = siteCommand.data.toJSON();
  assert.equal(schema.name, 'site');
  assert.match(schema.description, /site|portal/i);

  let payload;
  await siteCommand.execute({ reply: async value => { payload = value; } });
  assert.equal(payload.embeds.length, 1);
  const embed = payload.embeds[0].toJSON();
  assert.equal(embed.title, '🌙 Frieren Portalı');
  assert.doesNotMatch(embed.description, /https?:\/\/|frierenbot\.vercel\.app/i);
  assert.equal(embed.image.url, 'https://frierenbot.vercel.app/assets/site-banner.webp');
  assert.ok(embed.fields.length >= 3);
  const siteButtons = payload.components.flatMap(row => row.components)
    .filter(button => button.toJSON().url === 'https://frierenbot.vercel.app');
  assert.equal(siteButtons.length, 1);
  assert.equal(siteButtons[0].toJSON().label, 'Siteyi Ziyaret Et');
});