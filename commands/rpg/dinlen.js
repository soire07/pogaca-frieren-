import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { pool, ensureUser } from '../../database/db.js';

const REST_COOLDOWN_MS = 5 * 60 * 1000;

export default {
  data: new SlashCommandBuilder()
    .setName('dinlen')
    .setDescription('Dinlenerek HP ve Mana değerlerini tamamen yenile.'),

  async execute(interaction) {
    if (!interaction.guildId) {
      return interaction.reply({ content: 'Dinlenme yalnızca sunucularda kullanılabilir.', ephemeral: true });
    }

    await ensureUser(interaction.guildId, interaction.user.id);
    const current = await pool.query(
      'SELECT hp, max_hp, mana, max_mana, last_rest_at FROM users WHERE guild_id=$1 AND user_id=$2',
      [interaction.guildId, interaction.user.id]
    );
    const stats = current.rows[0];

    if (Number(stats.hp) >= Number(stats.max_hp) && Number(stats.mana) >= Number(stats.max_mana)) {
      return interaction.reply({ content: '✨ HP ve Mana değerlerin zaten tamamen dolu.', ephemeral: true });
    }

    const restored = await pool.query(
      `UPDATE users
       SET hp=max_hp, mana=max_mana, last_rest_at=NOW()
       WHERE guild_id=$1 AND user_id=$2
         AND (last_rest_at IS NULL OR last_rest_at <= NOW() - INTERVAL '5 minutes')
       RETURNING hp, max_hp, mana, max_mana`,
      [interaction.guildId, interaction.user.id]
    );

    if (!restored.rowCount) {
      const lastRestAt = stats.last_rest_at ? new Date(stats.last_rest_at).getTime() : Date.now();
      const next = lastRestAt + REST_COOLDOWN_MS;
      return interaction.reply({
        content: `⏳ Biraz daha dinlenmelisin. Yeniden dinlenebilirsin: <t:${Math.ceil(next / 1000)}:R>`,
        ephemeral: true
      });
    }

    const updated = restored.rows[0];
    const embed = new EmbedBuilder()
      .setColor(0x65d6a6)
      .setTitle('🌿 Dinlenme Tamamlandı')
      .setDescription('Güvenli bir yerde dinlendin; büyü gücün ve dayanıklılığın tamamen yenilendi.')
      .addFields(
        { name: '❤️ HP', value: `**${updated.hp}/${updated.max_hp}**`, inline: true },
        { name: '🔮 Mana', value: `**${updated.mana}/${updated.max_mana}**`, inline: true }
      )
      .setFooter({ text: 'Dinlenme bekleme süresi: 5 dakika' });

    return interaction.reply({ embeds: [embed] });
  }
};
