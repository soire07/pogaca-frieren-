import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { pool, ensureUser } from './database/db.js';

export default {
  data: new SlashCommandBuilder()
    .setName('maceragecmisi')
    .setDescription('Maceralarındaki savaş, keşif ve koleksiyon istatistiklerini göster.')
    .addUserOption(option => option
      .setName('kullanici')
      .setDescription('İstatistiklerini görmek istediğin oyuncu')
      .setRequired(false)),

  async execute(interaction) {
    if (!interaction.guildId) {
      return interaction.reply({ content: 'Bu komut yalnızca sunucularda kullanılabilir.', ephemeral: true });
    }

    await interaction.deferReply();
    const target = interaction.options.getUser('kullanici') ?? interaction.user;

    try {
      await ensureUser(interaction.guildId, target.id);
      const [userResult, collectionResult, equipmentResult, spellResult, adventureResult] = await Promise.all([
        pool.query(
          `SELECT level, xp, coins, daily_streak, best_daily_streak,
                  exploration_count, items_used_count, boss_defeats,
                  dungeon_runs, dungeon_wins, character_draw_count
           FROM users WHERE guild_id=$1 AND user_id=$2`,
          [interaction.guildId, target.id]
        ),
        pool.query(
          `SELECT COUNT(*)::int AS unique_characters,
                  COALESCE(SUM(quantity), 0)::int AS total_copies
           FROM anime_character_collection WHERE guild_id=$1 AND user_id=$2`,
          [interaction.guildId, target.id]
        ),
        pool.query(
          'SELECT COUNT(*)::int AS equipped FROM user_equipment WHERE guild_id=$1 AND user_id=$2',
          [interaction.guildId, target.id]
        ),
        pool.query(
          'SELECT COUNT(*)::int AS learned FROM learned_spells WHERE guild_id=$1 AND user_id=$2',
          [interaction.guildId, target.id]
        ),
        pool.query(
          'SELECT outcome_text, coins_awarded, xp_awarded, item_found, first_discovery, occurred_at FROM adventure_history WHERE guild_id=$1 AND user_id=$2 ORDER BY occurred_at DESC, id DESC LIMIT 5',
          [interaction.guildId, target.id]
        )
      ]);

      const u = userResult.rows[0];
      if (!u) return interaction.editReply('Oyuncu istatistikleri bulunamadı.');

      const c = collectionResult.rows[0];
      const recentAdventures = adventureResult.rows.length
        ? adventureResult.rows.map((row, index) => `**${index + 1}.** ${row.outcome_text} · +${n(row.coins_awarded)} altın / +${n(row.xp_awarded)} XP${row.first_discovery ? ' · 🧭 Yeni keşif' : ''}${row.item_found ? ` · ${row.item_found}` : ''}\n<t:${Math.floor(new Date(row.occurred_at).getTime() / 1000)}:R>`).join('\n')
        : 'Henüz kaydedilmiş bir macera yok. /macera ile ilk keşfine çık.';
      const n = value => Number(value ?? 0).toLocaleString('tr-TR');
      const embed = new EmbedBuilder()
        .setColor(0xb58cff)
        .setTitle(`📖 ${target.username} · Macera Geçmişi`)
        .setThumbnail(target.displayAvatarURL())
        .setDescription('Bu sunucudaki kalıcı RPG ilerlemesinin özeti.')
        .addFields(
          { name: '⭐ İlerleme', value: `Seviye: **${n(u.level)}**\nToplam XP: **${n(u.xp)}**\nAltın: **${n(u.coins)}**`, inline: true },
          { name: '⚔️ Savaş', value: `İblis zaferi: **${n(u.boss_defeats)}**\nZindan denemesi: **${n(u.dungeon_runs)}**\nZindan zaferi: **${n(u.dungeon_wins)}**`, inline: true },
          { name: '🧭 Macera', value: `Keşif: **${n(u.exploration_count)}**\nKullanılan eşya: **${n(u.items_used_count)}**\nKarakter çekimi: **${n(u.character_draw_count)}**`, inline: true },
          { name: '🎴 Koleksiyon', value: `Farklı karakter: **${n(c.unique_characters)}**\nToplam kopya: **${n(c.total_copies)}**`, inline: true },
          { name: '🔮 Hazırlık', value: `Öğrenilen büyü: **${n(spellResult.rows[0].learned)}**\nKuşanılan ekipman: **${n(equipmentResult.rows[0].equipped)}**`, inline: true },
          { name: '🔥 Günlük seri', value: `Mevcut: **${n(u.daily_streak)} gün**\nEn iyi: **${n(u.best_daily_streak)} gün**`, inline: true },
          { name: '🗺️ Son 5 macera', value: recentAdventures.slice(0, 1024), inline: false }
        )
        .setFooter({ text: 'Poğaça Frieren • Macera kayıtları yalnızca bu sunucuya aittir.' })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
    } catch (error) {
      console.error('/maceragecmisi hatası:', error);
      return interaction.editReply('Macera geçmişi yüklenemedi. Daha sonra tekrar dene.');
    }
  }
};
