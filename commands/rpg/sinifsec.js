import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { pool, ensureUser } from '../../database/db.js';
import { CHARACTER_CLASSES } from '../../rpg-mechanics.js';

const options = Object.entries(CHARACTER_CLASSES).map(([value, profile]) => ({ name: profile.label, value }));

export default {
  data: new SlashCommandBuilder()
    .setName('sinifsec')
    .setDescription('Macera tarzına uygun kalıcı karakter sınıfını seç.')
    .addStringOption(option => option.setName('sinif').setDescription('Seçeceğin sınıf').setRequired(true)
      .addChoices(...options)),

  async execute(interaction) {
    if (!interaction.guildId) return interaction.reply({ content: 'Sınıfını yalnızca sunucuda seçebilirsin.', ephemeral: true });
    const key = interaction.options.getString('sinif', true);
    const profile = CHARACTER_CLASSES[key];
    if (!profile) return interaction.reply({ content: 'Bu sınıf seçeneği geçerli değil.', ephemeral: true });
    await ensureUser(interaction.guildId, interaction.user.id);
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      await db.query('SELECT user_id FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE', [interaction.guildId, interaction.user.id]);
      const result = await db.query('UPDATE users SET class_name=$3 WHERE guild_id=$1 AND user_id=$2 RETURNING class_name', [interaction.guildId, interaction.user.id, profile.label]);
      await db.query('COMMIT');
      const details = {
        buyucu: '✨ Saldırı ve büyü hasarı savaşta %8 artar.',
        muhafiz: '🛡️ Savunma etkisi savaşta %12 artar.',
        sifaci: '💚 İyileştirme etkisi %20 artar.',
        gezgin: '⚖️ Ek sınıf çarpanı yok; dengeli başlangıç sınıfı.'
      }[key];
      const embed = new EmbedBuilder().setColor(0x9b8cff).setTitle('🧭 Sınıfın belirlendi: ' + profile.label)
        .setDescription(profile.description + '\n\n' + details)
        .setFooter({ text: 'Poğaça Frieren • Sınıfını istediğin zaman yeniden seçebilirsin.' });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
      await db.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { db.release(); }
  }
};
