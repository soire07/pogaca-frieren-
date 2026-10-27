import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { pool, ensureUser } from '../../database/db.js';

const names = {
  zoltraak: '⚡ Zoltraak', alev_kuresi: '🔥 Alev Küresi', buz_mizragi: '🧊 Buz Mızrağı',
  koruyucu_bariyer: '🛡️ Koruyucu Bariyer', sifa_isigi: '💚 Şifa Işığı',
  yildirim_zinciri: '⚡ Yıldırım Zinciri', tas_duvar: '🪨 Taş Duvar', mana_patlamasi: '🌌 Mana Patlaması'
};

export default {
  data: new SlashCommandBuilder().setName('buyuustaligi').setDescription('Savaş büyülerinin ustalık seviyelerini göster.'),
  async execute(interaction) {
    if (!interaction.guildId) return interaction.reply({ content: 'Bu komut yalnızca sunucularda kullanılabilir.', ephemeral: true });
    await ensureUser(interaction.guildId, interaction.user.id);
    const result = await pool.query(
      `SELECT l.spell_key, COALESCE(m.casts,0)::int AS casts, COALESCE(m.mastery_level,0)::int AS mastery_level
       FROM learned_spells l LEFT JOIN spell_mastery m
       ON m.guild_id=l.guild_id AND m.user_id=l.user_id AND m.spell_key=l.spell_key
       WHERE l.guild_id=$1 AND l.user_id=$2 ORDER BY COALESCE(m.mastery_level,0) DESC, COALESCE(m.casts,0) DESC`,
      [interaction.guildId, interaction.user.id]
    );
    const lines = result.rows.map(row => {
      const casts = Number(row.casts), level = Number(row.mastery_level);
      const progress = level >= 10 ? '✨ Maksimum ustalık' : `Sonraki seviye için ${Math.max(0, (level + 1) * 10 - casts)} kullanım`;
      return `${names[row.spell_key] || row.spell_key}\n${'▰'.repeat(level)}${'▱'.repeat(10-level)} **${level}/10** · ${casts} kullanım · ${progress}`;
    });
    const embed = new EmbedBuilder().setColor(0x9b8cff).setTitle('📚 Büyü Ustalığı')
      .setDescription(lines.length ? lines.join('\n\n') : 'Henüz savaş büyüsü öğrenmedin. /buyuogren komutunu kullan.')
      .addFields({ name: '✨ Nasıl gelişir?', value: 'Her 10 kullanımda bir ustalık seviyesi kazanırsın. Saldırı büyülerinin hasarı ustalık seviyesi başına artar.' })
      .setFooter({ text: 'Poğaça Frieren • /iblisavasi' });
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
