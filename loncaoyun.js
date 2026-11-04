import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { pool } from './database/db.js';
import { GUILD_GAME_TYPES, startGuildMiniGame, answerGuildMiniGame, getGuildGameLeaderboard } from './guild-games.js';

const gameChoices = GUILD_GAME_TYPES.map(game => ({ name: game.label, value: game.key }));

function gameComponents(session) {
  return [new ActionRowBuilder().addComponents(
    ...session.options.map((option,index) => new ButtonBuilder()
      .setCustomId('guildgame:' + session.session_id + ':' + index)
      .setLabel(option.slice(0,80))
      .setStyle(ButtonStyle.Secondary))
  )];
}

export default {
  data: new SlashCommandBuilder()
    .setName('loncaoyun')
    .setDescription('Lonca Oyun Salonu: Frieren temalı mini oyunlar ve skor tablosu.')
    .addSubcommand(command => command.setName('baslat').setDescription('Bir mini oyun başlat; herkes katılabilir.')
      .addStringOption(option => option.setName('oyun').setDescription('Oyun türü').setRequired(true).addChoices(...gameChoices)))
    .addSubcommand(command => command.setName('siralam').setDescription('Sunucunun mini oyun sıralamasını göster.')),

  async execute(interaction) {
    if (!interaction.guildId || !interaction.channelId) {
      return interaction.reply({ content: 'Lonca oyunları yalnızca sunucu kanallarında oynanabilir.', flags: MessageFlags.Ephemeral });
    }
    const action = interaction.options.getSubcommand();
    if (action === 'baslat') {
      const gameType = interaction.options.getString('oyun', true);
      const session = await startGuildMiniGame(pool, {
        guildId: interaction.guildId, channelId: interaction.channelId,
        userId: interaction.user.id, gameType
      });
      if (session.status === 'channel_active') return interaction.reply({ content: 'Bu kanalda zaten devam eden bir oyun var. Süresi dolduğunda yeni tur başlatabilirsin.', flags: MessageFlags.Ephemeral });
      const embed = new EmbedBuilder()
        .setColor(0x9b8cff)
        .setTitle('🏰 ' + session.game_label)
        .setDescription(session.prompt + '\\n\\n**60 saniyen var.** Her oyuncu bu turda bir kez cevap verebilir; doğru cevap 10 lonca puanı kazandırır.')
        .setFooter({ text: 'Frieren Lonca Oyun Salonu • Tur ' + session.session_id.slice(0,8) });
      return interaction.reply({
        embeds: [embed], components: gameComponents(session),
        allowedMentions: { parse: [] }
      });
    }
    if (action === 'siralam') {
      const rows = await getGuildGameLeaderboard(pool, interaction.guildId, 10);
      const lines = rows.map((row,index) => '**' + (index+1) + '.** <@' + row.user_id + '> — **' + Number(row.points).toLocaleString('tr-TR') + '** puan · ' + Number(row.correct_answers) + ' doğru');
      return interaction.reply({
        content: '**🏆 Lonca Oyun Salonu Sıralaması**\\n' + (lines.join('\\n') || 'Henüz skor kaydı yok.'),
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] }
      });
    }
    return interaction.reply({ content: 'Bilinmeyen oyun işlemi.', flags: MessageFlags.Ephemeral });
  }
};

export async function handleGuildGameInteraction(interaction, db = pool) {
  if (!interaction.isButton?.() || !interaction.customId?.startsWith('guildgame:')) return false;
  const [,sessionId,indexText] = interaction.customId.split(':');
  if (!interaction.guildId || !interaction.channelId || !sessionId || !/^\\d$/.test(indexText || '')) {
    await interaction.reply({ content: 'Bu oyun cevabı geçersiz.', flags: MessageFlags.Ephemeral });
    return true;
  }
  try {
    const result = await answerGuildMiniGame(db, {
      guildId: interaction.guildId, channelId: interaction.channelId,
      sessionId, userId: interaction.user.id, answerIndex: Number(indexText)
    });
    const messages = {
      not_found: 'Bu oyun turu bulunamadı.',
      expired: 'Bu turun süresi doldu.',
      already_answered: 'Bu turda cevabını zaten kullandın.',
      incorrect: 'Yanlış cevap. Bu turda ikinci kez cevap veremezsin. ' + (result.explanation || ''),
      correct: 'Doğru cevap! **+' + result.pointsAwarded + ' lonca puanı** kazandın. ' + (result.explanation || '')
    };
    await interaction.reply({
      content: messages[result.status] || 'Cevabın işlenemedi.',
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] }
    });
    return true;
  } catch (error) {
    console.error('Lonca mini oyun yanıtı kaydedilemedi:', error?.message || error);
    await interaction.reply({ content: 'Cevabın kaydedilemedi. Biraz sonra tekrar dene.', flags: MessageFlags.Ephemeral }).catch(() => {});
    return true;
  }
}
