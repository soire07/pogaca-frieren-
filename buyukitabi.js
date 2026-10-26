
import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';

const spells = [
  {
    name: 'Zoltraak',
    type: 'Saldırı büyüsü',
    description: 'Hedefe yoğun büyü enerjisi gönderen güçlü bir saldırı büyüsü.',
    emoji: '⚡'
  },
  {
    name: 'Çiçek Bahçesi',
    type: 'Doğa büyüsü',
    description: 'Çevreyi rengârenk çiçeklerle kaplayan huzurlu bir büyü.',
    emoji: '🌸'
  },
  {
    name: 'Temizlik Büyüsü',
    type: 'Günlük yaşam büyüsü',
    description: 'Pelerinindeki tozları ve kirleri temizlemene yardımcı olur.',
    emoji: '🧹'
  },
  {
    name: 'Poğaça Isıtma Büyüsü',
    type: 'Mutfak büyüsü',
    description: 'Poğaçanı tam kararında ısıtır. Frieren bu büyüyü kesinlikle öğrenmek isterdi!',
    emoji: '🥐'
  },
  {
    name: 'Mimic Tespit Büyüsü',
    type: 'Keşif büyüsü',
    description: 'Şüpheli sandıklara yaklaşmadan önce dikkatli olmanı hatırlatır. Her sandık güvenli değildir!',
    emoji: '📦'
  }
];

function createEmbed(index) {
  const spell = spells[index];

  return new EmbedBuilder()
    .setColor(0x9b8cff)
    .setTitle(`${spell.emoji} ${spell.name}`)
    .setDescription(spell.description)
    .addFields(
      { name: '📚 Büyü türü', value: spell.type, inline: true },
      {
        name: '📖 Büyük Büyü Kitabı',
        value: `Büyü ${index + 1} / ${spells.length}`,
        inline: true
      }
    )
    .setFooter({ text: 'Poğaça Frieren • Büyü Arşivi' });
}

function createButtons(index) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('buyukitabi_prev')
      .setLabel('Önceki')
      .setEmoji('⬅️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(index === 0),

    new ButtonBuilder()
      .setCustomId('buyukitabi_random')
      .setLabel('Rastgele')
      .setEmoji('🎲')
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId('buyukitabi_next')
      .setLabel('Sonraki')
      .setEmoji('➡️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(index === spells.length - 1)
  );
}

export default {
  data: new SlashCommandBuilder()
    .setName('buyukitabi')
    .setDescription('Frieren evreninden büyüler keşfet.'),

  async execute(interaction) {
    let index = Math.floor(Math.random() * spells.length);

    await interaction.reply({
      embeds: [createEmbed(index)],
      components: [createButtons(index)]
    });

    const message = await interaction.fetchReply();

    const collector = message.createMessageComponentCollector({
      time: 120_000
    });

    collector.on('collect', async button => {
      if (button.user.id !== interaction.user.id) {
        await button.reply({
          content: 'Bu büyü kitabını yalnızca komutu kullanan kişi kontrol edebilir. 🪄',
          ephemeral: true
        });
        return;
      }

      if (button.customId === 'buyukitabi_prev') {
        index = Math.max(0, index - 1);
      } else if (button.customId === 'buyukitabi_next') {
        index = Math.min(spells.length - 1, index + 1);
      } else if (button.customId === 'buyukitabi_random') {
        index = Math.floor(Math.random() * spells.length);
      }

      await button.update({
        embeds: [createEmbed(index)],
        components: [createButtons(index)]
      });
    });

    collector.on('end', async () => {
      try {
        await interaction.editReply({ components: [] });
      } catch {
        // Mesaj artık düzenlenemiyorsa sessizce sonlandır.
      }
    });
  }
};
