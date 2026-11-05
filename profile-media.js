import { randomUUID } from 'node:crypto';

const ACCOUNT=/^site_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KINDS=new Set(['avatar','banner']);
const LIMITS={avatar:2*1024*1024,banner:4*1024*1024};

export function validateProfileImage(kind, input) {
  if(!KINDS.has(kind)) throw new Error('PROFILE_MEDIA_KIND_INVALID');
  const buffer=Buffer.isBuffer(input)?input:Buffer.from(input||[]);
  if(!buffer.length||buffer.length>LIMITS[kind]) throw new Error('PROFILE_MEDIA_SIZE_INVALID');
  let mime=null,width=0,height=0;
  if(buffer.length>=24&&buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))){
    mime='image/png';width=buffer.readUInt32BE(16);height=buffer.readUInt32BE(20);
  } else if(buffer.length>=4&&buffer[0]===0xff&&buffer[1]===0xd8){
    mime='image/jpeg';
    let offset=2;
    while(offset+4<buffer.length){
      if(buffer[offset]!==0xff){offset++;continue;}
      const marker=buffer[offset+1];offset+=2;
      if(marker===0xd8||marker===0xd9||marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;
      if(offset+2>buffer.length)break;
      const length=buffer.readUInt16BE(offset);
      if(length<2||offset+length>buffer.length)break;
      if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){
        if(length<7)break;height=buffer.readUInt16BE(offset+3);width=buffer.readUInt16BE(offset+5);break;
      }
      offset+=length;
    }
  } else throw new Error('PROFILE_MEDIA_FORMAT_INVALID');
  if(!width||!height||width>4096||height>4096||width*height>4_000_000)throw new Error('PROFILE_MEDIA_DIMENSIONS_INVALID');
  return {buffer,mime,width,height};
}

export async function ensureProfileMediaSchema(db){
  await db.query(`CREATE TABLE IF NOT EXISTS frieren_profile_media(
    account_id UUID NOT NULL REFERENCES frieren_site_accounts(id) ON DELETE CASCADE,
    media_kind TEXT NOT NULL CHECK(media_kind IN ('avatar','banner')),
    mime_type TEXT NOT NULL CHECK(mime_type IN ('image/jpeg','image/png')),
    media_data BYTEA NOT NULL,
    width INTEGER NOT NULL CHECK(width BETWEEN 1 AND 4096),
    height INTEGER NOT NULL CHECK(height BETWEEN 1 AND 4096),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(account_id,media_kind)
  )`);
}

export async function saveProfileMedia(db,accountId,kind,input){
  if(!ACCOUNT.test(String(accountId||'')))throw new Error('PROFILE_MEDIA_ACCOUNT_INVALID');
  const media=validateProfileImage(kind,input);
  await ensureProfileMediaSchema(db);
  await db.query(`INSERT INTO frieren_profile_media(account_id,media_kind,mime_type,media_data,width,height)
    VALUES($1,$2,$3,$4,$5,$6)
    ON CONFLICT(account_id,media_kind) DO UPDATE SET mime_type=EXCLUDED.mime_type,media_data=EXCLUDED.media_data,width=EXCLUDED.width,height=EXCLUDED.height,updated_at=NOW()`,
    [accountId.slice(5),kind,media.mime,media.buffer,media.width,media.height]);
  return {status:'saved',kind,width:media.width,height:media.height};
}

export async function getProfileMedia(db,accountId,kind){
  if(!ACCOUNT.test(String(accountId||''))||!KINDS.has(kind))return null;
  const result=await db.query('SELECT mime_type,media_data,width,height FROM frieren_profile_media WHERE account_id=$1 AND media_kind=$2',[accountId.slice(5),kind]);
  return result.rows[0]||null;
}

export async function deleteProfileMedia(db,accountId,kind){
  if(!ACCOUNT.test(String(accountId||''))||!KINDS.has(kind))throw new Error('PROFILE_MEDIA_INPUT_INVALID');
  await ensureProfileMediaSchema(db);
  await db.query('DELETE FROM frieren_profile_media WHERE account_id=$1 AND media_kind=$2',[accountId.slice(5),kind]);
  return {status:'deleted',kind};
}
