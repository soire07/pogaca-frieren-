
import { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { pool, ensureUser } from './database/db.js';

const outcomes = [
  { text: 'Ormanda kayıp bir büyü kitabı buldun!', coins: 35, xp: 25, item: '📖 Yasak Büyü Kitabı' },
  { text: 'Bir Mimic seni kovaladı ama kaçmayı başardın.', coins: 15, xp: 20, item: null },
  { text: 'Yol kenarında bir fırın buldun. Fırıncı sana ödül verdi!', coins: 60, xp: 15, item: '🥐 Büyülü Poğaça Kutusu' },
  { text: 'Eski bir harabede gizli bir oda keşfettin.', coins: 45, xp: 40, item: '💎 Mana Kristali' }
];

export default {
  data: new SlashCommandBuilder()
    .setName('macera')
    .setDescription('Küçük bir maceraya çık ve ödül kazan.'),

  async execute(interaction) {
    await ensureUser(interaction.guildId, interaction.user.id);

    const outcome = outcomes[Math.floor(Math.random() * outcomes.length)];
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const { rows: [u] } = await client.query(
        'SELECT coins, xp, last_adventure_at FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE',
        [interaction.guildId, interaction.user.id]
      );

      if (u.last_adventure_at && Date.now() - new Date(u.last_adventure_at).getTime() < 300_000) {
        await client.query('ROLLBACK');
        return interaction.reply({
          content: '⏳ Yeni maceraya çıkmadan önce 5 dakika beklemelisin.',
          ephemeral: true
        });
      }

      const newXp = u.xp + outcome.xp;
      const newLevel = Math.floor(Math.sqrt(newXp / 100)) + 1;

      await client.query(
        'UPDATE users SET coins=coins+$3, xp=$4, level=$5, last_adventure_at=NOW() WHERE guild_id=$1 AND user_id=$2',
        [interaction.guildId, interaction.user.id, outcome.coins, newXp, newLevel]
      );

      if (outcome.item) {
        await client.query(
          `INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,$3,1)
           ON CONFLICT(guild_id,user_id,item_key)
           DO UPDATE SET quantity=inventory.quantity+1`,
          [interaction.guildId, interaction.user.id, outcome.item]
        );
      }

      await client.query('COMMIT');

      const itemText = outcome.item
        ? `\nBulduğun eşya: **${outcome.item}**`
        : '';

      const gif = new AttachmentBuilder('./macera.gif');

      const embed = new EmbedBuilder()
        .setColor(0x9b8cff)
        .setTitle('🗺️ Macera Tamamlandı')
        .setDescription(
          `${outcome.text}\n\nÖdül: **${outcome.coins}** altın ve **${outcome.xp} XP**${itemText}`
        )
        .addFields({
          name: 'Yeni seviye',
          value: String(newLevel),
          inline: true
        })
        .setImage('attachment://macera.gif')
        .setFooter({ text: 'Poğaça Frieren • Macera Günlüğü' });

      await interaction.reply({
        embeds: [embed],
        files: [gif]
      });
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
};
