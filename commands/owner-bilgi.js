import { SlashCommandBuilder } from 'discord.js';
import { ownerOnly, getOwnerOverview, createOwnerEmbed, formatDuration } from '../owner-admin.js';
import { pool } from '../database/db.js';

export default {
  data: new SlashCommandBuilder().setName('owner-bilgi').setDescription('Frieren botunun çalışma ve bağlantı durumunu gösterir.'),
  async execute(interaction) {
    if (!await ownerOnly(interaction)) return;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const s = await getOwnerOverview(interaction.client, pool);
    const embed = createOwnerEmbed('Frieren · Sistem Durumu', 'Canlı bot sürecinden alınan teknik bilgiler.', s.ready ? 0x57F287 : 0xED4245)
      .addFields(
        { name: 'Bot', value: s.ready ? 'Çevrimiçi' : 'Hazır değil', inline: true },
        { name: 'Discord gecikmesi', value: s.ping === null ? 'Ölçülemiyor' : s.ping + ' ms', inline: true },
        { name: 'Çalışma süresi', value: formatDuration(s.uptimeSeconds), inline: true },
        { name: 'Sunucular', value: String(s.guildCount), inline: true },
        { name: 'Komutlar', value: String(s.commandCount), inline: true },
        { name: 'Veritabanı', value: s.databaseReady ? 'Bağlı' : 'Hata', inline: true },
        { name: 'Bellek kayıtları', value: String(s.memoryCount), inline: true },
        { name: 'Bekleyen onaylar', value: String(s.pendingApprovals), inline: true },
        { name: 'Bakım modu', value: s.maintenance ? 'Açık' : 'Kapalı', inline: true },
        { name: 'RAM (RSS)', value: (s.rssBytes / 1024 / 1024).toFixed(1) + ' MB', inline: true },
        { name: 'Heap', value: (s.heapUsedBytes / 1024 / 1024).toFixed(1) + ' MB', inline: true },
        { name: 'Node.js', value: s.nodeVersion, inline: true }
      );
    await interaction.editReply({ embeds: [embed] });
  }
};
