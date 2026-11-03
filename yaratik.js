import { SlashCommandBuilder,EmbedBuilder,MessageFlags } from 'discord.js';
import { pool } from './database/db.js';
import { CREATURE_CATALOG,getCreatureCollection,getCreatureWishlist,initCreatureSchema,setCreatureWishlist } from './creatures.js';
let schemaReady;
async function ensureSchema(){if(!schemaReady)schemaReady=initCreatureSchema(pool).catch(error=>{schemaReady=null;throw error;});await schemaReady;}
const creatureChoices=CREATURE_CATALOG.map(item=>({name:item.name,value:item.key}));
const rarityChoices=['Yaygın','Nadir','Destansı','Efsanevi'].map(value=>({name:value,value}));
export default{
 data:new SlashCommandBuilder().setName('yaratik').setDescription('Frieren evreninde büyülü yaratık topla ve istek listeni yönet.')
 .addSubcommand(s=>s.setName('defter').setDescription('Yaratık koleksiyonunu filtrele ve görüntüle.')
  .addStringOption(o=>o.setName('nadirlik').setDescription('Nadirliğe göre filtrele.').addChoices(...rarityChoices))
  .addStringOption(o=>o.setName('ara').setDescription('Yaratık adına göre ara.').setMaxLength(50)))
 .addSubcommand(s=>s.setName('istek-ekle').setDescription('Bir yaratık için doğma bildirimi iste.').addStringOption(o=>o.setName('yaratik').setDescription('Takip edeceğin yaratık.').setRequired(true).addChoices(...creatureChoices)))
 .addSubcommand(s=>s.setName('istek-sil').setDescription('Yaratık doğma bildirimini kapat.').addStringOption(o=>o.setName('yaratik').setDescription('Takipten çıkaracağın yaratık.').setRequired(true).addChoices(...creatureChoices)))
 .addSubcommand(s=>s.setName('istekler').setDescription('Takip ettiğin yaratıkları görüntüle.')),
 async execute(interaction){
  if(!interaction.guildId)return interaction.reply({content:'Yaratık arşivi yalnızca sunucularda kullanılabilir.',flags:MessageFlags.Ephemeral});
  await interaction.deferReply({flags:MessageFlags.Ephemeral});
  try{
   await ensureSchema();const input={guildId:interaction.guildId,userId:interaction.user.id},action=interaction.options.getSubcommand();
   if(action==='istek-ekle'||action==='istek-sil'){
    const result=await setCreatureWishlist(pool,{...input,creatureKey:interaction.options.getString('yaratik',true),enabled:action==='istek-ekle'});
    const messages={added:'Yaratık istek listene eklendi. Doğduğunda haber verilecek.',already_listed:'Bu yaratık zaten istek listende.',removed:'Yaratık istek listesinden çıkarıldı.',not_listed:'Bu yaratık zaten takip edilmiyor.'};
    return interaction.editReply({content:messages[result.status]||'İstek listesi güncellenemedi.'});
   }
   if(action==='istekler'){
    const list=await getCreatureWishlist(pool,input.guildId,input.userId);
    return interaction.editReply({embeds:[new EmbedBuilder().setColor(0x9a8bd2).setTitle('🔔 Yaratık Doğma Bildirimleri').setDescription(list.map(item=>item.emoji+' **'+item.name+'** · '+item.rarity).join('\n')||'Henüz takip ettiğin yaratık yok.')]});
   }
   const book=await getCreatureCollection(pool,input.guildId,input.userId,{rarity:interaction.options.getString('nadirlik'),query:interaction.options.getString('ara')||''});
   const lines=book.entries.map(row=>(row.creature?.variant==='shiny'?'✨ ':'')+(row.creature?.emoji||'✨')+' **'+(row.creature?.name||row.creature_key)+'** × '+row.quantity+' · '+(row.creature?.rarity||'Bilinmiyor')+(row.creature?.variant==='shiny'?' · Parlak':''));
   const embed=new EmbedBuilder().setColor(0x9a8bd2).setTitle('📚 Frieren Yaratık Arşivi')
    .setDescription(lines.join('\n')||'Bu filtreyle eşleşen yaratık bulunamadı. Sohbet akışında beliren yaratıkları ilk yakalayan sen ol.')
    .setFooter({text:book.unique+'/'+book.totalSpecies+' varyant · '+book.filteredCount+' sonuç · toplam '+book.total+' yakalama'});
   return interaction.editReply({embeds:[embed]});
  }catch(error){console.error('Yaratık defteri açılamadı:',error?.message||error);return interaction.editReply({content:'Yaratık arşivi şu anda kullanılamıyor.'});}
 }
};
