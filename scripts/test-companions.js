import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { COMPANION_CATALOG, COMPANION_COSMETICS, companionLevelForXp, normalizeCompanionAction, normalizeCompanionCosmetic } from '../companions.js';
test('companion catalog uses unique stable keys and bounded prices',()=>{const keys=COMPANION_CATALOG.map(item=>item.key);assert.equal(new Set(keys).size,keys.length);assert.ok(COMPANION_CATALOG.length>=4);assert.ok(COMPANION_CATALOG.every(item=>/^[a-z][a-z0-9_]+$/.test(item.key)&&item.cost>0&&item.cost<=1000));});
test('companion XP progression is deterministic and capped',()=>{assert.equal(companionLevelForXp(0),1);assert.equal(companionLevelForXp(100),2);assert.equal(companionLevelForXp(900),4);assert.equal(companionLevelForXp(-1),1);assert.equal(companionLevelForXp(Number.NaN),1);assert.equal(companionLevelForXp(10_000_000),50);});
test('only supported companion care actions are accepted',()=>{assert.equal(normalizeCompanionAction('feed'),'feed');assert.equal(normalizeCompanionAction('play'),'play');assert.equal(normalizeCompanionAction('train'),'train');assert.equal(normalizeCompanionAction('delete'),null);assert.equal(normalizeCompanionAction(null),null);});
test('companion cosmetics are stable, priced and reject unknown selections',()=>{assert.equal(new Set(COMPANION_COSMETICS.map(item=>item.key)).size,COMPANION_COSMETICS.length);assert.ok(COMPANION_COSMETICS.every(item=>item.cost>0&&item.cost<=1000));assert.equal(normalizeCompanionCosmetic('default'),'default');assert.equal(normalizeCompanionCosmetic(COMPANION_COSMETICS[0].key),COMPANION_COSMETICS[0].key);assert.equal(normalizeCompanionCosmetic('admin_override'),null);});


test('all companion transactions lock the user row before the companion row', async () => {
  const source = await readFile(new URL('../companions.js', import.meta.url), 'utf8');
  for (const name of ['adoptCompanion', 'careForCompanion', 'equipCompanionCosmetic']) {
    const start = source.indexOf('export async function ' + name);
    assert.ok(start >= 0, name + ' must exist');
    const next = source.indexOf('\nexport async function ', start + 1);
    const body = source.slice(start, next < 0 ? source.length : next);
    const userLock = body.indexOf('SELECT user_id FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE');
    const companionLock = body.indexOf('FROM user_companions WHERE guild_id=$1 AND user_id=$2 FOR UPDATE');
    assert.ok(userLock >= 0 && companionLock > userLock, name + ' must use user-first lock order');
  }
});
