import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { pool, ensureUser } from '../../database/db.js';
import { JOURNAL_COLLECTIONS } from '../../gameplay-depth.js';

function progressBar(value, total, width = 12) {
  const ratio = total > 0 ? Math.max(0, Math.min(1, value / total)) : 0;
  const filled = Math.round(ratio * width);
  return `${'▰'.repeat(filled)}${'▱'.repeat(width - filled)}`;
}

export default {
  data: new SlashCommandBuilder()
    .setName('gunluk')
    .setDescription('Macera ilerlemeni ve koleksiyon hedeflerini görüntüle.'),

  async execute(interaction) {
    if (!interaction.guildId) {
      return interaction.reply({
        content: 'Macera günlüğü yalnızca bir Discord sunucusunda kullanılabilir.',
        ephemeral: true
      });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      await ensureUser(interaction.guildId, interaction.user.id);
      const { rows } = await pool.query(
        `SELECT level, xp, coins, exploration_count, boss_defeats, dungeon_wins,
                dungeon_runs
         FROM users
         WHERE guild_id = $1 AND user_id = $2`,
        [interaction.guildId, interaction.user.id]
      );

      const player = rows[0];
      if (!player) {
        return interaction.editReply('Oyuncu kaydı bulunamadı. Lütfen komutu tekrar dene.');
      }

      const { rows: masteryRows } = await pool.query(
        `SELECT region_key, visits
         FROM exploration_region_mastery
         WHERE guild_id = $1 AND user_id = $2
         ORDER BY visits DESC, region_key ASC`,
        [interaction.guildId, interaction.user.id]
      );

      const totalRegionVisits = masteryRows.reduce((sum, row) => sum + Number(row.visits || 0), 0);
      const regionText = masteryRows.length
        ? masteryRows.slice(0, 6).map(row => `• **${row.region_key}** — ${Number(row.visits)} ziyaret`).join('\n')
        : 'Henüz bölge ustalığı kaydın yok. Keşfe çıkarak günlüğünü başlat.';

      const statsEmbed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`📖 ${interaction.user.username} • Macera Günlüğü`)
        .setDescription('Yolculuğunun özeti ve tamamlamayı hedefleyebileceğin koleksiyonlar.')
        .addFields(
          {
            name: '🧭 Karakter',
            value: `Seviye: **${player.level}**\nXP: **${player.xp}**\nAltın: **${player.coins}**`,
            inline: true
          },
          {
            name: '⚔️ Başarılar',
            value: `Keşif: **${player.exploration_count}**\nBoss zaferi: **${player.boss_defeats}**\nZindan zaferi: **${player.dungeon_wins}/${player.dungeon_runs}**`,
            inline: true
          },
          {
            name: `🗺️ Bölge ustalığı • ${totalRegionVisits} ziyaret`,
            value: regionText
          }
        );

      const collectionText = Object.values(JOURNAL_COLLECTIONS).map(collection => {
        const total = collection.keys.length;
        return `**${collection.label}**\n${progressBar(0, total)} 0/${total} kayıtlı`;
      }).join('\n\n');

      statsEmbed.addFields({
        name: '📚 Koleksiyon hedefleri',
        value: collectionText.slice(0, 1024)
      });
      statsEmbed.setFooter({ text: 'Poğaça Frieren • Koleksiyon keşif kayıtlarının kalıcı entegrasyonu sonraki aşamada genişletilecek.' });

      return interaction.editReply({ embeds: [statsEmbed] });
    } catch (error) {
      console.error('Macera günlüğü komutu başarısız:', error);
      return interaction.editReply('Macera günlüğü okunamadı. Lütfen daha sonra tekrar dene.');
    }
  }
};
