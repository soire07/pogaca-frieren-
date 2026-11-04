import test from 'node:test';
import assert from 'node:assert/strict';
import { CARD_VARIANTS, pickCardVariant, saveCardVariant, listCardVariants } from '../card-variants.js';

test('anime card series variants have deterministic rarity weights and safe selection',()=>{
 assert.equal(CARD_VARIANTS.reduce((sum,item)=>sum+item.weight,0),100);
 assert.equal(pickCardVariant(()=>0.84).key,'standard');
 assert.equal(pickCardVariant(()=>0.85).key,'festival');
 assert.equal(pickCardVariant(()=>0.91).key,'winter');
 assert.equal(pickCardVariant(()=>0.96).key,'mage_exam');
 assert.equal(pickCardVariant(()=>0.99).key,'celestial');
 assert.throws(()=>pickCardVariant(()=>1),/CARD_VARIANT_RANDOM_INVALID/);
});

test('card variant ownership is stored per guild, user, character and edition',async()=>{
 let captured;
 const db={async query(sql,params){captured={sql,params};return{rows:[{quantity:2}],rowCount:1};}};
 const result=await saveCardVariant(db,{guildId:'1539562273197260860',userId:'123456789012345678',characterName:'Frieren',variantKey:'winter'});
 assert.equal(result.quantity,2);
 assert.equal(result.variant.label,'Kış Büyüsü Baskısı');
 assert.match(captured.sql,/ON CONFLICT\(guild_id,user_id,character_name,variant_key\)/);
 assert.deepEqual(captured.params,['1539562273197260860','123456789012345678','Frieren','Frieren: Beyond Journey’s End','winter']);
});

test('card variant listing filters by canonical series using parameterized SQL',async()=>{
 let captured;
 const db={async query(sql,params){captured={sql,params};return{rows:[{character_name:'Frieren',series_name:'Frieren: Beyond Journey’s End',variant_key:'festival',quantity:1}],rowCount:1};}};
 const rows=await listCardVariants(db,'1539562273197260860','123456789012345678','Frieren: Beyond Journey’s End');
 assert.equal(rows[0].variant.key,'festival');
 assert.deepEqual(captured.params,['1539562273197260860','123456789012345678','Frieren: Beyond Journey’s End']);
});
