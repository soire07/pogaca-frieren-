
import {
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType
} from 'discord.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, ensureUser } from './database/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const MAX_HP = 100;
const TURN_TIME = 30_000;
const INVITE_TIME = 30_000;
const DUEL_TIME = 180_000;

const GIFS = {
  start: 'buyusavasi.gif',
  attack: 'buyusavasi_vurus.gif',
  win: 'buyusavasi_kazandi.gif'
};

function createEmbed(title, description, color, hp1, hp2, gifName, maxHp1 = MAX_HP, maxHp2 = MAX_HP, attack1 = 10, defense1 = 5, attack2 = 10, defense2 = 5) {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .addFields(
      { name: '🧙 Oyuncu 1', value: `❤️ ${hp1}/${maxHp1} HP\n⚔️ Saldırı: ${attack1} · 🛡️ Savunma: ${defense1}`, inline: true },
      { name: '🔮 Oyuncu 2', value: `❤️ ${hp2}/${maxHp2} HP\n⚔️ Saldırı: ${attack2} · 🛡️ Savunma: ${defense2}`, inline: true }
    )
    .setFooter({ text: 'Poğaça Frieren • Büyü Düellosu' });

  if (gifName) embed.setImage(`attachment://${gifName}`);

  return embed;
}

function createAttachment(filename) {
  return new AttachmentBuilder(join(__dirname, filename));
}

function createButtons(disabled = false) {
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
    if (!interaction.guildId) {
      return interaction.reply({ content: 'Büyü düellosu yalnızca sunucularda yapılabilir.', ephemeral: true });
    }
    const opponent = interaction.options.getUser('rakip', true);
    const challenger = interaction.user;

    if (opponent.bot || opponent.id === challenger.id) {
      return interaction.reply({
        content: 'Kendinle veya bir botla düello yapamazsın! 🪄',
        ephemeral: true
      });
    }

    if (!interaction.channel?.isTextBased()) {
      return interaction.reply({
        content: 'Bu komut bir metin kanalında kullanılmalı.',
        ephemeral: true
      });
    }

    const inviteEmbed = new EmbedBuilder()
      .setColor(0x9b8cff)
      .setTitle('⚔️ Büyü Düellosu Daveti')
      .setDescription(
        `${challenger} seni düelloya çağırdı!\n\n` +
        'Kabul edersen sırayla saldırabilir, savunabilir veya iyileşebilirsin.'
      )
      .setFooter({ text: 'Davetin 30 saniye içinde yanıtlanması gerekiyor.' });

    const inviteRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('duel_accept')
        .setLabel('Kabul et')
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId('duel_decline')
        .setLabel('Reddet')
        .setStyle(ButtonStyle.Secondary)
    );

    // Gerçek Discord kullanıcı etiketlemesi ve bildirim izni
    await interaction.reply({
      content: `⚔️ <@${opponent.id}>`,
      embeds: [inviteEmbed],
      components: [inviteRow],
      allowedMentions: {
        users: [opponent.id]
      }
    });

    const inviteMessage = await interaction.fetchReply();

    const inviteCollector = inviteMessage.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: INVITE_TIME
    });

    let invitationHandled = false;

    inviteCollector.on('collect', async button => {
      if (button.user.id !== opponent.id) {
        return button.reply({
          content: 'Bu daveti yalnızca seçilen rakip yanıtlayabilir.',
          ephemeral: true
        });
      }

      if (invitationHandled) {
        return button.deferUpdate();
      }

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

      await Promise.all([
        ensureUser(interaction.guildId, challenger.id),
        ensureUser(interaction.guildId, opponent.id)
      ]);
      const [stats1Result, stats2Result] = await Promise.all([
        pool.query('SELECT max_hp, attack, defense FROM users WHERE guild_id=$1 AND user_id=$2', [interaction.guildId, challenger.id]),
        pool.query('SELECT max_hp, attack, defense FROM users WHERE guild_id=$1 AND user_id=$2', [interaction.guildId, opponent.id])
      ]);
      const stats1 = stats1Result.rows[0];
      const stats2 = stats2Result.rows[0];
      const maxHp1 = Number(stats1.max_hp);
      const maxHp2 = Number(stats2.max_hp);
      const attack1 = Number(stats1.attack);
      const attack2 = Number(stats2.attack);
      const defense1 = Number(stats1.defense);
      const defense2 = Number(stats2.defense);

      const [upgrade1, upgrade2] = await Promise.all([
        pool.query('SELECT COALESCE(MAX(upgrade_level),0)::int AS level FROM character_upgrades WHERE guild_id=$1 AND user_id=$2', [interaction.guildId, challenger.id]),
        pool.query('SELECT COALESCE(MAX(upgrade_level),0)::int AS level FROM character_upgrades WHERE guild_id=$1 AND user_id=$2', [interaction.guildId, opponent.id])
      ]);
      const bonus1 = Number(upgrade1.rows[0]?.level || 0) * 2;
      const bonus2 = Number(upgrade2.rows[0]?.level || 0) * 2;

      let hp1 = maxHp1;
      let hp2 = maxHp2;
      let currentPlayer = challenger.id;
      let round = 1;
      let gameOver = false;
      let turnTimer;
      let duelTimer;
      let shield1 = false;
      let shield2 = false;
      let healUsed1 = false;
      let healUsed2 = false;
      let turnCollector;

      const playerName = id =>
        id === challenger.id ? challenger.username : opponent.username;

      const makeDuelEmbed = (title, description, color, currentHp1, currentHp2, gifName) =>
        createEmbed(title, description, color, currentHp1, currentHp2, gifName, maxHp1, maxHp2, attack1, defense1, attack2, defense2);

      const makeBattleEmbed = (description, gifName = null, color = 0x9b8cff) =>
        makeDuelEmbed(
          `⚔️ Büyü Düellosu • Tur ${round}`,
          `${description}\n\nSıradaki oyuncu: <@${currentPlayer}>`,
          color,
          hp1,
          hp2,
          gifName
        );

      const finishGame = async (winner, reason) => {
        if (gameOver) return;
        gameOver = true;

        clearTimeout(turnTimer);
        clearTimeout(duelTimer);

        if (turnCollector) turnCollector.stop('finished');

        const finalEmbed = makeDuelEmbed(
          winner ? '🏆 Düello Bitti!' : '⏰ Düello Sona Erdi',
          winner
            ? `**Kazanan:** ${winner}\n\n${reason}`
            : reason,
          winner ? 0x57f287 : 0xe6c875,
          hp1,
          hp2,
          GIFS.win
        );

        try {
          await interaction.editReply({
            embeds: [finalEmbed],
            files: [createAttachment(GIFS.win)],
            components: [createButtons(true)]
          });
        } catch (error) {
          console.error('Düello sonucu gönderilemedi:', error);
        }
      };

      const startTurnTimer = () => {
        clearTimeout(turnTimer);

        turnTimer = setTimeout(() => {
          if (!gameOver) {
            finishGame(
              null,
              `${playerName(currentPlayer)} zamanında hamle yapmadığı için düello sona erdi.`
            );
          }
        }, TURN_TIME);
      };

      const applyMove = async move => {
        if (gameOver) {
          return move.deferUpdate().catch(() => {});
        }

        if (![challenger.id, opponent.id].includes(move.user.id)) {
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

        const isPlayer1 = move.user.id === challenger.id;
        let description = '';
        let showAttackGif = false;

        if (move.customId === 'duel_attack') {
          const rawDamage = Math.floor(Math.random() * 16) + 15 + (isPlayer1 ? attack1 : attack2) + (isPlayer1 ? bonus1 : bonus2);
          let damage = Math.max(1, rawDamage - Math.floor((isPlayer1 ? defense2 : defense1) / 2));

          if (isPlayer1 && shield2) {
            damage = Math.ceil(damage * 0.5);
            shield2 = false;
            description = '🛡️ Rakibin savunması hasarı azalttı! ';
          } else if (!isPlayer1 && shield1) {
            damage = Math.ceil(damage * 0.5);
            shield1 = false;
            description = '🛡️ Rakibin savunması hasarı azalttı! ';
          }

          if (isPlayer1) {
            hp2 = Math.max(0, hp2 - damage);
          } else {
            hp1 = Math.max(0, hp1 - damage);
          }

          const upgradeBonus = isPlayer1 ? bonus1 : bonus2;
          description += `⚡ ${move.user} büyü saldırısı yaptı ve **${damage} hasar** verdi!${upgradeBonus ? ` (karakter geliştirmesi +${upgradeBonus})` : ''}`;
          showAttackGif = true;

        } else if (move.customId === 'duel_defend') {
          if (isPlayer1) shield1 = true;
          else shield2 = true;

          description = `🛡️ ${move.user} savunma kalkanı oluşturdu! Bir sonraki saldırının hasarı yarıya inecek.`;

        } else if (move.customId === 'duel_heal') {
          if ((isPlayer1 && healUsed1) || (!isPlayer1 && healUsed2)) {
            startTurnTimer();

            return move.reply({
              content: 'Bu düelloda iyileşme hakkını zaten kullandın. Başka bir hamle seç!',
              ephemeral: true
            });
          }

          const healing = Math.floor(Math.random() * 11) + 10;

          if (isPlayer1) {
            const before = hp1;
            hp1 = Math.min(maxHp1, hp1 + healing);
            healUsed1 = true;
            description = `💚 ${move.user} **${hp1 - before} HP** iyileşti!`;
          } else {
            const before = hp2;
            hp2 = Math.min(maxHp2, hp2 + healing);
            healUsed2 = true;
            description = `💚 ${move.user} **${hp2 - before} HP** iyileşti!`;
          }
        }

        if (hp1 <= 0 || hp2 <= 0) {
          await move.deferUpdate();

          return finishGame(
            hp1 <= 0 ? opponent : challenger,
            `${hp1 <= 0 ? challenger.username : opponent.username} yenildi!`
          );
        }

        currentPlayer = currentPlayer === challenger.id
          ? opponent.id
          : challenger.id;

        round++;

        try {
          await move.update({
            embeds: [
              makeBattleEmbed(
                description,
                showAttackGif ? GIFS.attack : null
              )
            ],
            files: showAttackGif ? [createAttachment(GIFS.attack)] : [],
            components: [createButtons()]
          });
        } catch (error) {
          console.error('Düello hamlesi güncellenemedi:', error);
        }

        startTurnTimer();
      };

      const initialEmbed = makeDuelEmbed(
        '⚔️ Düello Başladı!',
        `${challenger} ile ${opponent} karşı karşıya!\n\n` +
        `İlk hamle: ${challenger}\n` +
        `Başlangıç HP: ${maxHp1} / ${maxHp2}. Saldırı ve savunma değerlerin artık savaşta etkili. Hamleni seç!`,
        0x9b8cff,
        hp1,
        hp2,
        GIFS.start
      );

      await interaction.editReply({
        embeds: [initialEmbed],
        files: [createAttachment(GIFS.start)],
        components: [createButtons()]
      });

      const battleMessage = await interaction.fetchReply();

      turnCollector = battleMessage.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: DUEL_TIME
      });

      turnCollector.on('collect', applyMove);

      turnCollector.on('end', () => {
        clearTimeout(turnTimer);

        if (!gameOver) {
          finishGame(null, 'Düellonun toplam süresi doldu.');
        }
      });

      duelTimer = setTimeout(() => {
        if (!gameOver) {
          finishGame(null, 'Düellonun toplam süresi doldu.');
        }
      }, DUEL_TIME);

      startTurnTimer();
    });

    inviteCollector.on('end', async (_, reason) => {
      if (reason !== 'handled' && !invitationHandled) {
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
        } catch (error) {
          console.error('Düello daveti güncellenemedi:', error);
        }
      }
    });
  }
};
    
