import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { ensureUser, pool } from './database/db.js';

export const MAX_PETS_PER_USER = 3;
export const PET_CATALOG = Object.freeze([
  Object.freeze({key:'forest_fox',name:'Orman Tilkisi',emoji:'🦊',cost:350,bonus:'Keşif ipuçlarını bulma desteği',description:'Orman yollarındaki gizli izleri fark eder.'}),
  Object.freeze({key:'snow_hare',name:'Kar Tavşanı',emoji:'🐇',cost:400,bonus:'Soğuk bölge keşif desteği',description:'Karlı rotalarda güvenli patikaları bulur.'}),
  Object.freeze({key:'arcane_moth',name:'Gizem Güvesi',emoji:'🦋',cost:500,bonus:'Mana araştırması desteği',description:'Büyü kalıntılarının çevresinde dolaşır.'}),
  Object.freeze({key:'dragon_hatchling',name:'Ejder Yavrusu',emoji:'🐉',cost:900,bonus:'Boss hazırlığı desteği',description:'Tehlikeli karşılaşmalarda cesaret verir.'}),
  Object.freeze({key:'healing_slime',name:'Şifacı Balçık',emoji:'🫧',cost:600,bonus:'Dinlenme ve toparlanma desteği',description:'Yolculuk molalarında sahibine eşlik eder.'}),
  Object.freeze({key:'scout_raven',name:'Gözcü Kuzgun',emoji:'🐦‍⬛',cost:550,bonus:'Keşif rotası desteği',description:'Uzak noktaları yükseklerden gözler.'}),
  Object.freeze({key:'treasure_ferret',name:'Hazine Gelinciği',emoji:'🦦',cost:700,bonus:'Ganimet arama desteği',description:'Küçük hazineleri ve saklı sandıkları arar.'}),
  Object.freeze({key:'craft_beetle',name:'Usta Böcek',emoji:'🪲',cost:650,bonus:'Üretim hazırlığı desteği',description:'Malzemeleri düzenlemeye yardım eder.'}),
  Object.freeze({key:'seasonal_sprite',name:'Mevsim Perisi',emoji:'🌸',cost:800,bonus:'Mevsimsel etkinlik desteği',description:'Mevsim değişimlerine göre görünüm kazanır.'})
]);

export function petLevelForXp(xp) {
  const value=Number(xp);
  if(!Number.isFinite(value)||value<0)return 1;
  return Math.min(30,Math.floor(Math.sqrt(value/80))+1);
}
export function normalizePetName(value) {
  const name=String(value??'').trim().replace(/\s+/g,' ');
  return [...name].length>=2&&[...name].length<=24&&!/[<>@]/u.test(name)&&!name.includes(String.fromCharCode(96))?name:null;
}
export async function initPetSchema(db) {
  await db.query("CREATE TABLE IF NOT EXISTS user_pets(guild_id TEXT NOT NULL,user_id TEXT NOT NULL,pet_key TEXT NOT NULL,nickname VARCHAR(24) NOT NULL,xp INTEGER NOT NULL DEFAULT 0 CHECK(xp>=0),level INTEGER NOT NULL DEFAULT 1 CHECK(level BETWEEN 1 AND 30),mood INTEGER NOT NULL DEFAULT 75 CHECK(mood BETWEEN 0 AND 100),care_streak INTEGER NOT NULL DEFAULT 0 CHECK(care_streak>=0),last_cared_at TIMESTAMPTZ,last_action_at TIMESTAMPTZ,is_active BOOLEAN NOT NULL DEFAULT FALSE,adopted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(guild_id,user_id,pet_key),FOREIGN KEY(guild_id,user_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE)");
  await db.query("CREATE UNIQUE INDEX IF NOT EXISTS idx_user_pets_one_active ON user_pets(guild_id,user_id) WHERE is_active=TRUE");
  await db.query("CREATE INDEX IF NOT EXISTS idx_user_pets_collection ON user_pets(guild_id,user_id,adopted_at)");
}
export async function listPets(db,{guildId,userId}) {
  if(!guildId||!userId)return [];
  await initPetSchema(db);
  const result=await db.query('SELECT pet_key,nickname,xp,level,mood,care_streak,last_cared_at,is_active,adopted_at FROM user_pets WHERE guild_id=$1 AND user_id=$2 ORDER BY is_active DESC,adopted_at,pet_key',[guildId,userId]);
  return result.rows.map(row=>({...row,catalog:PET_CATALOG.find(p=>p.key===row.pet_key)||null}));
}
export async function adoptPet(dbPool,{guildId,userId,petKey}) {
  const pet=PET_CATALOG.find(item=>item.key===petKey);
  if(!guildId||!userId||!pet)return {status:'invalid_pet'};
  await ensureUser(guildId,userId);await initPetSchema(dbPool);
  const db=await dbPool.connect();
  try {
    await db.query('BEGIN');
    await db.query('SELECT user_id FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE',[guildId,userId]);
    const owned=await db.query('SELECT pet_key FROM user_pets WHERE guild_id=$1 AND user_id=$2 AND pet_key=$3',[guildId,userId,petKey]);
    if(owned.rowCount){await db.query('ROLLBACK');return {status:'already_owned'};}
    const count=await db.query('SELECT COUNT(*)::int AS total FROM user_pets WHERE guild_id=$1 AND user_id=$2',[guildId,userId]);
    if(Number(count.rows[0].total)>=MAX_PETS_PER_USER){await db.query('ROLLBACK');return {status:'collection_full',limit:MAX_PETS_PER_USER};}
    const debit=await db.query('UPDATE users SET coins=coins-$3 WHERE guild_id=$1 AND user_id=$2 AND coins >= $3 RETURNING coins',[guildId,userId,pet.cost]);
    if(!debit.rowCount){await db.query('ROLLBACK');return {status:'insufficient_funds',cost:pet.cost};}
    const active=Number(count.rows[0].total)===0;
    await db.query('INSERT INTO user_pets(guild_id,user_id,pet_key,nickname,is_active) VALUES($1,$2,$3,$4,$5)',[guildId,userId,petKey,pet.name,active]);
    await db.query('COMMIT');
    return {status:'adopted',pet,balance:Number(debit.rows[0].coins),isActive:active};
  } catch(error){await db.query('ROLLBACK').catch(()=>{});if(error?.code==='23505')return {status:'already_owned'};throw error;}
  finally{db.release();}
}
export async function setActivePet(dbPool,{guildId,userId,petKey}) {
  if(!guildId||!userId||!PET_CATALOG.some(p=>p.key===petKey))return {status:'invalid_pet'};
  await initPetSchema(dbPool);const db=await dbPool.connect();
  try{
    await db.query('BEGIN');
    await db.query('SELECT user_id FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE',[guildId,userId]);
    const pet=await db.query('SELECT pet_key,nickname FROM user_pets WHERE guild_id=$1 AND user_id=$2 AND pet_key=$3 FOR UPDATE',[guildId,userId,petKey]);
    if(!pet.rowCount){await db.query('ROLLBACK');return {status:'not_owned'};}
    await db.query('UPDATE user_pets SET is_active=FALSE,updated_at=NOW() WHERE guild_id=$1 AND user_id=$2 AND is_active=TRUE',[guildId,userId]);
    await db.query('UPDATE user_pets SET is_active=TRUE,updated_at=NOW() WHERE guild_id=$1 AND user_id=$2 AND pet_key=$3',[guildId,userId,petKey]);
    await db.query('COMMIT');return {status:'activated',pet:pet.rows[0]};
  }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}finally{db.release();}
}
export async function renamePet(dbPool,{guildId,userId,petKey,name}) {
  await initPetSchema(dbPool);
  const nickname=normalizePetName(name);if(!nickname)return {status:'invalid_name'};
  const db=await dbPool.connect();
  try{
    const result=await db.query('UPDATE user_pets SET nickname=$4,updated_at=NOW() WHERE guild_id=$1 AND user_id=$2 AND pet_key=$3 RETURNING pet_key,nickname',[guildId,userId,petKey,nickname]);
    return result.rowCount?{status:'renamed',pet:result.rows[0]}:{status:'not_owned'};
  }finally{db.release();}
}
export async function careForPet(dbPool,{guildId,userId,petKey,action}) {
  if(!['feed','play','train'].includes(action))return {status:'invalid_action'};
  await initPetSchema(dbPool);
  const db=await dbPool.connect();
  try{
    await db.query('BEGIN');
    await db.query('SELECT user_id FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE',[guildId,userId]);
    const result=await db.query("SELECT pet_key,xp,level,mood,care_streak,(last_action_at>NOW()-INTERVAL '20 minutes') AS cooling FROM user_pets WHERE guild_id=$1 AND user_id=$2 AND pet_key=$3 FOR UPDATE",[guildId,userId,petKey]);
    const pet=result.rows[0];if(!pet){await db.query('ROLLBACK');return {status:'not_owned'};}
    if(pet.cooling){await db.query('ROLLBACK');return {status:'cooldown'};}
    const cost=action==='feed'?30:action==='train'?50:0;
    if(cost){const debit=await db.query('UPDATE users SET coins=coins-$3 WHERE guild_id=$1 AND user_id=$2 AND coins >= $3 RETURNING coins',[guildId,userId,cost]);if(!debit.rowCount){await db.query('ROLLBACK');return {status:'insufficient_funds',cost};}}
    const xp=Number(pet.xp)+(action==='feed'?5:action==='play'?12:20);
    const moodDelta=action==='feed'?12:action==='play'?18:-4;
    const updated=await db.query("UPDATE user_pets SET xp=$4,level=$5,mood=LEAST(100,GREATEST(0,mood+$6)),care_streak=CASE WHEN last_cared_at::date=CURRENT_DATE THEN care_streak WHEN last_cared_at>=CURRENT_DATE-INTERVAL '1 day' THEN care_streak+1 ELSE 1 END,last_cared_at=NOW(),last_action_at=NOW(),updated_at=NOW() WHERE guild_id=$1 AND user_id=$2 AND pet_key=$3 RETURNING pet_key,nickname,xp,level,mood,care_streak,is_active",[guildId,userId,petKey,xp,petLevelForXp(xp),moodDelta]);
    await db.query('COMMIT');return {status:'cared',action,pet:updated.rows[0],cost};
  }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}finally{db.release();}
}
export async function getPetSupportPreview(db,{guildId,userId,petKey}) {
  await initPetSchema(db);
  const result=await db.query('SELECT pet_key,nickname,level,mood FROM user_pets WHERE guild_id=$1 AND user_id=$2 AND pet_key=$3',[guildId,userId,petKey]);
  if(!result.rowCount)return {status:'not_owned'};
  const pet=PET_CATALOG.find(item=>item.key===petKey);
  return {status:'preview',pet:result.rows[0],bonus:pet?.bonus||'Destek bonusu yok'};
}

const petChoices=PET_CATALOG.map(p=>({name:p.name,value:p.key}));
const reply=(interaction,content)=>interaction.reply({content,flags:MessageFlags.Ephemeral});
export default {
 data:new SlashCommandBuilder().setName('evcilhayvan').setDescription('Evcil hayvan koleksiyonunu, bakımını ve gelişimini yönet.')
  .addSubcommand(s=>s.setName('katalog').setDescription('Evcil hayvan türlerini ve özelliklerini gör.'))
  .addSubcommand(s=>s.setName('koleksiyon').setDescription('Sahip olduğun evcil hayvanları listele.'))
  .addSubcommand(s=>s.setName('edin').setDescription('Altınla yeni bir evcil hayvan edin.').addStringOption(o=>o.setName('tur').setDescription('Evcil hayvan türü').setRequired(true).addChoices(...petChoices)))
  .addSubcommand(s=>s.setName('aktif').setDescription('Koleksiyonundan aktif evcil hayvanı seç.').addStringOption(o=>o.setName('tur').setDescription('Sahip olduğun hayvan').setRequired(true).addChoices(...petChoices)))
  .addSubcommand(s=>s.setName('ad').setDescription('Evcil hayvanına özel bir ad ver.').addStringOption(o=>o.setName('tur').setDescription('Hayvan türü').setRequired(true).addChoices(...petChoices)).addStringOption(o=>o.setName('isim').setDescription('Yeni adı (2-24 karakter)').setRequired(true).setMaxLength(24)))
  .addSubcommand(s=>s.setName('bakim').setDescription('Evcil hayvanını besle, oyna veya eğit.').addStringOption(o=>o.setName('tur').setDescription('Hayvan türü').setRequired(true).addChoices(...petChoices)).addStringOption(o=>o.setName('islem').setDescription('Bakım işlemi').setRequired(true).addChoices({name:'Besle (30 altın)',value:'feed'},{name:'Oyna (ücretsiz)',value:'play'},{name:'Eğit (50 altın)',value:'train'})))
  .addSubcommand(s=>s.setName('destek').setDescription('Evcil hayvanının destek rolünü ve seviyesini önizle.').addStringOption(o=>o.setName('tur').setDescription('Sahip olduğun hayvan').setRequired(true).addChoices(...petChoices))),
 async execute(interaction){
  if(!interaction.guildId)return reply(interaction,'Evcil hayvan sistemi sunucularda kullanılabilir.');
  const base={guildId:interaction.guildId,userId:interaction.user.id},action=interaction.options.getSubcommand();
  if(action==='katalog')return reply(interaction,'**Evcil Hayvan Kataloğu**\n'+PET_CATALOG.map(p=>p.emoji+' **'+p.name+'** — '+p.cost+' altın\n'+p.description+' · '+p.bonus).join('\n'));
  if(action==='koleksiyon'){const pets=await listPets(pool,base);return reply(interaction,pets.length?'**Evcil Hayvan Koleksiyonun**\n'+pets.map(p=>(p.is_active?'[Aktif] ':'')+p.catalog.emoji+' **'+p.nickname+'** — Seviye '+p.level+' · Ruh hâli '+p.mood+'/100 · Bakım serisi '+p.care_streak).join('\n'):'Henüz evcil hayvanın yok. /evcilhayvan edin ile başlayabilirsin.');}
  const petKey=interaction.options.getString('tur');
  if(action==='edin'){const r=await adoptPet(pool,{...base,petKey});const m={adopted:r.pet.emoji+' '+r.pet.name+' koleksiyonuna eklendi. '+(r.isActive?'İlk hayvanın aktif edildi.':'/evcilhayvan aktif ile etkin hayvanını seç.')+' Kalan altın: '+r.balance,already_owned:'Bu türden zaten bir evcil hayvanın var.',collection_full:'Koleksiyon sınırı '+r.limit+' hayvan.',insufficient_funds:'Gerekli altın: '+r.cost,invalid_pet:'Hayvan türü bulunamadı.'};return reply(interaction,m[r.status]||'Evcil hayvan edinilemedi.');}
  if(action==='aktif'){const r=await setActivePet(pool,{...base,petKey});return reply(interaction,r.status==='activated'?'Aktif evcil hayvanın: '+r.pet.nickname+'.':r.status==='not_owned'?'Bu hayvan koleksiyonunda yok.':'Hayvan etkinleştirilemedi.');}
  if(action==='ad'){const r=await renamePet(pool,{...base,petKey,name:interaction.options.getString('isim')});return reply(interaction,r.status==='renamed'?'Yeni evcil hayvan adı: '+r.pet.nickname:r.status==='invalid_name'?'Ad 2-24 karakter olmalı; etiket veya biçimlendirme karakteri kullanma.':'Bu hayvan koleksiyonunda yok.');}
  if(action==='bakim'){const r=await careForPet(pool,{...base,petKey,action:interaction.options.getString('islem')});const m={cared:'Bakım tamamlandı. Seviye '+r.pet.level+' · Ruh hâli '+r.pet.mood+'/100 · Bakım serisi '+r.pet.care_streak+(r.cost?' · Harcanan: '+r.cost+' altın':''),cooldown:'Bu hayvanın tekrar bakım için 20 dakika dinlenmesi gerekiyor.',not_owned:'Bu hayvan koleksiyonunda yok.',insufficient_funds:'Gerekli altın: '+r.cost,invalid_action:'Bakım işlemi geçersiz.'};return reply(interaction,m[r.status]||'Bakım tamamlanamadı.');}
  if(action==='destek'){const r=await getPetSupportPreview(pool,{...base,petKey});return reply(interaction,r.status==='preview'?'**'+r.pet.nickname+'** — Seviye '+r.pet.level+' · '+(PET_CATALOG.find(p=>p.key===petKey)?.bonus||'Destek yok')+'\nNot: Bu, mevcut rol önizlemesidir; savaş/keşif bonusu henüz uygulanmaz.':'Bu hayvan koleksiyonunda yok.');}
  return reply(interaction,'Bilinmeyen işlem.');
 }
};
