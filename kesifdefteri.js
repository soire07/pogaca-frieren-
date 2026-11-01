import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { pool, ensureUser } from './database/db.js';
import { ADVENTURE_DISCOVERIES, COMPLETE_ADVENTURE_JOURNAL_REWARD } from './adventure-data.js';

export default {
  data: new SlashCommandBuilder()
    .setName('kesifdefteri')
    .setDescription('Maceralarda bulduğun yerleri, keşif ödüllerini ve tamamlanma durumunu gör.'),
  async execute(interaction) {
    if (!interaction.guildId) return interaction.reply({ content: 'Bu komut yalnızca sunucularda kullanılabilir.', flags: MessageFlags.Ephemeral });
    await ensureUser(interaction.guildId, interaction.user.id);
    const { rows } = await pool.query(
      'SELECT discovery_key, discovered_at FROM adventure_discoveries WHERE guild_id=$1 AND user_id=$2 ORDER BY discovered_at',
      [interaction.guildId, interaction.user.id]
    );
    const discovered = new Set(rows.map(row => row.discovery_key));
    const { rows: [treasureProgress] } = await pool.query(
      'SELECT fragments, treasures_opened FROM adventure_treasure_progress WHERE guild_id=$1 AND user_id=$2',
      [interaction.guildId, interaction.user.id]
    );
    const { rows: [streakRow] } = await pool.query(
      'SELECT daily_streak, best_streak, last_visit_date FROM adventure_streaks WHERE guild_id=$1 AND user_id=$2',
      [interaction.guildId, interaction.user.id]
    );
    const { rows: masteryRows } = await pool.query(
      'SELECT route_key, visits FROM adventure_route_mastery WHERE guild_id=$1 AND user_id=$2',
      [interaction.guildId, interaction.user.id]
    );
    const mastery = new Map(masteryRows.map(row => [row.route_key, Number(row.visits)]));

    const { rows: [claim] } = await pool.query(
      'SELECT claimed_at FROM adventure_journal_claims WHERE guild_id=$1 AND user_id=$2',
      [interaction.guildId, interaction.user.id]
    );
    const embed = new EmbedBuilder()
      .setColor(0x9b8cff)
      .setTitle('📔 Macera Keşif Defteri')
      .setDescription(`Hazine haritası: **${Number(treasureProgress?.fragments || 0)}/5 parça** · Açılan sandık: **${Number(treasureProgress?.treasures_opened || 0)}**\nGünlük macera serisi: **${Number(streakRow?.daily_streak || 0)} gün** · Rekor: **${Number(streakRow?.best_streak || 0)} gün**\nKeşfedilen yerler: **${discovered.size}/${ADVENTURE_DISCOVERIES.length}**\nHer yeni keşif +25 altın ve +15 XP verir. Defteri tamamlamak tek seferlik +${COMPLETE_ADVENTURE_JOURNAL_REWARD.coins} altın kazandırır.`)
      .addFields(ADVENTURE_DISCOVERIES.map(entry => ({
        name: `${discovered.has(entry.key) ? '✅' : '🔒'} ${entry.emoji} ${entry.name}`,
        value: `${entry.description}\nDurum: **${discovered.has(entry.key) ? 'Keşfedildi' : 'Henüz keşfedilmedi'}**\nRota ziyaretleri: **${mastery.get(entry.key) || 0}** · Ustalık: **${Math.floor((mastery.get(entry.key) || 0) / 3)}** · Sonraki ödül: **${3 - ((mastery.get(entry.key) || 0) % 3)} ziyaret**`,
        inline: true
      })))
      .setFooter({ text: claim ? '🏆 Keşif defteri tamamlandı ve ödül alındı.' : 'Poğaça Frieren • Yeni yerler görmek için /macera kullan.' });
    return interaction.reply({ embeds: [embed] });
  }
};
