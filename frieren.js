import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

const facts = [
  'Frieren, insanlarla geçirdiği zamanı sonradan daha iyi anlamaya çalışan uzun ömürlü bir elf büyücüsüdür.',
  'Frieren evreninde büyüler hem gündelik hayatın hem de maceraların bir parçasıdır.',
  'Bazen en önemsiz görünen büyü, en çok işe yarayan büyü olabilir.'
];

const frierenGif = 'https://tenor.com/nnYr0bqkFSc.gif';

export default {
  data: new SlashCommandBuilder()
    .setName('frieren')
    .setDescription('Frieren temalı rastgele bir bilgi gösterir.'),

  async execute(interaction) {
    const fact = facts[Math.floor(Math.random() * facts.length)];

    const embed = new EmbedBuilder()
      .setColor(0x9b8cff)
      .setTitle('✨ Frieren’ın Günlüğü')
      .setDescription(fact)
      .setFooter({ text: 'Poğaça Frieren • Frieren evreninden' });

    await interaction.reply({
      content: `✨ Frieren’dan bir an!\n${frierenGif}`,
      embeds: [embed]
    });
  }
};
