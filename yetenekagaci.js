import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { pool, ensureUser } from './database/db.js';

const TALENTS = {
  saldiri: { name: '⚔️ Keskin Sezgi', description: 'Her rütbede saldırı gücü +%4.', column: 'attack_rank', maxRank: 3 },
  savunma: { name: '🛡️ Çelik İrade', description: 'Her rütbede savunma +%4.', column: 'defense_rank', maxRank: 3 },
  can: { name: '❤️ Elf Dayanıklılığı', description: 'Her rütbede azami HP +%5.', column: 'hp_rank', maxRank: 3 },
  mana: { name: '🔮 Kadim Bilgelik', description: 'Her rütbede azami mana +%5.', column: 'mana_rank', maxRank: 3 }
};
const pointsFor = level => Math.floor(Number(level) / 3);

function renderTalents(level, ranks) {
  const earned = pointsFor(level);
  const spent = Object.values(ranks).reduce((sum, rank) => sum + Number(rank), 0);
  const embed = new EmbedBuilder()
    .setColor(0x9b8cff)
    .setTitle('🌿 Yetenek Ağacı • Elf Öğretisi')
    .setDescription(`Seviyen: **${level}** · Kazanılan puan: **${earned}** · Harcanan: **${spent}** · Kullanılabilir: **${Math.max(0, earned - spent)}**\nHer 3 seviyede 1 yetenek puanı kazanırsın. Her yetenek en fazla III. rütbeye yükseltilebilir.`)
    .addFields(Object.entries(TALENTS).map(([key, talent]) => ({
      name: `${talent.name} · ${Number(ranks[key] || 0) === 0 ? '0' : 'ⅠⅡⅢ'[Number(ranks[key]) - 1]}`,
      value: `${talent.description}\nMevcut rütbe: **${Number(ranks[key] || 0)}/${talent.maxRank}** · Seçenek: \` ${key} \``,
      inline: true
    })))
    .setFooter({ text: 'Poğaça Frieren • Kalıcı yetenekler tüm savaş türlerinde etkilidir.' });
  return embed;
}

export default {
  data: new SlashCommandBuilder()
    .setName('yetenekagaci')
    .setDescription('Seviye kazandıkça kalıcı savaş yeteneklerini geliştir.')
    .addStringOption(option => option.setName('yetenek').setDescription('Yükseltmek istediğin yetenek; boş bırakınca ağacı gösterir.')
      .setRequired(false).addChoices(
        { name: 'Keskin Sezgi — saldırı +%4/rütbe', value: 'saldiri' },
        { name: 'Çelik İrade — savunma +%4/rütbe', value: 'savunma' },
        { name: 'Elf Dayanıklılığı — azami HP +%5/rütbe', value: 'can' },
        { name: 'Kadim Bilgelik — azami mana +%5/rütbe', value: 'mana' }
      )),
  async execute(interaction) {
    if (!interaction.guildId) return interaction.reply({ content: 'Bu komut yalnızca sunucularda kullanılabilir.', flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await ensureUser(interaction.guildId, interaction.user.id);
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      const { rows: [user] } = await db.query('SELECT level FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE', [interaction.guildId, interaction.user.id]);
      const { rows: [talents] } = await db.query('SELECT attack_rank, defense_rank, hp_rank, mana_rank FROM user_talents WHERE guild_id=$1 AND user_id=$2 FOR UPDATE', [interaction.guildId, interaction.user.id]);
      const ranks = talents || { attack_rank: 0, defense_rank: 0, hp_rank: 0, mana_rank: 0 };
      const selected = interaction.options.getString('yetenek');
      if (!selected) {
        await db.query('ROLLBACK');
        return interaction.editReply({ embeds: [renderTalents(user.level, {
          saldiri: ranks.attack_rank, savunma: ranks.defense_rank, can: ranks.hp_rank, mana: ranks.mana_rank
        })] });
      }
      const talent = TALENTS[selected];
      const column = talent.column;
      const current = Number(ranks[column] || 0);
      const spent = Object.values(ranks).reduce((sum, rank) => sum + Number(rank), 0);
      const available = pointsFor(user.level) - spent;
      if (current >= talent.maxRank) {
        await db.query('ROLLBACK');
        return interaction.editReply(`✨ **${talent.name}** zaten en yüksek III. rütbede.`);
      }
      if (available < 1) {
        await db.query('ROLLBACK');
        return interaction.editReply(`Henüz yetenek puanın yok. Her 3 seviyede 1 puan kazanırsın. Mevcut seviye: **${user.level}**.`);
      }
      await db.query(`UPDATE user_talents SET ${column}=${column}+1, updated_at=NOW() WHERE guild_id=$1 AND user_id=$2`, [interaction.guildId, interaction.user.id]);
      await db.query('COMMIT');
      const updated = { ...ranks, [column]: current + 1 };
      return interaction.editReply({
        content: `🌟 **${talent.name}** ${current} → **${current + 1}. rütbeye** yükseltildi! Etkisi kalıcıdır.`,
        embeds: [renderTalents(user.level, { saldiri: updated.attack_rank, savunma: updated.defense_rank, can: updated.hp_rank, mana: updated.mana_rank })]
      });
    } catch (error) {
      await db.query('ROLLBACK').catch(() => {});
      console.error('Yetenek ağacı hatası:', error);
      return interaction.editReply('Yetenek ağacı işlenirken bir hata oluştu. Biraz sonra yeniden dene.');
    } finally {
      db.release();
    }
  }
};
