import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { pool, ensureUser } from '../../database/db.js';

const spellDetails = {
  zoltraak: { name: '⚡ Zoltraak', cost: 'Başlangıç büyüsü', effect: '8 Mana · Dengeli saldırı' },
  alev_kuresi: { name: '🔥 Alev Küresi', cost: '180 altın', effect: '14 Mana · Yüksek hasar' },
  buz_mizragi: { name: '🧊 Buz Mızrağı', cost: '160 altın', effect: '12 Mana · %35 dondurma ihtimali' },
  koruyucu_bariyer: { name: '🛡️ Koruyucu Bariyer', cost: '120 altın', effect: '6 Mana · Karşı saldırıyı azaltır' },
  sifa_isigi: { name: '💚 Şifa Işığı', cost: '200 altın', effect: '20 Mana · Savaşta bir kez iyileştirir' }
};

export default {
  data: new SlashCommandBuilder()
    .setName('buyular')
    .setDescription('Öğrendiğin savaş büyülerini ve etkilerini göster.'),

  async execute(interaction) {
    if (!interaction.guildId) {
      return interaction.reply({ content: 'Büyü arşivi yalnızca sunucularda kullanılabilir.', ephemeral: true });
    }
    await ensureUser(interaction.guildId, interaction.user.id);
    const result = await pool.query(
      'SELECT spell_key, learned_at FROM learned_spells WHERE guild_id=$1 AND user_id=$2 ORDER BY learned_at ASC',
      [interaction.guildId, interaction.user.id]
    );
    const lines = result.rows.map(row => {
      const spell = spellDetails[row.spell_key];
      return spell ? `• **${spell.name}** — ${spell.effect} _(${spell.cost})_` : `• ${row.spell_key}`;
    });

    const embed = new EmbedBuilder()
      .setColor(0x9b8cff)
      .setTitle('📚 Öğrendiğin Savaş Büyüleri')
      .setDescription(lines.length ? lines.join('\n') : 'Henüz savaş büyüsü öğrenmedin. /buyuogren komutunu kullan.')
      .setFooter({ text: `Poğaça Frieren • ${lines.length} öğrenilmiş büyü` });
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
