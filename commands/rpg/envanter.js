import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { pool, ensureUser } from '../../database/db.js';

export default {
  data: new SlashCommandBuilder()
    .setName('envanter')
    .setDescription('Keşiflerde topladığın eşyaları ve miktarlarını göster.'),

  async execute(interaction) {
    if (!interaction.guildId) {
      return interaction.reply({ content: 'Envanter yalnızca sunucularda kullanılabilir.', ephemeral: true });
    }

    await ensureUser(interaction.guildId, interaction.user.id);
    const result = await pool.query(
      'SELECT item_key, quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 ORDER BY quantity DESC, item_key ASC',
      [interaction.guildId, interaction.user.id]
    );

    const totalItems = result.rows.reduce((sum, row) => sum + Number(row.quantity), 0);
    const description = result.rows.length
      ? result.rows.map(row => `• **${row.item_key}** ×${Number(row.quantity).toLocaleString('tr-TR')}`).join('\n')
      : 'Çantan şimdilik boş. **/kesif** komutuyla keşfe çıkıp eşya toplayabilirsin.';

    const embed = new EmbedBuilder()
      .setColor(0xd6a86a)
      .setTitle(`🎒 ${interaction.user.username} — Maceracı Envanteri`)
      .setDescription(description)
      .addFields(
        { name: '🧺 Farklı eşya', value: String(result.rows.length), inline: true },
        { name: '📦 Toplam eşya', value: totalItems.toLocaleString('tr-TR'), inline: true }
      )
      .setFooter({ text: 'Poğaça Frieren RPG • Eşyaların veritabanında saklanır' });

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
