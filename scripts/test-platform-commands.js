import test from 'node:test';
import assert from 'node:assert/strict';
import adventurerCommand from '../maceraci.js';
import eventCommand from '../etkinlik.js';
import arenaCommand from '../arena.js';

test('adventurer web-link command is discoverable and exposes only the one-time link flow', () => {
  const schema=adventurerCommand.data.toJSON();
  assert.equal(schema.name,'maceraci');
  assert.deepEqual(schema.options.map(option=>option.name),['bagla']);
});

test('event calendar exposes list, join, leave and creation actions with bounded inputs', () => {
  const schema=eventCommand.data.toJSON();
  assert.equal(schema.name,'etkinlik');
  assert.deepEqual(schema.options.map(option=>option.name),['liste','katil','ayril','olustur']);
  const create=schema.options.find(option=>option.name==='olustur');
  assert.ok(create.options.find(option=>option.name==='baslik').required);
  assert.ok(create.options.find(option=>option.name==='baslangic').required);
  assert.ok(create.options.find(option=>option.name==='bitis').required);
  assert.equal(create.options.find(option=>option.name==='kapasite').max_value,500);
});

test('arena retains queue lifecycle and exposes the season leaderboard', () => {
  const schema=arenaCommand.data.toJSON();
  assert.deepEqual(schema.options.map(option=>option.name),['katil','durum','ayril','siralam']);
});
