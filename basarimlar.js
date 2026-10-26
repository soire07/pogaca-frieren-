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
  data:new SlashCommandBuilder().setName('basarimlar').setDescription('Başarımlarını ve tamamladığın hedefleri göster.')
    .addStringOption(o=>o.setName('odul').setDescription('Tamamladığın başarımın ödülünü al.')
      .addChoices(
        {name:'İlk Keşif',value:'first_draw'},
        {name:'Koleksiyoncu',value:'collector_10'},
        {name:'Arşiv Ustası',value:'collector_25'},
        {name:'Poğaça Zengini',value:'rich_1000'},
        {name:'Yolun Başında',value:'level_5'},
        {name:'Efsane Avcısı',value:'legendary'}
      ).setRequired(false)),
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
      const claimKey=interaction.options.getString('odul');
      if(claimKey){
        const achievement=achievements.find(a=>a.id===claimKey);
        if(!achievement) return interaction.editReply('Bu başarım bulunamadı.');
        if(!achievement.check(stats)) return interaction.editReply('Bu başarımı henüz tamamlamadın.');
        const db=await pool.connect();
        try{
          await db.query('BEGIN');
          const claim=await db.query('INSERT INTO achievement_claims(guild_id,user_id,achievement_key) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING achievement_key',[interaction.guildId,interaction.user.id,achievement.id]);
          if(!claim.rowCount){await db.query('ROLLBACK');return interaction.editReply('Bu başarımın ödülünü daha önce aldın.');}
          await db.query('UPDATE users SET coins=coins+$3 WHERE guild_id=$1 AND user_id=$2',[interaction.guildId,interaction.user.id,achievement.reward]);
          await db.query('COMMIT');
          return interaction.editReply(`🏆 **${achievement.title}** ödülünü aldın: **${achievement.reward} altın**!`);
        }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}finally{db.release();}
      }
      const {rows:claimedRows}=await pool.query('SELECT achievement_key FROM achievement_claims WHERE guild_id=$1 AND user_id=$2',[interaction.guildId,interaction.user.id]);
      const claimed=new Set(claimedRows.map(r=>r.achievement_key));
      const lines=achievements.map(a=>{
        const done=a.check(stats);
        return `${claimed.has(a.id)?'💰 Ödül alındı':done?'✅ Tamamlandı':'🔒'} ${a.emoji} **${a.title}** — ${a.description}\n${claimed.has(a.id)?'Ödül alındı':done?'Ödül hazır: '+a.reward+' altın':'Ödül: '+a.reward+' altın'} · Kod: \`${a.id}\``;
      });
      const completed=achievements.filter(a=>a.check(stats)).length;
      const embed=new EmbedBuilder().setColor(0xb58cff).setTitle('🏅 Başarımlar • '+interaction.user.username)
        .setDescription(lines.join('\n\n'))
        .addFields({name:'İlerleme',value:`${completed}/${achievements.length} başarı`,inline:true},{name:'Farklı karakter',value:String(stats.uniqueCharacters),inline:true},{name:'Toplam kopya',value:String(stats.totalCopies),inline:true})
        .setFooter({text:'Ödül almak için /basarimlar odul:<başarım kodu> kullan.'}).setTimestamp();
      return interaction.editReply({embeds:[embed]});
    } catch(error) {
      console.error('/basarimlar hatası:',error);
      return interaction.editReply('Başarımlar yüklenirken hata oluştu. Daha sonra tekrar dene.');
    }
  }
};
