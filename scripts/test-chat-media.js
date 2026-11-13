import test from 'node:test';
import assert from 'node:assert/strict';
import {validateChatMedia,signChatMediaUrl,isChatMediaConfigured,getChatMediaReadUrl} from '../chat-media.js';

const envKeys=['CHAT_MEDIA_R2_ACCOUNT_ID','CHAT_MEDIA_R2_BUCKET','CHAT_MEDIA_R2_ACCESS_KEY_ID','CHAT_MEDIA_R2_SECRET_ACCESS_KEY'];
const original=Object.fromEntries(envKeys.map(key=>[key,process.env[key]]));
function setTestConfig(){process.env.CHAT_MEDIA_R2_ACCOUNT_ID='1234567890abcdef1234567890abcdef';process.env.CHAT_MEDIA_R2_BUCKET='frieren-chat-test';process.env.CHAT_MEDIA_R2_ACCESS_KEY_ID='test-access-key';process.env.CHAT_MEDIA_R2_SECRET_ACCESS_KEY='test-secret-key';}
function restore(){for(const key of envKeys){if(original[key]===undefined)delete process.env[key];else process.env[key]=original[key];}}

test('chat media accepts supported file signatures and enforces type and size',()=>{
 assert.equal(validateChatMedia(Buffer.from([0xff,0xd8,0xff,0x00]),'image/jpeg').kind,'image');
 assert.equal(validateChatMedia(Buffer.from([0x1a,0x45,0xdf,0xa3]),'video/webm').kind,'video');
 assert.equal(validateChatMedia(Buffer.from('OggS0000'),'audio/ogg').kind,'audio');
 assert.throws(()=>validateChatMedia(Buffer.from('<svg/>'),'image/svg+xml'),/CHAT_MEDIA_TYPE_INVALID/);
 assert.throws(()=>validateChatMedia(Buffer.from('not-an-image'),'image/png'),/CHAT_MEDIA_SIGNATURE_INVALID/);
 assert.throws(()=>validateChatMedia(Buffer.alloc(8*1024*1024+1).fill(0xff),'image/jpeg'),/CHAT_MEDIA_SIZE_INVALID/);
});

test('R2 signing creates bounded presigned PUT, GET and DELETE requests without exposing secrets',()=>{
 setTestConfig();
 try{
  assert.equal(isChatMediaConfigured(),true);
  const key='chat/public/123e4567-e89b-42d3-a456-426614174000.jpg';
  const put=new URL(signChatMediaUrl('PUT',key,'image/jpeg',600));
  assert.equal(put.hostname,'1234567890abcdef1234567890abcdef.r2.cloudflarestorage.com');
  assert.equal(put.searchParams.get('X-Amz-Expires'),'600');
  assert.equal(put.searchParams.get('X-Amz-SignedHeaders'),'content-type;host');
  assert.match(put.searchParams.get('X-Amz-Signature'),/^[a-f0-9]{64}$/);
  assert.ok(!put.href.includes('test-secret-key'));
  const get=new URL(signChatMediaUrl('GET',key,'image/jpeg',9000));
  assert.equal(get.searchParams.get('X-Amz-Expires'),'3600');
  assert.equal(get.searchParams.get('response-content-type'),'image/jpeg');
  assert.equal(get.searchParams.get('response-content-disposition'),'inline');
  assert.match(signChatMediaUrl('DELETE',key,null),/X-Amz-Signature=[a-f0-9]{64}/);
  assert.match(getChatMediaReadUrl({object_key:key,mime_type:'image/jpeg'}),/^https:\/\//);
  assert.throws(()=>signChatMediaUrl('POST',key,'image/jpeg'),/CHAT_MEDIA_METHOD_INVALID/);
  assert.throws(()=>signChatMediaUrl('GET','../secret','image/jpeg'),/CHAT_MEDIA_KEY_INVALID/);
 }finally{restore();}
});

test('chat media remains disabled when R2 credentials are absent',()=>{
 for(const key of envKeys)delete process.env[key];
 try{assert.equal(isChatMediaConfigured(),false);assert.equal(getChatMediaReadUrl({object_key:'chat/public/123e4567-e89b-42d3-a456-426614174000.jpg',mime_type:'image/jpeg'}),null);assert.throws(()=>signChatMediaUrl('GET','chat/public/123e4567-e89b-42d3-a456-426614174000.jpg','image/jpeg'),/CHAT_MEDIA_STORAGE_NOT_CONFIGURED/);}
 finally{restore();}
});
