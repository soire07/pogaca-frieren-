import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { pool, ensureUser } from './database/db.js';

const missions = [
  { key:'adventure', title:'Macera tutkunu', description:'Bugün bir maceraya çık', reward:100, sql:`SELECT (last_adventure_at::date = CURRENT_DATE) AS done FROM users WHERE guild_id=$1 AND user_id=$2` },
  { key:'daily', title:'Fırın ziyareti', description:'Günlük ödülünü al', reward:75, sql:`SELECT (last_daily_at::date = CURRENT_DATE) AS done FROM users WHERE guild_id=$1 AND user_id=$2` },
  { key:'draw', title:'Karakter avcısı', description:'Bugün ücretsiz karakter çek', reward:125, sql:`SELECT (last_free_character_at::date = CURRENT_DATE) AS done FROM users WHERE guild_id=$1 AND user_id=$2` },
  { key:'explore', title:'Kuzeyin iz sürücüsü', description:'/kesif ile bugün bir keşif tamamla', reward:90, sql:`SELECT (last_exploration_at::date = CURRENT_DATE) AS done FROM users WHERE guild_id=$1 AND user_id=$2` },
  { key:'item', title:'Hazırlıklı maceracı', description:'Envanterinden bugün bir eşya kullan', reward:80, sql:`SELECT (last_item_used_at::date = CURRENT_DATE) AS done FROM users WHERE guild_id=$1 AND user_id=$2` }
];

const classMissions = [
  { key:'class_buyucu', className:'Büyücü', title:'Mana araştırmacısı', description:'Büyücü olarak bugün /buyupratik ile bir büyü çalış', reward:140,
    sql:`SELECT (u.class_name='Büyücü' AND EXISTS (SELECT 1 FROM spell_mastery sm WHERE sm.guild_id=u.guild_id AND sm.user_id=u.user_id AND sm.updated_at::date=CURRENT_DATE)) AS done FROM users u WHERE u.guild_id=$1 AND u.user_id=$2` },
  { key:'class_muhafiz', className:'Muhafız', title:'Ön safta nöbet', description:'Muhafız olarak bugün bir iblisle yüzleş', reward:130,
    sql:`SELECT (u.class_name='Muhafız' AND u.last_boss_at::date=CURRENT_DATE) AS done FROM users u WHERE u.guild_id=$1 AND u.user_id=$2` },
  { key:'class_sifaci', className:'Şifacı', title:'Hazırlıklı şifacı', description:'Şifacı olarak bugün envanterinden bir eşya kullan', reward:120,
    sql:`SELECT (u.class_name='Şifacı' AND u.last_item_used_at::date=CURRENT_DATE) AS done FROM users u WHERE u.guild_id=$1 AND u.user_id=$2` },
  { key:'class_gezgin', className:'Gezgin', title:'Yolun çağrısı', description:'Gezgin olarak bugün bir keşif tamamla', reward:110,
    sql:`SELECT (u.class_name='Gezgin' AND u.last_exploration_at::date=CURRENT_DATE) AS done FROM users u WHERE u.guild_id=$1 AND u.user_id=$2` }
];
const allMissions = [...missions, ...classMissions];

export default {
 data:new SlashCommandBuilder().setName('gunlukgorev').setDescription('Günlük ve sınıfına özel görevlerini kontrol et; ödüllerini al.')
   .addStringOption(o=>o.setName('odul').setDescription('Tamamlanan görevin ödülünü almak için görev kodunu seç.').addChoices(
    {name:'Macera tutkunu',value:'adventure'},{name:'Fırın ziyareti',value:'daily'},{name:'Karakter avcısı',value:'draw'},{name:'Kuzeyin iz sürücüsü',value:'explore'},{name:'Hazırlıklı maceracı',value:'item'},
    {name:'Büyücü: Mana araştırmacısı',value:'class_buyucu'},{name:'Muhafız: Ön safta nöbet',value:'class_muhafiz'},{name:'Şifacı: Hazırlıklı şifacı',value:'class_sifaci'},{name:'Gezgin: Yolun çağrısı',value:'class_gezgin'}
   ).setRequired(false)),
 async execute(interaction) {
  if(!interaction.guildId) return interaction.reply({content:'Bu komut yalnızca sunucularda kullanılabilir.',ephemeral:true});
  await interaction.deferReply({ephemeral:true});
  try {
   await ensureUser(interaction.guildId,interaction.user.id);
   const claimKey=interaction.options.getString('odul');
   if(claimKey) {
    const mission=allMissions.find(m=>m.key===claimKey);
    if(!mission) return interaction.editReply('Bu görev kodu geçerli değil.');
    const db=await pool.connect();
    try {
     await db.query('BEGIN');
     const user=await db.query('SELECT class_name FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE',[interaction.guildId,interaction.user.id]);
     if(mission.className && user.rows[0]?.class_name!==mission.className) {
      await db.query('ROLLBACK');
      return interaction.editReply(`Bu görev yalnızca **${mission.className}** sınıfına açık. Sınıfın: **${user.rows[0]?.class_name || 'Bilinmiyor'}**.`);
     }
     if(mission.className) {
      const priorClassClaim=await db.query(`SELECT 1 FROM daily_mission_claims WHERE guild_id=$1 AND user_id=$2 AND mission_date=CURRENT_DATE AND mission_key LIKE 'class_%' LIMIT 1`,[interaction.guildId,interaction.user.id]);
      if(priorClassClaim.rowCount) {
       await db.query('ROLLBACK');
       return interaction.editReply('Bugün sınıfına özel görev ödülünü zaten aldın. Yarın yeni sınıf görevin açılacak.');
      }
     }
     const progress=await db.query(mission.sql,[interaction.guildId,interaction.user.id]);
     if(!progress.rows[0]?.done){await db.query('ROLLBACK');return interaction.editReply('Bu görevi henüz tamamlamadın. Önce açıklamadaki işlemi yap.');}
     const claim=await db.query(`INSERT INTO daily_mission_claims(guild_id,user_id,mission_date,mission_key)
      VALUES($1,$2,CURRENT_DATE,$3) ON CONFLICT DO NOTHING RETURNING mission_key`,[interaction.guildId,interaction.user.id,mission.key]);
     if(!claim.rowCount){await db.query('ROLLBACK');return interaction.editReply('Bu görevin ödülünü bugün zaten aldın.');}
     await db.query('UPDATE users SET coins=coins+$3 WHERE guild_id=$1 AND user_id=$2',[interaction.guildId,interaction.user.id,mission.reward]);
     await db.query('COMMIT');
     return interaction.editReply(`🎉 **${mission.title}** görevinin ödülü: **${mission.reward} altın**!`);
    } catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;} finally{db.release();}
   }
   const [claimed,userResult]=await Promise.all([
    pool.query('SELECT mission_key FROM daily_mission_claims WHERE guild_id=$1 AND user_id=$2 AND mission_date=CURRENT_DATE',[interaction.guildId,interaction.user.id]),
    pool.query('SELECT class_name FROM users WHERE guild_id=$1 AND user_id=$2',[interaction.guildId,interaction.user.id])
   ]);
   const className=userResult.rows[0]?.class_name || 'Gezgin';
   const claimedKeys=new Set(claimed.rows.map(r=>r.mission_key));
   const availableMissions=[...missions,...classMissions.filter(m=>m.className===className)];
   const lines=[];
   for(const m of availableMissions){
    const p=await pool.query(m.sql,[interaction.guildId,interaction.user.id]);
    const done=Boolean(p.rows[0]?.done);
    lines.push(`${claimedKeys.has(m.key)?'✅ Ödül alındı':done?'🟢 Tamamlandı':'🔒 Bekliyor'} **${m.title}** — ${m.description}\nÖdül: ${m.reward} altın · Kod: \`${m.key}\``);
   }
   const embed=new EmbedBuilder().setColor(0xb58cff).setTitle('📜 Günlük Görevler')
    .setDescription(lines.join('\n\n'))
    .setFooter({text:`Sınıfın: ${className} · Sınıfa özel görev ödülü günde bir kez alınabilir.`});
   return interaction.editReply({embeds:[embed]});
  } catch(error){console.error('/gunlukgorev hatası:',error);return interaction.editReply('Görevler yüklenemedi. Daha sonra tekrar dene.');}
 }
};
