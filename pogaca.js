import { SlashCommandBuilder } from 'discord.js';
const fillings = ['peynirli', 'patatesli', 'zeytinli', 'sürpriz dolgulu', 'Frieren’ın sakladığı son poğaça'];
export default {
  data: new SlashCommandBuilder().setName('pogaca').setDescription('Rastgele bir poğaça kazan.'),
  async execute(interaction) {
    const item = fillings[Math.floor(Math.random() * fillings.length)];
    await interaction.reply(`🥐 Fırın çalıştı! ${interaction.user} bugün **${item}** poğaça buldu.`);
  }
};
