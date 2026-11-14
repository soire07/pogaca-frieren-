import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  SlashCommandBuilder
} from 'discord.js';

const SITE_URL = 'https://frierenbot.vercel.app';
const SITE_BANNER_URL = `${SITE_URL}/site-banner.webp`;

export default {
  data: new SlashCommandBuilder()
    .setName('site')
    .setDescription('Frieren Portalı’nı, web özelliklerini ve maceracı panelini tanıt.'),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x8f78c8)
      .setTitle('🌙 Frieren Portalı')
      .setURL(SITE_URL)
      .setDescription(
        '**Bir yolculuk, bin yıllık bir hikâye.**\n' +
        'Poğaça Frieren’in dünyasını Discord’un ötesinde keşfet! Frieren evreni, maceracı gelişimi ve topluluk özellikleri tek bir portalda buluşuyor.\n\n' +
        '🔗 **Portal:** ' + SITE_URL
      )
      .addFields(
        {
          name: '🧭 Maceracı Paneli',
          value: 'Karakterini ve RPG ilerlemeni web üzerinden görüntüle; maceracı kimliğini Discord hesabınla güvenli biçimde bağla.',
          inline: false
        },
        {
          name: '⚔️ RPG ve Keşif',
          value: 'Envanter, ekipman, koleksiyon, pazar, etkinlikler ve macera sistemlerini tek noktadan takip et.',
          inline: true
        },
        {
          name: '✨ Frieren Dünyası',
          value: 'Büyüler, yol arkadaşları, keşif alanları ve topluluk deneyimiyle yolculuğunu sürdür.',
          inline: true
        },
        {
          name: '🌐 Her şey tek portalda',
          value: 'Siteyi ziyaret et, özellikleri keşfet ve Frieren topluluğuna katıl. Yeni maceran burada başlıyor.',
          inline: false
        }
      )
      .setImage(SITE_BANNER_URL)
      .setFooter({ text: 'Poğaça Frieren • Frieren Portalı' });

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Siteyi Ziyaret Et')
        .setStyle(ButtonStyle.Link)
        .setURL(SITE_URL)
        .setEmoji('🌙')
    );

    await interaction.reply({ embeds: [embed], components: [buttons] });
  }
};
