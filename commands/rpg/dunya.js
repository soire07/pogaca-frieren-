import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

const regions = [
  {
    name: '🌾 Kuzey Toprakları',
    level: '1–5',
    danger: 'Düşük',
    description: 'Yolculuğa yeni başlayan büyücüler için güvenli yollar ve temel karşılaşmalar.'
  },
  {
    name: '🌲 Orman Yolu',
    level: '5–12',
    danger: 'Orta',
    description: 'Kaybolmuş patikalar, vahşi yaratıklar ve keşif görevleri.'
  },
  {
    name: '🏚️ Harabe Sınırı',
    level: '12–20',
    danger: 'Orta-Yüksek',
    description: 'Eski büyü kalıntıları, tuzaklar ve daha dayanıklı düşmanlar.'
  },
  {
    name: '🌋 İblis Bölgesi',
    level: '20–35',
    danger: 'Yüksek',
    description: 'İblislerle dolu tehlikeli alanlar; güçlü büyüler ve hazırlık gerektirir.'
  },
  {
    name: '🏰 Kuzey Platosu',
    level: '35+',
    danger: 'Çok yüksek',
    description: 'Usta maceracılar için zorlu mücadelelere ve boss karşılaşmalarına uygun son bölge.'
  }
];

export default {
  data: new SlashCommandBuilder()
    .setName('dunya')
    .setDescription('Frieren RPG dünyasının bölgelerini ve önerilen seviyeleri göster.'),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x9b8cff)
      .setTitle('🗺️ Frieren Dünyası • Bölge Rehberi')
      .setDescription(
        'Yolculuğunu planla, seviyene uygun bölgeyi seç. Seviyeler başlangıç için öneridir; bu rehber şimdilik bilgilendirme amaçlıdır.'
      )
      .addFields(
        regions.map(region => ({
          name: region.name,
          value: `**Önerilen seviye:** ${region.level}\n**Tehlike:** ${region.danger}\n${region.description}`,
          inline: false
        }))
      )
      .setFooter({ text: 'Poğaça Frieren • Dünya rehberi | Yeni bölgeler aşamalı olarak eklenecek.' });

    return interaction.reply({ embeds: [embed] });
  }
};
