import { SlashCommandBuilder } from 'discord.js';
const results = [
  '📦 Sandık açıldı... MIMIC! Frieren yine tuzağa düştü.',
  '✨ Bu sefer gerçek bir hazine buldun. İçinden 3 altın poğaça çıktı.',
  '👀 Sandık şüpheli görünüyor. Fern sana dokunmamanı söylüyor.',
  '🥐 Sandığın içinden yalnızca bayat bir poğaça çıktı. Büyük hayal kırıklığı.'
];
export default {
  data: new SlashCommandBuilder().setName('mimic').setDescription('Mimic sandığının içini kontrol et.'),
  async execute(interaction) { await interaction.reply(results[Math.floor(Math.random() * results.length)]); }
};
