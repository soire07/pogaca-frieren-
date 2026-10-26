import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { pool, ensureUser } from './database/db.js';

export default {
  data: new SlashCommandBuilder()
    .setName('koleksiyon')
    .setDescription('Keşfettiğin anime karakterlerini ve koleksiyon ilerlemeni gösterir.')
    .addUserOption(option =>
      option.setName('kullanici')
        .setDescription('Koleksiyonunu görmek istediğin kullanıcı')
        .setRequired(false)
    ),

  async execute(interaction) {
    if (!interaction.guildId) {
      return interaction.reply({ content: 'Bu komut yalnızca sunucularda kullanılabilir.', ephemeral: true });
    }

    await interaction.deferReply();
    const target = interaction.options.getUser('kullanici') ?? interaction.user;

    try {
      await ensureUser(interaction.guildId, target.id);
      const { rows } = await pool.query(
        `SELECT character_name, anime, rarity, emoji, quantity, image, color
         FROM anime_character_collection
         WHERE guild_id = $1 AND user_id = $2
         ORDER BY CASE rarity
           WHEN 'Efsanevi' THEN 0
           WHEN 'Destansı' THEN 1
           WHEN 'Nadir' THEN 2
           ELSE 3
         END, character_name`,
        [interaction.guildId, target.id]
      );

      const artworkByCharacter = {
        Frieren: 'https://frieren-anime.jp/wp-content/uploads/2023/08/g3-723x1024.jpg',
        Fern: 'https://frieren-anime.jp/wp-content/uploads/2023/08/g6-723x1024.jpg',
        Stark: 'https://frieren-anime.jp/wp-content/uploads/2023/08/g7-723x1024.jpg',
        Himmel: 'https://frieren-anime.jp/wp-content/uploads/2023/08/g9-723x1024.jpg',
        Heiter: 'https://frieren-anime.jp/wp-content/uploads/2023/08/g10-723x1024.jpg',
        Sein: 'https://frieren-anime.jp/wp-content/uploads/2023/12/g-724x1024.jpg',
        Kanne: 'https://frieren-anime.jp/wp-content/uploads/2024/01/chara01_full1.png',
        Lawine: 'https://frieren-anime.jp/wp-content/uploads/2024/01/chara02_full1.png',
        Laufen: 'https://frieren-anime.jp/wp-content/uploads/2024/01/chara08_full1.png',
        Richter: 'https://frieren-anime.jp/wp-content/uploads/2024/01/chara07_full1.png'
      };
      const uniqueCount = rows.length;
      const totalCharacters = 16;
      const percent = Math.min(100, Math.round((uniqueCount / totalCharacters) * 100));
      const totalCopies = rows.reduce((sum, row) => sum + Number(row.quantity), 0);
      const description = rows.length
        ? rows.map(row => `${row.emoji} **${row.character_name}** — ${row.rarity} · ×${row.quantity}\n└ ${row.anime}`).join('\n')
        : 'Henüz karakter keşfetmemişsin. **/kimimben** komutunu kullanarak ilk karakterini bul!';

      const embed = new EmbedBuilder()
        .setColor(rows[0]?.color ?? 0x9b8cff)
        .setTitle(`📚 ${target.username} | Anime Koleksiyonu`)
        .setThumbnail(
          (rows.find(row => artworkByCharacter[row.character_name]) && artworkByCharacter[rows.find(row => artworkByCharacter[row.character_name]).character_name]) ||
          rows.find(row => row.image)?.image ||
          target.displayAvatarURL()
        )
        .setDescription(description.slice(0, 4000))
        .addFields(
          { name: '🧩 Farklı karakter', value: `${uniqueCount}/${totalCharacters}`, inline: true },
          { name: '📦 Toplam kopya', value: String(totalCopies), inline: true },
          { name: '📈 Tamamlama', value: `${percent}%`, inline: true }
        )
        .setFooter({ text: 'Poğaça Frieren • Koleksiyon kayıtları sunucuya özeldir' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('Koleksiyon komutu hatası:', error);
      await interaction.editReply('Koleksiyon yüklenirken bir hata oluştu. Lütfen biraz sonra tekrar dene.');
    }
  }
};
