import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { pool } from './database/db.js';
import { HOME_ROOMS, HOME_DECORATIONS, PLAYER_COSMETICS, getPlayerHome, unlockHomeRoom, saveHomeLayout, purchaseCosmetic, equipCosmetic, saveCosmeticPreset, applyCosmeticPreset, getHomeTrophies, placeHomeTrophy, claimEventMilestone } from './player-experience.js';

const rooms=HOME_ROOMS.map(x=>({name:x.name,value:x.key}));
const cosmetics=PLAYER_COSMETICS.map(x=>({name:x.name,value:x.key}));
const reply=(i,content)=>i.reply({content,flags:MessageFlags.Ephemeral});
export default {
 data:new SlashCommandBuilder().setName('yasam').setDescription('Kişisel ev, kozmetik ve etkinlik ödülleri.')
 .addSubcommand(s=>s.setName('ev').setDescription('Evini ve odalarını görüntüle.'))
 .addSubcommand(s=>s.setName('dekorasyonlar').setDescription('Kullanılabilir ev dekorasyonlarını listele.'))
 .addSubcommand(s=>s.setName('kupalar').setDescription('Kazandığın başarımları ve sergilenen kupaları gör.'))
 .addSubcommand(s=>s.setName('kupa-yerlestir').setDescription('Kazandığın kupayı Zafer Salonunda sergile.').addStringOption(o=>o.setName('basarim').setDescription('Başarım anahtarı').setRequired(true).setMaxLength(80)).addIntegerOption(o=>o.setName('konum').setDescription('Vitrin konumu (0-5)').setRequired(true).setMinValue(0).setMaxValue(5)))
 .addSubcommand(s=>s.setName('oda-ac').setDescription('Yeni oda aç.').addStringOption(o=>o.setName('oda').setDescription('Oda').setRequired(true).addChoices(...rooms)))
 .addSubcommand(s=>s.setName('duzenle').setDescription('Ev yerleşimini JSON olarak kaydet.').addStringOption(o=>o.setName('json').setDescription('Oda/dekorasyon/konum listesi').setRequired(true).setMaxLength(1500)).addStringOption(o=>o.setName('aktif_oda').setDescription('Aktif oda').addChoices(...rooms)))
 .addSubcommand(s=>s.setName('kozmetik').setDescription('Kozmetik kataloğunu görüntüle.'))
 .addSubcommand(s=>s.setName('kozmetik-al').setDescription('Kozmetik satın al.').addStringOption(o=>o.setName('esya').setDescription('Kozmetik').setRequired(true).addChoices(...cosmetics)))
 .addSubcommand(s=>s.setName('kozmetik-kus').setDescription('Sahip olduğun kozmetiği kuşan.').addStringOption(o=>o.setName('esya').setDescription('Kozmetik').setRequired(true).addChoices(...cosmetics)))
 .addSubcommand(s=>s.setName('preset').setDescription('Mevcut kozmetik görünümünü kaydet.').addStringOption(o=>o.setName('ad').setDescription('Preset adı').setRequired(true).setMaxLength(32)))
 .addSubcommand(s=>s.setName('preset-yukle').setDescription('Kaydedilmiş kozmetik görünümünü uygula.').addStringOption(o=>o.setName('ad').setDescription('Preset adı').setRequired(true).setMaxLength(32)))
 .addSubcommand(s=>s.setName('etkinlik-odul').setDescription('Bitmiş etkinlik katılım ödülünü al.').addStringOption(o=>o.setName('id').setDescription('Etkinlik UUID').setRequired(true)).addStringOption(o=>o.setName('hedef').setDescription('Ödül aşaması').setRequired(true).addChoices({name:'Katılımcı',value:'participant'},{name:'Yoklama',value:'checkin'}))),
 async execute(i){
  if(!i.guildId)return reply(i,'Bu özellik sunucularda kullanılabilir.');
  const base={guildId:i.guildId,userId:i.user.id},action=i.options.getSubcommand();
  if(action==='ev'){const d=await getPlayerHome(pool,base);return reply(i,'**Kişisel Evim**\nAktif oda: '+(HOME_ROOMS.find(x=>x.key===d.home.active_room)?.name||'Gezgin Odası')+'\nAçık odalar: '+d.rooms.map(x=>HOME_ROOMS.find(r=>r.key===x.room_key)?.name||x.room_key).join(', ')+'\nDekorasyon: '+(d.home.layout?.length||0)+' öğe');}
  if(action==='dekorasyonlar')return reply(i,'**Ev Dekorasyonları**\n'+HOME_DECORATIONS.map(x=>'• '+x).join('\n'));
  if(action==='kupalar'){const rows=await getHomeTrophies(pool,base);return reply(i,rows.length?'**Kazanılmış Kupalar**\n'+rows.map(x=>'• '+x.achievement_key+(x.display_slot===null?'':' · Vitrin '+x.display_slot)).join('\n'):'Henüz kazanılmış başarımın yok.');}
  if(action==='kupa-yerlestir'){const r=await placeHomeTrophy(pool,{...base,achievementKey:i.options.getString('basarim'),displaySlot:i.options.getInteger('konum')});return reply(i,r.status==='placed'?'Kupa Zafer Salonuna yerleştirildi.':r.status==='room_locked'?'Önce Zafer Salonunu açmalısın.':r.status==='trophy_missing'?'Bu başarıma sahip değilsin.':'Kupa veya konum geçersiz.');}
  if(action==='oda-ac'){const r=await unlockHomeRoom(pool,{...base,roomKey:i.options.getString('oda')});const m={unlocked:'Oda açıldı: '+r.room.name+'. Kalan altın: '+r.balance,already_unlocked:'Bu oda zaten açık.',level_locked:'Gereken seviye: '+r.requiredLevel,insufficient_funds:'Gerekli altın: '+r.cost,invalid_room:'Oda bulunamadı.'};return reply(i,m[r.status]||'Oda açılamadı.');}
  if(action==='duzenle'){let layout;try{layout=JSON.parse(i.options.getString('json'));}catch{return reply(i,'Yerleşim geçerli JSON olmalı.');}const r=await saveHomeLayout(pool,{...base,layout,activeRoom:i.options.getString('aktif_oda')||'starter'});return reply(i,r.status==='saved'?'Ev yerleşimi kaydedildi.':'Yerleşimde kilitli oda var.');}
  if(action==='kozmetik')return reply(i,'**Kozmetik Kataloğu**\n'+PLAYER_COSMETICS.map(x=>'• '+x.name+' — '+x.cost+' altın · Seviye '+x.level).join('\n'));
  if(action==='kozmetik-al'){const r=await purchaseCosmetic(pool,{...base,cosmeticKey:i.options.getString('esya')});const m={purchased:'Satın alındı: '+r.cosmetic.name+'. Kalan altın: '+r.balance,already_owned:'Zaten sahip olduğun bir kozmetik.',level_locked:'Gereken seviye: '+r.requiredLevel,insufficient_funds:'Gerekli altın: '+r.cost};return reply(i,m[r.status]||'Satın alma başarısız.');}
  if(action==='kozmetik-kus'){const r=await equipCosmetic(pool,{...base,cosmeticKey:i.options.getString('esya')});return reply(i,r.status==='equipped'?'Kuşanıldı: '+r.cosmetic.name:r.status==='not_owned'?'Bu kozmetiğe sahip değilsin.':'Kozmetik kuşanılamadı.');}
  if(action==='preset'){const r=await saveCosmeticPreset(pool,{...base,presetName:i.options.getString('ad')});return reply(i,r.status==='saved'?'Görünüm preset olarak kaydedildi: '+r.presetName:'Preset adı geçersiz.');}
  if(action==='preset-yukle'){const r=await applyCosmeticPreset(pool,{...base,presetName:i.options.getString('ad')});return reply(i,r.status==='applied'?'Preset uygulandı. Kuşanılan parça: '+r.count:r.status==='preset_missing'?'Bu isimde preset yok.':r.status==='ownership_missing'?'Preset içindeki bir kozmetik artık hesabında bulunmuyor.':'Preset uygulanamadı.');}
  if(action==='etkinlik-odul'){const r=await claimEventMilestone(pool,{...base,eventId:i.options.getString('id'),rewardKey:i.options.getString('hedef')});const rewardCosmetic=PLAYER_COSMETICS.find(x=>x.key===r.cosmeticKey);const m={claimed:'Ödül alındı: '+r.coins+' altın, '+r.xp+' XP'+(r.cosmeticGranted&&rewardCosmetic?' ve '+rewardCosmetic.name:'')+'.',already_claimed:'Bu ödül daha önce alındı.',milestone_locked:'Katılım hedefi tamamlanmadı: '+r.target,event_not_finished:'Etkinlik henüz bitmedi veya bulunamadı.',invalid_reward:'Etkinlik ID/ödül geçersiz.'};return reply(i,m[r.status]||'Ödül alınamadı.');}
  return reply(i,'Bilinmeyen işlem.');
 }
};
