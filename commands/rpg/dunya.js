import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

const regions = [
  {
    name: '🌾 Merkez Topraklar',
    level: '1–5',
    danger: 'Düşük',
    description: 'Kasabalar, hanlar ve başlangıç görevleri. Yolculuğa yeni başlayan büyücüler için önerilen rota.'
  },
  {
    name: '🌲 Büyük Orman Yolları',
    level: '5–12',
    danger: 'Orta',
    description: 'Sisli patikalar, büyülü bitkiler, mana izleri ve vahşi yaratıklarla karşılaşmalar.'
  },
  {
    name: '🏚️ Kadim Harabeler',
    level: '12–20',
    danger: 'Orta-Yüksek',
    description: 'Eski uygarlıkların kalıntıları, mühürlü odalar, tuzaklar ve unutulmuş büyüler.'
  },
  {
    name: '🧭 Kuzey Topraklarına Giden Yol',
    level: '20–35',
    danger: 'Yüksek',
    description: 'Sert hava, uzun yolculuklar ve daha tehlikeli yaratıklar. İyi ekipman ve mana yönetimi gerekir.'
  },
  {
    name: '❄️ Kuzey Yaylaları',
    level: '35–50',
    danger: 'Çok yüksek',
    description: 'Zorlu geçitler, güçlü iblisler ve nadir ganimetler. İleride özel bölge bosslarıyla genişletilecek.'
  },
  {
    name: '🏰 Äußerst ve Sınav Rotası',
    level: '50+',
    danger: 'Usta seviyesi',
    description: 'Büyücü sınavı temalı görevler, özel karşılaşmalar ve yüksek seviyeli maceracılar için içerik rotası.'
  }
];

export default {
  data: new SlashCommandBuilder()
    .setName('dunya')
    .setDescription('Frieren dünyasının bölgelerini ve önerilen seviyeleri göster.'),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x9b8cff)
      .setTitle('🗺️ Frieren Dünyası • Yolculuk Rehberi')
      .setDescription(
        'Yolculuğunu planla ve seviyene uygun rotayı incele. Seviyeler oyun için öneridir; bu komut şimdilik rehber görevi görür, keşif bölgesini değiştirmez.'
      )
      .addFields(regions.map(region => ({
        name: region.name,
        value: `**Önerilen seviye:** ${region.level}\n**Tehlike:** ${region.danger}\n${region.description}`,
        inline: false
      })))
      .setFooter({ text: 'Poğaça Frieren • Yolculuk, büyüler ve hatıralar' });

    return interaction.reply({ embeds: [embed] });
  }
};
