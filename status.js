import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';

function formatUptime(milliseconds) {
  const totalSeconds = Math.floor(Math.max(0, milliseconds) / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [days ? `${days}g` : '', hours ? `${hours}sa` : '', minutes ? `${minutes}dk` : '', `${seconds}sn`]
    .filter(Boolean).join(' ');
}

export default {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('Frieren botunun çalışma durumunu gösterir.'),
  async execute(interaction) {
    const client = interaction.client;
    const ping = client.ws.ping;
    const embed = new EmbedBuilder()
      .setColor(client.isReady() ? 0x57F287 : 0xED4245)
      .setTitle('✨ Poğaça Frieren • Bot Durumu')
      .setDescription(client.isReady() ? 'Bot çalışıyor ve Discord bağlantısı hazır.' : 'Bot henüz hazır değil.')
      .addFields(
        { name: 'Bağlantı', value: client.isReady() ? '🟢 Çevrimiçi' : '🔴 Hazır değil', inline: true },
        { name: 'Gecikme', value: Number.isFinite(ping) && ping >= 0 ? `${Math.round(ping)} ms` : 'Ölçülemiyor', inline: true },
        { name: 'Çalışma süresi', value: formatUptime(client.uptime ?? 0), inline: true },
        { name: 'Sunucu sayısı', value: String(client.guilds.cache.size), inline: true },
        { name: 'Yüklü komut', value: String(client.commands?.size ?? 0), inline: true },
        { name: 'Node.js', value: process.version, inline: true },
      )
      .setTimestamp()
      .setFooter({ text: 'Durum bilgisi canlı bot sürecinden alınır.' });
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
