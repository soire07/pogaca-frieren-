import { ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { pool, ensureUser } from './database/db.js';
import { equipmentItems, equipmentBonus } from './equipment-data.js';
import { levelForXp } from './utils.js';

const COOLDOWN_MINUTES = 30;
const COOLDOWN_MS = COOLDOWN_MINUTES * 60_000;

function dungeonForLevel(level) {
  if (level >= 30) return { name: '🌑 Kuzeyin Mühürlü Mahzeni', hp: 620, damage: 28, xp: 150, coins: 180, level: 30, lootChance: 0.22, loot: 'Kuzey Mührü' };
  if (level >= 15) return { name: '🗿 Kadim Harabe Zindanı', hp: 420, damage: 20, xp: 110, coins: 130, level: 15, lootChance: 0.18, loot: 'Kadim Rün Parçası' };
  if (level >= 5) return { name: '🌲 Büyük Orman Zindanı', hp: 260, damage: 13, xp: 75, coins: 90, level: 5, lootChance: 0.14, loot: 'Orman Kristali' };
  return { name: '🌾 Merkez Topraklar Mahzeni', hp: 160, damage: 8, xp: 45, coins: 55, level: 1, lootChance: 0.10, loot: 'Eski Mahzen Anahtarı' };
}

export default {
  data: new SlashCommandBuilder()
    .setName('zindan')
    .setDescription('Bir oyuncuyu davet ederek Frieren evreninin zindanına birlikte gir.')
    .addUserOption(option =>
      option.setName('takim_arkadasi')
        .setDescription('Zindana davet edeceğin oyuncu')
        .setRequired(true)
    ),

  async execute(interaction) {
    if (!interaction.guildId) {
      return interaction.reply({ content: 'Zindan yalnızca sunucularda kullanılabilir.', ephemeral: true });
    }

    const teammate = interaction.options.getUser('takim_arkadasi', true);
    if (teammate.bot || teammate.id === interaction.user.id) {
      return interaction.reply({ content: 'Zindana girmek için kendin dışında gerçek bir oyuncu seçmelisin.', ephemeral: true });
    }

    await ensureUser(interaction.guildId, interaction.user.id);
    await ensureUser(interaction.guildId, teammate.id);

    const acceptId = 'dungeon_accept:' + interaction.id;
    const declineId = 'dungeon_decline:' + interaction.id;
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(acceptId).setLabel('Zindana Katıl').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(declineId).setLabel('Reddet').setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({
      content: `🧭 <@${teammate.id}>, <@${interaction.user.id}> seni birlikte zindana girmeye davet ediyor. Kabul etmek için 60 saniyen var.`,
      components: [row],
      allowedMentions: { users: [teammate.id, interaction.user.id] }
    });

    let response;
    try {
      response = await interaction.channel.awaitMessageComponent({
        filter: component => component.user.id === teammate.id && [acceptId, declineId].includes(component.customId),
        time: 60_000
      });
    } catch {
      return interaction.editReply({ content: '⌛ Zindan davetinin süresi doldu. İstersen yeniden davet gönderebilirsin.', components: [] });
    }

    if (response.customId === declineId) {
      await response.update({ content: `❌ <@${teammate.id}> zindan davetini reddetti.`, components: [] });
      return;
    }

    await response.update({ content: '⚔️ İki maceracı zindana giriyor... savaş sonucu hazırlanıyor.', components: [] });

    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      const playerIds = [interaction.user.id, teammate.id].sort();
      const result = await db.query(
        `SELECT user_id, level, xp, coins, hp, max_hp, mana, max_mana, attack, defense, last_dungeon_at
         FROM users WHERE guild_id=$1 AND user_id = ANY($2::text[]) FOR UPDATE`,
        [interaction.guildId, playerIds]
      );

      if (result.rowCount !== 2) {
        await db.query('ROLLBACK');
        return interaction.editReply({ content: 'Takım oyuncularının verileri alınamadı. Biraz sonra tekrar deneyin.', components: [] });
      }

      const byId = new Map(result.rows.map(player => [player.user_id, player]));
      const players = [byId.get(interaction.user.id), byId.get(teammate.id)];
      const now = Date.now();
      const cooldownPlayer = players.find(player =>
        player.last_dungeon_at && now - new Date(player.last_dungeon_at).getTime() < COOLDOWN_MS
      );
      if (cooldownPlayer) {
        const remaining = Math.ceil((COOLDOWN_MS - (now - new Date(cooldownPlayer.last_dungeon_at).getTime())) / 60_000);
        await db.query('ROLLBACK');
        return interaction.editReply({
          content: `⏳ Takımdaki bir oyuncunun zindan bekleme süresi devam ediyor. Yaklaşık **${remaining} dakika** sonra tekrar deneyin.`,
          components: []
        });
      }

      const equipmentResult = await db.query(
        'SELECT user_id, item_key FROM user_equipment WHERE guild_id=$1 AND user_id = ANY($2::text[])',
        [interaction.guildId, playerIds]
      );
      const gearByUser = new Map(players.map(player => [player.user_id, []]));
      for (const row of equipmentResult.rows) {
        const item = equipmentItems.find(entry => entry.name === row.item_key);
        if (item) gearByUser.get(row.user_id).push(item);
      }

      const combatants = players.map(player => {
        const gear = equipmentBonus(gearByUser.get(player.user_id) || []);
        return {
          ...player,
          level: Number(player.level),
          hp: Math.min(Number(player.hp), Math.min(2000, Number(player.max_hp) + gear.hp)),
          maxHp: Math.min(2000, Number(player.max_hp) + gear.hp),
          attack: Math.min(500, Number(player.attack) + gear.attack),
          defense: Math.min(250, Number(player.defense) + gear.defense)
        };
      });

      if (combatants.some(player => player.hp <= 0)) {
        await db.query('ROLLBACK');
        return interaction.editReply({ content: '❤️ Takımdaki herkesin HP değeri sıfırdan yüksek olmalı. Önce **/dinlen** kullanın.', components: [] });
      }

      const averageLevel = Math.floor(combatants.reduce((sum, player) => sum + player.level, 0) / combatants.length);
      const dungeon = dungeonForLevel(averageLevel);
      let dungeonHp = dungeon.hp;
      let turn = 0;
      const log = [];
      const hpNow = combatants.map(player => player.hp);

      while (dungeonHp > 0 && hpNow.some(hp => hp > 0) && turn < 12) {
        turn++;
        for (let i = 0; i < combatants.length && dungeonHp > 0; i++) {
          const player = combatants[i];
          if (hpNow[i] <= 0) continue;
          const damage = Math.max(1, Math.round(player.attack * (0.85 + ((player.level + turn + i) % 4) * 0.1)));
          dungeonHp = Math.max(0, dungeonHp - damage);
          if (turn === 1 || dungeonHp === 0 || turn % 3 === 0) {
            log.push(`⚔️ <@${player.user_id}> ${damage} hasar verdi. Zindan düşmanı: **${dungeonHp}/${dungeon.hp} HP**`);
          }
          if (dungeonHp <= 0) break;
        }
        if (dungeonHp > 0) {
          for (let i = 0; i < combatants.length; i++) {
            if (hpNow[i] <= 0) continue;
            const player = combatants[i];
            const variance = 0.85 + ((player.level + turn + i) % 5) * 0.08;
            const incoming = Math.max(2, Math.round(dungeon.damage * variance - player.defense * 0.35));
            hpNow[i] = Math.max(0, hpNow[i] - incoming);
          }
        }
      }

      const win = dungeonHp <= 0;
      const xpReward = win ? dungeon.xp : Math.floor(dungeon.xp * 0.3);
      const coinReward = win ? dungeon.coins : Math.floor(dungeon.coins * 0.25);
      const lootFound = win && Math.random() < dungeon.lootChance;
      const lootItem = lootFound ? dungeon.loot : null;

      for (let i = 0; i < combatants.length; i++) {
        const player = combatants[i];
        const newXp = Number(player.xp) + xpReward;
        const newLevel = levelForXp(newXp);
        const gainedPoints = Math.max(0, newLevel - Number(player.level));
        await db.query(
          `UPDATE users SET
            hp=$3,
            xp=$4,
            level=$5,
            coins=coins+$6,
            stat_points=stat_points+$7,
            dungeon_wins=dungeon_wins+$8,
            dungeon_runs=dungeon_runs+1,
            last_dungeon_at=NOW()
           WHERE guild_id=$1 AND user_id=$2`,
          [interaction.guildId, player.user_id, hpNow[i], newXp, newLevel, coinReward, gainedPoints, win ? 1 : 0]
        );
        if (lootItem) {
          await db.query(
            `INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,$3,1)
             ON CONFLICT(guild_id,user_id,item_key) DO UPDATE SET quantity=inventory.quantity+1`,
            [interaction.guildId, player.user_id, lootItem]
          );
        }
      }

      await db.query('COMMIT');
      const embed = new EmbedBuilder()
        .setColor(win ? 0x55c58a : 0xb86b7d)
        .setTitle(win ? '🏆 Zindan Tamamlandı!' : '🛡️ Zindandan Güçlükle Çıkış')
        .setDescription(
          `**${dungeon.name}**\n` +
          `Tur sayısı: **${turn}** · Kalan düşman HP: **${dungeonHp}/${dungeon.hp}**\n\n` +
          combatants.map((player, i) =>
            `**<@${player.user_id}>** · Seviye ${player.level}${levelForXp(Number(player.xp) + xpReward) > player.level ? ` → ${levelForXp(Number(player.xp) + xpReward)} ✨` : ''}\n❤️ HP: ${player.hp} → ${hpNow[i]} · ⚔️ Saldırı: ${player.attack} · 🛡️ Savunma: ${player.defense}`
          ).join('\n\n') +
          (log.length ? '\n\n**⚔️ Savaş günlüğü**\n' + log.slice(-6).join('\n') : '')
        )
        .addFields(
          { name: '🎁 Kişi başı ödül', value: `✨ ${xpReward} XP\n🥐 ${coinReward} altın`, inline: true },
          { name: '💎 Nadir ganimet', value: lootItem ? `Her oyuncuya **${lootItem}** verildi!` : win ? `Ganimet ihtimali: %${Math.round(dungeon.lootChance * 100)} — bu kez düşmedi.` : 'Zindan tamamlanamadı; ganimet bulunamadı.', inline: true },
          { name: '⏳ Sonraki zindan', value: `${COOLDOWN_MINUTES} dakika sonra`, inline: true }
        )
        .setFooter({ text: win ? 'Poğaça Frieren • Birlikteyken daha güçlüsünüz.' : 'Poğaça Frieren • Güçlen, hazırlan ve yeniden dene.' });

      return interaction.editReply({ content: null, embeds: [embed], components: [] });
    } catch (error) {
      await db.query('ROLLBACK').catch(() => {});
      console.error('/zindan hatası:', error);
      return interaction.editReply({ content: 'Zindan sırasında bir hata oluştu. Daha sonra tekrar dene.', components: [] }).catch(() => {});
    } finally {
      db.release();
    }
  }
};
