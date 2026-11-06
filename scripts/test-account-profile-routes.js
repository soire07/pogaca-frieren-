import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {handlePublicSiteRequest} from '../public-site.js';
import {createPublicSiteSession,buildPublicSiteSessionCookie} from '../owner-dashboard.js';
import {createSiteCsrfToken} from '../site-auth.js';

const secret='test-public-profile-secret-at-least-32-characters';
process.env.ADMIN_SESSION_SECRET=secret;
const account={id:'site_123e4567-e89b-12d3-a456-426614174000',username:'Gezgin'};

function response(){
  return {
    status:0,headers:{},body:'',
    writeHead(status,headers={}){this.status=status;this.headers=headers;},
    end(body=''){this.body=body;}
  };
}

function sessionCookie(){
  const token=createPublicSiteSession(secret,account,Math.floor(Date.now()/1000)+3600);
  return buildPublicSiteSessionCookie(token,3600).split(';')[0];
}

test('POST /api/account-profile persists submitted profile and redirects back to /profil',async()=>{
  const statements=[];
  const db={async query(sql){
    statements.push(sql);
    if(sql.includes('INSERT INTO frieren_account_profiles'))return{rows:[{account_id:account.id}],rowCount:1};
    return{rows:[],rowCount:0};
  }};
  const form=new URLSearchParams({
    csrf:createSiteCsrfToken(secret),
    displayName:'Gezgin Test',
    profileSlug:'gezgin-test',
    bannerPosition:'center',
    bio:'Profil kayıt testi',
    statusText:'Test ediliyor',
    interests:'Frieren, büyü',
    tags:'frieren,test',
    theme:'violet',
    accentColor:'#aabbcc',
    visibility:'public',
    showActivity:'true',
    allowVisitors:'true'
  });
  const req=Readable.from([Buffer.from(form.toString())]);
  Object.assign(req,{
    method:'POST',
    url:'/api/account-profile',
    headers:{
      cookie:sessionCookie(),
      'content-type':'application/x-www-form-urlencoded'
    }
  });
  const res=response();
  assert.equal(await handlePublicSiteRequest(req,res,{db}),true);
  assert.equal(res.status,303);
  assert.equal(res.headers.Location,'/profil?status=saved');
  assert.ok(statements.some(sql=>sql.includes('INSERT INTO frieren_account_profiles')),'profile update must reach the persistence query');
  assert.ok(statements.some(sql=>sql.includes('INSERT INTO frieren_account_activity')),'profile update activity must be recorded');
});
