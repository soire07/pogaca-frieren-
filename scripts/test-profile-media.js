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
