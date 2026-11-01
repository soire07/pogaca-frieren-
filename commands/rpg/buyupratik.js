import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { pool, ensureUser } from '../../database/db.js';

const spellChoices = [
  { name: 'Zoltraak', value: 'zoltraak' },
  { name: 'Alev Küresi', value: 'alev_kuresi' },
  { name: 'Buz Mızrağı', value: 'buz_mizragi' },
  { name: 'Koruyucu Bariyer', value: 'koruyucu_bariyer' },
  { name: 'Şifa Işığı', value: 'sifa_isigi' },
  { name: 'Yıldırım Zinciri', value: 'yildirim_zinciri' },
  { name: 'Taş Duvar', value: 'tas_duvar' },
  { name: 'Mana Patlaması', value: 'mana_patlamasi' }
];
const spellNames = Object.fromEntries(spellChoices.map(spell => [spell.value, spell.name]));

export function masteryLevelForCasts(casts) {
  return Math.max(0, Math.min(10, Math.floor(Math.max(0, Number(casts) || 0) / 10)));
}
export function practiceCost(currentMastery) {
  return 25 + Math.max(0, Number(currentMastery) || 0) * 35;
}

export default {
  data: new SlashCommandBuilder()
    .setName('buyupratik')
    .setDescription('Başlangıç büyün veya öğrendiğin bir büyü için ücretli ustalık pratiği yap.')
    .addStringOption(option => option.setName('buyu').setDescription('Pratik yapacağın büyü').setRequired(true).addChoices(...spellChoices)),
  async execute(interaction) {
    if (!interaction.guildId) return interaction.reply({ content: 'Büyü pratiği yalnızca sunucularda kullanılabilir.', flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const spellKey = interaction.options.getString('buyu', true);
    const spellName = spellNames[spellKey];
    if (!spellName) return interaction.editReply('Bu büyü kataloğunda bulunamadı.');
    const db = await pool.connect();
    try {
      await ensureUser(interaction.guildId, interaction.user.id);
      await db.query('BEGIN');
      const userResult = await db.query(
        'SELECT mana, coins FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE',
        [interaction.guildId, interaction.user.id]
      );
      const user = userResult.rows[0];
      const learned = await db.query(
        'SELECT 1 FROM learned_spells WHERE guild_id=$1 AND user_id=$2 AND spell_key=$3',
        [interaction.guildId, interaction.user.id, spellKey]
      );
      // Zoltraak is granted at the start, even when it has no learned_spells row.
      if (!learned.rowCount && spellKey !== 'zoltraak') {
        await db.query('ROLLBACK');
        return interaction.editReply(`🔒 **${spellName}** henüz öğrenilmedi. Önce /buyuogren kullan.`);
      }
      const masteryResult = await db.query(
        'SELECT casts, mastery_level FROM spell_mastery WHERE guild_id=$1 AND user_id=$2 AND spell_key=$3 FOR UPDATE',
        [interaction.guildId, interaction.user.id, spellKey]
      );
      const current = masteryResult.rows[0] ?? { casts: 0, mastery_level: 0 };
      const casts = Number(current.casts);
      const mastery = Number(current.mastery_level);
      if (mastery >= 10) {
        await db.query('ROLLBACK');
        return interaction.editReply(`🌟 **${spellName}** zaten 10/10 maksimum ustalıkta.`);
      }
      const cost = practiceCost(mastery);
      if (Number(user.mana) < 8) {
        await db.query('ROLLBACK');
        return interaction.editReply(`🔮 Pratik için 8 mana gerekiyor; mevcut manan: ${Number(user.mana)}.`);
      }
      if (Number(user.coins) < cost) {
        await db.query('ROLLBACK');
        return interaction.editReply(`💰 Pratik ücreti ${cost} altın; bakiyen: ${Number(user.coins)}.`);
      }
      const nextCasts = casts + 1;
      const nextMastery = Math.max(mastery, masteryLevelForCasts(nextCasts));
      await db.query(
        'UPDATE users SET mana=mana-8, coins=coins-$3 WHERE guild_id=$1 AND user_id=$2',
        [interaction.guildId, interaction.user.id, cost]
      );
      await db.query(`INSERT INTO spell_mastery(guild_id,user_id,spell_key,casts,mastery_level,updated_at)
        VALUES($1,$2,$3,1,$4,NOW())
        ON CONFLICT(guild_id,user_id,spell_key) DO UPDATE
        SET casts=spell_mastery.casts+1,
            mastery_level=GREATEST(spell_mastery.mastery_level,EXCLUDED.mastery_level),
            updated_at=NOW()`,
        [interaction.guildId, interaction.user.id, spellKey, nextMastery]
      );
      await db.query('COMMIT');
      const progress = nextMastery >= 10 ? 'Maksimum ustalık' : `${nextCasts % 10}/10 sonraki seviye ilerlemesi`;
      const embed = new EmbedBuilder().setColor(0x75b7a5).setTitle('🔮 Büyü pratiği tamamlandı')
        .setDescription(`**${spellName}** üzerinde çalıştın.\n\n🔁 Kayıtlı pratik/kullanım: **${nextCasts}**\n🌟 Ustalık: **${nextMastery}/10**\n📈 İlerleme: **${progress}**\n🔮 Harcanan mana: **8**\n🪙 Harcanan altın: **${cost}**\n\nUstalık, /iblisavasi sırasında büyü etkilerini güçlendirir.`)
        .setFooter({ text: 'Her 10 kayıtlı pratik/kullanım bir ustalık seviyesi kazandırır.' });
      return interaction.editReply({ embeds: [embed] });
    } catch (error) {
      await db.query('ROLLBACK').catch(() => {});
      console.error('/buyupratik hatası:', error);
      return interaction.editReply('Pratik tamamlanamadı; işlem geri alındı. Daha sonra tekrar dene.');
    } finally {
      db.release();
    }
  }
};
