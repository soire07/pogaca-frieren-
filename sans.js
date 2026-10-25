import { SlashCommandBuilder } from 'discord.js';
export default {
  data: new SlashCommandBuilder().setName('sans').setDescription('Bugünkü eğlencelik şans yüzdesini gösterir.'),
  async execute(interaction) {
    const luck = Math.floor(Math.random() * 101);
    const comment = luck > 80 ? 'Bugün yıldızlar senden yana!' : luck > 45 ? 'Fena değil, bir poğaça kapabilirsin.' : 'Frieren gibi biraz daha beklemen gerekebilir.';
    await interaction.reply(`🍀 ${interaction.user} için bugünkü şans: **%${luck}**\n${comment}\n*Bu sonuç tamamen eğlence amaçlıdır.*`);
  }
};
