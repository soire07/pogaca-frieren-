import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { pool, ensureUser } from '../../database/db.js';
import { equipmentItems, equipmentBonus } from '../../equipment-data.js';

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
    const db = await pool.connect();
    try {
      await db.query('BEGIN');

      // Lock the player row first. Encounter starters lock the same row before
      // creating a reservation, so rest cannot race a newly starting battle.
      const current = await db.query(
        'SELECT hp, max_hp, mana, max_mana, last_rest_at FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE',
        [interaction.guildId, interaction.user.id]
      );
      const stats = current.rows[0];
      if (!stats) {
        await db.query('ROLLBACK');
        return interaction.reply({ content: 'Maceracı kaydın bulunamadı. Lütfen yeniden dene.', ephemeral: true });
      }

      const activeEncounter = await db.query(
        'SELECT encounter_type FROM active_rpg_encounters WHERE guild_id=$1 AND user_id=$2 AND expires_at > NOW()',
        [interaction.guildId, interaction.user.id]
      );
      if (activeEncounter.rowCount) {
        await db.query('ROLLBACK');
        return interaction.reply({
          content: '⚔️ Savaşın devam ederken dinlenemezsin. Önce karşılaşmayı tamamla.',
          ephemeral: true
        });
      }

      const equipped = await db.query(
        'SELECT item_key FROM user_equipment WHERE guild_id=$1 AND user_id=$2',
        [interaction.guildId, interaction.user.id]
      );
      const gear = equipmentBonus(equipped.rows.map(row => equipmentItems.find(item => item.name === row.item_key)).filter(Boolean));
      const effectiveMaxHp = Math.min(2000, Number(stats.max_hp) + gear.hp);
      const effectiveMaxMana = Math.min(2000, Number(stats.max_mana) + gear.mana);

      if (Number(stats.hp) >= effectiveMaxHp && Number(stats.mana) >= effectiveMaxMana) {
        await db.query('ROLLBACK');
        return interaction.reply({ content: '✨ HP ve Mana değerlerin zaten tamamen dolu.', ephemeral: true });
      }

      if (stats.last_rest_at && Date.now() - new Date(stats.last_rest_at).getTime() < REST_COOLDOWN_MS) {
        const next = new Date(stats.last_rest_at).getTime() + REST_COOLDOWN_MS;
        await db.query('ROLLBACK');
        return interaction.reply({
          content: `⏳ Biraz daha dinlenmelisin. Yeniden dinlenebilirsin: <t:${Math.ceil(next / 1000)}:R>`,
          ephemeral: true
        });
      }

      const restored = await db.query(
        `UPDATE users
         SET hp=$3, mana=$4, last_rest_at=NOW()
         WHERE guild_id=$1 AND user_id=$2
         RETURNING hp, max_hp, mana, max_mana`,
        [interaction.guildId, interaction.user.id, effectiveMaxHp, effectiveMaxMana]
      );
      await db.query('COMMIT');

      const updated = restored.rows[0];
      const embed = new EmbedBuilder()
        .setColor(0x65d6a6)
        .setTitle('🌿 Dinlenme Tamamlandı')
        .setDescription('Güvenli bir yerde dinlendin; büyü gücün ve dayanıklılığın tamamen yenilendi. Kuşanılan ekipmanlarının maksimum HP ve Mana bonusları da hesaba katıldı.')
        .addFields(
          { name: '❤️ HP', value: `**${updated.hp}/${effectiveMaxHp}**`, inline: true },
          { name: '🔮 Mana', value: `**${updated.mana}/${effectiveMaxMana}**`, inline: true }
        )
        .setFooter({ text: 'Dinlenme bekleme süresi: 5 dakika' });

      return interaction.reply({ embeds: [embed] });
    } catch (error) {
      await db.query('ROLLBACK').catch(() => {});
      console.error('/dinlen hatası:', error);
      return interaction.reply({ content: 'Dinlenme sırasında bir hata oluştu. Daha sonra tekrar dene.', ephemeral: true }).catch(() => {});
    } finally {
      db.release();
    }
  }
};
