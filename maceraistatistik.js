import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { pool, ensureUser } from './database/db.js';
import { ADVENTURE_DISCOVERIES } from './adventure-data.js';

export default {
  data: new SlashCommandBuilder()
    .setName('maceraistatistik')
    .setDescription('Macera geçmişini, keşiflerini, seri ve hazine ilerlemeni tek yerde gör.'),
  async execute(interaction) {
    if (!interaction.guildId) return interaction.reply({ content: 'Bu komut yalnızca sunucularda kullanılabilir.', flags: MessageFlags.Ephemeral });
    await ensureUser(interaction.guildId, interaction.user.id);
    const { rows: [stats] } = await pool.query(
      `SELECT u.level, u.xp, u.coins, u.last_adventure_at,
        (SELECT COUNT(*)::int FROM adventure_discoveries d WHERE d.guild_id=u.guild_id AND d.user_id=u.user_id) AS discoveries,
        (SELECT COALESCE(SUM(r.visits),0)::int FROM adventure_route_mastery r WHERE r.guild_id=u.guild_id AND r.user_id=u.user_id) AS adventures,
        (SELECT COALESCE(MAX(r.visits),0)::int FROM adventure_route_mastery r WHERE r.guild_id=u.guild_id AND r.user_id=u.user_id) AS best_route_visits,
        (SELECT COALESCE(s.daily_streak,0)::int FROM adventure_streaks s WHERE s.guild_id=u.guild_id AND s.user_id=u.user_id) AS daily_streak,
        (SELECT COALESCE(s.best_streak,0)::int FROM adventure_streaks s WHERE s.guild_id=u.guild_id AND s.user_id=u.user_id) AS best_streak,
        (SELECT COALESCE(t.fragments,0)::int FROM adventure_treasure_progress t WHERE t.guild_id=u.guild_id AND t.user_id=u.user_id) AS fragments,
        (SELECT COALESCE(t.treasures_opened,0)::int FROM adventure_treasure_progress t WHERE t.guild_id=u.guild_id AND t.user_id=u.user_id) AS treasures_opened,
        (SELECT COALESCE(i.quantity,0)::int FROM inventory i WHERE i.guild_id=u.guild_id AND i.user_id=u.user_id AND i.item_key='🗝️ Kadim Hazine Sandığı') AS chests
       FROM users u WHERE u.guild_id=$1 AND u.user_id=$2`,
      [interaction.guildId, interaction.user.id]
    );
    const s = stats;
    const embed = new EmbedBuilder()
      .setColor(0x9b8cff)
      .setTitle(`🗺️ ${interaction.user.username} • Macera İstatistikleri`)
      .addFields(
        { name: '⚔️ İlerleme', value: `Seviye: **${s.level}**\nXP: **${s.xp}**\nAltın: **${s.coins}**\nToplam macera: **${s.adventures}**`, inline: true },
        { name: '🧭 Keşif', value: `Keşfedilen yer: **${s.discoveries}/${ADVENTURE_DISCOVERIES.length}**\nEn çok gezilen rota: **${s.best_route_visits}** ziyaret\nGünlük seri: **${s.daily_streak} gün** · Rekor: **${s.best_streak} gün**`, inline: true },
        { name: '🗝️ Hazine', value: `Harita parçaları: **${s.fragments}/5**\nTamamlanan harita: **${s.treasures_opened}**\nSandık: **${s.chests}**`, inline: true }
      )
      .setFooter({ text: s.last_adventure_at ? `Son macera: ${new Date(s.last_adventure_at).toLocaleString('tr-TR')}` : 'Henüz maceraya çıkmadın. /macera ile başla!' });
    return interaction.reply({ embeds: [embed] });
  }
};
