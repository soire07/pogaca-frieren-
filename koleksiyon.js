import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { pool, ensureUser } from './database/db.js';
import { characters } from './character-data.js';

const PAGE_SIZE = 8;
const BUTTON_TIMEOUT = 10 * 60 * 1000;

const artworkByCharacter = {
  Frieren: 'https://frieren-anime.jp/wp-content/uploads/2023/08/g3-723x1024.jpg',
  Fern: 'https://frieren-anime.jp/wp-content/uploads/2023/08/g6-723x1024.jpg',
  Stark: 'https://frieren-anime.jp/wp-content/uploads/2023/08/g7-723x1024.jpg',
  Himmel: 'https://frieren-anime.jp/wp-content/uploads/2023/08/g9-723x1024.jpg',
  Heiter: 'https://frieren-anime.jp/wp-content/uploads/2023/08/g10-723x1024.jpg',
  Sein: 'https://frieren-anime.jp/wp-content/uploads/2023/12/g-724x1024.jpg',
  Kanne: 'https://frieren-anime.jp/wp-content/uploads/2024/01/chara02_full1.png',
  Lawine: 'https://frieren-anime.jp/wp-content/uploads/2024/01/chara08_full1.png',
  Laufen: 'https://frieren-anime.jp/wp-content/uploads/2024/01/chara07_full1.png',
  Richter: 'https://frieren-anime.jp/wp-content/uploads/2024/01/chara01_full1.png'
};

function makeSummaryEmbed(target, rows, totalCharacters, page, pageCount) {
  const uniqueCount = rows.length;
  const percent = Math.min(100, Math.round((uniqueCount / totalCharacters) * 100));
  const totalCopies = rows.reduce((sum, row) => sum + Number(row.quantity), 0);
  const rarityCounts = {
    Efsanevi: rows.filter(row => row.rarity === 'Efsanevi').length,
    Destansı: rows.filter(row => row.rarity === 'Destansı').length,
    Nadir: rows.filter(row => row.rarity === 'Nadir').length,
    Yaygın: rows.filter(row => row.rarity === 'Yaygın').length
  };
  const filled = Math.round((percent / 100) * 12);
  const progressBar = '▰'.repeat(filled) + '▱'.repeat(12 - filled);

  return new EmbedBuilder()
    .setColor(0x9b8cff)
    .setTitle(`📚 ${target.username} | Anime Koleksiyonu`)
    .setDescription(
      `**Koleksiyon ilerlemesi**\n${progressBar} **${percent}%**\n\n🌟 ${rarityCounts.Efsanevi} Efsanevi · ✦ ${rarityCounts.Destansı} Destansı · ◆ ${rarityCounts.Nadir} Nadir · ⭐ ${rarityCounts.Yaygın} Yaygın\n\n📖 Sayfa ${page + 1}/${pageCount}`
    )
    .addFields(
      { name: '🧩 Farklı karakter', value: `${uniqueCount}/${totalCharacters}`, inline: true },
      { name: '📦 Toplam kopya', value: String(totalCopies), inline: true },
      { name: '📈 Tamamlama', value: `${percent}%`, inline: true }
    )
    .setFooter({ text: 'Poğaça Frieren • Karakter kartları küçük görsellerle listelenir' })
    .setTimestamp();
}

function makeCharacterEmbed(row) {
  const image = artworkByCharacter[row.character_name] || row.image || characters.find(c => c.name === row.character_name)?.image;
  const embed = new EmbedBuilder()
    .setColor(row.color ?? 0x9b8cff)
    .setTitle(`${row.emoji || '🎴'} ${row.character_name}`)
    .setDescription(`**${row.rarity}** · ${row.anime}\n📦 Koleksiyon: **×${row.quantity}**`)
    .setFooter({ text: 'Poğaça Frieren • Koleksiyon karakteri' });
  if (image) embed.setThumbnail(image);
  return embed;
}

function makeButtons(page, pageCount, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('collection_prev')
      .setLabel('Önceki')
      .setEmoji('◀️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || page <= 0),
    new ButtonBuilder()
      .setCustomId('collection_next')
      .setLabel('Sonraki')
      .setEmoji('▶️')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled || page >= pageCount - 1)
  );
}

function makePage(target, rows, page) {
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const start = page * PAGE_SIZE;
  const pageRows = rows.slice(start, start + PAGE_SIZE);
  const embeds = [makeSummaryEmbed(target, rows, characters.length, page, pageCount)];
  if (pageRows.length) embeds.push(...pageRows.map(makeCharacterEmbed));
  else embeds[0].setDescription('Henüz karakter keşfetmemişsin. **/kimimben** komutunu kullanarak ilk karakterini bul!');
  return { embeds, components: pageCount > 1 ? [makeButtons(page, pageCount)] : [] };
}

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

      let page = 0;
      const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
      await interaction.editReply(makePage(target, rows, page));
      if (pageCount <= 1) return;

      const response = await interaction.fetchReply();
      const collector = response.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: BUTTON_TIMEOUT
      });

      collector.on('collect', async button => {
        if (!['collection_prev', 'collection_next'].includes(button.customId)) {
          return button.deferUpdate().catch(() => {});
        }
        if (button.user.id !== interaction.user.id) {
          return button.reply({ content: 'Bu koleksiyon sayfalarını yalnızca komutu kullanan kişi değiştirebilir.', ephemeral: true }).catch(() => {});
        }
        page = button.customId === 'collection_next'
          ? Math.min(page + 1, pageCount - 1)
          : Math.max(page - 1, 0);
        await button.update(makePage(target, rows, page)).catch(() => {});
      });

      collector.on('end', async () => {
        try {
          await interaction.editReply({ components: [makeButtons(page, pageCount, true)] });
        } catch (error) {
          console.error('Koleksiyon sayfalama butonları kapatılamadı:', error);
        }
      });
    } catch (error) {
      console.error('Koleksiyon komutu hatası:', error);
      await interaction.editReply('Koleksiyon yüklenirken bir hata oluştu. Lütfen biraz sonra tekrar dene.');
    }
  }
};
