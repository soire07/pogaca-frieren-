import test from 'node:test';
import assert from 'node:assert/strict';
import { registerGuildCommands } from '../guild-command-registration.js';

const guildId = '1567000000000000001';
const appId = '1567000000000000002';
const command = name => ({ data: { name, toJSON: () => ({ name, description: name + ' command', type: 1 }) } });

function fakeRest(existing = []) {
  const calls = [];
  return {
    calls,
    async get(route) { calls.push({ method: 'GET', route }); return existing; },
    async put(route, options) { calls.push({ method: 'PUT', route, body: options.body }); return options.body; }
  };
}

test('new guild receives all guild-scoped commands but not global news controls', async () => {
  const rest = fakeRest([]);
  const result = await registerGuildCommands({
    guildId, applicationId: appId,
    commands: [command('macera'), command('haberleri-ayarla'), command('cantam')],
    rest
  });
  assert.deepEqual(result, { status: 'registered', count: 2 });
  assert.equal(rest.calls.length, 2);
  assert.equal(rest.calls[1].body.length, 2);
  assert.deepEqual(rest.calls[1].body.map(item => item.name), ['macera', 'cantam']);
});

test('identical guild command definitions do not consume another registration write', async () => {
  const rest = fakeRest([{ id: '1', application_id: appId, guild_id: guildId, version: '2', name: 'macera', description: 'macera command', type: 1 }]);
  const result = await registerGuildCommands({ guildId, applicationId: appId, commands: [command('macera')], rest });
  assert.deepEqual(result, { status: 'unchanged', count: 1 });
  assert.equal(rest.calls.length, 1);
});

test('main and test guilds cannot be overwritten by automatic onboarding', async () => {
  const rest = fakeRest([]);
  const result = await registerGuildCommands({
    guildId: '1539562273197260860', applicationId: appId, commands: [command('macera')], rest
  });
  assert.deepEqual(result, { status: 'protected_guild', count: 0 });
  assert.equal(rest.calls.length, 0);
});

test('invalid guild or application IDs are rejected before Discord requests', async () => {
  const rest = fakeRest([]);
  await assert.rejects(registerGuildCommands({ guildId: 'bad', applicationId: appId, commands: [command('macera')], rest }), /INVALID_GUILD_COMMAND_REGISTRATION/);
  assert.equal(rest.calls.length, 0);
});

test('duplicate slash command definitions are rejected before Discord writes', async () => {
  const rest = fakeRest([]);
  await assert.rejects(registerGuildCommands({ guildId, applicationId: appId, commands: [command('macera'), command('macera')], rest }), /INVALID_GUILD_COMMAND_DEFINITIONS/);
  assert.equal(rest.calls.length, 0);
});
