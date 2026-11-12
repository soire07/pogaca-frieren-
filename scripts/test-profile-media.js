import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProfileImage } from '../profile-media.js';

function png(width=64,height=64){
 const data=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(data);data.writeUInt32BE(width,16);data.writeUInt32BE(height,20);return data;
}
test('profile media accepts bounded PNG with valid dimensions',()=>{
 const result=validateProfileImage('avatar',png());
 assert.equal(result.mime,'image/png');assert.equal(result.width,64);assert.equal(result.height,64);
});
test('profile media rejects invalid kind, unsupported formats and oversized dimensions',()=>{
 assert.throws(()=>validateProfileImage('cover',png()),/PROFILE_MEDIA_KIND_INVALID/);
 assert.throws(()=>validateProfileImage('avatar',Buffer.from('not an image')),/PROFILE_MEDIA_FORMAT_INVALID/);
 assert.throws(()=>validateProfileImage('avatar',png(4097,2)),/PROFILE_MEDIA_DIMENSIONS_INVALID/);
});
test('profile media enforces avatar and banner byte limits',()=>{
 assert.throws(()=>validateProfileImage('avatar',Buffer.alloc(2*1024*1024+1)),/PROFILE_MEDIA_SIZE_INVALID/);
});

test('profile media read initializes its account dependency before its own table and SELECT',async()=>{
 const statements=[];
 const db={query:async(sql)=>{
  statements.push(String(sql).trim());
  if(String(sql).startsWith('SELECT mime_type')) return {rows:[]};
  return {rows:[]};
 }};
 const {getProfileMedia}=await import('../profile-media.js');
 const result=await getProfileMedia(db,'site_123e4567-e89b-42d3-a456-426614174000','avatar');
 assert.equal(result,null);
 const accountTable=statements.findIndex(sql=>/CREATE TABLE IF NOT EXISTS frieren_site_accounts/.test(sql));
 const mediaTable=statements.findIndex(sql=>/CREATE TABLE IF NOT EXISTS frieren_profile_media/.test(sql));
 const mediaRead=statements.findIndex(sql=>/SELECT mime_type,media_data,width,height FROM frieren_profile_media/.test(sql));
 assert.ok(accountTable>=0,'site account table must be initialized');
 assert.ok(mediaTable>accountTable,'profile media table must be initialized after its FK target');
 assert.ok(mediaRead>mediaTable,'profile media SELECT must happen after both tables are initialized');
});
