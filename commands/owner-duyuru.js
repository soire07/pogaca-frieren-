import { SlashCommandBuilder } from 'discord.js';
import { ownerOnly, sendOwnerAnnouncement } from '../owner-admin.js';
import { pool } from '../database/db.js';

export default {
  data: new SlashCommandBuilder().setName('owner-duyuru').setDescription('Seçtiğin sunucudaki kanala duyuru gönderir.')
    .addStringOption(option => option.setName('sunucu').setDescription('Hedef Discord sunucu ID').setRequired(true))
    .addStringOption(option => option.setName('kanal').setDescription('Hedef metin kanalı ID').setRequired(true))
    .addStringOption(option => option.setName('mesaj').setDescription('Duyuru metni (en fazla 1800 karakter)').setRequired(true))
    .addBooleanOption(option => option.setName('onay').setDescription('Bu sunucu ve kanala gönderimi onayla').setRequired(true)),
  async execute(interaction) {
    if (!await ownerOnly(interaction)) return;
    if (!interaction.options.getBoolean('onay', true)) return interaction.reply({ content: 'Duyuru gönderimi için onay=true seçmelisin.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    try {
      const result = await sendOwnerAnnouncement(interaction.client, pool, {
        guildId: interaction.options.getString('sunucu', true),
        channelId: interaction.options.getString('kanal', true),
        message: interaction.options.getString('mesaj', true),
        actorId: interaction.user.id
      });
      await interaction.editReply('Duyuru gönderildi: **' + result.guildName + ' / #' + result.channelName + '**.');
    } catch (error) {
      const messages = {
        GUILD_NOT_FOUND: 'Bot bu sunucuda bulunamadı.',
        CHANNEL_NOT_SENDABLE: 'Hedef kanal mesaj gönderimini desteklemiyor.',
        MISSING_SEND_PERMISSION: 'Botun hedef kanalda mesaj gönderme izni yok.',
        INVALID_ANNOUNCEMENT: 'Sunucu, kanal veya mesaj bilgisi geçersiz.'
      };
      await interaction.editReply(messages[error.message] || 'Duyuru gönderilemedi. Teknik hata kaydedildi.');
      if (!messages[error.message]) console.error('Owner announcement failed:', error?.message || error);
    }
  }
};
