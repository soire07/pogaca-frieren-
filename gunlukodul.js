
import { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { pool, ensureUser } from './database/db.js';

export default {
  data: new SlashCommandBuilder()
    .setName('gunlukodul')
    .setDescription('Günlük RPG altın ödülünü al.'),

  async execute(interaction) {
    if (!interaction.guildId) {
      return interaction.reply({ content: 'Bu komut yalnızca sunucularda kullanılabilir.', ephemeral: true });
    }

    await ensureUser(interaction.guildId, interaction.user.id);

    const reward = 50 + Math.floor(Math.random() * 51);

    const result = await pool.query(
      `UPDATE users SET coins = coins + $3, last_daily_at = NOW()
       WHERE guild_id=$1 AND user_id=$2
       AND (last_daily_at IS NULL OR last_daily_at < NOW() - INTERVAL '20 hours')
       RETURNING coins`,
      [interaction.guildId, interaction.user.id, reward]
    );

    if (!result.rowCount) {
      return interaction.reply({
        content: '⏳ Günlük ödülünü yakın zamanda aldın. Daha sonra tekrar dene.',
        ephemeral: true
      });
    }

    const gif = new AttachmentBuilder('./gunlukodul.gif');

    const embed = new EmbedBuilder()
      .setColor(0x9b8cff)
      .setTitle('🥐 Günlük Fırın Ödülü')
      .setDescription(
        `**${reward}** poğaça altını kazandın!\nYeni bakiyen: **${Number(result.rows[0].coins).toLocaleString('tr-TR')}**`
      )
      .setImage('attachment://gunlukodul.gif')
      .setFooter({ text: 'Poğaça Frieren • Günlük Fırın' });

    await interaction.reply({
      embeds: [embed],
      files: [gif]
    });
  }
};
