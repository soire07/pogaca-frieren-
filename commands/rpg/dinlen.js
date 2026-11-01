import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { pool, ensureUser } from '../../database/db.js';
import { equipmentItems, equipmentBonus } from '../../equipment-data.js';

const REST_COOLDOWN_MS = 5 * 60 * 1000;

export default {
  data: new SlashCommandBuilder()
    .setName('dinlen')
    .setDescription('Dinlenerek HP ve Mana değerlerini tamamen yenile.'),

  async execute(interaction) {
    if (!interaction.guildId) {
      return interaction.reply({ content: 'Dinlenme yalnızca sunucularda kullanılabilir.', flags: MessageFlags.Ephemeral });
    }

    await ensureUser(interaction.guildId, interaction.user.id);
    const current = await pool.query(
      'SELECT hp, max_hp, mana, max_mana, last_rest_at FROM users WHERE guild_id=$1 AND user_id=$2',
      [interaction.guildId, interaction.user.id]
    );
    const stats = current.rows[0];
    const equipped = await pool.query('SELECT item_key FROM user_equipment WHERE guild_id=$1 AND user_id=$2', [interaction.guildId, interaction.user.id]);
    const gear = equipmentBonus(equipped.rows.map(row => equipmentItems.find(item => item.name === row.item_key)).filter(Boolean));
    const effectiveMaxHp = Math.min(2000, Number(stats.max_hp) + gear.hp);
    const effectiveMaxMana = Math.min(2000, Number(stats.max_mana) + gear.mana);

    if (Number(stats.hp) >= effectiveMaxHp && Number(stats.mana) >= effectiveMaxMana) {
      return interaction.reply({ content: '✨ HP ve Mana değerlerin zaten tamamen dolu.', flags: MessageFlags.Ephemeral });
    }

    const restored = await pool.query(
      `UPDATE users
       SET hp=$3, mana=$4, last_rest_at=NOW()
       WHERE guild_id=$1 AND user_id=$2
         AND (last_rest_at IS NULL OR last_rest_at <= NOW() - INTERVAL '5 minutes')
       RETURNING hp, max_hp, mana, max_mana`,
      [interaction.guildId, interaction.user.id, effectiveMaxHp, effectiveMaxMana]
    );

    if (!restored.rowCount) {
      const lastRestAt = stats.last_rest_at ? new Date(stats.last_rest_at).getTime() : Date.now();
      const next = lastRestAt + REST_COOLDOWN_MS;
      return interaction.reply({
        content: `⏳ Biraz daha dinlenmelisin. Yeniden dinlenebilirsin: <t:${Math.ceil(next / 1000)}:R>`,
        flags: MessageFlags.Ephemeral
      });
    }

    const updated = restored.rows[0];
    const embed = new EmbedBuilder()
      .setColor(0x65d6a6)
      .setTitle('🌿 Dinlenme Tamamlandı')
      .setDescription('Güvenli bir yerde dinlendin; büyü gücün ve dayanıklılığın tamamen yenilendi. Kuşanılan ekipmanların maksimum HP ve Mana bonusları da hesaba katıldı.')
      .addFields(
        { name: '❤️ HP', value: `**${updated.hp}/${effectiveMaxHp}**`, inline: true },
        { name: '🔮 Mana', value: `**${updated.mana}/${effectiveMaxMana}**`, inline: true }
      )
      .setFooter({ text: 'Dinlenme bekleme süresi: 5 dakika' });

    return interaction.reply({ embeds: [embed] });
  }
};
