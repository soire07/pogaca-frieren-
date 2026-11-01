import { SlashCommandBuilder } from 'discord.js';
import { ownerOnly, listPendingApprovals, reviewApproval, createOwnerEmbed } from '../owner-admin.js';
import { pool } from '../database/db.js';

export default {
  data: new SlashCommandBuilder().setName('owner-onay').setDescription('Bekleyen kod ve teknik bilgi taleplerini inceler.')
    .addSubcommand(sub => sub.setName('listele').setDescription('Bekleyen talepleri listeler.'))
    .addSubcommand(sub => sub.setName('karar').setDescription('Bir talebi onaylar veya reddeder.')
      .addIntegerOption(option => option.setName('id').setDescription('Talep numarası').setRequired(true).setMinValue(1))
      .addStringOption(option => option.setName('sonuc').setDescription('Karar').setRequired(true)
        .addChoices({ name: 'Onayla', value: 'approved' }, { name: 'Reddet', value: 'rejected' }))),
  async execute(interaction) {
    if (!await ownerOnly(interaction)) return;
    if (interaction.options.getSubcommand() === 'listele') {
      const rows = await listPendingApprovals(pool, 8);
      const description = rows.length ? rows.map(row => '**#' + row.id + ' · ' + row.title + '**\nTür: ' + row.request_type + ' · Gönderen: ' + row.requester_tag + '\n' + String(row.details).slice(0, 140)).join('\n\n') : 'Bekleyen talep bulunmuyor.';
      return interaction.reply({ embeds: [createOwnerEmbed('Bekleyen teknik talepler', description)], flags: MessageFlags.Ephemeral });
    }
    const id = interaction.options.getInteger('id', true);
    const decision = interaction.options.getString('sonuc', true);
    const result = await reviewApproval(pool, id, decision, interaction.user.id);
    return interaction.reply({ content: result ? '#' + result.id + ' numaralı talep ' + (decision === 'approved' ? 'onaylandı' : 'reddedildi') + '. Onay, kodu otomatik çalıştırmaz.' : 'Bu talep bulunamadı veya daha önce sonuçlandırıldı.', flags: MessageFlags.Ephemeral });
  }
};
