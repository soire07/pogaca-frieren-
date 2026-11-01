import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { pool, ensureUser } from '../../database/db.js';

const statChoices = [
  { name: 'Can (+10 maksimum can)', value: 'hp' },
  { name: 'Mana (+10 maksimum mana)', value: 'mana' },
  { name: 'Saldırı (+2)', value: 'attack' },
  { name: 'Savunma (+1)', value: 'defense' }
];

export default {
  internalOnly: true,
  data: new SlashCommandBuilder()
    .setName('gelisim')
    .setDescription('Seviye puanlarını karakter özelliklerine yatır.')
    .addStringOption(option =>
      option.setName('ozellik')
        .setDescription('Geliştirmek istediğin özellik')
        .setRequired(true)
        .addChoices(...statChoices)
    )
    .addIntegerOption(option =>
      option.setName('puan')
        .setDescription('Harcamak istediğin puan sayısı')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(50)
    ),

  async execute(interaction) {
    if (!interaction.guildId) {
      return interaction.reply({ content: 'Bu komut yalnızca sunucularda kullanılabilir.', flags: MessageFlags.Ephemeral });
    }

    const stat = interaction.options.getString('ozellik', true);
    const points = interaction.options.getInteger('puan', true);
    await ensureUser(interaction.guildId, interaction.user.id);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: [player] } = await client.query(
        'SELECT stat_points, hp, max_hp, mana, max_mana, attack, defense FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE',
        [interaction.guildId, interaction.user.id]
      );

      if (!player || player.stat_points < points) {
        await client.query('ROLLBACK');
        return interaction.reply({
          content: `Yeterli gelişim puanın yok. Kullanılabilir puanın: **${player?.stat_points ?? 0}**.`,
          flags: MessageFlags.Ephemeral
        });
      }

      const current = Number(player[stat === 'hp' ? 'max_hp' : stat === 'mana' ? 'max_mana' : stat]);
      const increase = stat === 'hp' || stat === 'mana' ? points * 10 : stat === 'attack' ? points * 2 : points;
      const cap = stat === 'hp' || stat === 'mana' ? 2000 : stat === 'attack' ? 500 : 250;
      if (current + increase > cap) {
        await client.query('ROLLBACK');
        return interaction.reply({
          content: `Bu geliştirme üst sınırı aşar. ${stat === 'hp' ? 'Maksimum can' : stat === 'mana' ? 'Maksimum mana' : stat === 'attack' ? 'Saldırı' : 'Savunma'} sınırı: **${cap}**.`,
          flags: MessageFlags.Ephemeral
        });
      }

      if (stat === 'hp') {
        await client.query(
          'UPDATE users SET max_hp=max_hp+$3, hp=LEAST(max_hp+$3,hp+$3), stat_points=stat_points-$4 WHERE guild_id=$1 AND user_id=$2',
          [interaction.guildId, interaction.user.id, points * 10, points]
        );
      } else if (stat === 'mana') {
        await client.query(
          'UPDATE users SET max_mana=max_mana+$3, mana=LEAST(max_mana+$3,mana+$3), stat_points=stat_points-$4 WHERE guild_id=$1 AND user_id=$2',
          [interaction.guildId, interaction.user.id, points * 10, points]
        );
      } else if (stat === 'attack') {
        await client.query(
          'UPDATE users SET attack=attack+$3, stat_points=stat_points-$4 WHERE guild_id=$1 AND user_id=$2',
          [interaction.guildId, interaction.user.id, points * 2, points]
        );
      } else {
        await client.query(
          'UPDATE users SET defense=defense+$3, stat_points=stat_points-$4 WHERE guild_id=$1 AND user_id=$2',
          [interaction.guildId, interaction.user.id, points, points]
        );
      }

      const { rows: [updated] } = await client.query(
        'SELECT stat_points, hp, max_hp, mana, max_mana, attack, defense FROM users WHERE guild_id=$1 AND user_id=$2',
        [interaction.guildId, interaction.user.id]
      );
      await client.query('COMMIT');

      const embed = new EmbedBuilder()
        .setColor(0x9b8cff)
        .setTitle('✨ Karakter Geliştirildi')
        .setDescription(`**${points}** gelişim puanını başarıyla harcadın.`)
        .addFields(
          { name: '❤️ Can', value: `${updated.hp}/${updated.max_hp}`, inline: true },
          { name: '✨ Mana', value: `${updated.mana}/${updated.max_mana}`, inline: true },
          { name: '⚔️ Saldırı', value: String(updated.attack), inline: true },
          { name: '🛡️ Savunma', value: String(updated.defense), inline: true },
          { name: '🌟 Kalan puan', value: String(updated.stat_points), inline: true }
        )
        .setFooter({ text: 'Poğaça Frieren • Her gelişim yolculuğu farklıdır.' });

      return interaction.reply({ embeds: [embed] });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('/gelisim hatası:', error);
      if (!interaction.replied) {
        return interaction.reply({ content: 'Geliştirme sırasında bir hata oluştu. Lütfen tekrar dene.', flags: MessageFlags.Ephemeral });
      }
    } finally {
      client.release();
    }
  }
};
