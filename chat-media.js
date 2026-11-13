import { createHash, createHmac, randomUUID } from 'node:crypto';

const ACCOUNT=/^site_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SPECS={
 'image/jpeg':{extension:'jpg',max:8*1024*1024,kind:'image'},
 'image/png':{extension:'png',max:8*1024*1024,kind:'image'},
 'image/webp':{extension:'webp',max:8*1024*1024,kind:'image'},
 'image/gif':{extension:'gif',max:8*1024*1024,kind:'image'},
 'video/mp4':{extension:'mp4',max:24*1024*1024,kind:'video'},
 'video/webm':{extension:'webm',max:24*1024*1024,kind:'video'},
 'audio/mpeg':{extension:'mp3',max:16*1024*1024,kind:'audio'},
 'audio/ogg':{extension:'ogg',max:16*1024*1024,kind:'audio'},
 'audio/wav':{extension:'wav',max:16*1024*1024,kind:'audio'},
 'audio/flac':{extension:'flac',max:16*1024*1024,kind:'audio'},
 'audio/webm':{extension:'webm',max:16*1024*1024,kind:'audio'}
};
const ready=new WeakMap();
const sha256=value=>createHash('sha256').update(value).digest('hex');
const hmac=(key,value)=>createHmac('sha256',key).update(value).digest();
const encode=value=>encodeURIComponent(String(value)).replace(/[!'()*]/g,char=>'%'+char.charCodeAt(0).toString(16).toUpperCase());
function config(){
 const account=String(process.env.CHAT_MEDIA_R2_ACCOUNT_ID||'').trim();
 const bucket=String(process.env.CHAT_MEDIA_R2_BUCKET||'').trim();
 const accessKey=String(process.env.CHAT_MEDIA_R2_ACCESS_KEY_ID||'').trim();
 const secret=String(process.env.CHAT_MEDIA_R2_SECRET_ACCESS_KEY||'').trim();
 if(!/^[a-f0-9]{32}$/i.test(account)||!/^[a-z0-9-]{3,63}$/i.test(bucket)||!accessKey||!secret)return null;
 return{account,bucket,accessKey,secret,host:account+'.r2.cloudflarestorage.com'};
}
export function isChatMediaConfigured(){return Boolean(config());}

export function validateChatMedia(input,mimeType){
 const buffer=Buffer.isBuffer(input)?input:Buffer.from(input||[]);
 const mime=String(mimeType||'').toLowerCase().split(';')[0].trim();
 const spec=SPECS[mime];
 if(!spec)throw new Error('CHAT_MEDIA_TYPE_INVALID');
 if(!buffer.length||buffer.length>spec.max)throw new Error('CHAT_MEDIA_SIZE_INVALID');
 const starts=(bytes)=>buffer.length>=bytes.length&&buffer.subarray(0,bytes.length).equals(Buffer.from(bytes));
 let valid=false;
 if(mime==='image/jpeg')valid=starts([0xff,0xd8,0xff]);
 else if(mime==='image/png')valid=starts([137,80,78,71,13,10,26,10]);
 else if(mime==='image/webp')valid=buffer.length>=12&&buffer.toString('ascii',0,4)==='RIFF'&&buffer.toString('ascii',8,12)==='WEBP';
 else if(mime==='image/gif')valid=buffer.length>=6&&['GIF87a','GIF89a'].includes(buffer.toString('ascii',0,6));
 else if(mime==='video/mp4')valid=buffer.length>=12&&buffer.toString('ascii',4,8)==='ftyp';
 else if(mime==='video/webm'||mime==='audio/webm')valid=starts([0x1a,0x45,0xdf,0xa3]);
 else if(mime==='audio/mpeg')valid=starts([0x49,0x44,0x33])||(buffer.length>1&&buffer[0]===0xff&&(buffer[1]&0xe0)===0xe0);
 else if(mime==='audio/ogg')valid=starts([0x4f,0x67,0x67,0x53]);
 else if(mime==='audio/wav')valid=buffer.length>=12&&buffer.toString('ascii',0,4)==='RIFF'&&buffer.toString('ascii',8,12)==='WAVE';
 else if(mime==='audio/flac')valid=starts([0x66,0x4c,0x61,0x43]);
 if(!valid)throw new Error('CHAT_MEDIA_SIGNATURE_INVALID');
 return{buffer,mimeType:mime,extension:spec.extension,kind:spec.kind,size:buffer.length};
}

export function signChatMediaUrl(method,objectKey,mimeType,expiresIn=300){
 const cfg=config();if(!cfg)throw new Error('CHAT_MEDIA_STORAGE_NOT_CONFIGURED');
 const verb=String(method||'GET').toUpperCase();if(!['GET','PUT','DELETE'].includes(verb))throw new Error('CHAT_MEDIA_METHOD_INVALID');
 const key=String(objectKey||'');if(!/^chat\/(public|dm|group)\/[0-9a-f-]{36}\.[a-z0-9]+$/i.test(key))throw new Error('CHAT_MEDIA_KEY_INVALID');
 const expires=Math.max(1,Math.min(3600,Math.floor(Number(expiresIn)||300)));
 const now=new Date(),amzDate=now.toISOString().replace(/[:-]|\.\d{3}/g,''),date=amzDate.slice(0,8);
 const credentialScope=date+'/auto/s3/aws4_request',credential=cfg.accessKey+'/'+credentialScope;
 const uri='/'+[cfg.bucket,...key.split('/')].map(encode).join('/');
 const headers=verb==='PUT'?'content-type;host':'host';
 const canonicalHeaders=verb==='PUT'?'content-type:'+String(mimeType||'application/octet-stream')+'\nhost:'+cfg.host+'\n':'host:'+cfg.host+'\n';
 const params=[['X-Amz-Algorithm','AWS4-HMAC-SHA256'],['X-Amz-Credential',credential],['X-Amz-Date',amzDate],['X-Amz-Expires',String(expires)],['X-Amz-SignedHeaders',headers]];
 if(verb==='GET'&&mimeType){params.push(['response-content-type',String(mimeType)],['response-content-disposition','inline']);}
 const canonicalQuery=params.slice().sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0).map(([k,v])=>encode(k)+'='+encode(v)).join('&');
 const canonicalRequest=[verb,uri,canonicalQuery,canonicalHeaders,headers,'UNSIGNED-PAYLOAD'].join('\n');
 const stringToSign=['AWS4-HMAC-SHA256',amzDate,credentialScope,sha256(canonicalRequest)].join('\n');
 const dateKey=hmac('AWS4'+cfg.secret,date),regionKey=hmac(dateKey,'auto'),serviceKey=hmac(regionKey,'s3'),signingKey=hmac(serviceKey,'aws4_request');
 const signature=createHmac('sha256',signingKey).update(stringToSign).digest('hex');
 return 'https://'+cfg.host+uri+'?'+canonicalQuery+'&X-Amz-Signature='+signature;
}

async function createSchema(db){
 await db.query(`CREATE TABLE IF NOT EXISTS frieren_site_chat_media(
  media_id UUID PRIMARY KEY,owner_account_id TEXT NOT NULL,scope_type TEXT NOT NULL CHECK(scope_type IN ('public','dm','group')),
  scope_key TEXT NOT NULL,object_key TEXT NOT NULL UNIQUE,mime_type TEXT NOT NULL,size_bytes INTEGER NOT NULL CHECK(size_bytes>0),
  message_id UUID UNIQUE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),attached_at TIMESTAMPTZ
 )`);
 await db.query('CREATE INDEX IF NOT EXISTS frieren_site_chat_media_owner_idx ON frieren_site_chat_media(owner_account_id,created_at DESC)');
 await db.query('CREATE INDEX IF NOT EXISTS frieren_site_chat_media_message_idx ON frieren_site_chat_media(message_id) WHERE message_id IS NOT NULL');
}
export async function ensureChatMediaSchema(db){
 if(!db||typeof db.query!=='function')throw new Error('CHAT_MEDIA_DATABASE_INVALID');
 let pending=ready.get(db);if(!pending){pending=createSchema(db);ready.set(db,pending);}
 try{await pending;}catch(error){ready.delete(db);throw error;}
}

export async function uploadChatMedia(db,{accountId,scope,scopeKey,mimeType,buffer}){
 if(!ACCOUNT.test(String(accountId||'')))throw new Error('CHAT_MEDIA_ACCOUNT_INVALID');
 if(!['public','dm','group'].includes(scope)||!String(scopeKey||'').startsWith(scope+':')&&!(scope==='public'&&scopeKey==='public'))throw new Error('CHAT_MEDIA_SCOPE_INVALID');
 const media=validateChatMedia(buffer,mimeType),cfg=config();if(!cfg)throw new Error('CHAT_MEDIA_STORAGE_NOT_CONFIGURED');
 await ensureChatMediaSchema(db);
 const usage=await db.query("SELECT COALESCE(SUM(size_bytes),0)::bigint AS bytes FROM frieren_site_chat_media WHERE owner_account_id=$1 AND created_at>NOW()-INTERVAL '24 hours'",[accountId]);
 if(Number(usage.rows[0]?.bytes||0)+media.size>150*1024*1024)throw new Error('CHAT_MEDIA_DAILY_QUOTA');
 const mediaId=randomUUID(),objectKey='chat/'+scope+'/'+mediaId+'.'+media.extension;
 const putUrl=signChatMediaUrl('PUT',objectKey,media.mimeType,600);
 const response=await fetch(putUrl,{method:'PUT',headers:{'Content-Type':media.mimeType},body:media.buffer});
 if(!response.ok)throw new Error('CHAT_MEDIA_STORAGE_UPLOAD_FAILED');
 try{
  await db.query('INSERT INTO frieren_site_chat_media(media_id,owner_account_id,scope_type,scope_key,object_key,mime_type,size_bytes) VALUES($1,$2,$3,$4,$5,$6,$7)',[mediaId,accountId,scope,scopeKey,objectKey,media.mimeType,media.size]);
 }catch(error){
  try{await fetch(signChatMediaUrl('DELETE',objectKey,null,300),{method:'DELETE'});}catch{}
  throw error;
 }
 return{status:'uploaded',mediaId,mimeType:media.mimeType,sizeBytes:media.size,kind:media.kind};
}

export async function attachChatMedia(db,{mediaId,accountId,scope,scopeKey,messageId}){
 if(!/^[0-9a-f-]{36}$/i.test(String(mediaId||''))||!ACCOUNT.test(String(accountId||''))||!['public','dm','group'].includes(scope)||!/^[0-9a-f-]{36}$/i.test(String(messageId||'')))throw new Error('CHAT_MEDIA_ATTACHMENT_INVALID');
 await ensureChatMediaSchema(db);
 const result=await db.query(`UPDATE frieren_site_chat_media SET message_id=$5,attached_at=NOW()
  WHERE media_id=$1 AND owner_account_id=$2 AND scope_type=$3 AND scope_key=$4 AND message_id IS NULL
  AND created_at>NOW()-INTERVAL '24 hours' RETURNING media_id`,[mediaId,accountId,scope,scopeKey,messageId]);
 if(!result.rowCount)throw new Error('CHAT_MEDIA_ATTACHMENT_NOT_ALLOWED');
 return true;
}

export function getChatMediaReadUrl({object_key,mime_type}={}){
 if(!object_key||!mime_type||!SPECS[mime_type]||!config())return null;
 return signChatMediaUrl('GET',object_key,mime_type,3600);
}
