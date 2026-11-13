import test from 'node:test';
import assert from 'node:assert/strict';
import {subscribeChatEvents,publishChatEvent,getChatRealtimeSubscriberCount} from '../chat-realtime.js';

const a='site_123e4567-e89b-12d3-a456-426614174000';
const b='site_123e4567-e89b-12d3-a456-426614174001';

test('private realtime events reach only the intended accounts',()=>{
 const receivedA=[],receivedB=[];
 const stopA=subscribeChatEvents(a,event=>receivedA.push(event));
 const stopB=subscribeChatEvents(b,event=>receivedB.push(event));
 try{
  assert.equal(publishChatEvent({scope:'dm',accountIds:[a]}),1);
  assert.equal(receivedA.length,1);assert.equal(receivedB.length,0);
  assert.equal(receivedA[0].scope,'dm');
 }finally{stopA();stopB();}
});

test('group events carry only a validated group identifier and reach group members',()=>{
 const received=[];const stop=subscribeChatEvents(a,event=>received.push(event));
 try{
  assert.equal(publishChatEvent({scope:'group',accountIds:[a],conversationId:'123e4567-e89b-12d3-a456-426614174000'}),1);
  assert.equal(received[0].conversationId,'123e4567-e89b-12d3-a456-426614174000');
  assert.equal(publishChatEvent({scope:'group',accountIds:[a],conversationId:'not-an-id'}),1);
  assert.equal(received[1].conversationId,null);
 }finally{stop();}
});

test('public events fan out while invalid accounts and subscriptions are rejected',()=>{
 const received=[];const stop=subscribeChatEvents(a,event=>received.push(event));
 try{
  assert.equal(subscribeChatEvents('not-an-account',()=>{}),null);
  assert.equal(publishChatEvent({scope:'public'}),1);
  assert.equal(received[0].scope,'public');
  assert.equal(publishChatEvent({scope:'unknown'}),0);
 }finally{stop();}
});

test('unsubscribing releases subscriber slots exactly once',()=>{
 const before=getChatRealtimeSubscriberCount();const stop=subscribeChatEvents(a,()=>{});
 assert.equal(getChatRealtimeSubscriberCount(),before+1);stop();stop();
 assert.equal(getChatRealtimeSubscriberCount(),before);
});
