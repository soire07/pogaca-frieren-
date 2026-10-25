import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
export default {
  data: new SlashCommandBuilder().setName('temizle').setDescription('Kanaldaki son mesajlardan belirtilen sayıyı siler.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(o => o.setName('miktar').setDescription('1-100 mesaj').setMinValue(1).setMaxValue(100).setRequired(true)),
  async execute(interaction) {
    const amount = interaction.options.getInteger('miktar', true);
    if (!interaction.channel?.bulkDelete) return interaction.reply({ content: 'Bu kanalda toplu silme desteklenmiyor.', ephemeral: true });
    const deleted = await interaction.channel.bulkDelete(amount, true);
    await interaction.reply({ content: `🧹 ${deleted.size} mesaj silindi. 14 günden eski mesajlar Discord kuralı gereği toplu silinemez.`, ephemeral: true });
  }
};
