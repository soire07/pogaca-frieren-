import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { pool, ensureUser } from '../../database/db.js';

const spells = {
  alev_kuresi: { name: '🔥 Alev Küresi', cost: 180, description: 'Yüksek hasarlı ateş saldırısı.' },
  buz_mizragi: { name: '🧊 Buz Mızrağı', cost: 160, description: 'Hasar verir ve bazen düşmanın turunu durdurur.' },
  koruyucu_bariyer: { name: '🛡️ Koruyucu Bariyer', cost: 120, description: 'İblisin karşı saldırısını azaltır.' },
  sifa_isigi: { name: '💚 Şifa Işığı', cost: 200, description: 'Savaş sırasında bir kez canını yeniler.' }
};

export default {
  data: new SlashCommandBuilder()
    .setName('buyuogren')
    .setDescription('Altın harcayarak yeni bir savaş büyüsü öğren.')
    .addStringOption(option =>
      option.setName('buyu')
        .setDescription('Öğrenmek istediğin büyü')
        .setRequired(true)
        .addChoices(
          { name: '🔥 Alev Küresi — 180 altın', value: 'alev_kuresi' },
          { name: '🧊 Buz Mızrağı — 160 altın', value: 'buz_mizragi' },
          { name: '🛡️ Koruyucu Bariyer — 120 altın', value: 'koruyucu_bariyer' },
          { name: '💚 Şifa Işığı — 200 altın', value: 'sifa_isigi' }
        )
    ),

  async execute(interaction) {
    if (!interaction.guildId) {
      return interaction.reply({ content: 'Büyüler yalnızca sunucularda öğrenilebilir.', ephemeral: true });
    }

    const spellKey = interaction.options.getString('buyu', true);
    const spell = spells[spellKey];
    await ensureUser(interaction.guildId, interaction.user.id);

    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      const already = await db.query(
        'SELECT 1 FROM learned_spells WHERE guild_id=$1 AND user_id=$2 AND spell_key=$3 FOR UPDATE',
        [interaction.guildId, interaction.user.id, spellKey]
      );
      if (already.rowCount) {
        await db.query('ROLLBACK');
        return interaction.reply({ content: `Bu büyüyü zaten öğrendin: **${spell.name}**. /buyular ile büyü arşivini görebilirsin.`, ephemeral: true });
      }

      const purchase = await db.query(
        'UPDATE users SET coins=coins-$3 WHERE guild_id=$1 AND user_id=$2 AND coins >= $3 RETURNING coins',
        [interaction.guildId, interaction.user.id, spell.cost]
      );
      if (!purchase.rowCount) {
        await db.query('ROLLBACK');
        return interaction.reply({ content: `**${spell.name}** öğrenmek için ${spell.cost} altın gerekiyor. Bakiyeni /bakiye ile kontrol et.`, ephemeral: true });
      }

      await db.query(
        'INSERT INTO learned_spells (guild_id,user_id,spell_key) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [interaction.guildId, interaction.user.id, spellKey]
      );
      await db.query('COMMIT');

      const embed = new EmbedBuilder()
        .setColor(0x65d6a6)
        .setTitle('📜 Yeni büyü öğrenildi!')
        .setDescription(`**${spell.name}** artık büyü repertuvarında.\n${spell.description}`)
        .addFields(
          { name: '💰 Harcanan', value: `${spell.cost.toLocaleString('tr-TR')} altın`, inline: true },
          { name: '🪙 Kalan bakiye', value: Number(purchase.rows[0].coins).toLocaleString('tr-TR') + ' altın', inline: true }
        )
        .setFooter({ text: 'Poğaça Frieren • /buyular ile öğrendiğin büyüleri gör' });
      return interaction.reply({ embeds: [embed], ephemeral: false });
    } catch (error) {
      await db.query('ROLLBACK').catch(() => {});
      console.error('/buyuogren hatası:', error);
      return interaction.reply({ content: 'Büyü öğrenilirken bir hata oluştu. Lütfen daha sonra tekrar dene.', ephemeral: true }).catch(() => {});
    } finally {
      db.release();
    }
  }
};
