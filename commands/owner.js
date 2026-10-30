import { SlashCommandBuilder } from 'discord.js';
import { ownerOnly, OWNER_PANEL_URL, auditOwnerAction } from '../owner-admin.js';
import { pool } from '../database/db.js';

export default {
  data: new SlashCommandBuilder().setName('owner').setDescription('Sana özel Frieren Owner kontrol panelini açar.'),
  async execute(interaction) {
    if (!await ownerOnly(interaction)) return;
    await auditOwnerAction(pool, interaction.user.id, 'panel.open');
    await interaction.reply({ content: '**Frieren Owner Panel**\n' + OWNER_PANEL_URL + '\n\nBu bağlantı yalnızca senin Discord hesabınla açılır.', ephemeral: true });
  }
};
