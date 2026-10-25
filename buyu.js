import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
const spells = [
  ['Zoltraak', 'Kurgusal saldırı büyüsü — hedefe güçlü bir büyü enerjisi gönderir.'],
  ['Çiçek Bahçesi', 'Etrafı çiçeklerle dolduran huzurlu bir büyü.'],
  ['Temizlik Büyüsü', 'Macera sonrası pelerinindeki tozu temizlemeye yarar.'],
  ['Poğaça Isıtma Büyüsü', 'Poğaçanı tam kararında ısıtır. Frieren bile tarifini sorabilir.'],
  ['Mimic Tespit Büyüsü', 'Sandığın gerçekten güvenli olup olmadığını kontrol etmeye çalışır.']
];
export default {
  data: new SlashCommandBuilder().setName('buyu').setDescription('Rastgele bir büyü keşfet.'),
  async execute(interaction) {
    const [name, description] = spells[Math.floor(Math.random() * spells.length)];
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x9b8cff).setTitle(`🔮 ${name}`).setDescription(description)] });
  }
};
