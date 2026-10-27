import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { pool, ensureUser } from './database/db.js';

const spellChoices = [
  { name: 'Zoltraak', value: 'zoltraak' },
  { name: 'Koruyucu Bariyer', value: 'barrier' },
  { name: 'Heilen', value: 'heilen' },
  { name: 'Rüzgâr Bıçağı', value: 'wind_blade' },
  { name: 'Buz Mızrağı', value: 'ice_spear' },
  { name: 'Alev Küresi', value: 'fire_orb' },
  { name: 'Taş Duvar', value: 'stone_wall' },
  { name: 'Arındırma', value: 'purification' },
  { name: 'Yıldırım Zinciri', value: 'lightning_chain' }
];
const spellNames = Object.fromEntries(spellChoices.map(spell => [spell.value, spell.name]));

export function masteryLevelForCasts(casts) {
  return Math.max(0, Math.min(10, Math.floor(Math.max(0, Number(casts) || 0) / 3)));
}
export function practiceCost(currentMastery) {
  return 25 + Math.max(0, Number(currentMastery) || 0) * 35;
}

export default {
  data: new SlashCommandBuilder()
    .setName('buyupratik')
    .setDescription('Öğrendiğin bir büyü üzerinde çalışarak ustalığını geliştir.')
    .addStringOption(option => option.setName('buyu').setDescription('Pratik yapacağın öğrendiğin büyü').setRequired(true).addChoices(...spellChoices)),
  async execute(interaction) {
    if (!interaction.guildId) return interaction.reply({ content: 'Büyü pratiği yalnızca sunucularda kullanılabilir.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    const spellKey = interaction.options.getString('buyu', true);
    const spellName = spellNames[spellKey];
    const db = await pool.connect();
    try {
      await ensureUser(interaction.guildId, interaction.user.id);
      await db.query('BEGIN');
      const userResult = await db.query('SELECT mana, coins FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE', [interaction.guildId, interaction.user.id]);
      const user = userResult.rows[0];
      const learned = await db.query('SELECT 1 FROM learned_spells WHERE guild_id=$1 AND user_id=$2 AND spell_key=$3', [interaction.guildId, interaction.user.id, spellKey]);
      if (!learned.rowCount) { await db.query('ROLLBACK'); return interaction.editReply(`🔒 **${spellName}** büyüsünü henüz öğrenmedin. Önce /buyuogren komutunu kullan.`); }
      const masteryResult = await db.query('SELECT casts, mastery_level FROM spell_mastery WHERE guild_id=$1 AND user_id=$2 AND spell_key=$3 FOR UPDATE', [interaction.guildId, interaction.user.id, spellKey]);
      const current = masteryResult.rows[0] ?? { casts: 0, mastery_level: 0 };
      const casts = Number(current.casts);
      const mastery = Number(current.mastery_level);
      if (mastery >= 10) { await db.query('ROLLBACK'); return interaction.editReply(`🌟 **${spellName}** ustalığı zaten en yüksek seviye olan 10'a ulaştı.`); }
      const cost = practiceCost(mastery);
      if (Number(user.mana) < 8) { await db.query('ROLLBACK'); return interaction.editReply(`🔮 Pratik için 8 mana gerekiyor. Mevcut manan: ${Number(user.mana)}.`); }
      if (Number(user.coins) < cost) { await db.query('ROLLBACK'); return interaction.editReply(`💰 Pratik ücreti ${cost} altın. Bakiyen: ${Number(user.coins)} altın.`); }
      const nextCasts = casts + 1;
      const nextMastery = masteryLevelForCasts(nextCasts);
      await db.query('UPDATE users SET mana=mana-8, coins=coins-$3 WHERE guild_id=$1 AND user_id=$2', [interaction.guildId, interaction.user.id, cost]);
      await db.query(`INSERT INTO spell_mastery(guild_id,user_id,spell_key,casts,mastery_level,updated_at)
        VALUES($1,$2,$3,1,$4,NOW())
        ON CONFLICT(guild_id,user_id,spell_key) DO UPDATE SET casts=spell_mastery.casts+1, mastery_level=GREATEST(spell_mastery.mastery_level,EXCLUDED.mastery_level), updated_at=NOW()`,
        [interaction.guildId, interaction.user.id, spellKey, nextMastery]);
      await db.query('COMMIT');
      const nextProgress = nextCasts % 3;
      const embed = new EmbedBuilder().setColor(0x75b7a5).setTitle('🔮 Büyü pratiği tamamlandı')
        .setDescription(`**${spellName}** üzerinde çalıştın.\n\n🔁 Toplam pratik: **${nextCasts}**\n🌟 Ustalık: **${Math.max(mastery, nextMastery)}/10**\n📈 Sonraki ustalık seviyesine ilerleme: **${nextMastery >= 10 ? 'Maksimum' : nextProgress + '/3'}**\n🔮 Harcanan mana: **8**\n🪙 Harcanan altın: **${cost}**`)
        .setFooter({ text: 'Her 3 pratik, bir ustalık seviyesi kazandırır. En fazla 10 seviye.' });
      return interaction.editReply({ embeds: [embed] });
    } catch (error) {
      await db.query('ROLLBACK').catch(() => {});
      console.error('/buyupratik hatası:', error);
      return interaction.editReply('Büyü pratiği tamamlanamadı. İşlem geri alındı; daha sonra tekrar dene.');
    } finally { db.release(); }
  }
};
