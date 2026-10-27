import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { pool, ensureUser } from './database/db.js';

export default {
  data: new SlashCommandBuilder()
    .setName('hazinegecmisi')
    .setDescription('Son açtığın 10 Kadim Hazine Sandığı ve ganimetlerini görüntüle.'),
  async execute(interaction) {
    if (!interaction.guildId) return interaction.reply({ content: 'Bu komut yalnızca sunucularda kullanılabilir.', ephemeral: true });
    await ensureUser(interaction.guildId, interaction.user.id);
    const { rows } = await pool.query(
      'SELECT loot_item, coins, xp, opened_at FROM treasure_openings WHERE guild_id=$1 AND user_id=$2 ORDER BY opened_at DESC, id DESC LIMIT 10',
      [interaction.guildId, interaction.user.id]
    );
    const description = rows.length
      ? rows.map((row, index) => `**${index + 1}.** ${row.loot_item} — +${row.coins} altın · +${row.xp} XP\n< t:${Math.floor(new Date(row.opened_at).getTime() / 1000)}:R>`).join('\n')
      : 'Henüz hazine açmadın. Harita parçalarını toplayıp /hazineac ile sandıklarını açabilirsin.';
    const embed = new EmbedBuilder()
      .setColor(0x9b8cff)
      .setTitle('📜 Hazine Açma Geçmişi')
      .setDescription(description)
      .setFooter({ text: 'Poğaça Frieren • En son 10 sandığın kaydı gösterilir.' });
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
