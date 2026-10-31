import test from 'node:test';
import assert from 'node:assert/strict';
import { handlePublicSiteRequest } from '../public-site.js';
function res(){return {status:0,headers:{},body:'',writeHead(s,h={}){this.status=s;this.headers=h},end(b){this.body=b}}}
test('home page shows live bot metrics and platform links',async()=>{const r=res();const client={guilds:{cache:{size:3}},commands:{size:68},isReady:()=>true};assert.equal(await handlePublicSiteRequest({method:'GET',url:'/'},r,{client}),true);assert.equal(r.status,200);assert.match(r.body,/Bin yıllık/);assert.match(r.body,/68 komut/);assert.match(r.body,/Frieren AI/)});
test('Poğaça and AI pages render their feature areas',async()=>{const p=res(),a=res();await handlePublicSiteRequest({method:'GET',url:'/pogaca'},p,{client:{commands:{size:68},isReady:()=>true}});await handlePublicSiteRequest({method:'GET',url:'/frieren-ai'},a);assert.match(p.body,/Zindan &amp; Boss|Zindan & Boss/);assert.match(a.body,/Test sistemi/)});
test('unknown routes and non-GET requests are not intercepted',async()=>{assert.equal(await handlePublicSiteRequest({method:'GET',url:'/unknown'},res()),false);assert.equal(await handlePublicSiteRequest({method:'POST',url:'/'},res()),false)});
