import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { pool, ensureUser } from './database/db.js';

const choices = [
  { name: 'Cesaret — Tehlikeye rağmen ilerle', value: 'cesaret' },
  { name: 'Merhamet — Önce yardım et', value: 'merhamet' },
  { name: 'Merak — Gizemin peşine düş', value: 'merak' }
];

const chapters = [
  {
    title: '📜 Prolog: Kuzeyden Gelen Mektup',
    story: 'Kuzey topraklarından gelen mühürlü bir mektup, eski bir büyü kalıntısından söz ediyor. Frieren’in izinden giden bir gezgin olarak ilk kararın, yolculuğunun tonunu belirleyecek.',
    objective: 'Hikâyeye başlamak için bir karar seç.',
    requirement: async () => ({ ok: true, progress: 'Hazır' }),
    reward: { coins: 50, xp: 25 }
  },
  {
    title: '🌲 Bölüm I: Sisli Kuzey Ormanı',
    story: 'Ormanın derinliklerinde büyülü izler birbirine karışıyor. Bir şey seni harabelere doğru yönlendiriyor; ama önce çevreyi dikkatlice incelemelisin.',
    objective: ' /kesif komutuyla en az bir keşif tamamla.',
    requirement: async (db, guildId, userId, user) => {
      const count = Number(user.exploration_count);
      return { ok: count >= 1, progress: count + ' / 1 keşif' };
    },
    reward: { coins: 100, xp: 50 }
  },
  {
    title: '📖 Bölüm II: Kayıp Büyü Tomarı',
    story: 'Harabelerdeki yazıt, gücün yalnızca doğuştan gelmediğini anlatıyor. Yeni bir büyü öğrenirsen kapının ardındaki mühür çözülebilir.',
    objective: ' /buyuogren ile başlangıç büyün Zoltraak dışında en az bir büyü öğren.',
    requirement: async (db, guildId, userId) => {
      const result = await db.query("SELECT COUNT(*)::int AS count FROM learned_spells WHERE guild_id=$1 AND user_id=$2 AND spell_key <> 'zoltraak'", [guildId, userId]);
      const count = Number(result.rows[0]?.count || 0);
      return { ok: count >= 1, progress: count + ' / 1 yeni büyü' };
    },
    reward: { coins: 150, xp: 80 }
  },
  {
    title: '🧪 Bölüm III: Gezginin Hazırlığı',
    story: 'Yolun devamı tehlikeli. Eski bir gezgin, iyi hazırlanmış bir büyücünün bazen en güçlü büyüden daha fazlasını başarabileceğini söylüyor.',
    objective: 'Envanterinden en az bir eşya kullan.',
    requirement: async (db, guildId, userId, user) => {
      const count = Number(user.items_used_count);
      return { ok: count >= 1, progress: count + ' / 1 eşya' };
    },
    reward: { coins: 200, xp: 100 }
  },
  {
    title: '⚔️ Bölüm IV: Kuzey Sınavı',
    story: 'Kuzey sınırında karanlık bir büyü dalgası hissediliyor. Artık acemi değilsin; fakat bir sonraki adım için deneyimini kanıtlamalısın.',
    objective: 'En az 3. seviyeye ulaş.',
    requirement: async (db, guildId, userId, user) => {
      const level = Number(user.level);
      return { ok: level >= 3, progress: 'Seviye ' + level + ' / 3' };
    },
    reward: { coins: 300, xp: 150 }
  },
  {
    title: '🌟 Bölüm V: Yolculuğun İlk Mührü',
    story: 'Mühür açılıyor ve kuzey yolunun haritası beliriyor. Bu yalnızca başlangıç: daha uzak bölgeler, yeni yoldaşlar ve çok daha eski büyüler seni bekliyor.',
    objective: 'İlk hikâye zincirini tamamladın!',
    requirement: async () => ({ ok: true, progress: 'Tamamlandı' }),
    reward: { coins: 0, xp: 0 }
  }
];

function choiceLabel(value) {
  return choices.find(choice => choice.value === value)?.name.split(' — ')[0] ?? value;
}

export default {
  data: new SlashCommandBuilder()
    .setName('hikaye')
    .setDescription('Ana hikâyeyi, görev zincirini ve kalıcı ilerlemeni görüntüle.')
    .addStringOption(option =>
      option.setName('karar')
        .setDescription('Bu bölümde vereceğin karar')
        .addChoices(...choices)
        .setRequired(false)
    ),

  async execute(interaction) {
    if (!interaction.guildId) {
      return interaction.reply({ content: 'Ana hikâye yalnızca Discord sunucularında kullanılabilir.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const decision = interaction.options.getString('karar');

    try {
      await ensureUser(guildId, userId);
      await pool.query(
        'INSERT INTO story_progress(guild_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
        [guildId, userId]
      );

      const client = await pool.connect();
      let resultMessage;
      try {
        await client.query('BEGIN');
        const userResult = await client.query(
          'SELECT xp, level, coins, exploration_count, items_used_count FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE',
          [guildId, userId]
        );
        const user = userResult.rows[0];
        const progressResult = await client.query(
          'SELECT current_chapter, choices FROM story_progress WHERE guild_id=$1 AND user_id=$2 FOR UPDATE',
          [guildId, userId]
        );
        const progress = progressResult.rows[0];
        const chapterIndex = Number(progress.current_chapter);
        const chapter = chapters[chapterIndex];

        if (!chapter) {
          await client.query('COMMIT');
          return interaction.editReply('🌟 Ana hikâyeyi zaten tamamladın! Yeni hikâye bölümleri ileride eklenecek.');
        }

        const requirement = await chapter.requirement(client, guildId, userId, user);
        if (!decision) {
          await client.query('COMMIT');
          const previousChoices = Array.isArray(progress.choices) ? progress.choices : [];
          const embed = new EmbedBuilder()
            .setColor(0x9b8cff)
            .setTitle(chapter.title)
            .setDescription(chapter.story)
            .addFields(
              { name: '🎯 Görev', value: chapter.objective.trim(), inline: false },
              { name: '📊 İlerleme', value: requirement.progress, inline: true },
              { name: '🎁 Bölüm ödülü', value: chapter.reward.coins ? chapter.reward.coins + ' altın · ' + chapter.reward.xp + ' XP' : 'Hikâye sonu', inline: true },
              { name: '🧭 Önceki kararların', value: previousChoices.length ? previousChoices.map((value, index) => (index + 1) + '. ' + choiceLabel(value)).join('\n') : 'Henüz karar vermedin.', inline: false }
            )
            .setFooter({ text: 'Karar vermek için /hikaye karar:<seçim> kullan.' });
          return interaction.editReply({ embeds: [embed] });
        }

        if (!requirement.ok) {
          await client.query('COMMIT');
          return interaction.editReply('🔒 Bu bölümün şartı henüz tamamlanmadı. **' + chapter.objective.trim() + '**\nİlerleme: ' + requirement.progress + '\n\nGörevi tamamladıktan sonra /hikaye komutuyla kararını verebilirsin.');
        }

        const previousChoices = Array.isArray(progress.choices) ? progress.choices : [];
        const newChoices = [...previousChoices, decision];
        const reward = chapter.reward;
        const newXp = Number(user.xp) + reward.xp;
        const newLevel = Math.floor(Math.sqrt(newXp / 100)) + 1;
        const gainedPoints = Math.max(0, newLevel - Number(user.level));

        await client.query(
          `UPDATE users SET coins=coins+$3, xp=$4, level=$5, stat_points=stat_points+$6
           WHERE guild_id=$1 AND user_id=$2`,
          [guildId, userId, reward.coins, newXp, newLevel, gainedPoints]
        );
        await client.query(
          `UPDATE story_progress SET current_chapter=current_chapter+1, choices=$3::jsonb, updated_at=NOW()
           WHERE guild_id=$1 AND user_id=$2`,
          [guildId, userId, JSON.stringify(newChoices)]
        );
        await client.query('COMMIT');

        resultMessage = '📖 **' + chapter.title + '** tamamlandı!\nKararın: **' + choiceLabel(decision) + '**\nÖdül: **' + reward.coins + ' altın** ve **' + reward.xp + ' XP**' + (gainedPoints ? '\n✨ Seviye atladın: +' + gainedPoints + ' stat puanı.' : '');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }

      return interaction.editReply(resultMessage);
    } catch (error) {
      console.error('/hikaye hatası:', error);
      return interaction.editReply('Hikâye ilerlemesi kaydedilemedi. Lütfen biraz sonra tekrar dene.');
    }
  }
};
