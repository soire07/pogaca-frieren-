import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { pool, ensureUser } from '../../database/db.js';

export default {
  data: new SlashCommandBuilder()
    .setName('cantam')
    .setDescription('Envanterini ara, sırala ve sayfalı görüntüle.')
    .addStringOption(option => option.setName('arama').setDescription('Eşya adında aranacak ifade').setRequired(false).setMaxLength(80))
    .addStringOption(option => option.setName('siralama').setDescription('Eşyaları nasıl sıralayayım?').setRequired(false).addChoices(
      { name: 'Miktar (çoktan aza)', value: 'miktar' },
      { name: 'İsim (A–Z)', value: 'isim' }
    ))
    .addIntegerOption(option => option.setName('sayfa').setDescription('Görüntülenecek sayfa (her sayfada 15 eşya)').setRequired(false).setMinValue(1).setMaxValue(20)),

  async execute(interaction) {
    if (!interaction.guildId) {
      return interaction.reply({ content: 'Envanter yalnızca sunucularda kullanılabilir.', flags: MessageFlags.Ephemeral });
    }

    await ensureUser(interaction.guildId, interaction.user.id);
    const result = await pool.query(
      'SELECT item_key, quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 ORDER BY quantity DESC, item_key ASC',
      [interaction.guildId, interaction.user.id]
    );

    const totalItems = result.rows.reduce((sum, row) => sum + Number(row.quantity), 0);
    const search = (interaction.options.getString('arama') || '').trim().toLocaleLowerCase('tr-TR');
    const sort = interaction.options.getString('siralama') || 'miktar';
    const requestedPage = interaction.options.getInteger('sayfa') || 1;
    const filtered = result.rows.filter(row => !search || String(row.item_key).toLocaleLowerCase('tr-TR').includes(search));
    filtered.sort(sort === 'isim'
      ? (a, b) => String(a.item_key).localeCompare(String(b.item_key), 'tr')
      : (a, b) => Number(b.quantity) - Number(a.quantity) || String(a.item_key).localeCompare(String(b.item_key), 'tr'));
    const pageSize = 15;
    const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
    const page = Math.min(requestedPage, pageCount);
    const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);
    const description = pageRows.length
      ? pageRows.map(row => `• **${row.item_key}** ×${Number(row.quantity).toLocaleString('tr-TR')}`).join('\n')
      : search ? `“${search}” için eşya bulunamadı.` : 'Çantan şimdilik boş. **/kesif** komutuyla keşfe çıkıp eşya toplayabilirsin.';

    const embed = new EmbedBuilder()
      .setColor(0xd6a86a)
      .setTitle(`🎒 ${interaction.user.username} — Maceracı Envanteri`)
      .setDescription(description)
      .addFields(
        { name: '🧺 Eşya eşleşmesi', value: String(filtered.length), inline: true },
        { name: '📦 Toplam eşya', value: totalItems.toLocaleString('tr-TR'), inline: true },
        { name: '📄 Sayfa', value: `${page}/${pageCount}`, inline: true }
      )
      .setFooter({ text: 'Poğaça Frieren RPG • Eşyaların veritabanında saklanır' });

    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
};
