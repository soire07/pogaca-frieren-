import { randomUUID } from 'node:crypto';

const MAX_SUBSCRIBERS=100;
const accountPattern=/^site_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const subscribers=new Map();
let subscriberCount=0;

function deliver(accountId,event){
 const listeners=subscribers.get(accountId);
 if(!listeners)return;
 for(const listener of listeners){
  try{listener(event);}catch{}
 }
}

export function subscribeChatEvents(accountId,listener){
 const account=String(accountId||'');
 if(!accountPattern.test(account)||typeof listener!=='function'||subscriberCount>=MAX_SUBSCRIBERS)return null;
 const existing=subscribers.get(account);if(existing&&existing.size>=3)return null;
 let listeners=subscribers.get(account);
 if(!listeners){listeners=new Set();subscribers.set(account,listeners);}
 listeners.add(listener);subscriberCount++;
 let active=true;
 return()=>{
  if(!active)return;active=false;
  listeners.delete(listener);subscriberCount=Math.max(0,subscriberCount-1);
  if(!listeners.size)subscribers.delete(account);
 };
}

export function publishChatEvent({scope,accountIds=[],conversationId=null}={}){
 if(!['public','dm','group'].includes(scope))return 0;
 const event={id:randomUUID(),scope,conversationId:scope==='group'&&/^[0-9a-f-]{36}$/i.test(String(conversationId||''))?String(conversationId):scope==='dm'&&String(conversationId||'').split(':').length===2&&String(conversationId).split(':').every(id=>accountPattern.test(id))?String(conversationId):null,at:Date.now()};
 let delivered=0;
 if(scope==='public'){
  for(const listeners of subscribers.values())for(const listener of listeners){try{listener(event);delivered++;}catch{}}
  return delivered;
 }
 const targets=[...new Set(Array.isArray(accountIds)?accountIds.map(String).filter(id=>accountPattern.test(id)):[])];
 for(const accountId of targets){const before=delivered;const listeners=subscribers.get(accountId);if(listeners)for(const listener of listeners){try{listener(event);delivered++;}catch{}}}
 return delivered;
}

export function getChatRealtimeSubscriberCount(){return subscriberCount;}
