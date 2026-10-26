
import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';

const characters = [
  {
    name: 'Frieren',
    anime: 'Frieren: Beyond Journey’s End',
    rarity: 'Efsanevi',
    emoji: '🪄',
    color: 0x9b8cff,
    description: 'Bin yılı aşan ömrüyle büyülerin peşinden giden elf büyücü.',
    traits: 'Bilge • Sakin • Güçlü',
    image: null
  },
  {
    name: 'Fern',
    anime: 'Frieren: Beyond Journey’s End',
    rarity: 'Destansı',
    emoji: '🔮',
    color: 0x8c7bd9,
    description: 'Disiplinli, yetenekli ve son derece kontrollü bir büyücü.',
    traits: 'Disiplinli • Zeki • Soğukkanlı',
    image: null
  },
  {
    name: 'Stark',
    anime: 'Frieren: Beyond Journey’s End',
    rarity: 'Nadir',
    emoji: '⚔️',
    color: 0xc47b58,
    description: 'Korkularına rağmen arkadaşları için savaşan cesur savaşçı.',
    traits: 'Cesur • Sadık • Güçlü',
    image: null
  },
  {
    name: 'Himmel',
    anime: 'Frieren: Beyond Journey’s End',
    rarity: 'Efsanevi',
    emoji: '🌟',
    color: 0x58a6ff,
    description: 'İnsanlara umut veren, iyiliksever kahraman.',
    traits: 'Karizmatik • Fedakâr • İdealist',
    image: null
  },
  {
    name: 'Heiter',
    anime: 'Frieren: Beyond Journey’s End',
    rarity: 'Nadir',
    emoji: '🍃',
    color: 0x58b98a,
    description: 'Mizahı ve bilgeliğiyle öne çıkan eski kahraman grubunun rahibi.',
    traits: 'Bilge • Eğlenceli • Şefkatli',
    image: null
  },
  {
    name: 'Sein',
    anime: 'Frieren: Beyond Journey’s End',
    rarity: 'Destansı',
    emoji: '🌿',
    color: 0x52a88a,
    description: 'Arkadaşlarına yardım eden, deneyimli bir rahip.',
    traits: 'Olgun • Yardımsever • Rahat',
    image: null
  },
  {
    name: 'Goku',
    anime: 'Dragon Ball',
    rarity: 'Efsanevi',
    emoji: '🐉',
    color: 0xf0a33a,
    description: 'Sürekli güçlenmek ve daha güçlü rakiplerle karşılaşmak isteyen savaşçı.',
    traits: 'Neşeli • Azimli • Güçlü',
    image: null
  },
  {
    name: 'Naruto Uzumaki',
    anime: 'Naruto',
    rarity: 'Destansı',
    emoji: '🍥',
    color: 0xf08c38,
    description: 'Asla pes etmeyen ve hayallerinin peşinden giden ninja.',
    traits: 'Kararlı • Enerjik • Sadık',
    image: null
  },
  {
    name: 'Monkey D. Luffy',
    anime: 'One Piece',
    rarity: 'Destansı',
    emoji: '🏴‍☠️',
    color: 0xd95757,
    description: 'Özgürlüğü ve arkadaşlarını her şeyin üstünde tutan korsan.',
    traits: 'Özgür ruhlu • Cesur • Eğlenceli',
    image: null
  },
  {
    name: 'Satoru Gojo',
    anime: 'Jujutsu Kaisen',
    rarity: 'Efsanevi',
    emoji: '👁️',
    color: 0x68a9ff,
    description: 'Kendine güveni ve olağanüstü yetenekleriyle tanınan büyücü.',
    traits: 'Kendinden emin • Şakacı • Güçlü',
    image: null
  },
  {
    name: 'Tanjiro Kamado',
    anime: 'Demon Slayer',
    rarity: 'Nadir',
    emoji: '🌊',
    color: 0x50a9a0,
    description: 'Sevdiklerini korumak için mücadele eden şefkatli savaşçı.',
    traits: 'Şefkatli • Azimli • Dürüst',
    image: null
  },
  {
    name: 'Levi Ackerman',
    anime: 'Attack on Titan',
    rarity: 'Efsanevi',
    emoji: '🗡️',
    color: 0x8294a8,
    description: 'Soğukkanlılığı ve becerileriyle öne çıkan asker.',
    traits: 'Disiplinli • Soğukkanlı • Kararlı',
    image: null
  }
];

const rarityInfo = {
  'Yaygın': { chance: 50, stars: '⭐' },
  'Nadir': { chance: 30, stars: '⭐⭐' },
  'Destansı': { chance: 15, stars: '⭐⭐⭐' },
  'Efsanevi': { chance: 5, stars: '🌟🌟🌟🌟' }
};

function drawCharacter() {
  const roll = Math.random() * 100;

  let rarity;
  if (roll < 5) rarity = 'Efsanevi';
  else if (roll < 20) rarity = 'Destansı';
  else if (roll < 50) rarity = 'Nadir';
  else rarity = 'Yaygın';

  const pool = characters.filter(character => character.rarity === rarity);

  // Bu listede her nadirlikte karakter bulunduğundan
  // seçilen seviyeden rastgele bir karakter gelir.
  return pool[Math.floor(Math.random() * pool.length)];
}

function createCharacterEmbed(character, user) {
  const info = rarityInfo[character.rarity];

  const embed = new EmbedBuilder()
    .setColor(character.color)
    .setTitle(`${character.emoji} ${character.name}`)
    .setDescription(
      `**${user.username}**, senin anime karakterin belli oldu!\n\n` +
      `${character.description}`
    )
    .addFields(
      { name: '🎬 Anime', value: character.anime, inline: false },
      { name: '💎 Nadirlik', value: `${info.stars} ${character.rarity}`, inline: true },
      { name: '✨ Özellikler', value: character.traits, inline: false }
    )
    .setFooter({ text: 'Poğaça Frieren • Karakter Keşfi' })
    .setTimestamp();

  if (character.image) {
    embed.setThumbnail(character.image);
  }

  return embed;
}

export default {
  data: new SlashCommandBuilder()
    .setName('kimimben')
    .setDescription('Rastgele bir anime karakteri keşfet.'),

  async execute(interaction) {
    await interaction.deferReply();

    const character = drawCharacter();
    const embed = createCharacterEmbed(character, interaction.user);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('kimimben_again')
        .setLabel('Yeni karakter keşfet')
        .setEmoji('🎲')
        .setStyle(ButtonStyle.Primary)
    );

    const response = await interaction.editReply({
      embeds: [embed],
      components: [row]
    });

    const collector = response.createMessageComponentCollector({
      time: 60_000
    });

    collector.on('collect', async button => {
      if (button.customId !== 'kimimben_again') return;

      if (button.user.id !== interaction.user.id) {
        return button.reply({
          content: 'Bu karakteri yalnızca komutu kullanan kişi yenileyebilir.',
          ephemeral: true
        });
      }

      const nextCharacter = drawCharacter();

      await button.update({
        embeds: [
          createCharacterEmbed(nextCharacter, interaction.user)
        ],
        components: [row]
      });
    });

    collector.on('end', async () => {
      try {
        await interaction.editReply({
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId('kimimben_again_expired')
                .setLabel('Süre doldu')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true)
            )
          ]
        });
      } catch (error) {
        console.error('Kimimben butonu güncellenemedi:', error);
      }
    });
  }
};
    
