
import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType
} from 'discord.js';

const MAX_HP = 100;
const TURN_TIME = 30_000;
const DUEL_TIME = 180_000;

function makeEmbed(title, description, color, hp1, hp2) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .addFields(
      { name: '🧙 Oyuncu 1', value: `❤️ ${hp1}/${MAX_HP} HP`, inline: true },
      { name: '🔮 Oyuncu 2', value: `❤️ ${hp2}/${MAX_HP} HP`, inline: true }
    )
    .setFooter({ text: 'Poğaça Frieren • Büyü Düellosu' });
}

function actionRow(disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('duel_attack')
      .setLabel('Saldır')
      .setEmoji('⚡')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId('duel_defend')
      .setLabel('Savun')
      .setEmoji('🛡️')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId('duel_heal')
      .setLabel('İyileş')
      .setEmoji('💚')
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled)
  );
}

export default {
  data: new SlashCommandBuilder()
    .setName('buyusavasi')
    .setDescription('Bir arkadaşınla büyü düellosu yap.')
    .addUserOption(option =>
      option
        .setName('rakip')
        .setDescription('Düello yapmak istediğin kişi')
        .setRequired(true)
    ),

  async execute(interaction) {
    const opponent = interaction.options.getUser('rakip', true);

    if (opponent.bot || opponent.id === interaction.user.id) {
      return interaction.reply({
        content: 'Kendinle veya bir botla düello yapamazsın! 🪄',
        ephemeral: true
      });
    }

    const inviteEmbed = new EmbedBuilder()
      .setColor(0x9b8cff)
      .setTitle('⚔️ Büyü Düellosu Daveti')
      .setDescription(
        `${opponent}, ${interaction.user} seni büyü düellosuna çağırdı!\n\n` +
        'Kabul edersen ikiniz de sırayla hamle yapacaksınız.'
      )
      .setFooter({ text: 'Davet 30 saniye içinde yanıtlanmalı.' });

    const inviteRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('duel_accept')
        .setLabel('Düelloyu kabul et')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('duel_decline')
        .setLabel('Reddet')
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({
      embeds: [inviteEmbed],
      components: [inviteRow]
    });

    const inviteMessage = await interaction.fetchReply();

    const inviteCollector = inviteMessage.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 30_000
    });

    let invitationHandled = false;

    inviteCollector.on('collect', async button => {
      if (button.user.id !== opponent.id) {
        return button.reply({
          content: 'Bu daveti yalnızca seçilen rakip yanıtlayabilir.',
          ephemeral: true
        });
      }

      if (invitationHandled) return;
      invitationHandled = true;
      inviteCollector.stop('handled');

      if (button.customId === 'duel_decline') {
        return button.update({
          embeds: [
            new EmbedBuilder()
              .setColor(0xe06c75)
              .setTitle('❌ Düello reddedildi')
              .setDescription(`${opponent} düello davetini kabul etmedi.`)
          ],
          components: []
        });
      }

      await button.deferUpdate();

      let hp1 = MAX_HP;
      let hp2 = MAX_HP;
      let round = 1;
      let currentPlayer = interaction.user.id;
      let gameOver = false;

      const battleEmbed = () => makeEmbed(
        `⚔️ Büyü Düellosu • Tur ${round}`,
        `**${interaction.user.username}** vs **${opponent.username}**\n\n` +
        `Sıra: <@${currentPlayer}>\n` +
        'Aşağıdan hamleni seç. Her hamle için 30 saniyen var.',
        0x9b8cff,
        hp1,
        hp2
      );

      await interaction.editReply({
        embeds: [battleEmbed()],
        components: [actionRow()]
      });

      const battleMessage = await interaction.fetchReply();

      const turnCollector = battleMessage.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: DUEL_TIME
      });

      let turnTimer;

      const endGame = async (winner, reason) => {
        if (gameOver) return;
        gameOver = true;
        clearTimeout(turnTimer);
        turnCollector.stop('finished');

        const finalEmbed = new EmbedBuilder()
          .setColor(winner ? 0x57f287 : 0xe06c75)
          .setTitle(winner ? '🏆 Düello Bitti!' : '⏰ Düello Sona Erdi')
          .setDescription(
            winner
              ? `Kazanan: ${winner}\n\n${reason}`
              : reason
          )
          .addFields(
            { name: interaction.user.username, value: `❤️ ${hp1}/${MAX_HP} HP`, inline: true },
            { name: opponent.username, value: `❤️ ${hp2}/${MAX_HP} HP`, inline: true }
          )
          .setFooter({ text: 'Poğaça Frieren • Büyü Düellosu' });

        try {
          await interaction.editReply({
            embeds: [finalEmbed],
            components: [actionRow(true)]
          });
        } catch (error) {
          console.error('Düello sonucu gönderilemedi:', error);
        }
      };

      const startTurnTimer = () => {
        clearTimeout(turnTimer);
        turnTimer = setTimeout(() => {
          if (!gameOver) {
            endGame(null, 'Hamle süresi dolduğu için düello sona erdi.');
          }
        }, TURN_TIME);
      };

      startTurnTimer();

      turnCollector.on('collect', async move => {
        if (gameOver) return;

        if (move.user.id !== interaction.user.id &&
            move.user.id !== opponent.id) {
          return move.reply({
            content: 'Bu düelloda oyuncu olmadığın için hamle yapamazsın.',
            ephemeral: true
          });
        }

        if (move.user.id !== currentPlayer) {
          return move.reply({
            content: 'Şu anda sıra rakibinde. Biraz bekle! ⏳',
            ephemeral: true
          });
        }

        clearTimeout(turnTimer);

        let description = '';
        const isPlayer1 = move.user.id === interaction.user.id;
        const damage = Math.floor(Math.random() * 16) + 15;

        if (move.customId === 'duel_attack') {
          if (isPlayer1) {
            hp2 = Math.max(0, hp2 - damage);
          } else {
            hp1 = Math.max(0, hp1 - damage);
          }
          description = `⚡ ${move.user} saldırdı ve **${damage} hasar** verdi!`;
        } else if (move.customId === 'duel_defend') {
          description = `🛡️ ${move.user} savunma duruşuna geçti. Bir sonraki saldırısına karşı koruma kazandı.`;
        } else if (move.customId === 'duel_heal') {
          const heal = Math.floor(Math.random() * 11) + 10;
          if (isPlayer1) {
            const before = hp1;
            hp1 = Math.min(MAX_HP, hp1 + heal);
            description = `💚 ${move.user} **${hp1 - before} HP** iyileşti!`;
          } else {
            const before = hp2;
            hp2 = Math.min(MAX_HP, hp2 + heal);
            description = `💚 ${move.user} **${hp2 - before} HP** iyileşti!`;
          }
        }

        if (hp1 <= 0) {
          await move.update({
            embeds: [makeEmbed('⚔️ Son Hamle!', description, 0xe06c75, hp1, hp2)],
            components: []
          });
          return endGame(opponent, `${interaction.user.username} yenildi!`);
        }

        if (hp2 <= 0) {
          await move.update({
            embeds: [makeEmbed('⚔️ Son Hamle!', description, 0xe06c75, hp1, hp2)],
            components: []
          });
          return endGame(interaction.user, `${opponent.username} yenildi!`);
        }

        currentPlayer = currentPlayer === interaction.user.id
          ? opponent.id
          : interaction.user.id;

        round++;

        await move.update({
          embeds: [
            makeEmbed(
              `⚔️ Büyü Düellosu • Tur ${round}`,
              `${description}\n\nSıra: <@${currentPlayer}>\nHamleni seç!`,
              0x9b8cff,
              hp1,
              hp2
            )
          ],
          components: [actionRow()]
        });

        startTurnTimer();
      });

      turnCollector.on('end', (_, reason) => {
        clearTimeout(turnTimer);
        if (!gameOver && reason !== 'finished') {
          endGame(null, 'Düello süresi doldu.');
        }
      });
    });

    inviteCollector.on('end', async (_, reason) => {
      if (reason !== 'handled') {
        try {
          await interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor(0xe6c875)
                .setTitle('⌛ Davetin süresi doldu')
                .setDescription('Rakip zamanında yanıt vermedi.')
            ],
            components: []
          });
        } catch {}
      }
    });
  }
};
