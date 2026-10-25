import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { pool } from './database/db.js';

export default {
  data: new SlashCommandBuilder().setName('istatistik').setDescription('Bot ve sunucu istatistiklerini gösterir.'),
  async execute(interaction) {
    const result = await pool.query('SELECT COUNT(*)::int AS players, COALESCE(MAX(level), 1)::int AS max_level FROM users WHERE guild_id = $1', [interaction.guildId]);
    const row = result.rows[0];
    const embed = new EmbedBuilder().setColor(0x9b8cff).setTitle('📊 Poğaça Frieren İstatistikleri')
      .addFields(
        { name: 'Sunucu', value: interaction.guild?.name ?? 'Bilinmiyor', inline: true },
        { name: 'Kayıtlı oyuncu', value: String(row.players), inline: true },
        { name: 'En yüksek seviye', value: String(row.max_level), inline: true },
        { name: 'Ping', value: `${interaction.client.ws.ping} ms`, inline: true }
      );
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
