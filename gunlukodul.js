import { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, MessageFlags } from 'discord.js';
import { existsSync } from 'node:fs';
import { pool, ensureUser } from './database/db.js';

export default {
  data: new SlashCommandBuilder()
    .setName('gunlukodul')
    .setDescription('Günlük RPG altın ödülünü al.'),

  async execute(interaction) {
    if (!interaction.guildId) {
      return interaction.reply({ content: 'Bu komut yalnızca sunucularda kullanılabilir.', flags: MessageFlags.Ephemeral });
    }

    await ensureUser(interaction.guildId, interaction.user.id);

    const baseReward = 50 + Math.floor(Math.random() * 51);

    const result = await pool.query(
      `WITH eligible AS (
         SELECT guild_id, user_id,
           CASE
             WHEN last_daily_at IS NULL OR last_daily_at < NOW() - INTERVAL '48 hours' THEN 1
             ELSE daily_streak + 1
           END AS next_streak
         FROM users
         WHERE guild_id=$1 AND user_id=$2
           AND (last_daily_at IS NULL OR last_daily_at <= NOW() - INTERVAL '20 hours')
         FOR UPDATE
       ), updated AS (
         UPDATE users AS u
         SET coins = u.coins + $3
             + LEAST((eligible.next_streak - 1) * 10, 100)
             + CASE WHEN eligible.next_streak % 7 = 0 THEN 150 ELSE 0 END,
             daily_streak = eligible.next_streak,
             best_daily_streak = GREATEST(u.best_daily_streak, eligible.next_streak),
             last_daily_at = NOW()
         FROM eligible
         WHERE u.guild_id=eligible.guild_id AND u.user_id=eligible.user_id
         RETURNING u.coins, u.daily_streak, u.best_daily_streak
       )
       SELECT coins, daily_streak, best_daily_streak,
         LEAST((daily_streak - 1) * 10, 100) AS streak_bonus,
         CASE WHEN daily_streak % 7 = 0 THEN 150 ELSE 0 END AS milestone_bonus
       FROM updated`,
      [interaction.guildId, interaction.user.id, baseReward]
    );

    if (!result.rowCount) {
      return interaction.reply({
        content: '⏳ Günlük ödülünü yakın zamanda aldın. Yeniden almak için 20 saat geçmesi gerekiyor.',
        flags: MessageFlags.Ephemeral
      });
    }

    const claim = result.rows[0];
    const totalReward = baseReward + Number(claim.streak_bonus) + Number(claim.milestone_bonus);
    const milestoneText = Number(claim.milestone_bonus) > 0 ? '\n🎉 **7 günlük seri ödülü:** +150 altın!' : '';

    const embed = new EmbedBuilder()
      .setColor(0x9b8cff)
      .setTitle('🥐 Günlük Fırın Ödülü')
      .setDescription(
        `**${totalReward}** poğaça altını kazandın!\n` +
        `🎁 Temel ödül: ${baseReward} · 🔥 Seri bonusu: +${Number(claim.streak_bonus)}${milestoneText}\n` +
        `🔥 Günlük seri: **${claim.daily_streak} gün** · En iyi seri: **${claim.best_daily_streak} gün**\n` +
        `Yeni bakiyen: **${Number(claim.coins).toLocaleString('tr-TR')}**`
      )
      .setFooter({ text: 'Her 20 saatte bir alabilirsin; 48 saati aşarsan seri sıfırlanır.' });
    const files = [];
    if (existsSync('./gunlukodul.gif')) {
      files.push(new AttachmentBuilder('./gunlukodul.gif'));
      embed.setImage('attachment://gunlukodul.gif');
    }

    await interaction.reply({ embeds: [embed], files });
  }
};
