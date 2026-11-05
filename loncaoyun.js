import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { pool } from './database/db.js';
import { GUILD_GAME_TYPES, ensureGuildGameTables, startGuildMiniGame, answerGuildMiniGame, getGuildGameLeaderboard, joinGuildMiniGameTeam, getGuildGameTeamLeaderboard } from './guild-games.js';

let schemaReady;
async function ensureSchema() {
  if (!schemaReady) schemaReady = ensureGuildGameTables(pool).catch(error => { schemaReady = null; throw error; });
  await schemaReady;
}

const gameChoices = GUILD_GAME_TYPES.map(game => ({ name: game.label, value: game.key }));

function gameComponents(session) {
  const answerRow = new ActionRowBuilder().addComponents(
    ...session.options.map((option,index) => new ButtonBuilder()
      .setCustomId('guildgame:answer:' + session.session_id + ':' + index)
      .setLabel(option.slice(0,80))
      .setStyle(ButtonStyle.Secondary))
  );
  if (!session.team_mode) return [answerRow];
  const teamRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('guildgame:team:' + session.session_id + ':A').setLabel('Takım A’ya katıl').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('guildgame:team:' + session.session_id + ':B').setLabel('Takım B’ye katıl').setStyle(ButtonStyle.Success)
  );
  return [teamRow,answerRow];
}

export default {
  data: new SlashCommandBuilder()
    .setName('loncaoyun')
    .setDescription('Lonca Oyun Salonu: Frieren temalı mini oyunlar ve skor tablosu.')
    .addSubcommand(command => command.setName('baslat').setDescription('Bir mini oyun başlat; herkes katılabilir.')
      .addStringOption(option => option.setName('oyun').setDescription('Oyun türü').setRequired(true).addChoices(...gameChoices))
      .addBooleanOption(option => option.setName('takimli').setDescription('Takım A/B karşılaşması olarak oyna.')))
    .addSubcommand(command => command.setName('takim-siralam').setDescription('Bir takım turunun puanını görüntüle.')
      .addStringOption(option => option.setName('tur').setDescription('Tur kimliği').setRequired(true)))
    .addSubcommand(command => command.setName('siralam').setDescription('Sunucunun mini oyun sıralamasını göster.')),

  async execute(interaction) {
    if (!interaction.guildId || !interaction.channelId) {
      return interaction.reply({ content: 'Lonca oyunları yalnızca sunucu kanallarında oynanabilir.', flags: MessageFlags.Ephemeral });
    }
    await ensureSchema();
    const action = interaction.options.getSubcommand();
    if (action === 'baslat') {
      const gameType = interaction.options.getString('oyun', true);
      const session = await startGuildMiniGame(pool, {
        guildId: interaction.guildId, channelId: interaction.channelId,
        userId: interaction.user.id, gameType, teamMode: interaction.options.getBoolean('takimli') === true
      });
      if (session.status === 'channel_active') return interaction.reply({ content: 'Bu kanalda zaten devam eden bir oyun var. Süresi dolduğunda yeni tur başlatabilirsin.', flags: MessageFlags.Ephemeral });
      const embed = new EmbedBuilder()
        .setColor(0x9b8cff)
        .setTitle('🏰 ' + session.game_label)
        .setDescription(session.prompt + '\n\n**60 saniyen var.** Her oyuncu bu turda bir kez cevap verebilir; doğru cevap 10 lonca puanı kazandırır.' + (session.team_mode ? '\n\nÖnce Takım A veya Takım B’ye katıl, ardından cevabını seç.' : ''))
        .setFooter({ text: 'Frieren Lonca Oyun Salonu • Tur ' + session.session_id.slice(0,8) });
      return interaction.reply({
        embeds: [embed], components: gameComponents(session),
        allowedMentions: { parse: [] }
      });
    }
    if (action === 'takim-siralam') {
      const sessionId = interaction.options.getString('tur',true);
      const board = await getGuildGameTeamLeaderboard(pool,{guildId:interaction.guildId,channelId:interaction.channelId,sessionId});
      if (!board) return interaction.reply({content:'Bu takım turu bulunamadı veya bu kanala ait değil.',flags:MessageFlags.Ephemeral});
      return interaction.reply({content:'**' + board.game_label + ' · Takım Skoru**\n🅰️ Takım A: **' + Number(board.team_a_points).toLocaleString('tr-TR') + '** puan (' + Number(board.team_a_players) + ' oyuncu)\n🅱️ Takım B: **' + Number(board.team_b_points).toLocaleString('tr-TR') + '** puan (' + Number(board.team_b_players) + ' oyuncu)',flags:MessageFlags.Ephemeral});
    }
    if (action === 'siralam') {
      const rows = await getGuildGameLeaderboard(pool, interaction.guildId, 10);
      const lines = rows.map((row,index) => '**' + (index+1) + '.** <@' + row.user_id + '> — **' + Number(row.points).toLocaleString('tr-TR') + '** puan · ' + Number(row.correct_answers) + ' doğru');
      return interaction.reply({
        content: '**🏆 Lonca Oyun Salonu Sıralaması**\n' + (lines.join('\n') || 'Henüz skor kaydı yok.'),
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] }
      });
    }
    return interaction.reply({ content: 'Bilinmeyen oyun işlemi.', flags: MessageFlags.Ephemeral });
  }
};

export async function handleGuildGameInteraction(interaction, db = pool) {
  if (!interaction.isButton?.() || !interaction.customId?.startsWith('guildgame:')) return false;
  const parts = interaction.customId.split(':');
  const mode = parts[1] === 'team' || parts[1] === 'answer' ? parts[1] : 'answer';
  const sessionId = mode === 'answer' && parts.length === 3 ? parts[1] : parts[2];
  const value = mode === 'answer' && parts.length === 3 ? parts[2] : parts[3];
  if (!interaction.guildId || !interaction.channelId || !sessionId || !value) {
    await interaction.reply({ content: 'Bu oyun etkileşimi geçersiz.', flags: MessageFlags.Ephemeral });
    return true;
  }
  try {
    await ensureSchema();
    if (mode === 'team') {
      if (!['A','B'].includes(value)) return interaction.reply({content:'Takım seçimi geçersiz.',flags:MessageFlags.Ephemeral});
      const joined = await joinGuildMiniGameTeam(db,{guildId:interaction.guildId,channelId:interaction.channelId,sessionId,userId:interaction.user.id,team:value});
      const messages = {joined:'Takım ' + value + ' kadrosuna katıldın. Şimdi cevap butonunu kullanabilirsin.',already_joined:'Zaten Takım ' + value + ' kadrosundasın.',team_locked:'Bu turda takımın değiştirilemez.',team_full:'Bu takımın 5 kişilik kontenjanı doldu.',not_found:'Bu tur bulunamadı.',expired:'Bu turun süresi doldu.',not_team_mode:'Bu tur takım modu değil.'};
      return interaction.reply({content:messages[joined.status]||'Takıma katılma işlemi tamamlanamadı.',flags:MessageFlags.Ephemeral});
    }
    if (!/^\d$/.test(value)) return interaction.reply({content:'Cevap seçimi geçersiz.',flags:MessageFlags.Ephemeral});
    const result = await answerGuildMiniGame(db, {
      guildId: interaction.guildId, channelId: interaction.channelId,
      sessionId, userId: interaction.user.id, answerIndex: Number(value)
    });
    const messages = {
      not_found: 'Bu oyun turu bulunamadı.',
      expired: 'Bu turun süresi doldu.',
      already_answered: 'Bu turda cevabını zaten kullandın.',
      incorrect: 'Yanlış cevap. Bu turda ikinci kez cevap veremezsin. ' + (result.explanation || ''),
      correct: 'Doğru cevap! **+' + result.pointsAwarded + ' lonca puanı** kazandın.' + (result.team ? ' Takım ' + result.team + ' puanı: ' + Number(result.teamScore?.points || 0) + '.' : '') + ' ' + (result.explanation || ''),
      join_team_first: 'Önce Takım A veya Takım B’ye katılmalısın.'
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
