import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { pool } from './database/db.js';

export default {
  data: new SlashCommandBuilder()
    .setName('koleksiyonliderlik')
    .setDescription('Sunucudaki karakter koleksiyonlarını sıralar.'),
  async execute(interaction) {
    if (!interaction.guildId) {
      return interaction.reply({content:'Bu komut yalnızca sunucularda kullanılabilir.',flags:MessageFlags.Ephemeral});
    }
    await interaction.deferReply();
    try {
      const result=await pool.query(
        `SELECT user_id,COUNT(*)::int AS unique_characters,COALESCE(SUM(quantity),0)::int AS total_copies
         FROM anime_character_collection WHERE guild_id=$1
         GROUP BY user_id
         ORDER BY unique_characters DESC,total_copies DESC,user_id ASC
         LIMIT 10`,
        [interaction.guildId]
      );
      if(!result.rowCount) return interaction.editReply('Bu sunucuda henüz karakter koleksiyonu bulunmuyor.');
      const lines=result.rows.map((row,index)=>
        `${['🥇','🥈','🥉'][index]||'**'+(index+1)+'.**'} <@${row.user_id}> — **${row.unique_characters}** farklı karakter · **${row.total_copies}** toplam kopya`
      );
      const embed=new EmbedBuilder()
        .setColor(0xb58cff)
        .setTitle('🎴 Sunucu Karakter Koleksiyonu')
        .setDescription(lines.join('\n'))
        .setFooter({text:'Sıralama yalnızca bu sunucudaki koleksiyon kayıtlarını kapsar.'})
        .setTimestamp();
      return interaction.editReply({embeds:[embed],allowedMentions:{parse:[]}});
    } catch(error) {
      console.error('/koleksiyonliderlik hatası:',error);
      return interaction.editReply('Karakter koleksiyonu sıralaması yüklenemedi. Daha sonra tekrar dene.');
    }
  }
};
