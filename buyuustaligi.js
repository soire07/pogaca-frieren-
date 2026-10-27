import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { pool, ensureUser } from './database/db.js';

const labels = {
  zoltraak: 'Zoltraak', barrier: 'Koruyucu Bariyer', heilen: 'Heilen',
  wind_blade: 'Rüzgâr Bıçağı', ice_spear: 'Buz Mızrağı', fire_orb: 'Alev Küresi',
  stone_wall: 'Taş Duvar', purification: 'Arındırma', lightning_chain: 'Yıldırım Zinciri'
};

export default {
  data: new SlashCommandBuilder().setName('buyuustaligi').setDescription('Öğrendiğin büyüleri ve ustalık seviyelerini göster.'),
  async execute(interaction) {
    if (!interaction.guildId) return interaction.reply({ content: 'Büyü ustalığı yalnızca sunucularda görüntülenebilir.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    try {
      await ensureUser(interaction.guildId, interaction.user.id);
      const result = await pool.query(`SELECT s.spell_key, COALESCE(m.casts,0)::int AS casts,
        COALESCE(m.mastery_level,0)::int AS mastery_level
        FROM learned_spells s LEFT JOIN spell_mastery m
        ON m.guild_id=s.guild_id AND m.user_id=s.user_id AND m.spell_key=s.spell_key
        WHERE s.guild_id=$1 AND s.user_id=$2 ORDER BY s.learned_at ASC`,
        [interaction.guildId, interaction.user.id]);
      if (!result.rowCount) return interaction.editReply('Henüz büyü öğrenmedin. Başlangıç büyüsü kaydını yenilemek için tekrar dene.');
      const lines = result.rows.map(row => {
        const level = Math.min(10, Number(row.mastery_level));
        const casts = Number(row.casts);
        const filled = Math.round(level / 10 * 10);
        return `**${labels[row.spell_key] ?? row.spell_key}** — Ustalık ${level}/10 · Pratik ${casts}\n${'🟣'.repeat(filled)}${'⚪'.repeat(10-filled)}`;
      });
      const embed = new EmbedBuilder().setColor(0x9b8cff).setTitle('📚 Büyü Ustalığı').setDescription(lines.join('\n\n')).setFooter({ text: 'Yeni büyüler: /buyuogren · Ustalık geliştirme: /buyupratik' });
      return interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('/buyuustaligi hatası:', error);
      return interaction.editReply('Büyü ustalığın yüklenemedi. Daha sonra tekrar dene.');
    }
  }
};
