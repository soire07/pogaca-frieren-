import test from 'node:test';
import assert from 'node:assert/strict';
import { COMMAND_SHORT_DESCRIPTION_MAX, COMMAND_LONG_DESCRIPTION_MAX, validateOwnerCommandHelp, saveOwnerCommandHelp } from '../owner-command-help.js';

test('validates bounded command descriptions',()=>{
  const value=validateOwnerCommandHelp({commandName:'karakter',shortDescription:'Karakter profilini görüntüle.',longDescription:'Oyuncu karakterini ve ilerlemesini incele.'});
  assert.equal(value.commandName,'karakter');
  assert.ok(value.shortDescription.length<=COMMAND_SHORT_DESCRIPTION_MAX);
  assert.ok(value.longDescription.length<=COMMAND_LONG_DESCRIPTION_MAX);
});
test('rejects invalid command names and empty descriptions',()=>{
  assert.throws(()=>validateOwnerCommandHelp({commandName:'Bad Name',shortDescription:'a',longDescription:'b'}),/INVALID_COMMAND_HELP_NAME/);
  assert.throws(()=>validateOwnerCommandHelp({commandName:'karakter',shortDescription:'',longDescription:'b'}),/INVALID_COMMAND_SHORT_DESCRIPTION/);
  assert.throws(()=>validateOwnerCommandHelp({commandName:'karakter',shortDescription:'a',longDescription:''}),/INVALID_COMMAND_LONG_DESCRIPTION/);
});
test('enforces Discord and web help character limits',()=>{
  assert.throws(()=>validateOwnerCommandHelp({commandName:'karakter',shortDescription:'x'.repeat(101),longDescription:'ok'}),/INVALID_COMMAND_SHORT_DESCRIPTION/);
  assert.throws(()=>validateOwnerCommandHelp({commandName:'karakter',shortDescription:'ok',longDescription:'x'.repeat(2001)}),/INVALID_COMMAND_LONG_DESCRIPTION/);
});
test('rejects sensitive content',()=>{
  assert.throws(()=>validateOwnerCommandHelp({commandName:'karakter',shortDescription:'api token',longDescription:'help'}),/SENSITIVE_COMMAND_HELP_REJECTED/);
});
test('persists a version and current command help in one transaction',async()=>{
  const statements=[];
  const db={async query(sql){statements.push(sql);return {rows:[]};}};
  const saved=await saveOwnerCommandHelp(db,{commandName:'karakter',shortDescription:'Karakter profili.',longDescription:'Oyuncu karakterini ve ilerlemesini gösterir.',actorId:'1553794496234262641'});
  assert.equal(saved.commandName,'karakter');
  assert.ok(statements.some(sql=>sql.includes('INSERT INTO owner_command_help_versions')));
  assert.ok(statements.some(sql=>sql.includes('INSERT INTO owner_command_help(')));
  assert.ok(statements.some(sql=>sql.includes('LIMIT 30')));
  assert.equal(statements.at(-1),'COMMIT');
});
test('rolls back when persistence fails',async()=>{
  const statements=[];
  const db={async query(sql){statements.push(sql);if(sql.includes('INSERT INTO owner_command_help('))throw Error('db write failed');return {rows:[]};}};
  await assert.rejects(()=>saveOwnerCommandHelp(db,{commandName:'karakter',shortDescription:'Karakter profili.',longDescription:'Oyuncu karakterini ve ilerlemesini gösterir.',actorId:'1553794496234262641'}),/db write failed/);
  assert.ok(statements.includes('ROLLBACK'));
});
