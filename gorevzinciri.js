import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { pool, ensureUser } from './database/db.js';
import { levelForXp } from './utils.js';
import { getLevelScaledQuestReward } from './rpg-mechanics.js';

const steps = [
  { step: 1, title: 'Fırının Çağrısı', description: 'Bugün günlük ödülünü al: /gunlukodul', reward: 50, xpReward: 20, material: '🥐 Büyülü Poğaça Kutusu', sql: "SELECT (last_daily_at::date = CURRENT_DATE) AS done FROM users WHERE guild_id=$1 AND user_id=$2" },
  { step: 2, title: 'Kuzey Yolculuğu', description: 'Bugün /kesif ile bir keşif tamamla.', reward: 100, xpReward: 40, material: '💎 Mana Kristali', sql: "SELECT (last_exploration_at::date = CURRENT_DATE) AS done FROM users WHERE guild_id=$1 AND user_id=$2" },
  { step: 3, title: 'İblis Avcısının Yemini', description: 'Bugün /iblisavasi ile bir iblisi yen.', reward: 200, xpReward: 80, material: '🐉 Ejderha Pulu', sql: "SELECT (last_boss_win_at::date = CURRENT_DATE) AS done FROM users WHERE guild_id=$1 AND user_id=$2" }
];

export default {
  data: new SlashCommandBuilder().setName('gorevzinciri').setDescription('Üç aşamalı günlük görev zincirini ve aşamalı ödüllerini takip et.')
    .addStringOption(option => option.setName('odul').setDescription('Sıradaki tamamlanmış aşamanın ödülünü almak için seç.')
      .addChoices({ name: '1. Aşama ödülünü al', value: '1' }, { name: '2. Aşama ödülünü al', value: '2' }, { name: '3. Aşama ödülünü al', value: '3' }).setRequired(false)),
  async execute(interaction) {
    if (!interaction.guildId) return interaction.reply({ content: 'Bu komut yalnızca sunucularda kullanılabilir.', flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      await ensureUser(interaction.guildId, interaction.user.id);
      const requestedStep = interaction.options.getString('odul');
      if (!requestedStep) {
        await pool.query("INSERT INTO daily_quest_chains(guild_id,user_id,chain_date) VALUES($1,$2,CURRENT_DATE) ON CONFLICT DO NOTHING", [interaction.guildId, interaction.user.id]);
        const [chainResult, userResult] = await Promise.all([
          pool.query('SELECT current_step FROM daily_quest_chains WHERE guild_id=$1 AND user_id=$2 AND chain_date=CURRENT_DATE', [interaction.guildId, interaction.user.id]),
          pool.query('SELECT level, last_daily_at::date=CURRENT_DATE AS daily_done, last_exploration_at::date=CURRENT_DATE AS explore_done, last_boss_win_at::date=CURRENT_DATE AS boss_done FROM users WHERE guild_id=$1 AND user_id=$2', [interaction.guildId, interaction.user.id])
        ]);
        const currentStep = Number(chainResult.rows[0]?.current_step || 1);
        const p = userResult.rows[0] || {};
        const lines = steps.map(s => {
          const done = s.step === 1 ? p.daily_done : s.step === 2 ? p.explore_done : p.boss_done;
          const status = currentStep > s.step ? '✅ Ödül alındı' : currentStep === s.step ? (done ? '🟢 Hazır — ödülünü alabilirsin' : '🔒 Devam ediyor') : '⏳ Önceki aşama bekleniyor';
          const reward = getLevelScaledQuestReward(s.reward, s.xpReward, p.level, s.step === 3);
          return status + ' **' + s.step + '. ' + s.title + '**\n' + s.description + '\nÖdül: **' + reward.coins + ' altın** · **' + reward.xp + ' XP** + ⚒️ ' + s.material;
        });
        const description = currentStep > 3 ? '🎉 Günlük görev zincirinin tüm aşamalarını tamamladın! Yeni zincir yarın açılacak.' : lines.join('\n\n');
        const embed = new EmbedBuilder().setColor(0xb58cff).setTitle('🧭 Günlük Görev Zinciri').setDescription(description).setFooter({ text: 'Aşamalar sırayla açılır. Her ödül aynı gün yalnızca bir kez alınabilir.' });
        return interaction.editReply({ embeds: [embed] });
      }
      const step = steps.find(s => s.step === Number(requestedStep));
      if (!step) return interaction.editReply('Geçersiz görev aşaması.');
      const db = await pool.connect();
      try {
        await db.query('BEGIN');
        const playerResult = await db.query('SELECT xp, level, stat_points FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE', [interaction.guildId, interaction.user.id]);
        await db.query('INSERT INTO daily_quest_chains(guild_id,user_id,chain_date) VALUES($1,$2,CURRENT_DATE) ON CONFLICT DO NOTHING', [interaction.guildId, interaction.user.id]);
        const chain = await db.query('SELECT current_step FROM daily_quest_chains WHERE guild_id=$1 AND user_id=$2 AND chain_date=CURRENT_DATE FOR UPDATE', [interaction.guildId, interaction.user.id]);
        const currentStep = Number(chain.rows[0]?.current_step || 1);
        if (currentStep !== step.step) {
          await db.query('ROLLBACK');
          if (currentStep > 3) return interaction.editReply('Bugünkü görev zincirini zaten tamamladın. Yeni zincir yarın açılacak.');
          return interaction.editReply('Şu anda yalnızca **' + currentStep + '. aşamayı** tamamlayabilirsin. Önceki aşamaların sırasını atlayamazsın.');
        }
        const objective = await db.query(step.sql, [interaction.guildId, interaction.user.id]);
        if (!objective.rows[0]?.done) {
          await db.query('ROLLBACK');
          return interaction.editReply('**' + step.title + '** henüz tamamlanmadı. Önce şu koşulu yerine getir: ' + step.description);
        }
        const nextStep = step.step + 1;
        const player = playerResult.rows[0] || { xp: 0, level: 1, stat_points: 0 };
        const reward = getLevelScaledQuestReward(step.reward, step.xpReward, player.level, step.step === 3);
        const newXp = Number(player.xp) + reward.xp;
        const newLevel = levelForXp(newXp);
        const gainedStatPoints = Math.max(0, newLevel - Number(player.level));
        await db.query('UPDATE daily_quest_chains SET current_step=$3, completed_at=CASE WHEN $3=4 THEN NOW() ELSE completed_at END, updated_at=NOW() WHERE guild_id=$1 AND user_id=$2 AND chain_date=CURRENT_DATE', [interaction.guildId, interaction.user.id, nextStep]);
        await db.query('UPDATE users SET coins=coins+$3, xp=$4, level=$5, stat_points=stat_points+$6 WHERE guild_id=$1 AND user_id=$2', [interaction.guildId, interaction.user.id, reward.coins, newXp, newLevel, gainedStatPoints]);
        await db.query(
          `INSERT INTO inventory(guild_id,user_id,item_key,quantity)
           VALUES($1,$2,$3,1)
           ON CONFLICT(guild_id,user_id,item_key)
           DO UPDATE SET quantity=inventory.quantity+1`,
          [interaction.guildId, interaction.user.id, step.material]
        );
        await db.query('COMMIT');
        const completion = nextStep > 3 ? '\n🏆 **Görev zinciri tamamlandı!** Yarın yeni bir zincir başlayacak.' : '\n➡️ Sıradaki aşama açıldı: **' + steps[nextStep - 1].title + '**.';
        return interaction.editReply('🎉 **' + step.title + '** aşamasını tamamladın! **' + reward.coins + ' altın**, **' + reward.xp + ' XP** ve ⚒️ **' + step.material + ' ×1** kazandın.' + (reward.completionBonus ? '\n🏆 Tam zincir bonusu: +100 altın ve +100 XP (seviye çarpanı uygulanır).' : '') + (gainedStatPoints ? '\n✨ Seviye atladın: +' + gainedStatPoints + ' stat puanı.' : '') + ' Malzemeyi **/zanaat** tariflerinde kullanabilirsin.' + completion);
      } catch (error) { await db.query('ROLLBACK').catch(() => {}); throw error; } finally { db.release(); }
    } catch (error) { console.error('/gorevzinciri hatası:', error); return interaction.editReply('Görev zinciri yüklenemedi. Daha sonra tekrar dene.'); }
  }
};
