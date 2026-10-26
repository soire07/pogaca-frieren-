import { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } from 'discord.js';

const sections = [
  {
    name: '🪄 Frieren evreni',
    value: '`/frieren` • Bilgi kartı\n`/buyu` • Rastgele büyü\n`/buyukitabi` • Büyü arşivi\n`/karakter` • Karakter rehberi\n`/mimic` • Mimic şakası'
  },
  {
    name: '🎴 Karakter koleksiyonu',
    value: '`/kimimben` • Karakter keşfet\n`/karaktercek` • Günlük ücretsiz çekim\n`/koleksiyon` • Koleksiyonunu gör\n`/karaktergelistir` • Karakterini güçlendir\n`/takasteklif` • Kopya takas et\n`/parcala` • Fazla kopyayı altına çevir'
  },
  {
    name: '⚔️ Macera ve RPG',
    value: '`/profil` • RPG profilin\n`/macera` • Keşfe çık\n`/buyusavasi` • Oyuncuya karşı düello\n`/iblisavasi` • İblis boss savaşı\n`/gunlukodul` • Günlük altın\n`/gunlukgorev` • Günlük görevler\n`/basarimlar` • Başarımlar\n`/liderlik` • Sunucu sıralaması'
  },
  {
    name: '💰 Ekonomi ve eşyalar',
    value: '`/bakiye` • Altın bakiyesi\n`/market` • Büyülü market\n`/envanter` • Eşyalarını gör\n`/esyakullan` • Kullanılabilir eşya kullan'
  },
  {
    name: '🎲 Eğlence ve topluluk',
    value: '`/animequiz` • Anime bilgi yarışması\n`/pogaca` • Poğaça molası\n`/sans` • Şansını dene\n`/saril` • Birine sarıl\n`/istatistik` • Bot istatistikleri'
  },
  {
    name: '🛡️ Sunucu yönetimi',
    value: '`/kurulum` • Karşılama ve log ayarları\n`/uyar` • Uyarı kaydı\n`/timeout` • Üyeyi sustur\n`/ban` • Üyeyi yasakla\n`/temizle` • Mesajları temizle'
  }
];

export default {
  data: new SlashCommandBuilder()
    .setName('yardim')
    .setDescription('Poğaça Frieren komutlarını kategorilerle göster.'),

  async execute(interaction) {
    const gif = new AttachmentBuilder('./yardim.gif');
    const embed = new EmbedBuilder()
      .setColor(0x9b8cff)
      .setTitle('🥐 Poğaça Frieren • Büyücü Rehberi')
      .setDescription('Selam gezgin! Frieren’in büyü arşivini keşfet, yol arkadaşları topla, iblislerle savaş ve poğaça altınını biriktir.\n\n**Başlangıç önerisi:** `/kimimben` → `/profil` → `/macera`')
      .addFields(sections)
      .setImage('attachment://yardim.gif')
      .setFooter({ text: 'Bütün altınlar, karakterler ve ilerleme sunucu bazında saklanır.' });
    await interaction.reply({ embeds: [embed], files: [gif], ephemeral: true });
  }
};
