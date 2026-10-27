import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { pool, ensureUser } from './database/db.js';
import { ADVENTURE_DISCOVERIES, COMPLETE_ADVENTURE_JOURNAL_REWARD } from './adventure-data.js';

export default {
  data: new SlashCommandBuilder()
    .setName('kesifdefteri')
    .setDescription('Maceralarda bulduğun yerleri, keşif ödüllerini ve tamamlanma durumunu gör.'),
  async execute(interaction) {
    if (!interaction.guildId) return interaction.reply({ content: 'Bu komut yalnızca sunucularda kullanılabilir.', ephemeral: true });
    await ensureUser(interaction.guildId, interaction.user.id);
    const { rows } = await pool.query(
      'SELECT discovery_key, discovered_at FROM adventure_discoveries WHERE guild_id=$1 AND user_id=$2 ORDER BY discovered_at',
      [interaction.guildId, interaction.user.id]
    );
    const discovered = new Set(rows.map(row => row.discovery_key));
    const { rows: [claim] } = await pool.query(
      'SELECT claimed_at FROM adventure_journal_claims WHERE guild_id=$1 AND user_id=$2',
      [interaction.guildId, interaction.user.id]
    );
    const embed = new EmbedBuilder()
      .setColor(0x9b8cff)
      .setTitle('📔 Macera Keşif Defteri')
      .setDescription(`Keşfedilen yerler: **${discovered.size}/${ADVENTURE_DISCOVERIES.length}**\nHer yeni keşif +25 altın ve +15 XP verir. Defteri tamamlamak tek seferlik +${COMPLETE_ADVENTURE_JOURNAL_REWARD.coins} altın kazandırır.`)
      .addFields(ADVENTURE_DISCOVERIES.map(entry => ({
        name: `${discovered.has(entry.key) ? '✅' : '🔒'} ${entry.emoji} ${entry.name}`,
        value: `${entry.description}\nDurum: **${discovered.has(entry.key) ? 'Keşfedildi' : 'Henüz keşfedilmedi'}**`,
        inline: true
      })))
      .setFooter({ text: claim ? '🏆 Keşif defteri tamamlandı ve ödül alındı.' : 'Poğaça Frieren • Yeni yerler görmek için /macera kullan.' });
    return interaction.reply({ embeds: [embed] });
  }
};
