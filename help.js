import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder().setName('yardim').setDescription('Poğaça Frieren komutlarını kategorilerle gösterir.'),
  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x9b8cff)
      .setTitle('🥐 Poğaça Frieren | Komut Rehberi')
      .setDescription('Frieren büyüleri, poğaça mizahı, RPG ve moderasyon bir arada.')
      .addFields(
        { name: '✨ Anime', value: '`/frieren` `/buyu` `/mimic`', inline: true },
        { name: '😂 Eğlence', value: '`/pogaca` `/sans` `/saril`', inline: true },
        { name: '⚔️ RPG', value: '`/profil` `/gunlukodul` `/envanter` `/macera`', inline: true },
        { name: '🛡️ Moderasyon', value: '`/uyar` `/timeout` `/ban` `/temizle`', inline: true },
        { name: '📊 Genel', value: '`/istatistik` `/yardim`', inline: true }
      )
      .setFooter({ text: 'Yeni özellikler aşama aşama eklenecek.' });
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
