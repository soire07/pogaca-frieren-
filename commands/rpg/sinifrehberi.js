import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { characterClassGuide } from '../../rpg-mechanics.js';

export default {
  data: new SlashCommandBuilder().setName('sinifrehberi').setDescription('Karakter sınıflarını ve pasif bonuslarını karşılaştır.'),
  async execute(interaction) {
    const classes = characterClassGuide();
    const embed = new EmbedBuilder().setColor(0x9b8cff).setTitle('🧭 Frieren Dünyası — Sınıf Rehberi')
      .setDescription(classes.map(item => {
        const bonus = item.bonuses.length ? item.bonuses.join(' · ') : 'Özel çarpan yok; dengeli başlangıç';
        return `**${item.label}**\n${item.description}\n✨ ${bonus}`;
      }).join('\n\n'))
      .addFields({ name: 'Nasıl seçilir?', value: 'Sınıfını **/sinifsec** ile seçebilirsin. Sınıf pasifleri solo iblis savaşında, ortak boss baskınında ve katlı zindanda uygulanır.' })
      .setFooter({ text: 'Poğaça Frieren RPG • Takım rolü ile karakter sınıfı birbirinden ayrıdır.' });
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
