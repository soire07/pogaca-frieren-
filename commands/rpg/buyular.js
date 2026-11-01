import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { pool, ensureUser } from '../../database/db.js';

const spellDetails = {
  zoltraak: { name: '⚡ Zoltraak', cost: 'Başlangıç büyüsü', effect: '8 Mana · Dengeli saldırı' },
  alev_kuresi: { name: '🔥 Alev Küresi', cost: '180 altın', effect: '14 Mana · Yüksek hasar' },
  buz_mizragi: { name: '🧊 Buz Mızrağı', cost: '160 altın', effect: '12 Mana · %35 dondurma ihtimali' },
  koruyucu_bariyer: { name: '🛡️ Koruyucu Bariyer', cost: '120 altın', effect: '6 Mana · Karşı saldırıyı azaltır' },
  sifa_isigi: { name: '💚 Şifa Işığı', cost: '200 altın', effect: '20 Mana · Savaşta bir kez iyileştirir' },
  yildirim_zinciri: { name: '⚡ Yıldırım Zinciri', cost: '420 altın · Sv.10 + 3 boss', effect: '22 Mana · Yüksek zincir hasarı' },
  tas_duvar: { name: '🪨 Taş Duvar', cost: '360 altın · Sv.15 + 5 boss', effect: '12 Mana · Bir sonraki saldırının %75’ini engeller' },
  mana_patlamasi: { name: '🌌 Mana Patlaması', cost: '650 altın · Sv.25 + 10 boss', effect: '30 Mana · Çok yüksek hasar' }
};

export default {
  data: new SlashCommandBuilder()
    .setName('buyular')
    .setDescription('Öğrendiğin savaş büyülerini ve etkilerini göster.'),

  async execute(interaction) {
    if (!interaction.guildId) {
      return interaction.reply({ content: 'Büyü arşivi yalnızca sunucularda kullanılabilir.', flags: MessageFlags.Ephemeral });
    }
    await ensureUser(interaction.guildId, interaction.user.id);
    const result = await pool.query(
      'SELECT spell_key, learned_at FROM learned_spells WHERE guild_id=$1 AND user_id=$2 ORDER BY learned_at ASC',
      [interaction.guildId, interaction.user.id]
    );
    // Zoltraak is granted by default and may not have a row in learned_spells yet.
    const known = new Set(['zoltraak', ...result.rows.map(row => row.spell_key)]);
    const lines = [...known].map(spellKey => {
      const row = { spell_key: spellKey };
      const spell = spellDetails[row.spell_key];
      return spell ? `• **${spell.name}** — ${spell.effect} _(${spell.cost})_` : `• ${row.spell_key}`;
    });

    const embed = new EmbedBuilder()
      .setColor(0x9b8cff)
      .setTitle('📚 Öğrendiğin Savaş Büyüleri')
      .setDescription(lines.length ? lines.join('\n') : 'Henüz savaş büyüsü öğrenmedin. /buyuogren komutunu kullan.')
      .setFooter({ text: `Poğaça Frieren • ${lines.length} kullanılabilir büyü · Zoltraak başlangıç büyüsüdür` });
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
};
