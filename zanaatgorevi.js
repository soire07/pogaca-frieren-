import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { pool, ensureUser } from './database/db.js';
import { levelForXp } from './utils.js';

const TARGET = 3;
const REWARD = { coins: 100, xp: 50 };

export default {
  data: new SlashCommandBuilder()
    .setName('zanaatgorevi')
    .setDescription('Günlük zanaat görevinde 3 ekipman üret ve ödülünü al.')
    .addBooleanOption(option => option.setName('odul_al').setDescription('Görev tamamlandıysa günlük ödülü al.').setRequired(false)),
  async execute(interaction) {
    if (!interaction.guildId) return interaction.reply({ content: 'Bu komut yalnızca sunucularda kullanılabilir.', ephemeral: true });
    await ensureUser(interaction.guildId, interaction.user.id);
    const claim = interaction.options.getBoolean('odul_al') || false;
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      await db.query(
        'INSERT INTO daily_crafting_progress(guild_id,user_id,mission_date) VALUES($1,$2,CURRENT_DATE) ON CONFLICT DO NOTHING',
        [interaction.guildId, interaction.user.id]
      );
      const { rows: [progress] } = await db.query(
        'SELECT crafted_items, claimed_at FROM daily_crafting_progress WHERE guild_id=$1 AND user_id=$2 AND mission_date=CURRENT_DATE FOR UPDATE',
        [interaction.guildId, interaction.user.id]
      );
      const count = Number(progress.crafted_items);
      if (!claim) {
        await db.query('ROLLBACK');
        const status = progress.claimed_at ? 'Ödül bugün zaten alındı.' : count >= TARGET ? 'Görev tamamlandı; odul_al seçeneğini true yaparak ödülünü alabilirsin.' : `Eksik: **${TARGET - count}** ekipman daha üret.`;
        const embed = new EmbedBuilder().setColor(0x9b8cff).setTitle('📋 Günlük Zanaat Görevi')
          .setDescription(`Hedef: **${TARGET} ekipman**\nBugünkü üretimin: **${count}/${TARGET}**\nÖdül: **+${REWARD.coins} altın · +${REWARD.xp} XP**\n\n${status}`)
          .setFooter({ text: 'Poğaça Frieren • İlerleme her gün yenilenir.' });
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }
      if (count < TARGET) {
        await db.query('ROLLBACK');
        return interaction.reply({ content: `Günlük görev için **${TARGET}** ekipman üretmelisin. Şu an: **${count}/${TARGET}**.`, ephemeral: true });
      }
      if (progress.claimed_at) {
        await db.query('ROLLBACK');
        return interaction.reply({ content: 'Günlük zanaat ödülünü bugün zaten aldın.', ephemeral: true });
      }
      await db.query(
        'UPDATE daily_crafting_progress SET claimed_at=NOW(), updated_at=NOW() WHERE guild_id=$1 AND user_id=$2 AND mission_date=CURRENT_DATE',
        [interaction.guildId, interaction.user.id]
      );
      const { rows: [user] } = await db.query(
        'SELECT xp, level FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE',
        [interaction.guildId, interaction.user.id]
      );
      const newXp = Number(user.xp) + REWARD.xp;
      const newLevel = levelForXp(newXp);
      await db.query(
        'UPDATE users SET coins=coins+$3, xp=$4, stat_points=stat_points+GREATEST(0,$5-level), level=$5 WHERE guild_id=$1 AND user_id=$2',
        [interaction.guildId, interaction.user.id, REWARD.coins, newXp, newLevel]
      );
      await db.query('COMMIT');
      return interaction.reply({ content: `🎉 Günlük zanaat görevi tamamlandı! **+${REWARD.coins} altın**, **+${REWARD.xp} XP** kazandın. Yeni seviye: **${newLevel}**.`, ephemeral: true });
    } catch (error) {
      await db.query('ROLLBACK').catch(() => {});
      console.error('Günlük zanaat görevi hatası:', error);
      return interaction.reply({ content: 'Günlük zanaat görevi işlenemedi. Biraz sonra tekrar dene.', ephemeral: true });
    } finally {
      db.release();
    }
  }
};
