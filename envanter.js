
import { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { pool, ensureUser } from './database/db.js';
import { equipmentItems, equipmentSlots, formatEquipmentBonus } from './equipment-data.js';

export default {
  data: new SlashCommandBuilder()
    .setName('envanter')
    .setDescription('Kalıcı eşya envanterini gösterir.'),

  async execute(interaction) {
    if (!interaction.guildId) {
      return interaction.reply({ content: 'Bu komut yalnızca sunucularda kullanılabilir.', ephemeral: true });
    }

    // Acknowledge immediately so inventory/equipment queries cannot expire the interaction.
    await interaction.deferReply({ ephemeral: true });
    await ensureUser(interaction.guildId, interaction.user.id);

    const { rows } = await pool.query(
      'SELECT item_key, quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 ORDER BY item_key',
      [interaction.guildId, interaction.user.id]
    );

    const equippedResult = await pool.query('SELECT slot,item_key FROM user_equipment WHERE guild_id=$1 AND user_id=$2', [interaction.guildId, interaction.user.id]);
    const equippedMap = new Map(equippedResult.rows.map(row => [row.slot, row.item_key]));
    const equipmentDescription = equipmentSlots.map(slot => {
      const name = equippedMap.get(slot.id);
      const item = equipmentItems.find(entry => entry.name === name);
      return slot.label + ': ' + (item ? item.name + ' — ' + formatEquipmentBonus(item) : 'Boş');
    }).join('\n');

    const description = rows.length
      ? rows.map(r => `• **${r.item_key}** × ${r.quantity}`).join('\n')
      : 'Envanterin şimdilik boş. Maceraya çıkarak eşya bulabilirsin!';

    const gif = new AttachmentBuilder('./envanter.gif');

    const embed = new EmbedBuilder()
      .setColor(0x9b8cff)
      .setTitle(`🎒 ${interaction.user.username} | Envanter`)
      .setDescription(description + '\n\n**🛡️ Kuşanılan ekipman**\n' + equipmentDescription)
      .setImage('attachment://envanter.gif')
      .setFooter({ text: 'Poğaça Frieren • Büyülü Eşya Koleksiyonu' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('market_open:' + interaction.user.id)
        .setLabel('Mağazaya git')
        .setEmoji('🛍️')
        .setStyle(ButtonStyle.Primary)
    );

    await interaction.editReply({
      embeds: [embed],
      files: [gif],
      components: [row],
      ephemeral: true
    });
  }
};
