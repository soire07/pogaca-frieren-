import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { pool, ensureUser } from './database/db.js';

const missions = [
  { key:'adventure', title:'Macera tutkunu', description:'Bugün bir maceraya çık', reward:100, sql:`SELECT (last_adventure_at::date = CURRENT_DATE) AS done FROM users WHERE guild_id=$1 AND user_id=$2` },
  { key:'daily', title:'Fırın ziyareti', description:'Günlük ödülünü al', reward:75, sql:`SELECT (last_daily_at::date = CURRENT_DATE) AS done FROM users WHERE guild_id=$1 AND user_id=$2` },
  { key:'draw', title:'Karakter avcısı', description:'Bugün ücretsiz karakter çek', reward:125, sql:`SELECT (last_free_character_at::date = CURRENT_DATE) AS done FROM users WHERE guild_id=$1 AND user_id=$2` },
  { key:'explore', title:'Kuzeyin iz sürücüsü', description:'/kesif ile bugün bir keşif tamamla', reward:90, sql:`SELECT (last_exploration_at::date = CURRENT_DATE) AS done FROM users WHERE guild_id=$1 AND user_id=$2` },
  { key:'item', title:'Hazırlıklı maceracı', description:'Envanterinden bugün bir eşya kullan', reward:80, sql:`SELECT (last_item_used_at::date = CURRENT_DATE) AS done FROM users WHERE guild_id=$1 AND user_id=$2` }
];

export default {
 data:new SlashCommandBuilder().setName('gunlukgorev').setDescription('Günlük görevlerini kontrol et ve tamamladıklarının ödülünü al.')
   .addStringOption(o=>o.setName('odul').setDescription('Tamamlanan görevin ödülünü almak için görev kodunu seç.').addChoices(
    {name:'Macera tutkunu',value:'adventure'},{name:'Fırın ziyareti',value:'daily'},{name:'Karakter avcısı',value:'draw'},{name:'Kuzeyin iz sürücüsü',value:'explore'},{name:'Hazırlıklı maceracı',value:'item'}).setRequired(false)),
 async execute(interaction) {
  if(!interaction.guildId) return interaction.reply({content:'Bu komut yalnızca sunucularda kullanılabilir.',ephemeral:true});
  await interaction.deferReply({ephemeral:true});
  try {
   await ensureUser(interaction.guildId,interaction.user.id);
   const claimKey=interaction.options.getString('odul');
   if(claimKey) {
    const mission=missions.find(m=>m.key===claimKey);
    const progress=await pool.query(mission.sql,[interaction.guildId,interaction.user.id]);
    if(!progress.rows[0]?.done) return interaction.editReply('Bu görevi henüz tamamlamadın. Önce açıklamadaki işlemi yap.');
    const db=await pool.connect();
    try {
     await db.query('BEGIN');
     const claim=await db.query(`INSERT INTO daily_mission_claims(guild_id,user_id,mission_date,mission_key)
      VALUES($1,$2,CURRENT_DATE,$3) ON CONFLICT DO NOTHING RETURNING mission_key`,[interaction.guildId,interaction.user.id,mission.key]);
     if(!claim.rowCount){await db.query('ROLLBACK');return interaction.editReply('Bu görevin ödülünü bugün zaten aldın.');}
     await db.query('UPDATE users SET coins=coins+$3 WHERE guild_id=$1 AND user_id=$2',[interaction.guildId,interaction.user.id,mission.reward]);
     await db.query('COMMIT');
     return interaction.editReply(`🎉 **${mission.title}** görevinin ödülü: **${mission.reward} altın**!`);
    } catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;} finally{db.release();}
   }
   const claimed=await pool.query('SELECT mission_key FROM daily_mission_claims WHERE guild_id=$1 AND user_id=$2 AND mission_date=CURRENT_DATE',[interaction.guildId,interaction.user.id]);
   const claimedKeys=new Set(claimed.rows.map(r=>r.mission_key));
   const lines=[];
   for(const m of missions){
    const p=await pool.query(m.sql,[interaction.guildId,interaction.user.id]);
    const done=Boolean(p.rows[0]?.done);
    lines.push(`${claimedKeys.has(m.key)?'✅ Ödül alındı':done?'🟢 Tamamlandı':'🔒 Bekliyor'} **${m.title}** — ${m.description}\nÖdül: ${m.reward} altın · Kod: \` ${m.key} \``.replaceAll('\\`','`'));
   }
   const embed=new EmbedBuilder().setColor(0xb58cff).setTitle('📜 Günlük Görevler').setDescription(lines.join('\n\n')).setFooter({text:'Ödül almak için /gunlukgorev odul:<görev kodu> kullan.'});
   return interaction.editReply({embeds:[embed]});
  } catch(error){console.error('/gunlukgorev hatası:',error);return interaction.editReply('Görevler yüklenemedi. Daha sonra tekrar dene.');}
 }
};
