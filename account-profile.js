import { randomUUID } from 'node:crypto';

const ACCOUNT=/^site_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const THEMES=new Set(['midnight','violet','starlight','forest']);
const VISIBILITY=new Set(['public','followers','private']);
const clean=(v,max,code,{optional=false}={})=>{const s=String(v??'').normalize('NFC').trim();if((!optional&&!s)||Array.from(s).length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(s))throw new Error(code);return s;};
const account=id=>{if(!ACCOUNT.test(String(id||'')))throw new Error('ACCOUNT_PROFILE_ID_INVALID');return String(id);};
const ready=new WeakMap();
async function schema(db){
 await db.query(`CREATE TABLE IF NOT EXISTS frieren_account_profiles(
 account_id TEXT PRIMARY KEY,bio VARCHAR(280) NOT NULL DEFAULT '',status_text VARCHAR(80) NOT NULL DEFAULT '',
 interests JSONB NOT NULL DEFAULT '[]'::jsonb,tags JSONB NOT NULL DEFAULT '[]'::jsonb,
 theme TEXT NOT NULL DEFAULT 'midnight' CHECK(theme IN ('midnight','violet','starlight','forest')),
 accent_color VARCHAR(7) NOT NULL DEFAULT '#a78bfa',
 social_links JSONB NOT NULL DEFAULT '{}'::jsonb,
 visibility TEXT NOT NULL DEFAULT 'public' CHECK(visibility IN ('public','followers','private')),
 show_activity BOOLEAN NOT NULL DEFAULT TRUE,allow_visitors BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 )`);
 await db.query(`CREATE TABLE IF NOT EXISTS frieren_account_follows(
 follower_account_id TEXT NOT NULL,followed_account_id TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(follower_account_id,followed_account_id),CHECK(follower_account_id<>followed_account_id)
 )`);
 await db.query('CREATE INDEX IF NOT EXISTS frieren_account_followed_idx ON frieren_account_follows(followed_account_id,created_at DESC)');
 await db.query(`CREATE TABLE IF NOT EXISTS frieren_account_activity(
 activity_id UUID PRIMARY KEY,account_id TEXT NOT NULL,activity_type VARCHAR(40) NOT NULL,label VARCHAR(120) NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 )`);
 await db.query('CREATE INDEX IF NOT EXISTS frieren_account_activity_idx ON frieren_account_activity(account_id,created_at DESC)');
 await db.query(`CREATE TABLE IF NOT EXISTS frieren_account_profile_visits(
 owner_account_id TEXT NOT NULL,visitor_account_id TEXT NOT NULL,visit_count INTEGER NOT NULL DEFAULT 1,
 last_visited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(owner_account_id,visitor_account_id),CHECK(owner_account_id<>visitor_account_id)
 )`);
}
export async function ensureAccountProfileSchema(db){
 if(!db||typeof db.query!=='function')throw new Error('ACCOUNT_PROFILE_DATABASE_INVALID');
 let p=ready.get(db);if(!p){p=schema(db);ready.set(db,p);}try{await p;}catch(e){ready.delete(db);throw e;}
}
const list=(value,maxItems,maxLength,code)=>{let v=value;if(typeof v==='string'){try{v=JSON.parse(v);}catch{throw new Error(code);}}if(!Array.isArray(v)||v.length>maxItems)throw new Error(code);return [...new Set(v.map(x=>clean(x,maxLength,code)).filter(Boolean))];};
const links=value=>{let v=value;if(typeof v==='string'){try{v=JSON.parse(v);}catch{throw new Error('ACCOUNT_PROFILE_LINKS_INVALID');}}if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('ACCOUNT_PROFILE_LINKS_INVALID');const out={};for(const k of ['website','youtube','twitch','instagram','x','github','tiktok']){const raw=String(v[k]||'').trim();if(!raw)continue;if(raw.length>300)throw new Error('ACCOUNT_PROFILE_LINKS_INVALID');let u;try{u=new URL(raw);}catch{throw new Error('ACCOUNT_PROFILE_LINKS_INVALID');}if(u.protocol!=='https:'||u.username||u.password)throw new Error('ACCOUNT_PROFILE_LINKS_INVALID');out[k]=u.toString();}return out;};
export async function getAccountProfile(db,accountId,{viewerAccountId=null}={}){
 const id=account(accountId),viewer=viewerAccountId&&ACCOUNT.test(String(viewerAccountId))?viewerAccountId:null;await ensureAccountProfileSchema(db);
 const [p,f,counts]=await Promise.all([
  db.query('SELECT * FROM frieren_account_profiles WHERE account_id=$1',[id]),
  viewer?db.query('SELECT 1 FROM frieren_account_follows WHERE follower_account_id=$1 AND followed_account_id=$2',[viewer,id]):Promise.resolve({rowCount:0}),
  db.query('SELECT (SELECT COUNT(*)::int FROM frieren_account_follows WHERE followed_account_id=$1) AS followers,(SELECT COUNT(*)::int FROM frieren_account_follows WHERE follower_account_id=$1) AS following',[id])
 ]);
 const row=p.rows[0]||{bio:'',status_text:'',interests:[],tags:[],theme:'midnight',accent_color:'#a78bfa',social_links:{},visibility:'public',show_activity:true,allow_visitors:true};
 const following=f.rowCount>0;const canView=id===viewer||row.visibility==='public'||(row.visibility==='followers'&&following);
 return {profile:canView?row:{theme:row.theme,visibility:row.visibility},canView,following,followers:Number(counts.rows[0]?.followers||0),followingCount:Number(counts.rows[0]?.following||0),isOwner:id===viewer};
}
export async function updateAccountProfile(db,{accountId,bio='',statusText='',interests=[],tags=[],theme='midnight',accentColor='#a78bfa',socialLinks={},visibility='public',showActivity=true,allowVisitors=true}){
 const id=account(accountId),b=clean(bio,280,'ACCOUNT_PROFILE_INVALID',{optional:true}),s=clean(statusText,80,'ACCOUNT_PROFILE_INVALID',{optional:true});
 if(!THEMES.has(theme)||!VISIBILITY.has(visibility)||typeof showActivity!=='boolean'||typeof allowVisitors!=='boolean'||!/^#[0-9a-f]{6}$/i.test(String(accentColor)))throw new Error('ACCOUNT_PROFILE_INVALID');
 const i=list(interests,12,32,'ACCOUNT_PROFILE_INTERESTS_INVALID'),t=list(tags,10,24,'ACCOUNT_PROFILE_TAGS_INVALID'),l=links(socialLinks);await ensureAccountProfileSchema(db);
 const r=await db.query(`INSERT INTO frieren_account_profiles(account_id,bio,status_text,interests,tags,theme,accent_color,social_links,visibility,show_activity,allow_visitors)
 VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8::jsonb,$9,$10,$11)
 ON CONFLICT(account_id) DO UPDATE SET bio=EXCLUDED.bio,status_text=EXCLUDED.status_text,interests=EXCLUDED.interests,tags=EXCLUDED.tags,theme=EXCLUDED.theme,accent_color=EXCLUDED.accent_color,social_links=EXCLUDED.social_links,visibility=EXCLUDED.visibility,show_activity=EXCLUDED.show_activity,allow_visitors=EXCLUDED.allow_visitors,updated_at=NOW()
 RETURNING *`,[id,b,s,JSON.stringify(i),JSON.stringify(t),theme,accentColor,JSON.stringify(l),visibility,showActivity,allowVisitors]);return r.rows[0];
}
export async function followAccount(db,{followerAccountId,followedAccountId}){
 const follower=account(followerAccountId),followed=account(followedAccountId);if(follower===followed)throw new Error('ACCOUNT_PROFILE_SELF_FOLLOW');await ensureAccountProfileSchema(db);
 const target=await getAccountProfile(db,followed);if(target.profile?.allow_visitors===false)return{status:'not_allowed'};
 const r=await db.query('INSERT INTO frieren_account_follows(follower_account_id,followed_account_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING followed_account_id',[follower,followed]);return{status:r.rowCount?'followed':'already_following'};
}
export async function unfollowAccount(db,{followerAccountId,followedAccountId}){const follower=account(followerAccountId),followed=account(followedAccountId);await ensureAccountProfileSchema(db);const r=await db.query('DELETE FROM frieren_account_follows WHERE follower_account_id=$1 AND followed_account_id=$2',[follower,followed]);return{status:r.rowCount?'unfollowed':'not_following'};}
export async function recordAccountProfileVisit(db,{ownerAccountId,visitorAccountId}){const owner=account(ownerAccountId),visitor=account(visitorAccountId);if(owner===visitor)return{status:'self'};await ensureAccountProfileSchema(db);const p=await getAccountProfile(db,owner,{viewerAccountId:visitor});if(!p.canView)return{status:'private'};if(p.profile.allow_visitors===false)return{status:'disabled'};await db.query(`INSERT INTO frieren_account_profile_visits(owner_account_id,visitor_account_id,visit_count,last_visited_at) VALUES($1,$2,1,NOW()) ON CONFLICT(owner_account_id,visitor_account_id) DO UPDATE SET visit_count=frieren_account_profile_visits.visit_count+1,last_visited_at=NOW()`,[owner,visitor]);return{status:'recorded'};}
export async function listAccountProfileActivity(db,accountId,limit=12){const id=account(accountId);await ensureAccountProfileSchema(db);const n=Math.max(1,Math.min(30,Math.floor(Number(limit)||12)));const r=await db.query('SELECT activity_type,label,created_at FROM frieren_account_activity WHERE account_id=$1 ORDER BY created_at DESC LIMIT $2',[id,n]);return r.rows;}
export async function recordAccountActivity(db,{accountId,type,label}){const id=account(accountId),t=clean(type,40,'ACCOUNT_ACTIVITY_INVALID'),l=clean(label,120,'ACCOUNT_ACTIVITY_INVALID');await ensureAccountProfileSchema(db);await db.query('INSERT INTO frieren_account_activity(activity_id,account_id,activity_type,label) VALUES($1,$2,$3,$4)',[randomUUID(),id,t,l]);return{status:'recorded'};}
