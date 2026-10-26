
import { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } from 'discord.js';

const characters = {
  frieren: {
    name: 'Frieren',
    role: 'Elf büyücü',
    description: 'Uzun ömrü boyunca büyüler toplayan, geçmiş yolculuğunun anlamını zamanla daha iyi kavrayan sakin bir büyücü.',
    quote: 'Bazen birini tanımak için onunla geçirilen zamanın değerini sonradan anlarsın.'
  },
  fern: {
    name: 'Fern',
    role: 'Büyücü',
    description: 'Disiplinli, dikkatli ve güçlü bir büyücü. Frieren’ın yol arkadaşıdır.',
    quote: 'Hazırlıklı olmak, maceranın yarısıdır.'
  },
  stark: {
    name: 'Stark',
    role: 'Savaşçı',
    description: 'Korkularına rağmen arkadaşlarını korumaya çalışan cesur bir yol arkadaşı.',
    quote: 'Cesaret, korksan da devam edebilmektir.'
  },
  himmel: {
    name: 'Himmel',
    role: 'Kahraman',
    description: 'İyiliği ve insanlarda bıraktığı izlerle hatırlanan kahraman.',
    quote: 'İnsanlara güzel anılar bırak.'
  },
  heiter: {
    name: 'Heiter',
    role: 'Rahip',
    description: 'Esprili tavrı ve tecrübesiyle kahramanlar grubunun önemli bir parçası.',
    quote: 'Bazen biraz neşe, en zor yolculuğu bile kolaylaştırır.'
  },
  eisen: {
    name: 'Eisen',
    role: 'Cüce savaşçı',
    description: 'Dayanıklı, tecrübeli ve güvenilir bir savaşçı.',
    quote: 'Bir işe küçük bir adımla başla.'
  }
};

export default {
  data: new SlashCommandBuilder()
    .setName('karakter')
    .setDescription('Frieren evreninden bir karakter hakkında bilgi verir.')
    .addStringOption(option =>
      option
        .setName('isim')
        .setDescription('Bilgi almak istediğin karakter')
        .setRequired(true)
        .addChoices(
          { name: 'Frieren', value: 'frieren' },
          { name: 'Fern', value: 'fern' },
          { name: 'Stark', value: 'stark' },
          { name: 'Himmel', value: 'himmel' },
          { name: 'Heiter', value: 'heiter' },
          { name: 'Eisen', value: 'eisen' }
        )
    ),

  async execute(interaction) {
    const character = characters[
      interaction.options.getString('isim', true)
    ];

    const gif = new AttachmentBuilder('./frieren.gif');

    const embed = new EmbedBuilder()
      .setColor(0x9b8cff)
      .setTitle(`✨ ${character.name}`)
      .setDescription(character.description)
      .addFields(
        { name: 'Rol', value: character.role, inline: true },
        { name: 'Hatırlatma', value: character.quote }
      )
      .setImage('attachment://frieren.gif')
      .setFooter({ text: 'Poğaça Frieren • Karakter Arşivi' });

    await interaction.reply({
      embeds: [embed],
      files: [gif]
    });
  }
};
