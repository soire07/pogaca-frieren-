import test from 'node:test';
import assert from 'node:assert/strict';
import { createGuildMemberWelcomeHandler } from '../integrations/welcome/member-welcome.js';

function createMember({ settings = { welcome_channel_id: '223456789012345678', welcome_message: 'Merhaba {user}, {server}!' }, permissions = true } = {}) {
  const sent = [];
  const channel = {
    isTextBased: () => true,
    permissionsFor: () => ({ has: permission => permission === 'SendMessages' && permissions }),
    async send(payload) { sent.push(payload); }
  };
  const member = {
    id: '123456789012345678',
    guild: {
      id: '1539562273197260860',
      name: 'Frieren Test',
      members: { me: {} },
      channels: { async fetch(id) { assert.equal(id, settings?.welcome_channel_id); return channel; } }
    }
  };
  return { member, sent, db: { async query() { return { rows: settings ? [settings] : [] }; } } };
}

test('welcome handler expands placeholders and only allows the joining member mention', async () => {
  const { member, sent, db } = createMember();
  const handler = createGuildMemberWelcomeHandler({ db, recordError: async () => {} });
  await handler(member);
  assert.deepEqual(sent, [{
    content: 'Merhaba <@123456789012345678>, Frieren Test!',
    allowedMentions: { parse: [], users: ['123456789012345678'] }
  }]);
});

test('welcome handler skips guilds without a saved welcome configuration', async () => {
  const { member, sent, db } = createMember({ settings: null });
  await createGuildMemberWelcomeHandler({ db, recordError: async () => {} })(member);
  assert.equal(sent.length, 0);
});

test('welcome handler does not send when the bot lacks SendMessages permission', async () => {
  const { member, sent, db } = createMember({ permissions: false });
  await createGuildMemberWelcomeHandler({ db, recordError: async () => {} })(member);
  assert.equal(sent.length, 0);
});

test('welcome handler bounds the configured message to 300 characters', async () => {
  const settings = { welcome_channel_id: '223456789012345678', welcome_message: 'x'.repeat(350) };
  const { member, sent, db } = createMember({ settings });
  await createGuildMemberWelcomeHandler({ db, recordError: async () => {} })(member);
  assert.equal(sent[0].content.length, 300);
});

test('welcome handler records database errors without throwing into Discord event dispatch', async () => {
  const { member, db } = createMember();
  const errors = [];
  db.query = async () => { throw new Error('database unavailable'); };
  const handler = createGuildMemberWelcomeHandler({
    db,
    logger: { error() {} },
    recordError: async (...args) => errors.push(args)
  });
  await assert.doesNotReject(handler(member));
  assert.equal(errors[0][1], 'guild-member-join');
  assert.equal(errors[0][2], 'Error');
});
