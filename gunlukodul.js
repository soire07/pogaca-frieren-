import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { pool } from './database/db.js';
export default {
  data: new SlashCommandBuilder().setName('gunlukodul').setDescription('Günlük RPG altın ödülünü al.'),
  async execute(interaction) {
    await ensureUser(interaction.guildId, interaction.user.id);
    const reward = 50 + Math.floor(Math.random() * 51);
    const result = await pool.query(`UPDATE users SET coins = coins + $3, last_daily_at = NOW()
      WHERE guild_id=$1 AND user_id=$2 AND (last_daily_at IS NULL OR last_daily_at < NOW() - INTERVAL '20 hours') RETURNING coins`,
      [interaction.guildId, interaction.user.id, reward]);
    if (!result.rowCount) return interaction.reply({ content: '⏳ Günlük ödülünü yakın zamanda aldın. Daha sonra tekrar dene.', ephemeral: true });
    const embed = new EmbedBuilder().setColor(0x9b8cff).setTitle('🥐 Günlük Fırın Ödülü').setDescription(`**${reward}** poğaça altını kazandın!\nYeni bakiyen: **${result.rows[0].coins}**`);
    await interaction.reply({ embeds: [embed] });
  }
};
