import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder
} from 'discord.js';
import { pool } from './database/db.js';
import {
  enqueueArenaPlayer,
  getArenaQueueStatus,
  leaveArenaQueue,
  submitArenaTurn
} from './arena-queue.js';
import { getArenaRating, getArenaLeaderboard } from './adventurer-platform.js';

function arenaEmbed(state) {
  const team = key => state.players
    .filter(player => player.team === key)
    .map(player => `${player.alive ? '🟢' : '☠️'} **${player.name}** — ${player.hp}/${player.maxHp} HP · ${player.mana}/${player.maxMana} Mana`)
    .join('\n');
  const current = state.status === 'active' ? state.players[state.turnIndex] : null;
  const embed = new EmbedBuilder()
    .setTitle('⚔️ 3v3 Büyücü Arenası')
    .setDescription(
      `**Tur ${state.round}** · ${state.turnCount} hamle\n\n**Takım A**\n${team('A')}\n\n**Takım B**\n${team('B')}`
    )
    .setFooter({ text: `Maç: ${state.matchId}` })
    .setTimestamp(new Date(state.updatedAt));
  if (current) embed.addFields({ name: 'Sıra', value: `<@${current.userId}> — hamleni seç.` });
  else embed.addFields({ name: 'Sonuç', value: state.winner === 'draw' ? 'Berabere' : `Takım ${state.winner} kazandı.` });
  return embed;
}

function arenaButtons(matchId, disabled = false) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`arena:attack:${matchId}`).setLabel('Saldır').setStyle(ButtonStyle.Danger).setDisabled(disabled),
    new ButtonBuilder().setCustomId(`arena:spell:${matchId}`).setLabel('Zoltraak (-20 Mana)').setStyle(ButtonStyle.Primary).setDisabled(disabled),
    new ButtonBuilder().setCustomId(`arena:guard:${matchId}`).setLabel('Savun').setStyle(ButtonStyle.Secondary).setDisabled(disabled)
  )];
}

function selectTarget(state, actorId) {
  const actor = state.players.find(player => player.userId === actorId);
  return state.players
    .filter(player => player.alive && player.team !== actor?.team)
    .sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp) || a.hp - b.hp)[0] || null;
}

export default {
  data: new SlashCommandBuilder()
    .setName('arena')
    .setDescription('3v3 Büyücü Arenasına katıl, sıranı gör veya kuyruktan ayrıl.')
    .addSubcommand(command => command.setName('katil').setDescription('3v3 eşleştirme kuyruğuna katıl.'))
    .addSubcommand(command => command.setName('durum').setDescription('Kuyruk veya devam eden maç durumunu gör.'))
    .addSubcommand(command => command.setName('ayril').setDescription('Eşleştirme kuyruğundan ayrıl.'))
    .addSubcommand(command => command.setName('siralam').setDescription('Bu sezonun arena sıralamasını gör.')),

  async execute(interaction) {
    if (!interaction.guildId) {
      return interaction.reply({ content: 'Arena yalnızca sunucularda kullanılabilir.', flags: MessageFlags.Ephemeral });
    }
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'katil') {
      const rating = await getArenaRating(pool, interaction.guildId, interaction.user.id);
      const result = await enqueueArenaPlayer(pool, {
        guildId: interaction.guildId,
        userId: interaction.user.id,
        rating: Number(rating.rating)
      });
      if (result.status === 'queued') {
        const queue = result.queue;
        return interaction.reply({
          content: `⏳ 3v3 Arena kuyruğuna katıldın. Kuyrukta **${queue.queueSize}/6** oyuncu var; önünde **${queue.playersAhead}** oyuncu bulunuyor. Eşleşme oluşunca bu kanalda duyurulacak.`,
          flags: MessageFlags.Ephemeral
        });
      }
      const mentions = result.participants.map(player => `<@${player.userId}>`).join(' ');
      return interaction.reply({
        content: `⚔️ **3v3 Arena maçı bulundu!** ${mentions}\nSırası gelen oyuncu aşağıdaki hamlelerden birini seçebilir.`,
        embeds: [arenaEmbed(result.state)],
        components: arenaButtons(result.matchId),
        allowedMentions: { users: result.participants.map(player => player.userId) }
      });
    }
    if (subcommand === 'durum') {
      const status = await getArenaQueueStatus(pool, interaction.guildId, interaction.user.id);
      if (status.status === 'queued') {
        return interaction.reply({
          content: `⏳ Kuyruktasın. **${status.queueSize}/6** oyuncu var; önünde **${status.playersAhead}** oyuncu bulunuyor.`,
          flags: MessageFlags.Ephemeral
        });
      }
      if (status.status === 'in_match') {
        return interaction.reply({
          content: 'Devam eden 3v3 maçın:',
          embeds: [arenaEmbed(status.state)],
          components: arenaButtons(status.matchId),
          flags: MessageFlags.Ephemeral
        });
      }
      return interaction.reply({ content: 'Şu anda arena kuyruğunda veya aktif bir maçta değilsin. **/arena katil** ile başlayabilirsin.', flags: MessageFlags.Ephemeral });
    }
    if (subcommand === 'ayril') {
      const result = await leaveArenaQueue(pool, { guildId: interaction.guildId, userId: interaction.user.id });
      return interaction.reply({
        content: result.removed ? 'Kuyruktan ayrıldın.' : 'Aktif bir kuyruk kaydın bulunamadı.',
        flags: MessageFlags.Ephemeral
      });
    }
    if (subcommand === 'siralam') {
      const board = await getArenaLeaderboard(pool, interaction.guildId, 10);
      const lines = board.players.map((player,index) => `**${index+1}.** ${player.character_name || 'Maceracı'} — ${player.rank} · ${player.rating} MMR · ${player.wins}G/${player.losses}M`);
      return interaction.reply({ content: `**${board.season.name} · Arena Sıralaması**\n${lines.join('\n') || 'Henüz sıralama verisi yok.'}`, flags: MessageFlags.Ephemeral });
    }
    return interaction.reply({ content: 'Bilinmeyen arena işlemi.', flags: MessageFlags.Ephemeral });
  }
};

export async function handleArenaInteraction(interaction, db = pool) {
  if (!interaction.isButton?.() || !interaction.customId?.startsWith('arena:')) return false;
  const [, action, matchId] = interaction.customId.split(':');
  if (!interaction.guildId || !matchId || !['attack', 'spell', 'guard'].includes(action)) {
    await interaction.reply({ content: 'Bu arena hamlesi geçersiz.', flags: MessageFlags.Ephemeral });
    return true;
  }
  try {
    const status = await getArenaQueueStatus(db, interaction.guildId, interaction.user.id);
    if (status.status !== 'in_match' || status.matchId !== matchId) {
      await interaction.reply({ content: 'Bu maçta aktif bir oyuncu değilsin veya maç artık devam etmiyor.', flags: MessageFlags.Ephemeral });
      return true;
    }
    const target = action === 'guard' ? null : selectTarget(status.state, interaction.user.id);
    if (action !== 'guard' && !target) {
      await interaction.reply({ content: 'Saldırabileceğin canlı bir rakip bulunamadı.', flags: MessageFlags.Ephemeral });
      return true;
    }
    const result = await submitArenaTurn(db, {
      guildId: interaction.guildId,
      matchId,
      actorId: interaction.user.id,
      action,
      targetId: target?.userId
    });
    const finished = result.state.status === 'finished';
    await interaction.update({
      content: finished
        ? result.state.winner === 'draw' ? '⚖️ Arena maçı berabere bitti.' : `🏆 **Takım ${result.state.winner} arenayı kazandı!**`
        : `Hamle: ${action === 'guard' ? 'Savunma' : action === 'spell' ? 'Zoltraak' : 'Saldırı'}`,
      embeds: [arenaEmbed(result.state)],
      components: arenaButtons(matchId, finished)
    });
    return true;
  } catch (error) {
    if (error.code === 'ARENA_NOT_YOUR_TURN' || error.message === 'ARENA_NOT_YOUR_TURN') {
      await interaction.reply({ content: 'Henüz senin sıran değil. Sıra göstergesini takip et.', flags: MessageFlags.Ephemeral });
      return true;
    }
    if (error.code === 'ARENA_MATCH_NOT_FOUND_OR_PLAYER_NOT_ACTIVE' || error.message === 'ARENA_MATCH_NOT_FOUND_OR_PLAYER_NOT_ACTIVE') {
      await interaction.reply({ content: 'Bu maç artık aktif değil veya oyuncu kaydın bulunamadı.', flags: MessageFlags.Ephemeral });
      return true;
    }
    console.error('Arena button interaction failed:', error?.message || error);
    await interaction.reply({ content: 'Arena hamlesi kaydedilemedi. Biraz sonra tekrar dene.', flags: MessageFlags.Ephemeral }).catch(() => {});
    return true;
  }
}
