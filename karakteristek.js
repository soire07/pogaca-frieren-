import { SlashCommandBuilder,EmbedBuilder,MessageFlags } from 'discord.js';
import { pool } from './database/db.js';
import { getCharacterWishlist,initCharacterWishlistSchema,searchCharacterChoices,setCharacterWishlist } from './character-wishlist.js';
let schemaReady;
async function ensureSchema(){if(!schemaReady)schemaReady=initCharacterWishlistSchema(pool).catch(error=>{schemaReady=null;throw error;});await schemaReady;}
export default{
 data:new SlashCommandBuilder().setName('karakteristek').setDescription('Anime karakterlerini istek listene ekle ve hedeflerini takip et.')
 .addSubcommand(s=>s.setName('ekle').setDescription('Bir karakteri istek listene ekle.').addStringOption(o=>o.setName('karakter').setDescription('Takip edeceğin karakter.').setRequired(true).setAutocomplete(true)))
 .addSubcommand(s=>s.setName('sil').setDescription('Bir karakteri istek listesinden çıkar.').addStringOption(o=>o.setName('karakter').setDescription('Listeden çıkaracağın karakter.').setRequired(true).setAutocomplete(true)))
 .addSubcommand(s=>s.setName('liste').setDescription('İstek listeni görüntüle.')),
 async autocomplete(interaction){
  const query=interaction.options.getFocused();
  return interaction.respond(searchCharacterChoices(query));
 },
 async execute(interaction){
  if(!interaction.guildId)return interaction.reply({content:'Karakter istek listesi yalnızca sunucularda kullanılabilir.',flags:MessageFlags.Ephemeral});
  await interaction.deferReply({flags:MessageFlags.Ephemeral});
  try{
   await ensureSchema();const input={guildId:interaction.guildId,userId:interaction.user.id},action=interaction.options.getSubcommand();
   if(action==='ekle'||action==='sil'){
    const result=await setCharacterWishlist(pool,{...input,characterName:interaction.options.getString('karakter',true),enabled:action==='ekle'});
    const messages={added:'Karakter istek listene eklendi.',already_listed:'Bu karakter zaten listende.',removed:'Karakter istek listesinden çıkarıldı.',not_listed:'Bu karakter zaten listende değil.',limit_reached:'İstek listende en fazla '+result.limit+' karakter olabilir.'};
    return interaction.editReply({content:messages[result.status]||'İstek listesi güncellenemedi.'});
   }
   const list=await getCharacterWishlist(pool,input.guildId,input.userId);
   const embed=new EmbedBuilder().setColor(0x9b8cff).setTitle('💫 Karakter İstek Listen')
    .setDescription(list.map(row=>(row.character?.emoji||'🎴')+' **'+row.character_name+'** · '+(row.character?.rarity||'Bilinmiyor')).join('\n')||'Henüz istek listene karakter eklemedin.')
    .setFooter({text:list.length+'/10 hedef'});
   return interaction.editReply({embeds:[embed]});
  }catch(error){console.error('Karakter istek listesi hatası:',error?.message||error);return interaction.editReply({content:'Karakter istek listesi şu anda kullanılamıyor.'});}
 }
};
