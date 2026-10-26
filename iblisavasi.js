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

function battleEmbed({ player, bossHp, playerHp, playerMaxHp = PLAYER_MAX_HP, playerMana = 100, playerMaxMana = 100, attack = 10, defense = 5, bonus, description, won = false, lost = false }) {
  const embed = new EmbedBuilder()
    .setColor(won ? 0x65d6a6 : lost ? 0xe06c75 : 0x9b8cff)
    .setTitle(won ? '🏆 İblis yenildi!' : lost ? '🌑 Büyücü düştü...' : '⚔️ İblis Avı • Kuzey Sınırı')
    .setDescription(description)
    .addFields(
      { name: '🧙 Gezgin', value: `❤️ **${Math.max(0, playerHp)}/${playerMaxHp} HP** · 🔮 **${playerMana}/${playerMaxMana} Mana**\n⚔️ Saldırı: **${attack}** · 🛡️ Savunma: **${defense}**\n✨ Karakter bonusu: +${bonus} hasar`, inline: true },
      { name: '👹 İblis', value: `🩸 **${Math.max(0, bossHp)}/${BOSS_MAX_HP} HP**`, inline: true }
    )
    .setFooter({ text: 'Poğaça Frieren • Kuzey sınırında her büyü önemlidir.' })
    .setTimestamp();
  if (player?.displayAvatarURL) embed.setThumbnail(player.displayAvatarURL());
  return embed;
}

function actionRow(disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('demon_attack').setLabel('Zoltraak · 8 Mana').setEmoji('⚡').setStyle(ButtonStyle.Danger).setDisabled(disabled),
    new ButtonBuilder().setCustomId('demon_fire').setLabel('Alev Küresi · 14').setEmoji('🔥').setStyle(ButtonStyle.Danger).setDisabled(disabled),
    new ButtonBuilder().setCustomId('demon_ice').setLabel('Buz Mızrağı · 12').setEmoji('🧊').setStyle(ButtonStyle.Danger).setDisabled(disabled),
    new ButtonBuilder().setCustomId('demon_defend').setLabel('Kalkan · 6 Mana').setEmoji('🛡️').setStyle(ButtonStyle.Primary).setDisabled(disabled),
    new ButtonBuilder().setCustomId('demon_heal').setLabel('Şifa · 20 Mana').setEmoji('💚').setStyle(ButtonStyle.Success).setDisabled(disabled)
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
    const knownSpellResult = await pool.query(
      'SELECT spell_key FROM learned_spells WHERE guild_id=$1 AND user_id=$2',
      [interaction.guildId, interaction.user.id]
    );
    const learnedSpells = new Set(knownSpellResult.rows.map(row => row.spell_key));

    const statsResult = await pool.query(
      'SELECT hp, max_hp, mana, max_mana, attack, defense FROM users WHERE guild_id=$1 AND user_id=$2',
      [interaction.guildId, interaction.user.id]
    );
    const stats = statsResult.rows[0];
    if (Number(stats.hp) <= 0) {
      return interaction.editReply('🌑 Canın tükenmiş. Yeniden savaşa çıkmadan önce **/dinlen** komutuyla HP ve mananı yenilemelisin.');
    }
    const playerMaxHp = Number(stats.max_hp);
    const playerMaxMana = Number(stats.max_mana);
    const attack = Number(stats.attack);
    const defense = Number(stats.defense);
    let playerHp = Math.min(playerMaxHp, Number(stats.hp));
    let playerMana = Math.min(playerMaxMana, Number(stats.mana));

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
    let shield = false;
    let healUsed = false;
    let busy = false;
    let finished = false;

    const renderBattleEmbed = options => battleEmbed({ ...options, playerMaxHp, playerMana, playerMaxMana, attack, defense });

    const initial = renderBattleEmbed({
      player: interaction.user,
      bossHp,
      playerHp,
      bonus: upgradeBonus,
      description: `Kuzey sınırında tehlikeli bir iblisle karşılaştın, <@${interaction.user.id}>!\n\n**Hamleni seç:** Zoltraak dengeli saldırır; Alev Küresi daha güçlü hasar verir; Buz Mızrağı iblisi dondurup karşı saldırısını durdurabilir. Kalkan hasarı azaltır, Şifa ise savaşta bir kez can yeniler. Her karakter geliştirme seviyesi saldırı gücüne +2 hasar ekler.`
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
        const requiredSpell = {
          demon_attack: 'zoltraak',
          demon_fire: 'alev_kuresi',
          demon_ice: 'buz_mizragi',
          demon_defend: 'koruyucu_bariyer',
          demon_heal: 'sifa_isigi'
        }[button.customId];
        if (requiredSpell && !learnedSpells.has(requiredSpell)) {
          busy = false;
          const spellNames = {
            alev_kuresi: 'Alev Küresi',
            buz_mizragi: 'Buz Mızrağı',
            koruyucu_bariyer: 'Koruyucu Bariyer',
            sifa_isigi: 'Şifa Işığı'
          };
          return button.reply({
            content: `Bu büyüyü henüz öğrenmedin. ${spellNames[requiredSpell] ? `**${spellNames[requiredSpell]}** için /buyuogren komutunu kullan.` : 'Başlangıç büyün hazır.'}`,
            ephemeral: true
          });
        }

        let actionText = '';
        let frozenBoss = false;
        if (button.customId === 'demon_attack') {
          if (playerMana < 8) {
            busy = false;
            return button.reply({ content: 'Zoltraak için en az **8 Mana** gerekiyor. /dinlen ile mananı yenileyebilirsin.', ephemeral: true });
          }
          playerMana -= 8;
          const damage = Math.floor(Math.random() * 13) + 18 + attack + upgradeBonus;
          bossHp = Math.max(0, bossHp - damage);
          actionText = `⚡ Zoltraak isabet etti! İblise **${damage} hasar** verdin. (Saldırı: ${attack}, Mana: −8)`;
        } else if (button.customId === 'demon_fire') {
          if (playerMana < 14) {
            busy = false;
            return button.reply({ content: 'Alev Küresi için en az **14 Mana** gerekiyor.', ephemeral: true });
          }
          playerMana -= 14;
          const damage = Math.floor(Math.random() * 13) + 28 + attack + upgradeBonus;
          bossHp = Math.max(0, bossHp - damage);
          actionText = `🔥 Alev Küresi patladı! İblise **${damage} hasar** verdin. (Mana: −14)`;
        } else if (button.customId === 'demon_ice') {
          if (playerMana < 12) {
            busy = false;
            return button.reply({ content: 'Buz Mızrağı için en az **12 Mana** gerekiyor.', ephemeral: true });
          }
          playerMana -= 12;
          const damage = Math.floor(Math.random() * 11) + 22 + attack + upgradeBonus;
          bossHp = Math.max(0, bossHp - damage);
          frozenBoss = Math.random() < 0.35;
          actionText = `🧊 Buz Mızrağı isabet etti! İblise **${damage} hasar** verdin. (Mana: −12)${frozenBoss ? '\n❄️ İblis dondu ve bu tur karşı saldırı yapamadı!' : ''}`;
        } else if (button.customId === 'demon_defend') {
          if (playerMana < 6) {
            busy = false;
            return button.reply({ content: 'Savunma büyüsü için en az **6 Mana** gerekiyor. /dinlen ile mananı yenileyebilirsin.', ephemeral: true });
          }
          playerMana -= 6;
          shield = true;
          actionText = '🛡️ Koruyucu büyü kurdun. İblisin bir sonraki saldırısı yarı hasar verecek. (Mana: −6)';
        } else if (button.customId === 'demon_heal') {
          if (healUsed) {
            busy = false;
            return button.reply({ content: 'İyileşme büyünü bu savaşta zaten kullandın.', ephemeral: true });
          }
          if (playerMana < 20) {
            busy = false;
            return button.reply({ content: 'İyileşme büyüsü için en az **20 Mana** gerekiyor. /dinlen ile mananı yenileyebilirsin.', ephemeral: true });
          }
          playerMana -= 20;
          const before = playerHp;
          playerHp = Math.min(playerMaxHp, playerHp + Math.floor(Math.random() * 16) + 20);
          healUsed = true;
          actionText = `💚 İyileşme büyüsüyle **${playerHp - before} HP** geri kazandın. (Mana: −20)`;
        }

        if (bossHp <= 0) {
          await pool.query('UPDATE users SET hp=$3, mana=$4 WHERE guild_id=$1 AND user_id=$2', [interaction.guildId, interaction.user.id, playerHp, playerMana]);
          const rewardCoins = 140 + Math.floor(Math.random() * 81);
          const rewardXp = 90 + Math.floor(Math.random() * 41);
          const db = await pool.connect();
          try {
            await db.query('BEGIN');
            await db.query(
              `UPDATE users SET coins=coins+$3, xp=xp+$4,
                stat_points=stat_points+GREATEST(0,(FLOOR(SQRT((xp+$4)::numeric / 100))::int + 1)-level),
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
            embeds: [renderBattleEmbed({
              player: interaction.user, bossHp: 0, playerHp, bonus: upgradeBonus, won: true,
              description: `${actionText}\n\n🌟 **Zafer!** İblisi alt ettin.\nÖdülün: **${rewardCoins} altın**, **${rewardXp} XP** ve **💎 Mana Kristali ×1**.`
            })],
            components: []
          });
        }

        const rawBossDamage = Math.floor(Math.random() * 12) + 12;
        let bossDamage = Math.max(1, rawBossDamage - Math.floor(defense / 2));
        if (frozenBoss) bossDamage = 0;
        if (shield && bossDamage > 0) {
          bossDamage = Math.ceil(bossDamage / 2);
          shield = false;
          actionText += '\n🛡️ Kalkanın iblisin saldırısını zayıflattı.';
        }
        playerHp = Math.max(0, playerHp - bossDamage);
        actionText += bossDamage > 0
          ? `\n👹 İblis karşılık verdi: **${bossDamage} hasar** aldın.`
          : '\n❄️ Donduğu için iblis bu tur saldıramadı.';

        if (playerHp <= 0) {
          await pool.query('UPDATE users SET hp=$3, mana=$4 WHERE guild_id=$1 AND user_id=$2', [interaction.guildId, interaction.user.id, playerHp, playerMana]);
          finished = true;
          collector.stop('defeat');
          return button.update({
            embeds: [renderBattleEmbed({
              player: interaction.user, bossHp, playerHp: 0, bonus: upgradeBonus, lost: true,
              description: `${actionText}\n\n🌑 Bu kez geri çekilmek zorunda kaldın. Ödül kazanamadın; yarım saat dinlenip yeniden deneyebilirsin.`
            })],
            components: []
          });
        }

        await pool.query('UPDATE users SET hp=$3, mana=$4 WHERE guild_id=$1 AND user_id=$2', [interaction.guildId, interaction.user.id, playerHp, playerMana]);
        await button.update({
          embeds: [renderBattleEmbed({ player: interaction.user, bossHp, playerHp, bonus: upgradeBonus, description: actionText })],
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
        embeds: [renderBattleEmbed({
          player: interaction.user, bossHp, playerHp, bonus: upgradeBonus, lost: true,
          description: '⏳ Savaşın süresi doldu. İblis karanlığa karıştı; yeniden denemek için bekleme süresinin bitmesini bekle.'
        })],
        components: []
      }).catch(() => {});
    });
  }
};
