import test from 'node:test';
import assert from 'node:assert/strict';
import adventurerCommand from '../maceraci.js';
import eventCommand from '../etkinlik.js';
import arenaCommand from '../arena.js';
import lifeCommand from '../yasam.js';
import { getArenaRankName } from '../adventurer-platform.js';

test('adventurer web-link command is discoverable and exposes only the one-time link flow', () => {
  const schema=adventurerCommand.data.toJSON();
  assert.equal(schema.name,'maceraci');
  assert.deepEqual(schema.options.map(option=>option.name),['bagla']);
});

test('event calendar exposes list, join, leave and creation actions with bounded inputs', () => {
  const schema=eventCommand.data.toJSON();
  assert.equal(schema.name,'etkinlik');
  assert.deepEqual(schema.options.map(option=>option.name),['liste','takim-olustur','takimlar','takim-katil','lig-olustur','lig-kayit','lig-fikstur','lig-durum','lig-skor','katil','ayril','yoklama','olustur']);
  const teamCreate=schema.options.find(option=>option.name==='takim-olustur');
  assert.ok(teamCreate.options.find(option=>option.name==='isim').required);
  const leagueCreate=schema.options.find(option=>option.name==='lig-olustur');
  assert.ok(leagueCreate.options.find(option=>option.name==='sezon').required);
  assert.ok(leagueCreate.options.find(option=>option.name==='baslangic').required);
  assert.ok(leagueCreate.options.find(option=>option.name==='bitis').required);
  const create=schema.options.find(option=>option.name==='olustur');
  assert.ok(create.options.find(option=>option.name==='baslik').required);
  assert.ok(create.options.find(option=>option.name==='baslangic').required);
  assert.ok(create.options.find(option=>option.name==='bitis').required);
  assert.equal(create.options.find(option=>option.name==='kapasite').max_value,500);
  assert.ok(schema.options.some(option=>option.name==='lig-fikstur'));
  assert.ok(schema.options.some(option=>option.name==='lig-skor'));
});

test('arena retains queue lifecycle and exposes the season leaderboard', () => {
  const schema=arenaCommand.data.toJSON();
  assert.deepEqual(schema.options.map(option=>option.name),['katil','durum','ayril','siralam']);
});

test('seasonal MMR rank thresholds are stable and ordered', () => {
  assert.equal(getArenaRankName(0),'Bronz');
  assert.equal(getArenaRankName(999),'Bronz');
  assert.equal(getArenaRankName(1000),'Gümüş');
  assert.equal(getArenaRankName(1200),'Altın');
  assert.equal(getArenaRankName(1400),'Platin');
  assert.equal(getArenaRankName(1600),'Elmas');
  assert.equal(getArenaRankName(1800),'Efsane');
});

test('player experience command exposes home, cosmetics, presets and event rewards',()=>{ const schema=lifeCommand.data.toJSON(); assert.equal(schema.name,'yasam'); assert.deepEqual(schema.options.map(option=>option.name),['ev','paylasim','istasyonlar','iksir-demle','dekorasyonlar','kupalar','kupa-yerlestir','oda-ac','duzenle','kozmetik','kozmetik-al','kozmetik-kus','preset','preset-yukle','etkinlik-odul']); const purchase=schema.options.find(option=>option.name==='kozmetik-al'); assert.ok(purchase.options[0].choices.length<=25); });
