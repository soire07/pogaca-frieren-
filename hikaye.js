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
    story: 'Kuzey topraklarından gelen mühürlü mektup, unutulmuş bir büyü kalıntısından söz ediyor. Mektubun arkasında tek bir cümle var: “İlk seçimin, yolunu belirleyecek.”',
    objective: 'Hikâyeye başlamak için kendi yolunu seç.',
    requirement: async () => ({ ok: true, progress: 'Karar vermeye hazır' }),
    reward: { coins: 50, xp: 25 }
  },
  {
    title: '🌲 Bölüm I: Sisli Kuzey Ormanı',
    story: 'İlk kararın ormanın sana nasıl karşılık vereceğini belirledi. Seçtiğin yol, karşılaşacağın sınavı değiştirdi.',
    objective: 'Seçtiğin yolun sınavını tamamla.',
    requirement: async (db, guildId, userId, user, path) => {
      if (path === 'cesaret') {
        const count = Number(user.boss_defeats);
        return { ok: count >= 1, progress: count + ' / 1 iblis zaferi', detail: 'Cesaret yolunda /iblisavasi ile bir iblisi yen.' };
      }
      if (path === 'merhamet') {
        const count = Number(user.items_used_count);
        return { ok: count >= 1, progress: count + ' / 1 kullanılan eşya', detail: 'Merhamet yolunda envanterinden bir eşya kullan.' };
      }
      const result = await db.query("SELECT COUNT(*)::int AS count FROM learned_spells WHERE guild_id=$1 AND user_id=$2 AND spell_key <> 'zoltraak'", [guildId, userId]);
      const count = Number(result.rows[0]?.count || 0);
      return { ok: count >= 1, progress: count + ' / 1 yeni büyü', detail: 'Merak yolunda /buyuogren ile Zoltraak dışında bir büyü öğren.' };
    },
    reward: { coins: 140, xp: 70 }
  },
  {
    title: '🗝️ Bölüm II: Harabelerin Mührü',
    story: 'Ormanın sonunda eski bir kapı buldun. Mühür, yalnızca kararlı bir gezginin yolculuğuna devam etmesine izin veriyor. Kapının ardındaki izler kuzeydeki büyük tehdide işaret ediyor.',
    objective: 'Toplamda en az 2 keşif tamamla.',
    requirement: async (db, guildId, userId, user) => {
      const count = Number(user.exploration_count);
      return { ok: count >= 2, progress: count + ' / 2 keşif' };
    },
    reward: { coins: 180, xp: 90 }
  },
  {
    title: '⚔️ Bölüm III: Kuzey Sınavı',
    story: 'Harabelerdeki mühür kırıldığında karanlık bir dalga yayıldı. Bir sonraki geçit, gücünü ve deneyimini kanıtlamanı istiyor.',
    objective: 'En az 3. seviyeye ulaş.',
    requirement: async (db, guildId, userId, user) => {
      const level = Number(user.level);
      return { ok: level >= 3, progress: 'Seviye ' + level + ' / 3' };
    },
    reward: { coins: 250, xp: 125 }
  },
  {
    title: '🌟 Bölüm IV: Yolculuğun İlk Mührü',
    story: 'Mühür açılıyor ve kuzey yolunun haritası beliriyor. Seçtiğin yol seni buraya getirdi; ancak daha uzak bölgeler, kadim büyüler ve güçlü düşmanlar ileride seni bekliyor.',
    objective: 'İlk hikâye zincirini tamamladın!',
    requirement: async () => ({ ok: true, progress: 'Finale hazır' }),
    reward: { coins: 300, xp: 150 }
  }
];

const pathDetails = {
  cesaret: { label: 'Cesaret', description: 'Bir iblisi yenerek korkunun karşısında dur.' },
  merhamet: { label: 'Merhamet', description: 'Bir eşya kullanarak hazırlığını ve kendine özenini göster.' },
  merak: { label: 'Merak', description: 'Yeni bir büyü öğrenerek bilinmeyenin peşine düş.' }
};

const endings = {
  cesaret: { title: '🔥 Cesaretin Mührü', story: 'Kuzey rüzgârı sert eserken geri adım atmadın. Mühür, kararlılığını tanıdı ve önünde yeni bir yol açıldı.', bonusCoins: 100, bonusXp: 40 },
  merhamet: { title: '🌿 Merhametin Mührü', story: 'Yol boyunca yalnızca gücünü değil, başkalarını gözetme iradeni de korudun. Eski mühür yumuşak bir ışıkla açıldı.', bonusCoins: 120, bonusXp: 50 },
  merak: { title: '🔮 Bilginin Mührü', story: 'Bilinmeyeni araştırmaktan vazgeçmedin. Mühür, öğrenme isteğine karşılık vererek kadim bir işaret gösterdi.', bonusCoins: 90, bonusXp: 60 }
};

function choiceLabel(value) {
  return choices.find(choice => choice.value === value)?.name.split(' — ')[0] ?? value;
}

export default {
  data: new SlashCommandBuilder()
    .setName('hikaye')
    .setDescription('Ana hikâyeyi ilerlet; seçimlerine göre farklı sınavlarla karşılaş.')
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
          'SELECT xp, level, coins, exploration_count, items_used_count, boss_defeats FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE',
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

        const previousChoices = Array.isArray(progress.choices) ? progress.choices : [];
        const chosenPath = previousChoices[0] ?? decision ?? 'merak';
        const requirement = await chapter.requirement(client, guildId, userId, user, chosenPath);

        if (!decision) {
          await client.query('COMMIT');
          const path = pathDetails[previousChoices[0]];
          const embed = new EmbedBuilder()
            .setColor(0x9b8cff)
            .setTitle(chapter.title)
            .setDescription(chapter.story + (chapterIndex === 1 && path ? '\n\n**Seçtiğin yol:** ' + path.label + ' — ' + path.description : ''))
            .addFields(
              { name: '🎯 Görev', value: chapterIndex === 1 ? (requirement.detail ?? chapter.objective) : chapter.objective, inline: false },
              { name: '📊 İlerleme', value: requirement.progress, inline: true },
              { name: '🎁 Bölüm ödülü', value: chapter.reward.coins ? chapter.reward.coins + ' altın · ' + chapter.reward.xp + ' XP' : 'Hikâye sonu', inline: true },
              { name: '🧭 Önceki kararların', value: previousChoices.length ? previousChoices.map((value, index) => (index + 1) + '. ' + choiceLabel(value)).join('\n') : 'Henüz karar vermedin.', inline: false }
            )
            .setFooter({ text: chapterIndex === 0 ? 'İlk kararın hikâye yolunu belirler. /hikaye karar:<seçim>' : 'Görevi tamamladıktan sonra /hikaye karar:<seçim> ile ilerle.' });
          return interaction.editReply({ embeds: [embed] });
        }

        if (chapterIndex === 1 && !previousChoices.length && !pathDetails[decision]) {
          await client.query('ROLLBACK');
          return interaction.editReply('İlk kararın için Cesaret, Merhamet veya Merak seçeneklerinden birini seçmelisin.');
        }

        if (!requirement.ok) {
          await client.query('COMMIT');
          const task = chapterIndex === 1 ? requirement.detail : chapter.objective;
          return interaction.editReply('🔒 Bu bölüm henüz tamamlanmadı. **' + task.trim() + '**\nİlerleme: ' + requirement.progress + '\n\nGörevi tamamladıktan sonra /hikaye komutuyla devam edebilirsin.');
        }

        const newChoices = chapterIndex === 0 ? [decision] : [...previousChoices, decision];
        const ending = chapterIndex === chapters.length - 1 ? endings[decision] : null;
        // Final ending bonuses scale with the player's level: a level-50 player
        // receives 100 x 50 = 5,000 bonus coins on the courage ending.
        const playerLevel = Math.max(1, Number(user.level) || 1);
        const scaledBonusCoins = ending ? ending.bonusCoins * playerLevel : 0;
        const scaledBonusXp = ending ? ending.bonusXp * playerLevel : 0;
        const rewardCoins = chapter.reward.coins + scaledBonusCoins;
        const rewardXp = chapter.reward.xp + scaledBonusXp;
        const newXp = Number(user.xp) + rewardXp;
        const newLevel = Math.floor(Math.sqrt(newXp / 100)) + 1;
        const gainedPoints = Math.max(0, newLevel - Number(user.level));

        await client.query(
          `UPDATE users SET coins=coins+$3, xp=$4, level=$5, stat_points=stat_points+$6
           WHERE guild_id=$1 AND user_id=$2`,
          [guildId, userId, rewardCoins, newXp, newLevel, gainedPoints]
        );
        await client.query(
          `UPDATE story_progress SET current_chapter=current_chapter+1, choices=$3::jsonb, updated_at=NOW()
           WHERE guild_id=$1 AND user_id=$2`,
          [guildId, userId, JSON.stringify(newChoices)]
        );
        await client.query('COMMIT');

        const pathName = pathDetails[newChoices[0]]?.label ?? choiceLabel(decision);
        if (ending) {
          resultMessage = '🌟 **' + ending.title + '**\\n' + ending.story + '\\n\\nİlk yolun: **' + pathName + '**\\nFinal kararın: **' + choiceLabel(decision) + '**\\n\\nToplam ödül: **' + rewardCoins + ' altın** ve **' + rewardXp + ' XP**' +
            (gainedPoints ? '\\n✨ Seviye atladın: +' + gainedPoints + ' stat puanı.' : '') +
            '\\n\\nAna hikâyenin ilk zinciri tamamlandı. Yeni bölümler sonraki güncellemelerde eklenecek.';
        } else {
          resultMessage = '📖 **' + chapter.title + '** tamamlandı!\\n' +
            (chapterIndex === 0 ? 'Seçtiğin yol: **' + pathName + '**\\n' : 'Yolun: **' + pathName + '**\\n') +
            'Kararın: **' + choiceLabel(decision) + '**\\nÖdül: **' + rewardCoins + ' altın** ve **' + rewardXp + ' XP**' +
            (gainedPoints ? '\\n✨ Seviye atladın: +' + gainedPoints + ' stat puanı.' : '');
        }
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
