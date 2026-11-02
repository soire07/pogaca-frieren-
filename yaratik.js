import { SlashCommandBuilder,EmbedBuilder,MessageFlags } from 'discord.js';
import { pool } from './database/db.js';
import { getCreatureCollection,initCreatureSchema } from './creatures.js';
let schemaReady;
async function ensureSchema(){if(!schemaReady)schemaReady=initCreatureSchema(pool).catch(error=>{schemaReady=null;throw error;});await schemaReady;}
export default{
 data:new SlashCommandBuilder().setName('yaratik').setDescription('Frieren evreninde yakaladığın büyülü yaratıkları görüntüle.')
 .addSubcommand(s=>s.setName('defter').setDescription('Yaratık koleksiyonunu ve tamamlanma durumunu göster.')),
 async execute(interaction){
  if(!interaction.guildId)return interaction.reply({content:'Yaratık arşivi yalnızca sunucularda kullanılabilir.',flags:MessageFlags.Ephemeral});
  await interaction.deferReply({flags:MessageFlags.Ephemeral});
  try{
   await ensureSchema();const book=await getCreatureCollection(pool,interaction.guildId,interaction.user.id);
   const lines=book.entries.map(row=>(row.creature?.emoji||'✨')+' **'+(row.creature?.name||row.creature_key)+'** × '+row.quantity+' · '+(row.creature?.rarity||'Bilinmiyor'));
   const embed=new EmbedBuilder().setColor(0x9a8bd2).setTitle('📚 Frieren Yaratık Arşivi')
    .setDescription(lines.join('\n')||'Henüz bir yaratık yakalamadın. Sohbet akışında beliren yaratıkları ilk yakalayan sen ol.')
    .setFooter({text:book.unique+'/'+5+' tür · toplam '+book.total+' yakalama'});
   return interaction.editReply({embeds:[embed]});
  }catch(error){console.error('Yaratık defteri açılamadı:',error?.message||error);return interaction.editReply({content:'Yaratık arşivi şu anda kullanılamıyor.'});}
 }
};
