import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType
} from 'discord.js';
import { pool, ensureUser } from './database/db.js';

const BUTTON_TIMEOUT = 10 * 60 * 1000;

const characters = [
  { name: 'Frieren', anime: 'Frieren: Beyond Journey’s End', rarity: 'Efsanevi', emoji: '🪄', color: 0x9b8cff, description: 'Bin yılı aşan ömrüyle büyülerin peşinden giden elf büyücü.', traits: 'Bilge • Sakin • Güçlü', image: 'https://frieren-anime.jp/wp-content/uploads/2023/08/g3-723x1024.jpg' },
  { name: 'Fern', anime: 'Frieren: Beyond Journey’s End', rarity: 'Destansı', emoji: '🔮', color: 0x8c7bd9, description: 'Disiplinli, yetenekli ve son derece kontrollü bir büyücü.', traits: 'Disiplinli • Zeki • Soğukkanlı', image: 'https://frieren-anime.jp/wp-content/uploads/2023/08/g6-723x1024.jpg' },
  { name: 'Stark', anime: 'Frieren: Beyond Journey’s End', rarity: 'Nadir', emoji: '⚔️', color: 0xc47b58, description: 'Korkularına rağmen arkadaşları için savaşan cesur savaşçı.', traits: 'Cesur • Sadık • Güçlü', image: 'https://frieren-anime.jp/wp-content/uploads/2023/08/g7-723x1024.jpg' },
  { name: 'Himmel', anime: 'Frieren: Beyond Journey’s End', rarity: 'Efsanevi', emoji: '🌟', color: 0x58a6ff, description: 'İnsanlara umut veren, iyiliksever kahraman.', traits: 'Karizmatik • Fedakâr • İdealist', image: 'https://frieren-anime.jp/wp-content/uploads/2023/08/g9-723x1024.jpg' },
  { name: 'Heiter', anime: 'Frieren: Beyond Journey’s End', rarity: 'Nadir', emoji: '🍃', color: 0x58b98a, description: 'Mizahı ve bilgeliğiyle öne çıkan eski kahraman grubunun rahibi.', traits: 'Bilge • Eğlenceli • Şefkatli', image: 'https://frieren-anime.jp/wp-content/uploads/2023/08/g10-723x1024.jpg' },
  { name: 'Sein', anime: 'Frieren: Beyond Journey’s End', rarity: 'Destansı', emoji: '🌿', color: 0x52a88a, description: 'Arkadaşlarına yardım eden, deneyimli bir rahip.', traits: 'Olgun • Yardımsever • Rahat', image: 'https://frieren-anime.jp/wp-content/uploads/2023/12/g-724x1024.jpg' },
  { name: 'Goku', anime: 'Dragon Ball', rarity: 'Efsanevi', emoji: '🐉', color: 0xf0a33a, description: 'Sürekli güçlenmek ve daha güçlü rakiplerle karşılaşmak isteyen savaşçı.', traits: 'Neşeli • Azimli • Güçlü', image: 'https://dragonball-super.com/img/chara/cr-goku.jpg' },
  { name: 'Naruto Uzumaki', anime: 'Naruto', rarity: 'Efsanevi', emoji: '🍥', color: 0xf08c38, description: 'Asla pes etmeyen ve hayallerinin peşinden giden ninja.', traits: 'Kararlı • Enerjik • Sadık', image: 'https://i.pinimg.com/736x/1b/52/07/1b52070987b60e23275c4d0897c90bab.jpg' },
  { name: 'Monkey D. Luffy', anime: 'One Piece', rarity: 'Efsanevi', emoji: '🏴‍☠️', color: 0xd95757, description: 'Özgürlüğü ve arkadaşlarını her şeyin üstünde tutan korsan.', traits: 'Özgür ruhlu • Cesur • Eğlenceli', image: 'https://img.uhdpaper.com/wallpaper/luffy-sun-god-nika-gear-5-one-piece-370%405%40l' },
  { name: 'Satoru Gojo', anime: 'Jujutsu Kaisen', rarity: 'Efsanevi', emoji: '👁️', color: 0x68a9ff, description: 'Kendine güveni ve olağanüstü yetenekleriyle tanınan büyücü.', traits: 'Kendinden emin • Şakacı • Güçlü', image: 'https://cdn.sweezy-wallpapers.com/wallpapers/1971ab3c-0151-403a-95a5-1852fda021a0/satoru-gojo-jujutsu-kaisen-blue-energy-desktop-wallpaper-5k-preview.webp' },
  { name: 'Tanjiro Kamado', anime: 'Demon Slayer', rarity: 'Nadir', emoji: '🌊', color: 0x50a9a0, description: 'Sevdiklerini korumak için mücadele eden şefkatli savaşçı.', traits: 'Şefkatli • Azimli • Dürüst', image: 'https://demonslayer-anime.com/eda/assets/img/character/thumb/thumb_tanjirou.png' },
  { name: 'Levi Ackerman', anime: 'Attack on Titan', rarity: 'Efsanevi', emoji: '🗡️', color: 0x8294a8, description: 'Soğukkanlılığı ve becerileriyle öne çıkan asker.', traits: 'Disiplinli • Soğukkanlı • Kararlı', image: 'https://images.hdqwalls.com/download/levi-ackerman-2z-2932x2932.jpg' },
  { name: 'Kanne', anime: 'Frieren: Beyond Journey’s End', rarity: 'Yaygın', emoji: '💧', color: 0x69b7e8, description: 'Suyu kontrol edebilen, büyü sınavına katılan genç büyücü.', traits: 'Meraklı • Duyarlı • Büyücü', image: 'https://frieren-anime.jp/wp-content/uploads/2024/01/chara02_full1.png' },
  { name: 'Lawine', anime: 'Frieren: Beyond Journey’s End', rarity: 'Yaygın', emoji: '❄️', color: 0x78a9dc, description: 'Buz büyülerinde yetenekli, kararlı genç büyücü.', traits: 'Kararlı • Rekabetçi • Yetenekli', image: 'https://frieren-anime.jp/wp-content/uploads/2024/01/chara08_full1.png' },
  { name: 'Laufen', anime: 'Frieren: Beyond Journey’s End', rarity: 'Yaygın', emoji: '🌬️', color: 0x80c7b0, description: 'Hızlı hareketleriyle öne çıkan genç büyücü.', traits: 'Çevik • Atik • Zeki', image: 'https://frieren-anime.jp/wp-content/uploads/2024/01/chara07_full1.png' },
  { name: 'Richter', anime: 'Frieren: Beyond Journey’s End', rarity: 'Yaygın', emoji: '🪨', color: 0xb69a83, description: 'Toprak büyülerinde uzmanlaşmış, doğrudan konuşan büyücü.', traits: 'Pratik • Kendinden emin • Büyücü', image: 'https://frieren-anime.jp/wp-content/uploads/2024/01/chara01_full1.png' }
];

const rarityInfo = {
  Yaygın: { stars: '⭐' },
  Nadir: { stars: '⭐⭐' },
  Destansı: { stars: '⭐⭐⭐' },
  Efsanevi: { stars: '🌟🌟🌟🌟' }
};

function drawCharacter(previousName = null) {
  const roll = Math.random() * 100;
  let rarity;
  if (roll < 5) rarity = 'Efsanevi';
  else if (roll < 20) rarity = 'Destansı';
  else if (roll < 50) rarity = 'Nadir';
  else rarity = 'Yaygın';

  let rarityPool = characters.filter(c => c.rarity === rarity && c.name !== previousName);
  if (!rarityPool.length) rarityPool = characters.filter(c => c.rarity === rarity);
  if (!rarityPool.length) rarityPool = characters.filter(c => c.name !== previousName);
  if (!rarityPool.length) rarityPool = characters;
  return rarityPool[Math.floor(Math.random() * rarityPool.length)];
}

async function saveCharacter(guildId, userId, character) {
  await ensureUser(guildId, userId);
  const result = await pool.query(
    `INSERT INTO anime_character_collection
      (guild_id, user_id, character_name, anime, rarity, emoji, color, description, traits, image)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (guild_id, user_id, character_name)
     DO UPDATE SET quantity = anime_character_collection.quantity + 1,
                   anime = EXCLUDED.anime,
                   rarity = EXCLUDED.rarity,
                   emoji = EXCLUDED.emoji,
                   color = EXCLUDED.color,
                   description = EXCLUDED.description,
                   traits = EXCLUDED.traits,
                   image = EXCLUDED.image,
                   last_obtained_at = NOW()
     RETURNING quantity`,
    [guildId, userId, character.name, character.anime, character.rarity, character.emoji, character.color, character.description, character.traits, character.image]
  );
  return result.rows[0].quantity;
}

function createCharacterEmbed(character, user, quantity) {
  const info = rarityInfo[character.rarity] ?? rarityInfo.Nadir;
  const eliteNames = ['Goku', 'Naruto Uzumaki', 'Monkey D. Luffy', 'Levi Ackerman'];
  const elite = eliteNames.includes(character.name);
  const embed = new EmbedBuilder()
    .setColor(character.color)
    .setAuthor({
      name: `✧ ${character.rarity.toLocaleUpperCase('tr-TR')} ✧`
    })
    .setTitle(`${character.emoji}  ${character.name}  ${character.emoji}`)
    .setDescription(
      elite
        ? `**${user.username}**, efsanevi bir karakter keşfettin!\n\n${character.description}`
        : `**${user.username}**, anime karakterin belli oldu!\n\n${character.description}`
    )
    .addFields(
      { name: '🎬  ANİME', value: `**${character.anime}**`, inline: true },
      { name: '💎  SINIF', value: `**${character.rarity}**\n${info.stars}`, inline: true },
      { name: '📚  KOLEKSİYON', value: `**×${quantity}**`, inline: true },
      { name: '✧  KARAKTER ÖZELLİKLERİ', value: `┏  ${character.traits}\n┗━━━━━━━━━━━━━━━━`, inline: false }
    )
    .setFooter({ text: 'Poğaça Frieren • Karakter Keşfi' })
    .setTimestamp();
  if (character.image) embed.setImage(character.image);
  return embed;
}
function createRow(disabled = false) {
  const button = new ButtonBuilder()
    .setCustomId('kimimben_again')
    .setLabel(disabled ? 'Süre doldu' : 'Yeni karakter keşfet')
    .setStyle(disabled ? ButtonStyle.Secondary : ButtonStyle.Primary)
    .setDisabled(disabled);
  if (!disabled) button.setEmoji('🎲');
  return new ActionRowBuilder().addComponents(button);
}

export default {
  data: new SlashCommandBuilder()
    .setName('kimimben')
    .setDescription('Rastgele bir anime karakteri keşfet ve koleksiyonuna ekle.'),

  async execute(interaction) {
    if (!interaction.guildId) {
      return interaction.reply({ content: 'Bu komut yalnızca sunucularda kullanılabilir.', ephemeral: true });
    }
    await interaction.deferReply();

    let character = drawCharacter();
    let quantity;
    try {
      quantity = await saveCharacter(interaction.guildId, interaction.user.id, character);
    } catch (error) {
      console.error('Karakter kaydetme hatası:', error);
      return interaction.editReply('Karakter veritabanına kaydedilemedi. Lütfen biraz sonra tekrar dene.');
    }

    const response = await interaction.editReply({
      embeds: [createCharacterEmbed(character, interaction.user, quantity)],
      components: [createRow()]
    });

    const collector = response.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: BUTTON_TIMEOUT
    });

    collector.on('collect', async button => {
      if (button.customId !== 'kimimben_again') {
        return button.deferUpdate().catch(() => {});
      }
      if (button.user.id !== interaction.user.id) {
        return button.reply({
          content: 'Bu karakteri yalnızca komutu kullanan kişi yenileyebilir.',
          ephemeral: true
        }).catch(() => {});
      }

      try {
        const nextCharacter = drawCharacter(character.name);
        const nextQuantity = await saveCharacter(interaction.guildId, interaction.user.id, nextCharacter);
        await button.update({
          embeds: [createCharacterEmbed(nextCharacter, interaction.user, nextQuantity)],
          components: [createRow()]
        });
        character = nextCharacter;
      } catch (error) {
        console.error('Kimimben buton/kayıt hatası:', error);
        if (!button.replied && !button.deferred) {
          await button.reply({
            content: 'Karakter kaydedilirken bir hata oluştu. Tekrar deneyebilirsin.',
            ephemeral: true
          }).catch(() => {});
        }
      }
    });

    collector.on('end', async () => {
      try {
        await interaction.editReply({ components: [createRow(true)] });
      } catch (error) {
        console.error('Kimimben butonu kapatılamadı:', error);
      }
    });
  }
};
