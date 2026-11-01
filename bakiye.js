import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { pool, ensureUser } from './database/db.js';
export default {
 data:new SlashCommandBuilder().setName('bakiye').setDescription('Poğaça altını bakiyeni göster.')
  .addUserOption(o=>o.setName('kullanici').setDescription('Bakiyesini görmek istediğin kullanıcı').setRequired(false)),
 async execute(interaction){
  if(!interaction.guildId)return interaction.reply({content:'Bu komut yalnızca sunucularda kullanılabilir.',flags: MessageFlags.Ephemeral});
  const target=interaction.options.getUser('kullanici')??interaction.user;
  await ensureUser(interaction.guildId,target.id);
  const result=await pool.query('SELECT coins,xp,level FROM users WHERE guild_id=$1 AND user_id=$2',[interaction.guildId,target.id]);
  const row=result.rows[0];
  const embed=new EmbedBuilder().setColor(0x9b8cff).setTitle('🥐 '+target.username+' • Cüzdan')
   .addFields(
    {name:'🪙 Poğaça altını',value:'**'+Number(row.coins).toLocaleString('tr-TR')+'**',inline:true},
    {name:'✨ Seviye',value:'**'+row.level+'**',inline:true},
    {name:'📚 XP',value:'**'+Number(row.xp).toLocaleString('tr-TR')+'**',inline:true}
   ).setFooter({text:'Altın kazanmak için /gunlukodul kullan.'}).setTimestamp();
  return interaction.reply({embeds:[embed]});
 }
};
