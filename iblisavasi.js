import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType
} from 'discord.js';
import { pool, ensureUser } from './database/db.js';

const BOSS_MAX_HP = 160;
const PLAYER_MAX_HP = 100;
const COOLDOWN_MS = 30 * 60 * 1000;

function battleEmbed({ player, bossHp, playerHp, bonus, description, won = false, lost = false }) {
  const embed = new EmbedBuilder()
    .setColor(won ? 0x65d6a6 : lost ? 0xe06c75 : 0x9b8cff)
    .setTitle(won ? '🏆 İblis yenildi!' : lost ? '🌑 Büyücü düştü...' : '⚔️ İblis Avı • Kuzey Sınırı')
    .setDescription(description)
    .addFields(
      { name: '🧙 Gezgin', value: `❤️ **${Math.max(0, playerHp)}/${PLAYER_MAX_HP} HP**\n✨ Geliştirme bonusu: +${bonus} hasar`, inline: true },
      { name: '👹 İblis', value: `🩸 **${Math.max(0, bossHp)}/${BOSS_MAX_HP} HP**`, inline: true }
    )
    .setFooter({ text: 'Poğaça Frieren • Kuzey sınırında her büyü önemlidir.' })
    .setTimestamp();
  if (player?.displayAvatarURL) embed.setThumbnail(player.displayAvatarURL());
  return embed;
}

function actionRow(disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('demon_attack').setLabel('Zoltraak').setEmoji('⚡').setStyle(ButtonStyle.Danger).setDisabled(disabled),
    new ButtonBuilder().setCustomId('demon_defend').setLabel('Savunma büyüsü').setEmoji('🛡️').setStyle(ButtonStyle.Primary).setDisabled(disabled),
    new ButtonBuilder().setCustomId('demon_heal').setLabel('İyileş').setEmoji('💚').setStyle(ButtonStyle.Success).setDisabled(disabled)
  );
}

export default {
  data: new SlashCommandBuilder()
    .setName('iblisavasi')
    .setDescription('Frieren evreninde bir iblis boss ile savaş ve ödül kazan.'),

  async execute(interaction) {
    if (!interaction.guildId) {
      return interaction.reply({ content: 'İblis avı yalnızca sunucularda yapılabilir.', ephemeral: true });
    }

    await interaction.deferReply();
    await ensureUser(interaction.guildId, interaction.user.id);

    const claimed = await pool.query(
      `UPDATE users SET last_boss_at = NOW()
       WHERE guild_id=$1 AND user_id=$2
         AND (last_boss_at IS NULL OR last_boss_at <= NOW() - INTERVAL '30 minutes')
       RETURNING last_boss_at`,
      [interaction.guildId, interaction.user.id]
    );

    if (!claimed.rowCount) {
      const status = await pool.query('SELECT last_boss_at FROM users WHERE guild_id=$1 AND user_id=$2', [interaction.guildId, interaction.user.id]);
      const next = new Date(status.rows[0].last_boss_at).getTime() + COOLDOWN_MS;
      return interaction.editReply(`⏳ Mana gücünü toparlamalısın. Yeni iblis avına <t:${Math.ceil(next / 1000)}:R> çıkabilirsin.`);
    }

    const upgrades = await pool.query(
      'SELECT COALESCE(MAX(upgrade_level),0)::int AS level FROM character_upgrades WHERE guild_id=$1 AND user_id=$2',
      [interaction.guildId, interaction.user.id]
    );
    const upgradeBonus = Number(upgrades.rows[0]?.level || 0) * 2;
    let bossHp = BOSS_MAX_HP;
    let playerHp = PLAYER_MAX_HP;
    let shield = false;
    let healUsed = false;
    let busy = false;
    let finished = false;

    const initial = battleEmbed({
      player: interaction.user,
      bossHp,
      playerHp,
      bonus: upgradeBonus,
      description: `Kuzey sınırında tehlikeli bir iblisle karşılaştın, <@${interaction.user.id}>!\n\n**Hamleni seç:** Zoltraak ile saldır, savunma büyüsüyle hasarı azalt veya savaş boyunca bir kez iyileş. Her karakter geliştirme seviyesi saldırı gücüne +2 hasar ekler.`
    });
    await interaction.editReply({ embeds: [initial], components: [actionRow()] });
    const message = await interaction.fetchReply();
    const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, time: 5 * 60 * 1000 });

    collector.on('collect', async button => {
      if (button.user.id !== interaction.user.id) {
        return button.reply({ content: 'Bu iblis avı yalnızca komutu başlatan gezgine ait.', ephemeral: true });
      }
      if (finished || busy) return button.deferUpdate().catch(() => {});
      busy = true;

      try {
        let actionText = '';
        if (button.customId === 'demon_attack') {
          const damage = Math.floor(Math.random() * 13) + 18 + upgradeBonus;
          bossHp = Math.max(0, bossHp - damage);
          actionText = `⚡ Zoltraak isabet etti! İblise **${damage} hasar** verdin.`;
        } else if (button.customId === 'demon_defend') {
          shield = true;
          actionText = '🛡️ Koruyucu büyü kurdun. İblisin bir sonraki saldırısı yarı hasar verecek.';
        } else if (button.customId === 'demon_heal') {
          if (healUsed) {
            busy = false;
            return button.reply({ content: 'İyileşme büyünü bu savaşta zaten kullandın.', ephemeral: true });
          }
          const before = playerHp;
          playerHp = Math.min(PLAYER_MAX_HP, playerHp + Math.floor(Math.random() * 16) + 20);
          healUsed = true;
          actionText = `💚 İyileşme büyüsüyle **${playerHp - before} HP** geri kazandın.`;
        }

        if (bossHp <= 0) {
          const rewardCoins = 140 + Math.floor(Math.random() * 81);
          const rewardXp = 90 + Math.floor(Math.random() * 41);
          const db = await pool.connect();
          try {
            await db.query('BEGIN');
            await db.query(
              `UPDATE users SET coins=coins+$3, xp=xp+$4,
                level=FLOOR(SQRT((xp+$4)::numeric / 100))::int + 1
               WHERE guild_id=$1 AND user_id=$2`,
              [interaction.guildId, interaction.user.id, rewardCoins, rewardXp]
            );
            await db.query(
              `INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,'💎 Mana Kristali',1)
               ON CONFLICT(guild_id,user_id,item_key) DO UPDATE SET quantity=inventory.quantity+1`,
              [interaction.guildId, interaction.user.id]
            );
            await db.query('COMMIT');
          } catch (error) {
            await db.query('ROLLBACK').catch(() => {});
            throw error;
          } finally {
            db.release();
          }

          finished = true;
          collector.stop('victory');
          return button.update({
            embeds: [battleEmbed({
              player: interaction.user, bossHp: 0, playerHp, bonus: upgradeBonus, won: true,
              description: `${actionText}\n\n🌟 **Zafer!** İblisi alt ettin.\nÖdülün: **${rewardCoins} altın**, **${rewardXp} XP** ve **💎 Mana Kristali ×1**.`
            })],
            components: []
          });
        }

        let bossDamage = Math.floor(Math.random() * 12) + 12;
        if (shield) {
          bossDamage = Math.ceil(bossDamage / 2);
          shield = false;
          actionText += '\n🛡️ Kalkanın iblisin saldırısını zayıflattı.';
        }
        playerHp = Math.max(0, playerHp - bossDamage);
        actionText += `\n👹 İblis karşılık verdi: **${bossDamage} hasar** aldın.`;

        if (playerHp <= 0) {
          finished = true;
          collector.stop('defeat');
          return button.update({
            embeds: [battleEmbed({
              player: interaction.user, bossHp, playerHp: 0, bonus: upgradeBonus, lost: true,
              description: `${actionText}\n\n🌑 Bu kez geri çekilmek zorunda kaldın. Ödül kazanamadın; yarım saat dinlenip yeniden deneyebilirsin.`
            })],
            components: []
          });
        }

        await button.update({
          embeds: [battleEmbed({ player: interaction.user, bossHp, playerHp, bonus: upgradeBonus, description: actionText })],
          components: [actionRow()]
        });
      } catch (error) {
        console.error('/iblisavasi hatası:', error);
        if (!button.replied && !button.deferred) await button.reply({ content: 'Savaş sırasında bir hata oluştu. Lütfen daha sonra tekrar dene.', ephemeral: true }).catch(() => {});
      } finally {
        busy = false;
      }
    });

    collector.on('end', async (_, reason) => {
      if (finished || reason === 'victory' || reason === 'defeat') return;
      finished = true;
      await interaction.editReply({
        embeds: [battleEmbed({
          player: interaction.user, bossHp, playerHp, bonus: upgradeBonus, lost: true,
          description: '⏳ Savaşın süresi doldu. İblis karanlığa karıştı; yeniden denemek için bekleme süresinin bitmesini bekle.'
        })],
        components: []
      }).catch(() => {});
    });
  }
};
