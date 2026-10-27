
import { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { pool, ensureUser } from './database/db.js';
import { levelForXp } from './utils.js';
import { ADVENTURE_DISCOVERIES, ADVENTURE_DISCOVERY_REWARD, COMPLETE_ADVENTURE_JOURNAL_REWARD } from './adventure-data.js';

const outcomes = [
  { text: 'Ormanda kayıp bir büyü kitabı buldun!', coins: 25, xp: 25, item: '📖 Yasak Büyü Kitabı', discovery: 'forest-grimoire' },
  { text: 'Bir Mimic seni kovaladı ama kaçmayı başardın.', coins: 10, xp: 20, item: null, discovery: 'mimic-trail' },
  { text: 'Yol kenarında bir fırın buldun. Fırıncı sana ödül verdi!', coins: 40, xp: 15, item: '🥐 Büyülü Poğaça Kutusu', discovery: 'wandering-bakery' },
  { text: 'Eski bir harabede gizli bir oda keşfettin.', coins: 30, xp: 40, item: '💎 Mana Kristali', discovery: 'ruined-chamber' }
];

const rareOutcomes = [
  { text: 'Sislerin ardında gizlenmiş kadim bir elf sığınağı buldun!', coins: 80, xp: 90, item: '🌙 Efsunlu Elf Yadigârı', discovery: 'ancient-elf-sanctuary' },
  { text: 'Frieren’in unutulmuş notlarının saklandığı gizli bir arşive ulaştın!', coins: 70, xp: 60, item: '📜 Frieren’in Kayıp Notları', discovery: 'forgotten-grimoire' },
  { text: 'Bir ejderhanın eski yuvasını keşfettin ve geride kalan pulları topladın!', coins: 100, xp: 100, item: '🐉 Ejderha Pulu', discovery: 'dragon-nest' }
];

export default {
  data: new SlashCommandBuilder()
    .setName('macera')
    .setDescription('Maceraya çık; istersen keşif rotanı kendin seç.')
    .addStringOption(option => option.setName('rota').setDescription('İstersen belirli bir yeri hedefle; boş bırakınca rastgele rota seçilir.')
      .setRequired(false).addChoices(
        { name: '🌲 Kuzey Ormanı', value: 'forest-grimoire' },
        { name: '👣 Mimic İzleri', value: 'mimic-trail' },
        { name: '🥐 Yol Kenarı Fırını', value: 'wandering-bakery' },
        { name: '🏛️ Kadim Harabe', value: 'ruined-chamber' }
      )),

  async execute(interaction) {
    if (!interaction.guildId) {
      return interaction.reply({ content: 'Bu komut yalnızca sunucularda kullanılabilir.', ephemeral: true });
    }
    await ensureUser(interaction.guildId, interaction.user.id);

    const chosenRoute = interaction.options.getString('rota');
    const outcome = chosenRoute
      ? outcomes.find(entry => entry.discovery === chosenRoute)
      : Math.random() < 0.05
        ? rareOutcomes[Math.floor(Math.random() * rareOutcomes.length)]
        : outcomes[Math.floor(Math.random() * outcomes.length)];
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const { rows: [u] } = await client.query(
        'SELECT coins, xp, last_adventure_at FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE',
        [interaction.guildId, interaction.user.id]
      );

      if (u.last_adventure_at && Date.now() - new Date(u.last_adventure_at).getTime() < 600_000) {
        await client.query('ROLLBACK');
        return interaction.reply({
          content: '⏳ Yeni maceraya çıkmadan önce 10 dakika beklemelisin.',
          ephemeral: true
        });
      }

      const discoveryMeta = ADVENTURE_DISCOVERIES.find(entry => entry.key === outcome.discovery);
      const foundFragment = Math.random() < 0.20;
      let fragmentCount = 0;
      let treasureOpened = false;
      let treasureCount = 0;
      if (foundFragment) {
        await client.query(
          'INSERT INTO adventure_treasure_progress(guild_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
          [interaction.guildId, interaction.user.id]
        );
        const { rows: [treasure] } = await client.query(
          'SELECT fragments, treasures_opened FROM adventure_treasure_progress WHERE guild_id=$1 AND user_id=$2 FOR UPDATE',
          [interaction.guildId, interaction.user.id]
        );
        fragmentCount = Number(treasure.fragments) + 1;
        treasureCount = Number(treasure.treasures_opened);
        if (fragmentCount >= 5) {
          fragmentCount = 0;
          treasureOpened = true;
          treasureCount += 1;
        }
        await client.query(
          'UPDATE adventure_treasure_progress SET fragments=$3, treasures_opened=$4, updated_at=NOW() WHERE guild_id=$1 AND user_id=$2',
          [interaction.guildId, interaction.user.id, fragmentCount, treasureCount]
        );
        await client.query(
          `INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,'🧩 Kadim Harita Parçası',1)
           ON CONFLICT(guild_id,user_id,item_key) DO UPDATE SET quantity=inventory.quantity+1`,
          [interaction.guildId, interaction.user.id]
        );
        if (treasureOpened) {
          await client.query(
            `INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,'🗝️ Kadim Hazine Sandığı',1)
             ON CONFLICT(guild_id,user_id,item_key) DO UPDATE SET quantity=inventory.quantity+1`,
            [interaction.guildId, interaction.user.id]
          );
        }
      }
      const treasureReward = treasureOpened ? { coins: 100, xp: 80 } : { coins: 0, xp: 0 };

      const { rows: [streakRow] } = await client.query(
        `WITH previous AS (
           SELECT last_visit_date FROM adventure_streaks WHERE guild_id=$1 AND user_id=$2
         ), updated AS (
           INSERT INTO adventure_streaks(guild_id,user_id,daily_streak,last_visit_date)
           VALUES($1,$2,1,CURRENT_DATE)
           ON CONFLICT(guild_id,user_id) DO UPDATE SET
             daily_streak=CASE
               WHEN adventure_streaks.last_visit_date=CURRENT_DATE THEN adventure_streaks.daily_streak
               WHEN adventure_streaks.last_visit_date=CURRENT_DATE-1 THEN adventure_streaks.daily_streak+1
               ELSE 1
             END,
             last_visit_date=CURRENT_DATE,
             updated_at=NOW()
           RETURNING daily_streak
         )
         SELECT updated.daily_streak,
                COALESCE((SELECT last_visit_date FROM previous), CURRENT_DATE-2) IS DISTINCT FROM CURRENT_DATE AS new_day
         FROM updated`,
        [interaction.guildId, interaction.user.id]
      );
      const dailyStreak = Number(streakRow.daily_streak);
      const streakReward = streakRow.new_day && dailyStreak > 0 && dailyStreak % 3 === 0
        ? { coins: 50, xp: 30 }
        : { coins: 0, xp: 0 };

      const { rows: [masteryRow] } = await client.query(
        `INSERT INTO adventure_route_mastery(guild_id,user_id,route_key,visits)
         VALUES($1,$2,$3,1)
         ON CONFLICT(guild_id,user_id,route_key)
         DO UPDATE SET visits=adventure_route_mastery.visits+1, updated_at=NOW()
         RETURNING visits`,
        [interaction.guildId, interaction.user.id, outcome.discovery]
      );
      const routeVisits = Number(masteryRow.visits);
      const routeMasteryLevel = Math.floor(routeVisits / 3);
      const routeMasteryReward = routeVisits % 3 === 0 ? { coins: 30, xp: 20 } : { coins: 0, xp: 0 };

      const { rows: [newDiscovery] } = await client.query(
        'INSERT INTO adventure_discoveries(guild_id,user_id,discovery_key) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING discovery_key',
        [interaction.guildId, interaction.user.id, outcome.discovery]
      );
      const firstDiscovery = Boolean(newDiscovery);
      const discoveryCoins = firstDiscovery ? ADVENTURE_DISCOVERY_REWARD.coins : 0;
      const discoveryXp = firstDiscovery ? ADVENTURE_DISCOVERY_REWARD.xp : 0;
      let journalCompletionCoins = 0;
      let journalCompletedNow = false;
      const { rows: [discoveryCount] } = await client.query(
        'SELECT COUNT(*)::int AS count FROM adventure_discoveries WHERE guild_id=$1 AND user_id=$2',
        [interaction.guildId, interaction.user.id]
      );
      if (Number(discoveryCount.count) >= ADVENTURE_DISCOVERIES.length) {
        const { rows: [claim] } = await client.query(
          'INSERT INTO adventure_journal_claims(guild_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING user_id',
          [interaction.guildId, interaction.user.id]
        );
        if (claim) {
          journalCompletionCoins = COMPLETE_ADVENTURE_JOURNAL_REWARD.coins;
          journalCompletedNow = true;
        }
      }

      const newXp = Number(u.xp) + outcome.xp + discoveryXp + routeMasteryReward.xp + streakReward.xp + treasureReward.xp;
      const newLevel = levelForXp(newXp);
      const totalCoins = outcome.coins + discoveryCoins + journalCompletionCoins + routeMasteryReward.coins + streakReward.coins + treasureReward.coins;

      await client.query(
        'UPDATE users SET coins=coins+$3, xp=$4, stat_points=stat_points+GREATEST(0,$5-level), level=$5, last_adventure_at=NOW() WHERE guild_id=$1 AND user_id=$2',
        [interaction.guildId, interaction.user.id, totalCoins, newXp, newLevel]
      );

      if (outcome.item) {
        await client.query(
          `INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,$3,1)
           ON CONFLICT(guild_id,user_id,item_key)
           DO UPDATE SET quantity=inventory.quantity+1`,
          [interaction.guildId, interaction.user.id, outcome.item]
        );
      }

      await client.query('COMMIT');

      const itemText = outcome.item
        ? `\nBulduğun eşya: **${outcome.item}**`
        : '';

      const gif = new AttachmentBuilder('./macera.gif');

      const embed = new EmbedBuilder()
        .setColor(0x9b8cff)
        .setTitle('🗺️ Macera Tamamlandı')
        .setDescription(
          `${outcome.text}\n\nÖdül: **${outcome.coins + discoveryCoins + journalCompletionCoins + routeMasteryReward.coins + streakReward.coins + treasureReward.coins}** altın ve **${outcome.xp + discoveryXp + routeMasteryReward.xp + streakReward.xp + treasureReward.xp} XP**${foundFragment ? `\n🧩 Kadim harita parçası buldun! Parça ilerlemesi: **${fragmentCount}/5**.${treasureOpened ? `\n🗝️ **Hazine haritasını tamamladın!** +${treasureReward.coins} altın, +${treasureReward.xp} XP ve envanterine bir Kadim Hazine Sandığı eklendi.` : ''}` : ''}${streakReward.coins ? `\n🔥 **${dailyStreak} günlük macera serisi!** Seri ödülü: +${streakReward.coins} altın, +${streakReward.xp} XP.` : ''}\n📅 Günlük seri: **${dailyStreak} gün**${routeMasteryReward.coins ? `\n🌟 Rota ustalığı: **3 ziyaretlik eşik** tamamlandı (+${routeMasteryReward.coins} altın, +${routeMasteryReward.xp} XP).` : ''}\n🧭 Bu rotayı **${routeVisits}** kez gezdin · Ustalık seviyesi: **${routeMasteryLevel}**${itemText}\n\n${firstDiscovery ? `🧭 Yeni keşif: **${discoveryMeta?.name}** (+${discoveryCoins} altın, +${discoveryXp} XP)` : `📔 Bu keşfi daha önce kaydetmiştin: **${discoveryMeta?.name}**`}${journalCompletedNow ? `\n\n🏆 **Keşif defterini tamamladın! +${journalCompletionCoins} altın tamamlanma ödülü kazandın.**` : ''}`
        )
        .addFields({
          name: 'Yeni seviye',
          value: String(newLevel),
          inline: true
        })
        .setImage('attachment://macera.gif')
        .setFooter({ text: 'Poğaça Frieren • Macera Günlüğü' });

      await interaction.reply({
        embeds: [embed],
        files: [gif]
      });
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
};
