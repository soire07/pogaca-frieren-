import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { pool } from './database/db.js';

const BOARDS = {
  kesif: {
    title: '🧭 En Büyük Kaşifler',
    query: `SELECT user_id, COUNT(*)::int AS score
            FROM adventure_discoveries WHERE guild_id=$1
            GROUP BY user_id ORDER BY score DESC, user_id ASC LIMIT 10`,
    label: 'keşif'
  },
  rota: {
    title: '🗺️ Rota Ustaları',
    query: `SELECT user_id, SUM(visits)::int AS score
            FROM adventure_route_mastery WHERE guild_id=$1
            GROUP BY user_id ORDER BY score DESC, user_id ASC LIMIT 10`,
    label: 'rota ziyareti'
  },
  seri: {
    title: '🔥 Günlük Macera Serileri',
    query: `SELECT user_id, daily_streak AS score
            FROM adventure_streaks WHERE guild_id=$1
            ORDER BY score DESC, user_id ASC LIMIT 10`,
    label: 'günlük seri'
  }
};

export default {
  data: new SlashCommandBuilder()
    .setName('kesifliderligi')
    .setDescription('Sunucunun keşif, rota ustalığı ve günlük macera liderlerini göster.')
    .addStringOption(option => option.setName('kategori').setDescription('Görüntülenecek liderlik tablosu.')
      .setRequired(false).addChoices(
        { name: '🧭 Keşif sayısı', value: 'kesif' },
        { name: '🗺️ Rota ziyaretleri', value: 'rota' },
        { name: '🔥 Günlük seri', value: 'seri' }
      )),
  async execute(interaction) {
    if (!interaction.guildId) {
      return interaction.reply({ content: 'Bu komut yalnızca sunucularda kullanılabilir.', ephemeral: true });
    }
    const selected = interaction.options.getString('kategori') || 'kesif';
    const board = BOARDS[selected] || BOARDS.kesif;
    const { rows } = await pool.query(board.query, [interaction.guildId]);
    const lines = rows.length
      ? rows.map((row, index) => `**${index + 1}.** <@${row.user_id}> — **${row.score}** ${board.label}`).join('\n')
      : 'Henüz sıralamaya girecek maceracı yok. İlk macerana /macera ile çık!';
    const embed = new EmbedBuilder()
      .setColor(0x9b8cff)
      .setTitle(board.title)
      .setDescription(lines)
      .setFooter({ text: 'Poğaça Frieren • Sadece bu sunucunun ilerlemesi sıralanır.' });
    return interaction.reply({ embeds: [embed] });
  }
};
