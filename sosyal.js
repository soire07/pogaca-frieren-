import { MessageFlags,SlashCommandBuilder } from 'discord.js';
import { pool,ensureUser } from './database/db.js';
import { ensureSocialPlatformTables,createFriendRequest,respondFriendRequest,setPlayerRival,removeSocialRelationship,listSocialRelationships,sendCoinGift,commendPlayer,getSocialReputation } from './social-platform.js';
let schemaReady;
async function ready(){if(!schemaReady)schemaReady=ensureSocialPlatformTables(pool).catch(e=>{schemaReady=null;throw e;});await schemaReady;}
const target=o=>o.setName('kullanici').setDescription('Oyuncu').setRequired(true);
const mention=id=>'<@'+String(id).replace(/[^\d]/g,'')+'>';
const reply=(i,c)=>i.reply({content:c,flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}});
async function setup(g,a,b){await ensureUser(g,a);await ensureUser(g,b);}
export default {data:new SlashCommandBuilder().setName('sosyal').setDescription('Arkadaşlık, rakiplik, hediye ve itibar sistemi.')
.addSubcommand(c=>c.setName('arkadas-iste').setDescription('Arkadaşlık isteği gönder.').addUserOption(target))
.addSubcommand(c=>c.setName('arkadas-kabul').setDescription('Arkadaşlık isteğini kabul et.').addStringOption(o=>o.setName('istek').setDescription('İstek UUID').setRequired(true).setMaxLength(36)))
.addSubcommand(c=>c.setName('arkadas-ret').setDescription('Arkadaşlık isteğini reddet.').addStringOption(o=>o.setName('istek').setDescription('İstek UUID').setRequired(true).setMaxLength(36)))
.addSubcommand(c=>c.setName('arkadas-sil').setDescription('Sosyal bağı kaldır.').addUserOption(target))
.addSubcommand(c=>c.setName('arkadaslar').setDescription('Arkadaş listesini göster.'))
.addSubcommand(c=>c.setName('rakip').setDescription('Bir oyuncuyu RPG rakibin yap.').addUserOption(target))
.addSubcommand(c=>c.setName('hediye').setDescription('Altın hediye et.').addUserOption(target).addIntegerOption(o=>o.setName('miktar').setDescription('Altın').setRequired(true).setMinValue(1).setMaxValue(50000)).addStringOption(o=>o.setName('not').setDescription('Kısa not').setMaxLength(100)))
.addSubcommand(c=>c.setName('itibar-ver').setDescription('Haftalık itibar puanını ver.').addUserOption(target))
.addSubcommand(c=>c.setName('itibar-gor').setDescription('İtibar puanını göster.').addUserOption(o=>o.setName('kullanici').setDescription('Oyuncu').setRequired(false))),
async execute(i){if(!i.guildId)return reply(i,'Sosyal sistem yalnızca sunucularda kullanılabilir.');await ready();const action=i.options.getSubcommand(),actor=i.user.id;
if(['arkadas-iste','rakip','arkadas-sil','hediye','itibar-ver'].includes(action)){const other=i.options.getUser('kullanici',true);if(other.bot||other.id===actor)return reply(i,'Kendinle veya botlarla sosyal işlem yapamazsın.');await setup(i.guildId,actor,other.id);
if(action==='arkadas-iste'){const r=await createFriendRequest(pool,{guildId:i.guildId,requesterId:actor,targetId:other.id});const m={sent:'Arkadaşlık isteğin '+mention(other.id)+' kullanıcısına gönderildi. 7 gün geçerli.',already_pending:'Bekleyen isteğin zaten var.',incoming_request:'Bu oyuncudan bekleyen istek var. İstek UUID: '+r.requestId,already_friends:'Bu oyuncu zaten arkadaşın.',rival_exists:'Önce rakiplik bağını kaldır.',player_missing:'Oyuncu kaydı bulunamadı.'};return reply(i,m[r.status]||'İstek oluşturulamadı.');}
if(action==='rakip'){const r=await setPlayerRival(pool,{guildId:i.guildId,actorId:actor,targetId:other.id});const m={rival_created:mention(other.id)+' artık RPG rakibin.',already_rivals:'Zaten rakipsiniz.',already_friends:'Arkadaşını rakip yapamazsın.',player_missing:'Oyuncu kaydı bulunamadı.'};return reply(i,m[r.status]||'Rakip kaydedilemedi.');}
if(action==='arkadas-sil'){const r=await removeSocialRelationship(pool,{guildId:i.guildId,actorId:actor,targetId:other.id});return reply(i,r.status==='removed'?'Sosyal bağ kaldırıldı.':'Kayıtlı sosyal bağın yok.');}
if(action==='hediye'){const r=await sendCoinGift(pool,{guildId:i.guildId,senderId:actor,recipientId:other.id,amount:i.options.getInteger('miktar',true),note:i.options.getString('not')||''});const m={sent:mention(other.id)+' oyuncusuna '+r.amount.toLocaleString('tr-TR')+' altın gönderdin. Kalan bakiye: '+r.senderBalance.toLocaleString('tr-TR')+'.',insufficient_funds:'Yeterli altının yok.',player_missing:'Oyuncu kaydı bulunamadı.'};return reply(i,m[r.status]||'Hediye gönderilemedi.');}
const r=await commendPlayer(pool,{guildId:i.guildId,giverId:actor,recipientId:other.id});const m={commended:mention(other.id)+' oyuncusuna itibar verdin. Yeni toplam: '+r.points+'. Bu hafta başka itibar puanı veremezsin.',already_voted:'Bu haftaki itibar puanını kullandın.',player_missing:'Oyuncu kaydı bulunamadı.'};return reply(i,m[r.status]||'İtibar verilemedi.');}
if(action==='arkadas-kabul'||action==='arkadas-ret'){const r=await respondFriendRequest(pool,{guildId:i.guildId,requestId:i.options.getString('istek',true),actorId:actor,accept:action==='arkadas-kabul'});const m={accepted:mention(r.otherUserId)+' ile artık arkadaşsınız.',rejected:'İstek reddedildi.',not_recipient:'Bu isteği yalnızca hedef kullanıcı yanıtlayabilir.',request_unavailable:'İstek bulunamadı, süresi doldu veya yanıtlandı.',player_missing:'Oyuncu kaydı bulunamadı.'};return reply(i,m[r.status]||'İstek yanıtlanamadı.');}
if(action==='arkadaslar'){const rows=await listSocialRelationships(pool,i.guildId,actor,'friend',25);return reply(i,'**Arkadaş listen**\n'+(rows.map(r=>'• '+mention(r.user_id)).join('\n')||'Henüz arkadaşın yok.'));}
if(action==='itibar-gor'){const other=i.options.getUser('kullanici')||i.user;await ensureUser(i.guildId,other.id);return reply(i,mention(other.id)+' oyuncusunun itibarı: **'+await getSocialReputation(pool,i.guildId,other.id)+'**.');}
return reply(i,'Bilinmeyen sosyal işlem.');}};
