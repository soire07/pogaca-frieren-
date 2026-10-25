import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
const facts = [
  'Frieren, insanlarla geçirdiği zamanı sonradan daha iyi anlamaya çalışan uzun ömürlü bir elf büyücüdür.',
  'Frieren evreninde büyüler hem gündelik hayatın hem de maceraların bir parçasıdır.',
  'Bazen en önemsiz görünen büyü, en çok işe yarayan büyü olabilir.'
];
export default {
  data: new SlashCommandBuilder().setName('frieren').setDescription('Frieren temalı rastgele bir bilgi gösterir.'),
  async execute(interaction) {
    const embed = new EmbedBuilder().setColor(0x9b8cff).setTitle('✨ Frieren’ın Günlüğü').setDescription(facts[Math.floor(Math.random() * facts.length)]);
    await interaction.reply({ embeds: [embed] });
  }
};
