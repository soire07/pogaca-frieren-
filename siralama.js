import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { pool, ensureUser } from './database/db.js';

const rankings = {
  level: { label: 'Seviye', column: 'level', emoji: '⭐', format: value => `Seviye ${value}` },
  xp: { label: 'Toplam XP', column: 'xp', emoji: '✨', format: value => `${Number(value).toLocaleString('tr-TR')} XP` },
  coins: { label: 'Altın', column: 'coins', emoji: '🪙', format: value => `${Number(value).toLocaleString('tr-TR')} altın` },
  bosses: { label: 'İblis zaferi', column: 'boss_defeats', emoji: '👹', format: value => `${value} zafer` },
  dungeons: { label: 'Zindan zaferi', column: 'dungeon_wins', emoji: '⚔️', format: value => `${value} zafer` },
  exploration: { label: 'Keşif', column: 'exploration_count', emoji: '🧭', format: value => `${value} keşif` }
};

export default {
  data: new SlashCommandBuilder()
    .setName('siralama')
    .setDescription('Sunucudaki maceracıların sıralamasını göster.')
    .addStringOption(option => option
      .setName('kategori')
      .setDescription('Hangi sıralamayı görmek istiyorsun?')
      .addChoices(
        { name: 'Seviye', value: 'level' },
        { name: 'Toplam XP', value: 'xp' },
        { name: 'Altın', value: 'coins' },
        { name: 'İblis zaferleri', value: 'bosses' },
        { name: 'Zindan zaferleri', value: 'dungeons' },
        { name: 'Keşif sayısı', value: 'exploration' }
      )
      .setRequired(false)),

  async execute(interaction) {
    if (!interaction.guildId) {
      return interaction.reply({ content: 'Bu komut yalnızca sunucularda kullanılabilir.', flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply();
    const key = interaction.options.getString('kategori') ?? 'level';
    const ranking = rankings[key];
    if (!ranking) return interaction.editReply('Bu sıralama kategorisi desteklenmiyor.');

    try {
      await ensureUser(interaction.guildId, interaction.user.id);
      const top = await pool.query(
        `SELECT user_id, ${ranking.column} AS score
         FROM users
         WHERE guild_id = $1
         ORDER BY ${ranking.column} DESC, user_id ASC
         LIMIT 10`,
        [interaction.guildId]
      );
      const mine = await pool.query(
        `SELECT ${ranking.column} AS score FROM users WHERE guild_id = $1 AND user_id = $2`,
        [interaction.guildId, interaction.user.id]
      );
      const score = Number(mine.rows[0]?.score ?? 0);
      const rank = await pool.query(
        `SELECT COUNT(*)::int + 1 AS rank
         FROM users
         WHERE guild_id = $1 AND ${ranking.column} > $2`,
        [interaction.guildId, score]
      );

      const lines = top.rows.length
        ? top.rows.map((row, index) => {
            const medal = ['🥇', '🥈', '🥉'][index] ?? `**${index + 1}.**`;
            return `${medal} <@${row.user_id}> — ${ranking.format(row.score)}`;
          })
        : ['Henüz sıralama verisi yok.'];

      const embed = new EmbedBuilder()
        .setColor(0xb58cff)
        .setTitle(`${ranking.emoji} Maceracı Sıralaması · ${ranking.label}`)
        .setDescription(lines.join('\n'))
        .addFields({
          name: 'Senin sıran',
          value: `#${rank.rows[0].rank} · ${ranking.format(score)}`,
          inline: true
        })
        .setFooter({ text: 'Sıralama yalnızca bu sunucudaki oyuncuları kapsar.' })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
    } catch (error) {
      console.error('/siralama hatası:', error);
      return interaction.editReply('Sıralama şu anda yüklenemedi. Biraz sonra tekrar dene.');
    }
  }
};
