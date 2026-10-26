import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { pool, ensureUser } from './database/db.js';

const achievements = [
  { id:'first_draw', title:'İlk Keşif', emoji:'🎴', description:'İlk anime karakterini keşfet', check:s=>s.uniqueCharacters>=1, reward:50 },
  { id:'collector_10', title:'Koleksiyoncu', emoji:'📚', description:'10 farklı karakter topla', check:s=>s.uniqueCharacters>=10, reward:150 },
  { id:'collector_25', title:'Arşiv Ustası', emoji:'🗃️', description:'25 farklı karakter topla', check:s=>s.uniqueCharacters>=25, reward:350 },
  { id:'rich_1000', title:'Poğaça Zengini', emoji:'🥐', description:'Cüzdanında 1.000 altın bulundur', check:s=>s.coins>=1000, reward:100 },
  { id:'level_5', title:'Yolun Başında', emoji:'🧙', description:'5. seviyeye ulaş', check:s=>s.level>=5, reward:200 },
  { id:'legendary', title:'Efsane Avcısı', emoji:'🌟', description:'En az bir Efsanevi karakter bulundur', check:s=>s.legendary>=1, reward:500 }
];

export default {
  data:new SlashCommandBuilder().setName('basarimlar').setDescription('Başarımlarını ve tamamladığın hedefleri göster.'),
  async execute(interaction) {
    if (!interaction.guildId) return interaction.reply({content:'Bu komut yalnızca sunucularda kullanılabilir.',ephemeral:true});
    await interaction.deferReply({ephemeral:true});
    try {
      await ensureUser(interaction.guildId,interaction.user.id);
      const [{rows:[u]}, {rows:[c]}] = await Promise.all([
        pool.query('SELECT coins,level,xp FROM users WHERE guild_id=$1 AND user_id=$2',[interaction.guildId,interaction.user.id]),
        pool.query(`SELECT COUNT(*)::int AS unique_count,
          COALESCE(SUM(quantity),0)::int AS total_copies,
          COUNT(*) FILTER (WHERE rarity='Efsanevi')::int AS legendary
          FROM anime_character_collection WHERE guild_id=$1 AND user_id=$2`,[interaction.guildId,interaction.user.id])
      ]);
      const stats={coins:Number(u?.coins||0),level:Number(u?.level||1),xp:Number(u?.xp||0),uniqueCharacters:Number(c?.unique_count||0),totalCopies:Number(c?.total_copies||0),legendary:Number(c?.legendary||0)};
      const lines=achievements.map(a=>{
        const done=a.check(stats);
        return `${done?'✅':'🔒'} ${a.emoji} **${a.title}** — ${a.description}\n${done?'Tamamlandı':'Ödül: '+a.reward+' altın'}`;
      });
      const completed=achievements.filter(a=>a.check(stats)).length;
      const embed=new EmbedBuilder().setColor(0xb58cff).setTitle('🏅 Başarımlar • '+interaction.user.username)
        .setDescription(lines.join('\n\n'))
        .addFields({name:'İlerleme',value:`${completed}/${achievements.length} başarı`,inline:true},{name:'Farklı karakter',value:String(stats.uniqueCharacters),inline:true},{name:'Toplam kopya',value:String(stats.totalCopies),inline:true})
        .setFooter({text:'Başarımlar şu an görüntülenir; ödüller otomatik yatırılmaz.'}).setTimestamp();
      return interaction.editReply({embeds:[embed]});
    } catch(error) {
      console.error('/basarimlar hatası:',error);
      return interaction.editReply('Başarımlar yüklenirken hata oluştu. Daha sonra tekrar dene.');
    }
  }
};
