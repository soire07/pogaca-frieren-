import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { pool, ensureUser } from './database/db.js';
import { equipmentItems, equipmentBonus } from './equipment-data.js';

const COOLDOWN_MINUTES = 30;

export default {
  data: new SlashCommandBuilder()
    .setName('zindan')
    .setDescription('Bir oyuncuyla birlikte Frieren evreninin zindanına gir.')
    .addUserOption(option =>
      option.setName('takim_arkadasi')
        .setDescription('Zindana seninle birlikte girecek oyuncu')
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
        return interaction.reply({ content: 'Takım oyuncularının verileri alınamadı. Biraz sonra tekrar dene.', ephemeral: true });
      }
      const byId = new Map(result.rows.map(row => [row.user_id, row]));
      const players = [byId.get(interaction.user.id), byId.get(teammate.id)];

      const cooldownPlayer = players.find(player =>
        player.last_dungeon_at && Date.now() - new Date(player.last_dungeon_at).getTime() < COOLDOWN_MINUTES * 60_000
      );
      if (cooldownPlayer) {
        const remaining = Math.ceil((COOLDOWN_MINUTES * 60_000 - (Date.now() - new Date(cooldownPlayer.last_dungeon_at).getTime())) / 60_000);
        await db.query('ROLLBACK');
        return interaction.reply({
          content: `⏳ Takım oyuncularından biri zindana yakın zamanda girdi. Yeniden denemek için yaklaşık **${remaining} dakika** bekleyin.`,
          ephemeral: true
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
          hp: Number(player.hp),
          maxHp: Math.min(2000, Number(player.max_hp) + gear.hp),
          attack: Math.min(500, Number(player.attack) + gear.attack),
          defense: Math.min(250, Number(player.defense) + gear.defense),
          gear
        };
      });

      if (combatants.some(player => player.hp <= 0)) {
        await db.query('ROLLBACK');
        return interaction.reply({ content: '❤️ Takımdaki herkesin HP değeri sıfırdan yüksek olmalı. Önce **/dinlen** kullanın.', ephemeral: true });
      }

      const averageLevel = Math.floor(combatants.reduce((sum, player) => sum + player.level, 0) / 2);
      const dungeon = averageLevel >= 30
        ? { name: '🌑 Kuzeyin Mühürlü Mahzeni', hp: 620, damage: 28, xp: 150, coins: 180, level: 30 }
        : averageLevel >= 15
          ? { name: '🗿 Kadim Harabe Zindanı', hp: 420, damage: 20, xp: 110, coins: 130, level: 15 }
          : averageLevel >= 5
            ? { name: '🌲 Büyük Orman Zindanı', hp: 260, damage: 13, xp: 75, coins: 90, level: 5 }
            : { name: '🌾 Merkez Topraklar Mahzeni', hp: 160, damage: 8, xp: 45, coins: 55, level: 1 };

      const teamPower = combatants.reduce((sum, player) => sum + player.attack * 3 + player.defense * 1.5 + player.level * 2, 0);
      const win = teamPower >= dungeon.hp * 0.34;
      const losses = combatants.map((player, index) => {
        const variance = 0.85 + ((player.level + index * 3) % 5) * 0.08;
        const damage = Math.max(3, Math.round(dungeon.damage * variance - player.defense * 0.35));
        return Math.max(0, player.hp - damage);
      });
      const totalXp = win ? dungeon.xp : Math.floor(dungeon.xp * 0.3);
      const totalCoins = win ? dungeon.coins : Math.floor(dungeon.coins * 0.25);

      for (let i = 0; i < combatants.length; i++) {
        const player = combatants[i];
        await db.query(
          `UPDATE users SET
            hp=$3,
            xp=xp+$4,
            level=FLOOR(SQRT((xp+$4)::numeric/100))::int+1,
            coins=coins+$5,
            last_dungeon_at=NOW()
           WHERE guild_id=$1 AND user_id=$2`,
          [interaction.guildId, player.user_id, losses[i], totalXp, totalCoins]
        );
      }

      await db.query('COMMIT');
      const resultEmbed = new EmbedBuilder()
        .setColor(win ? 0x55c58a : 0xb86b7d)
        .setTitle(win ? '🏆 Zindan Tamamlandı!' : '🛡️ Zindandan Güçlükle Çıkış')
        .setDescription(
          `**${dungeon.name}**\n` +
          `İki maceracı omuz omuza savaştı. Takım gücü: **${Math.round(teamPower)}** · Zindan dayanıklılığı: **${dungeon.hp}**\n\n` +
          combatants.map((player, i) =>
            `**<@${player.user_id}>** · Seviye ${player.level}\n❤️ HP: ${player.hp} → ${losses[i]} · ⚔️ Saldırı: ${player.attack} · 🛡️ Savunma: ${player.defense}`
          ).join('\n\n')
        )
        .addFields(
          { name: '🎁 Kişi başı ödül', value: `✨ ${totalXp} XP\n🥐 ${totalCoins} altın`, inline: true },
          { name: '⏳ Sonraki zindan', value: `${COOLDOWN_MINUTES} dakika sonra`, inline: true },
          { name: '🧭 Sonraki adım', value: 'HP düşükse **/dinlen**, daha güçlü ekipman için **/market** ve **/ekipman** kullan.', inline: false }
        )
        .setFooter({ text: win ? 'Poğaça Frieren • Birlikteyken daha güçlüsünüz.' : 'Poğaça Frieren • Güçlen, hazırlan ve yeniden dene.' });

      return interaction.reply({ embeds: [resultEmbed] });
    } catch (error) {
      await db.query('ROLLBACK').catch(() => {});
      console.error('/zindan hatası:', error);
      return interaction.reply({ content: 'Zindan sırasında bir hata oluştu. Daha sonra tekrar dene.', ephemeral: true }).catch(() => {});
    } finally {
      db.release();
    }
  }
};
