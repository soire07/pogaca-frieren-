import { SlashCommandBuilder } from 'discord.js';
import { createApprovalRequest } from '../owner-admin.js';
import { pool } from '../database/db.js';

export default {
  data: new SlashCommandBuilder().setName('teknik-talep').setDescription('Owner incelemesi için kod veya teknik bilgi talebi oluşturur.')
    .addStringOption(option => option.setName('tur').setDescription('Talep türü').setRequired(true)
      .addChoices({ name: 'Kod talebi', value: 'kod' }, { name: 'Teknik bilgi', value: 'teknik-bilgi' }))
    .addStringOption(option => option.setName('baslik').setDescription('Kısa talep başlığı').setRequired(true).setMaxLength(160))
    .addStringOption(option => option.setName('aciklama').setDescription('Talebin ayrıntıları (en fazla 1800 karakter)').setRequired(true).setMaxLength(1800)),
  async execute(interaction) {
    const title = interaction.options.getString('baslik', true);
    const details = interaction.options.getString('aciklama', true);
    try {
      const id = await createApprovalRequest(pool, {
        requesterId: interaction.user.id,
        requesterTag: interaction.user.tag,
        requestType: interaction.options.getString('tur', true),
        title,
        details
      });
      await interaction.reply({ content: 'Talebin Owner inceleme kuyruğuna eklendi. Talep numarası: **#' + id + '**. Lütfen parola, token veya API anahtarı paylaşma.', flags: MessageFlags.Ephemeral });
    } catch (error) {
      const message = error.message === 'POSSIBLE_SECRET_IN_REQUEST'
        ? 'Açıklamada parola veya anahtar olabilecek bir ifade var. Gizli bilgileri paylaşmadan yeniden gönder.'
        : 'Talep kaydedilemedi. Başlığı ve açıklamayı kontrol et.';
      await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
    }
  }
};
