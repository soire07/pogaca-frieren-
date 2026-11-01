import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { pool } from './database/db.js';

const BOARDS = {
  level: { title: '⚒️ En Yüksek Zanaat Seviyesi', column: 'level', label: 'seviye' },
  xp: { title: '✨ En Çok Zanaat XP', column: 'xp', label: 'XP' },
  crafts: { title: '🛠️ En Çok Üretim Yapanlar', column: 'successful_crafts', label: 'üretim' },
  salvage: { title: '♻️ En Çok Ekipman Parçalayanlar', column: 'salvaged_items', label: 'parçalanan eşya' }
};

export default {
  data: new SlashCommandBuilder()
    .setName('zanaatustalari')
    .setDescription('Sunucunun en başarılı zanaatkârlarını sırala.')
    .addStringOption(option => option.setName('kategori').setDescription('Sıralama ölçütü.')
      .setRequired(false).addChoices(
        { name: '⚒️ Zanaat seviyesi', value: 'level' },
        { name: '✨ Toplam zanaat XP', value: 'xp' },
        { name: '🛠️ Üretilen eşya sayısı', value: 'crafts' },
        { name: '♻️ Parçalanan ekipman', value: 'salvage' }
      )),
  async execute(interaction) {
    if (!interaction.guildId) return interaction.reply({ content: 'Bu komut yalnızca sunucularda kullanılabilir.', flags: MessageFlags.Ephemeral });
    const key = interaction.options.getString('kategori') || 'level';
    const board = BOARDS[key] || BOARDS.level;
    const { rows } = await pool.query(
      `SELECT user_id, level, xp, successful_crafts FROM user_crafting_progress
       WHERE guild_id=$1 ORDER BY ${board.column} DESC, user_id ASC LIMIT 10`,
      [interaction.guildId]
    );
    const lines = rows.length
      ? rows.map((row, index) => `**${index + 1}.** <@${row.user_id}> — **${row[board.column]}** ${board.label}`).join('\n')
      : 'Henüz zanaat ustası yok. Malzeme topla ve /zanaat ile üretime başla!';
    const embed = new EmbedBuilder().setColor(0x9b8cff).setTitle(board.title)
      .setDescription(lines)
      .setFooter({ text: 'Poğaça Frieren • Sıralama yalnızca bu sunucudaki zanaat ilerlemesini kapsar.' });
    return interaction.reply({ embeds: [embed] });
  }
};
