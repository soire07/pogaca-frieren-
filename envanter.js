
import { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { pool, ensureUser } from './database/db.js';

export default {
  data: new SlashCommandBuilder()
    .setName('envanter')
    .setDescription('Kalıcı eşya envanterini gösterir.'),

  async execute(interaction) {
    await ensureUser(interaction.guildId, interaction.user.id);

    const { rows } = await pool.query(
      'SELECT item_key, quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 ORDER BY item_key',
      [interaction.guildId, interaction.user.id]
    );

    const description = rows.length
      ? rows.map(r => `• **${r.item_key}** × ${r.quantity}`).join('\n')
      : 'Envanterin şimdilik boş. Maceraya çıkarak eşya bulabilirsin!';

    const gif = new AttachmentBuilder('./envanter.gif');

    const embed = new EmbedBuilder()
      .setColor(0x9b8cff)
      .setTitle(`🎒 ${interaction.user.username} | Envanter`)
      .setDescription(description)
      .setImage('attachment://envanter.gif')
      .setFooter({ text: 'Poğaça Frieren • Büyülü Eşya Koleksiyonu' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('market_open:' + interaction.user.id)
        .setLabel('Mağazaya git')
        .setEmoji('🛍️')
        .setStyle(ButtonStyle.Primary)
    );

    await interaction.reply({
      embeds: [embed],
      files: [gif],
      components: [row],
      ephemeral: true
    });
  }
};
