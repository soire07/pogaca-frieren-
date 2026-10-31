import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { pool, ensureUser } from './database/db.js';
import {
  ensureGuildDailyQuestCatalog,
  getDailyQuestObjectiveSql
} from './owner-rpg-quests.js';

export default {
  data: new SlashCommandBuilder()
    .setName('gunlukgorev')
    .setDescription('Günlük ve sınıfına özel görevlerini kontrol et; ödüllerini al.')
    .addStringOption(option => option
      .setName('odul')
      .setDescription('Tamamladığın görevin ödülünü almak için görev seç.')
      .setAutocomplete(true)
      .setRequired(false)),

  async autocomplete(interaction) {
    try {
      if (!interaction.guildId) return interaction.respond([]);
      await ensureGuildDailyQuestCatalog(pool, interaction.guildId);
      const focused = interaction.options.getFocused().toLocaleLowerCase('tr-TR');
      const result = await pool.query(
        `SELECT quest_key,title,class_name FROM guild_daily_quests
         WHERE guild_id=$1 AND active=TRUE
           AND (LOWER(title) LIKE LOWER($2) OR LOWER(quest_key) LIKE LOWER($2))
         ORDER BY title LIMIT 25`,
        [interaction.guildId, '%' + focused + '%']
      );
      return interaction.respond((result.rows || []).map(quest => ({
        name: (quest.class_name ? quest.class_name + ': ' : '') + quest.title,
        value: quest.quest_key
      })));
    } catch (error) {
      console.error('/gunlukgorev autocomplete hatası:', error?.message || error);
      return interaction.respond([]).catch(() => {});
    }
  },

  async execute(interaction) {
    if (!interaction.guildId) {
      return interaction.reply({ content: 'Bu komut yalnızca sunucularda kullanılabilir.', ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });
    try {
      await ensureUser(interaction.guildId, interaction.user.id);
      await ensureGuildDailyQuestCatalog(pool, interaction.guildId);
      const requestedKey = interaction.options.getString('odul');

      if (requestedKey) {
        const catalog = await pool.query(
          `SELECT quest_key,title,description,objective_type,class_name,reward_coins
           FROM guild_daily_quests WHERE guild_id=$1 AND quest_key=$2 AND active=TRUE LIMIT 1`,
          [interaction.guildId, requestedKey]
        );
        const mission = catalog.rows?.[0];
        if (!mission) return interaction.editReply('Bu görev artık aktif değil veya bulunamadı.');

        const db = await pool.connect();
        try {
          await db.query('BEGIN');
          const user = await db.query(
            'SELECT class_name FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE',
            [interaction.guildId, interaction.user.id]
          );
          if (mission.class_name && user.rows[0]?.class_name !== mission.class_name) {
            await db.query('ROLLBACK');
            return interaction.editReply(`Bu görev yalnızca **${mission.class_name}** sınıfına açık. Sınıfın: **${user.rows[0]?.class_name || 'Bilinmiyor'}**.`);
          }
          if (mission.class_name) {
            const priorClassClaim = await db.query(
              `SELECT 1 FROM daily_mission_claims
               WHERE guild_id=$1 AND user_id=$2 AND mission_date=CURRENT_DATE
                 AND (
                   mission_key='__class_daily_reward__'
                   OR mission_key LIKE 'class_%'
                   OR mission_key IN (SELECT quest_key FROM guild_daily_quests WHERE guild_id=$1 AND class_name IS NOT NULL)
                 )
               LIMIT 1`,
              [interaction.guildId, interaction.user.id]
            );
            if (priorClassClaim.rowCount) {
              await db.query('ROLLBACK');
              return interaction.editReply('Bugün sınıfına özel görev ödülünü zaten aldın. Yarın yeni görev açılacak.');
            }
          }

          const progress = await db.query(
            getDailyQuestObjectiveSql(mission.objective_type),
            [interaction.guildId, interaction.user.id]
          );
          if (!progress.rows[0]?.done) {
            await db.query('ROLLBACK');
            return interaction.editReply('Bu görevi henüz tamamlamadın. Önce açıklamadaki işlemi yap.');
          }
          const claim = await db.query(
            `INSERT INTO daily_mission_claims(guild_id,user_id,mission_date,mission_key)
             VALUES($1,$2,CURRENT_DATE,$3) ON CONFLICT DO NOTHING RETURNING mission_key`,
            [interaction.guildId, interaction.user.id, mission.quest_key]
          );
          if (!claim.rowCount) {
            await db.query('ROLLBACK');
            return interaction.editReply('Bu görevin ödülünü bugün zaten aldın.');
          }
          if (mission.class_name) {
            const classClaim = await db.query(
              `INSERT INTO daily_mission_claims(guild_id,user_id,mission_date,mission_key)
               VALUES($1,$2,CURRENT_DATE,'__class_daily_reward__')
               ON CONFLICT DO NOTHING RETURNING mission_key`,
              [interaction.guildId, interaction.user.id]
            );
            if (!classClaim.rowCount) {
              await db.query('ROLLBACK');
              return interaction.editReply('Bugün sınıfına özel görev ödülünü zaten aldın.');
            }
          }
          await db.query(
            'UPDATE users SET coins=coins+$3 WHERE guild_id=$1 AND user_id=$2',
            [interaction.guildId, interaction.user.id, Number(mission.reward_coins)]
          );
          await db.query('COMMIT');
          return interaction.editReply(`🎉 **${mission.title}** görevinin ödülü: **${Number(mission.reward_coins)} altın**!`);
        } catch (error) {
          await db.query('ROLLBACK').catch(() => {});
          throw error;
        } finally {
          db.release();
        }
      }

      const [claimed, userResult, questResult] = await Promise.all([
        pool.query(
          'SELECT mission_key FROM daily_mission_claims WHERE guild_id=$1 AND user_id=$2 AND mission_date=CURRENT_DATE',
          [interaction.guildId, interaction.user.id]
        ),
        pool.query(
          'SELECT class_name FROM users WHERE guild_id=$1 AND user_id=$2',
          [interaction.guildId, interaction.user.id]
        ),
        pool.query(
          `SELECT quest_key,title,description,objective_type,class_name,reward_coins
           FROM guild_daily_quests WHERE guild_id=$1 AND active=TRUE
           ORDER BY is_system DESC,title ASC LIMIT 100`,
          [interaction.guildId]
        )
      ]);
      const className = userResult.rows[0]?.class_name || 'Gezgin';
      const claimedKeys = new Set((claimed.rows || []).map(row => row.mission_key));
      const availableMissions = (questResult.rows || []).filter(mission =>
        !mission.class_name || mission.class_name === className
      );
      const lines = [];
      for (const mission of availableMissions) {
        const progress = await pool.query(
          getDailyQuestObjectiveSql(mission.objective_type),
          [interaction.guildId, interaction.user.id]
        );
        const done = Boolean(progress.rows[0]?.done);
        lines.push(`${claimedKeys.has(mission.quest_key) ? '✅ Ödül alındı' : done ? '🟢 Tamamlandı' : '🔒 Bekliyor'} **${mission.title}** — ${mission.description}\nÖdül: ${Number(mission.reward_coins)} altın · Kod: \`${mission.quest_key}\``);
      }
      const embed = new EmbedBuilder()
        .setColor(0xb58cff)
        .setTitle('📜 Günlük Görevler')
        .setDescription(lines.join('\n\n') || 'Şu anda aktif görev bulunmuyor.')
        .setFooter({ text: `Sınıfın: ${className} · Her görev günde bir kez ödül verir.` });
      return interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('/gunlukgorev hatası:', error);
      return interaction.editReply('Görevler yüklenemedi. Daha sonra tekrar dene.');
    }
  }
};
