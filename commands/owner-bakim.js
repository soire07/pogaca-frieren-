import { SlashCommandBuilder } from 'discord.js';
import { ownerOnly, setMaintenanceState } from '../owner-admin.js';
import { pool } from '../database/db.js';

export default {
  data: new SlashCommandBuilder().setName('owner-bakim').setDescription('Frieren bakım modunu açar veya kapatır.')
    .addBooleanOption(option => option.setName('aktif').setDescription('true: bakım modu açık, false: kapalı').setRequired(true)),
  async execute(interaction) {
    if (!await ownerOnly(interaction)) return;
    const enabled = interaction.options.getBoolean('aktif', true);
    await setMaintenanceState(pool, enabled, interaction.user.id);
    await interaction.reply({ content: enabled ? 'Bakım modu açıldı. Owner dışındaki kullanıcı komutları geçici olarak durduruldu.' : 'Bakım modu kapatıldı. Bot normal çalışmaya döndü.', flags: MessageFlags.Ephemeral });
  }
};
