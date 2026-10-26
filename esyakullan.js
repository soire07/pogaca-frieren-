import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { pool, ensureUser } from './database/db.js';

const usableItems = {
  frieren_tea: {
    name: '🍵 Frieren Çayı',
    key: '🍵 Frieren Çayı',
    description: 'Huzurlu bir mola verdin ve 25 XP kazandın.',
    xp: 25,
    coins: 0
  },
  poagaca_box: {
    name: '🥐 Büyülü Poğaça Kutusu',
    key: '🥐 Büyülü Poğaça Kutusu',
    description: 'Kutudaki özel poğaçaları değerlendirdin ve 40 altın kazandın.',
    xp: 0,
    coins: 40
  },
  star_potion: {
    name: '🌠 Yıldız İksiri',
    key: '🌠 Yıldız İksiri',
    description: 'Yıldız büyüsü sana 100 XP kazandırdı.',
    xp: 100,
    coins: 0
  }
};

export default {
  data: new SlashCommandBuilder()
    .setName('esyakullan')
    .setDescription('Envanterindeki kullanılabilir bir eşyayı kullan.')
    .addStringOption(option =>
      option.setName('esya')
        .setDescription('Kullanmak istediğin eşya')
        .setRequired(true)
        .addChoices(
          { name: '🍵 Frieren Çayı (+25 XP)', value: 'frieren_tea' },
          { name: '🥐 Büyülü Poğaça Kutusu (+40 altın)', value: 'poagaca_box' },
          { name: '🌠 Yıldız İksiri (+100 XP)', value: 'star_potion' }
        )
    ),

  async execute(interaction) {
    if (!interaction.guildId) {
      return interaction.reply({ content: 'Bu komut yalnızca sunucularda kullanılabilir.', ephemeral: true });
    }

    const itemId = interaction.options.getString('esya', true);
    const item = usableItems[itemId];
    await ensureUser(interaction.guildId, interaction.user.id);

    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      const found = await db.query(
        'SELECT quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key=$3 FOR UPDATE',
        [interaction.guildId, interaction.user.id, item.key]
      );

      if (!found.rowCount || Number(found.rows[0].quantity) < 1) {
        await db.query('ROLLBACK');
        return interaction.reply({
          content: 'Bu eşya envanterinde yok. Önce /market üzerinden satın alman gerekiyor.',
          ephemeral: true
        });
      }

      if (Number(found.rows[0].quantity) === 1) {
        await db.query(
          'DELETE FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key=$3',
          [interaction.guildId, interaction.user.id, item.key]
        );
      } else {
        await db.query(
          'UPDATE inventory SET quantity=quantity-1 WHERE guild_id=$1 AND user_id=$2 AND item_key=$3',
          [interaction.guildId, interaction.user.id, item.key]
        );
      }

      const updated = await db.query(
        `UPDATE users SET
          xp = xp + $3,
          coins = coins + $4,
          level = FLOOR(SQRT((xp + $3)::numeric / 100))::int + 1
         WHERE guild_id=$1 AND user_id=$2
         RETURNING xp, coins, level`,
        [interaction.guildId, interaction.user.id, item.xp, item.coins]
      );

      await db.query('COMMIT');
      const user = updated.rows[0];
      const embed = new EmbedBuilder()
        .setColor(0x9b8cff)
        .setTitle('✨ Eşya kullanıldı!')
        .setDescription(item.description)
        .addFields(
          { name: '⭐ Toplam XP', value: Number(user.xp).toLocaleString('tr-TR'), inline: true },
          { name: '🪙 Altın', value: Number(user.coins).toLocaleString('tr-TR'), inline: true },
          { name: '🧭 Seviye', value: String(user.level), inline: true }
        )
        .setFooter({ text: 'Poğaça Frieren • Eşyalar kalıcı envanterinden düşülür' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
      await db.query('ROLLBACK').catch(() => {});
      console.error('Eşya kullanma hatası:', error);
      return interaction.reply({ content: 'Eşya kullanılırken bir sorun oluştu. Daha sonra tekrar dene.', ephemeral: true }).catch(() => {});
    } finally {
      db.release();
    }
  }
};
