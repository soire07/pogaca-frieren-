import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { pool } from './database/db.js';
export default {
 data:new SlashCommandBuilder().setName('liderlik').setDescription('Sunucunun poğaça altını sıralamasını göster.'),
 async execute(interaction){
  if(!interaction.guildId)return interaction.reply({content:'Bu komut yalnızca sunucularda kullanılabilir.',flags: MessageFlags.Ephemeral});
  await interaction.deferReply();
  try{
   const result=await pool.query(`
    SELECT user_id,coins,level,xp FROM users WHERE guild_id=$1 AND (coins>0 OR xp>0)
    ORDER BY coins DESC,level DESC,xp DESC LIMIT 10
   `,[interaction.guildId]);
   if(!result.rowCount)return interaction.editReply('Sıralama henüz boş. /gunlukodul ile ilk altınlarını kazan!');
   const lines=await Promise.all(result.rows.map(async(r,i)=>{
    let name='Kullanıcı '+r.user_id.slice(-4);
    try{name=(await interaction.client.users.fetch(r.user_id)).username;}catch{}
    return (['🥇','🥈','🥉'][i]||'**'+(i+1)+'.**')+' **'+name+'** — 🪙 '+Number(r.coins).toLocaleString('tr-TR')+' altın · Seviye '+r.level;
   }));
   const embed=new EmbedBuilder().setColor(0xf0c76a).setTitle('🏆 Poğaça Altını • Liderlik')
    .setDescription(lines.join('\n')).setFooter({text:'Sadece bu sunucunun sıralaması gösterilir.'}).setTimestamp();
   return interaction.editReply({embeds:[embed]});
  }catch(error){console.error('Liderlik hatası:',error);return interaction.editReply('Liderlik tablosu yüklenemedi. Daha sonra tekrar dene.');}
 }
};
