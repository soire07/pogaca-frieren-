import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('temizle')
    .setDescription('Kanaldaki son mesajlardan belirtilen sayıyı siler.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(option =>
      option
        .setName('miktar')
        .setDescription('1-100 mesaj')
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    ),

  async execute(interaction) {
    const amount = interaction.options.getInteger('miktar', true);
    const channel = interaction.channel;

    if (!interaction.inGuild() || !channel?.bulkDelete) {
      return interaction.reply({
        content: 'Bu komut yalnızca toplu silmeyi destekleyen sunucu kanallarında kullanılabilir.',
        ephemeral: true
      });
    }

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({
        content: 'Bu komut için **Mesajları Yönet** izni gerekiyor.',
        ephemeral: true
      });
    }

    const botPermissions = interaction.guild?.members?.me?.permissionsIn(channel);
    if (!botPermissions?.has(PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({
        content: 'Botun bu kanalda **Mesajları Yönet** izni yok.',
        ephemeral: true
      });
    }

    await interaction.deferReply({ ephemeral: true });
    try {
      const deleted = await channel.bulkDelete(amount, true);
      await interaction.editReply(
        `🧹 ${deleted.size} mesaj silindi. 14 günden eski mesajlar Discord kuralı gereği toplu silinemez.`
      );
    } catch (error) {
      console.error(' /temizle başarısız:', error);
      await interaction.editReply(
        'Mesajlar silinemedi. Bot izinlerini ve kanal türünü kontrol et; 14 günden eski mesajlar toplu silinemez.'
      );
    }
  }
};
