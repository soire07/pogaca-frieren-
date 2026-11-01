import { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { pool, ensureUser } from './database/db.js';
import { equipmentItems, formatEquipmentBonus } from './equipment-data.js';

export const marketItems = [
 { id:'frieren_staff', name:'🪄 Frieren’in Asası', price:900, category:'Büyülü Eşyalar', rarity:'Efsanevi', description:'Bin yıllık büyü bilgisini temsil eden koleksiyonluk asa.', emoji:'🪄' },
 { id:'mana_crystal', name:'💎 Mana Kristali', price:500, category:'Büyülü Eşyalar', rarity:'Destansı', description:'Saf mana ile parlayan gizemli bir kristal.', emoji:'💎' },
 { id:'grimoire', name:'📖 Yasak Büyü Kitabı', price:750, category:'Büyülü Eşyalar', rarity:'Efsanevi', description:'Sayfalarında unutulmuş büyüler saklı.', emoji:'📖' },
 { id:'mimic_chest', name:'📦 Mimic Sandığı', price:350, category:'Büyülü Eşyalar', rarity:'Nadir', description:'İçinden ne çıkacağı belli olmayan şüpheli sandık.', emoji:'📦' },
 { id:'fern_ribbon', name:'🎀 Fern’in Kurdelası', price:420, category:'Anime Hatıraları', rarity:'Destansı', description:'Fern’den ilham alan zarif bir hatıra eşyası.', emoji:'🎀' },
 { id:'himmel_flower', name:'🌼 Himmel’in Mavi Çiçeği', price:600, category:'Anime Hatıraları', rarity:'Efsanevi', description:'Kahraman Himmel’i hatırlatan özel bir çiçek.', emoji:'🌼' },
 { id:'goku_orb', name:'🔴 Dört Yıldızlı Ejder Topu', price:650, category:'Anime Hatıraları', rarity:'Efsanevi', description:'Ejderha efsanesinden esinlenen parlak bir hatıra.', emoji:'🔴' },
 { id:'ninja_scroll', name:'📜 Gizli Ninja Parşömeni', price:280, category:'Anime Hatıraları', rarity:'Nadir', description:'Azim ve ninja ruhunu simgeleyen parşömen.', emoji:'📜' },
 { id:'cursed_charm', name:'🧿 Lanetli Muska', price:380, category:'Koleksiyon Eşyaları', rarity:'Destansı', description:'Jujutsu dünyasından esinlenen gizemli muska.', emoji:'🧿' },
 { id:'breathing_mask', name:'🌊 Su Nefesi Tılsımı', price:320, category:'Koleksiyon Eşyaları', rarity:'Nadir', description:'Sakinlik ve odaklanmayı simgeleyen tılsım.', emoji:'🌊' },
 { id:'survey_badge', name:'🪽 Keşif Birliği Rozeti', price:450, category:'Anime Hatıraları', rarity:'Destansı', description:'Cesur keşif askerlerine adanmış rozet.', emoji:'🪽' },
 { id:'lucky_charm', name:'🍀 Şans Tılsımı', price:250, category:'Büyülü Eşyalar', rarity:'Nadir', description:'Koleksiyonunda saklayabileceğin şanslı tılsım.', emoji:'🍀' },
 { id:'frieren_tea', name:'🍵 Frieren Çayı', price:120, category:'Koleksiyon Eşyaları', rarity:'Yaygın', description:'Uzun yolculuklar için sıcak, huzurlu bir çay.', emoji:'🍵' },
 { id:'poagaca_box', name:'🥐 Büyülü Poğaça Kutusu', price:180, category:'Koleksiyon Eşyaları', rarity:'Yaygın', description:'Poğaça Frieren marketinin imza kutusu.', emoji:'🥐' },
 { id:'star_potion', name:'🌠 Yıldız İksiri', price:800, category:'Koleksiyon Eşyaları', rarity:'Efsanevi', description:'Yıldız ışığıyla parlayan sınırlı temalı hatıra.', emoji:'🌠' },
 { id:'healing_potion', name:'🧪 Şifa İksiri', price:220, category:'Koleksiyon Eşyaları', rarity:'Yaygın', description:'Kullanıldığında 60 HP ve 25 Mana yeniler. /esyakullan ile kullanabilirsin.', emoji:'🧪' },
  ...equipmentItems.map(item => ({
    ...item,
    category: 'Ekipman',
    itemType: 'equipment',
    emoji: item.name.split(' ')[0],
    description: item.description + ' ' + formatEquipmentBonus(item) + ' · Kullanım seviyesi: ' + item.levelReq + '+.'
  }))
];

const categories = ['Hepsi','Ekipman','Büyülü Eşyalar','Anime Hatıraları','Koleksiyon Eşyaları'];
const rarityEmoji = { Yaygın:'⚪', Nadir:'🔹', Destansı:'🟣', Efsanevi:'🟡' };

export function renderMarketItem(itemId, balance, userId) {
 const item = marketItems.find(x => x.id === itemId);
 if (!item) return null;
 const embed = new EmbedBuilder()
  .setColor(item.rarity === 'Efsanevi' ? 0xffc857 : item.rarity === 'Destansı' ? 0xb58cff : 0x72d6ff)
  .setTitle('✨ EŞYA İNCELEME • '+item.name)
  .setDescription('╭─── ⋆｡°✩°｡⋆ ───╮\n'+item.emoji+' **'+item.name+'**\n╰─── ⋆｡°✩°｡⋆ ───╯\n\n'+item.description+'\n\n'+rarityEmoji[item.rarity]+' **Nadirlik:** '+item.rarity+'\n🗂️ **Kategori:** '+item.category+'\n💰 **Fiyat:** '+item.price.toLocaleString('tr-TR')+' altın\n🪙 **Bakiyen:** '+Number(balance).toLocaleString('tr-TR')+' altın')
  .setFooter({text:'Poğaça Frieren • Büyülü koleksiyon marketi'})
  .setTimestamp();
 const row = new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId('market_buy:'+item.id+':'+userId).setLabel('Satın al • '+item.price+' altın').setEmoji('🛍️').setStyle(ButtonStyle.Success),
  new ButtonBuilder().setCustomId('market_back:'+userId).setLabel('Markete dön').setEmoji('↩️').setStyle(ButtonStyle.Secondary)
 );
 return {embeds:[embed],components:[row]};
}

function panelEmbed(page, category, balance, user) {
 const filtered = marketItems.filter(item => category === 'Hepsi' || item.category === category);
 const pages = Math.max(1, Math.ceil(filtered.length / 4));
 const safePage = Math.min(page, pages - 1);
 const shown = filtered.slice(safePage * 4, safePage * 4 + 4);
 const embed = new EmbedBuilder().setColor(0x9b8cff)
  .setTitle('✨ POĞAÇA FRIEREN • BÜYÜLÜ MARKET')
  .setDescription('Anime evrenlerinden ilham alan özel koleksiyon eşyaları!\nAltındaki butonlarla kategori değiştir, eşyaları incele ve satın al.')
  .addFields({name:'💰 Cüzdanın',value:'**'+Number(balance).toLocaleString('tr-TR')+'** poğaça altını',inline:true},
   {name:'🗂️ Kategori',value:'**'+category+'**',inline:true},
   ...shown.map(item=>({name:item.name+'  •  '+item.price.toLocaleString('tr-TR')+' altın',value:rarityEmoji[item.rarity]+' **'+item.rarity+'**\n'+item.description,inline:false})))
  .setFooter({text:'Sayfa '+(safePage+1)+'/'+pages+' • Satın aldığın eşyalar /envanter içinde görünür.'})
  .setTimestamp();
 return {embed, page:safePage, pages, shown, category};
}

function panelComponents(view, userId) {
 const categoryRow = new ActionRowBuilder().addComponents(categories.map((cat,i)=>
  new ButtonBuilder().setCustomId('market_cat:'+i+':'+userId).setLabel(cat).setStyle(cat===view.category?ButtonStyle.Primary:ButtonStyle.Secondary)));
 const itemRow = new ActionRowBuilder().addComponents(view.shown.map(item=>
  new ButtonBuilder().setCustomId('market_detail:'+item.id+':'+userId).setLabel(item.name.replace(/^[^ ]+ /,'').slice(0,70)).setEmoji(item.emoji).setStyle(ButtonStyle.Primary)));
 const navRow = new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId('market_prev:'+view.page+':'+view.category+':'+userId).setLabel('◀ Önceki').setStyle(ButtonStyle.Secondary).setDisabled(view.page<=0),
  new ButtonBuilder().setCustomId('market_refresh:'+userId).setLabel('💰 Bakiyeyi yenile').setStyle(ButtonStyle.Primary),
  new ButtonBuilder().setCustomId('market_next:'+view.page+':'+view.category+':'+userId).setLabel('Sonraki ▶').setStyle(ButtonStyle.Secondary).setDisabled(view.page>=view.pages-1)
 );
 const inventoryRow = new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId('market_inventory:'+userId).setLabel('Envanterime git').setEmoji('📦').setStyle(ButtonStyle.Success)
 );
 return [categoryRow,itemRow,navRow,inventoryRow];
}

export async function renderMarket(guildId,userId,page=0,category='Hepsi') {
 await ensureUser(guildId,userId);
 const result=await pool.query('SELECT coins FROM users WHERE guild_id=$1 AND user_id=$2',[guildId,userId]);
 const view=panelEmbed(page,category,result.rows[0]?.coins??0,userId);
 return {embeds:[view.embed],components:panelComponents(view,userId)};
}

export async function buyMarketItem(guildId,userId,itemId) {
 const item=marketItems.find(x=>x.id===itemId);
 if(!item) return {ok:false,message:'Bu eşya markette bulunamadı.'};
 if(!Number.isSafeInteger(item.price)||item.price<=0) return {ok:false,message:'Bu eşyanın fiyatı geçersiz; satın alma güvenlik nedeniyle durduruldu.'};
 const db=await pool.connect();
 try {
  await db.query('BEGIN');
  const player=await db.query(
   'SELECT user_id FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE',
   [guildId,userId]
  );
  if(!player.rowCount){
   await db.query('ROLLBACK');
   return {ok:false,message:'RPG profilin bulunamadı. Marketi yeniden açıp tekrar dene.'};
  }
  const charged=await db.query(
   'UPDATE users SET coins=coins-$3 WHERE guild_id=$1 AND user_id=$2 AND coins >= $3 RETURNING coins',
   [guildId,userId,item.price]
  );
  if(!charged.rowCount){await db.query('ROLLBACK');return {ok:false,message:'Yeterli altının yok! **'+item.price+'** altın gerekiyor.'};}
  await db.query('INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,$3,1) ON CONFLICT(guild_id,user_id,item_key) DO UPDATE SET quantity=inventory.quantity+1',[guildId,userId,item.name]);
  await db.query('COMMIT');
  return {ok:true,message:'🛍️ **'+item.name+'** satın alındı! '+item.description+'\n🪙 Ödenen: **'+item.price+'** altın • Kalan: **'+Number(charged.rows[0].coins).toLocaleString('tr-TR')+'** altın'};
 } catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}
 finally{db.release();}
}


export function renderPurchaseResult(itemId, balance, userId) {
 const item = marketItems.find(x => x.id === itemId);
 if (!item) return null;
 const embed = new EmbedBuilder()
  .setColor(0x65d6a6)
  .setTitle('🎉 SATIN ALMA BAŞARILI!')
  .setDescription('✨ ⋆｡°✩°｡⋆ ✨\n\n'+item.emoji+' **'+item.name+'** artık koleksiyonunda!\n\n'+item.description+'\n\n💸 **Harcanan:** '+item.price.toLocaleString('tr-TR')+' altın\n💰 **Kalan bakiye:** '+Number(balance).toLocaleString('tr-TR')+' altın\n📦 Eşyalarını görmek için **/envanter** komutunu kullan.')
  .setFooter({text:'Poğaça Frieren • Güzel koleksiyonlar!'})
  .setTimestamp();
 const row = new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId('market_back:'+userId).setLabel('Markete dön').setEmoji('🛍️').setStyle(ButtonStyle.Primary),
  new ButtonBuilder().setCustomId('market_inventory:'+userId).setLabel('Envanterime git').setEmoji('📦').setStyle(ButtonStyle.Secondary)
 );
 return {embeds:[embed],components:[row]};
}


export async function renderMarketInventory(guildId, userId) {
 const result = await pool.query('SELECT item_key, quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 ORDER BY item_key',[guildId,userId]);
 const gif = new AttachmentBuilder('./envanter.gif');
 const embed = new EmbedBuilder().setColor(0xb58cff).setTitle('📦 KOLEKSİYON ÇANTAN')
  .setDescription(result.rows.length ? result.rows.map(row=>'• **'+row.item_key+'** × '+row.quantity).join('\n') : 'Çantan şimdilik boş. Marketten ilk eşyanı alabilirsin.')
  .setImage('attachment://envanter.gif')
  .setFooter({text:'Poğaça Frieren • Envanter özeti'}).setTimestamp();
 const row = new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId('market_back:'+userId).setLabel('Markete dön').setEmoji('🛍️').setStyle(ButtonStyle.Primary)
 );
 return {embeds:[embed],components:[row],files:[gif],attachments:[]};
}

export default {
 data:new SlashCommandBuilder().setName('market').setDescription('Butonlu, görsel anime temalı eşyalar marketini aç.'),
 async execute(interaction){
  if(!interaction.guildId)return interaction.reply({content:'Bu komut yalnızca sunucularda kullanılabilir.',flags: MessageFlags.Ephemeral});
  const panel=await renderMarket(interaction.guildId,interaction.user.id);
  return interaction.reply({...panel,flags: MessageFlags.Ephemeral});
 }
};
