import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { pool, ensureUser } from './database/db.js';
import { levelForXp } from './utils.js';

const LOOT = [
  { name: '💎 Mana Kristali', coins: 120, xp: 100 },
  { name: '📖 Yasak Büyü Kitabı', coins: 160, xp: 130 },
  { name: '🌙 Efsunlu Elf Yadigârı', coins: 220, xp: 180 },
  { name: '🐉 Ejderha Pulu', coins: 250, xp: 200 },
  { name: '🥐 Büyülü Poğaça Kutusu', coins: 140, xp: 120 }
];

const RARE_LOOT = [
  { name: '🪄 Frieren’in Kadim Asası', coins: 500, xp: 350 },
  { name: '👑 Himmel’in Efsanevi Yadigârı', coins: 800, xp: 500 }
];

export default {
  data: new SlashCommandBuilder()
    .setName('hazineac')
    .setDescription('Kadim hazine sandığını aç ve içindeki rastgele ganimeti kazan.')
    .addIntegerOption(option => option.setName('adet').setDescription('Açılacak sandık sayısı (1–5).')
      .setRequired(false).setMinValue(1).setMaxValue(5)),
  async execute(interaction) {
    if (!interaction.guildId) return interaction.reply({ content: 'Bu komut yalnızca sunucularda kullanılabilir.', flags: MessageFlags.Ephemeral });
    await ensureUser(interaction.guildId, interaction.user.id);
    await interaction.deferReply();
    const amount = interaction.options.getInteger('adet') || 1;
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      const { rows: [user] } = await db.query(
        'SELECT xp, level FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE',
        [interaction.guildId, interaction.user.id]
      );
      const { rows: [bag] } = await db.query(
        "SELECT quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key='🗝️ Kadim Hazine Sandığı' FOR UPDATE",
        [interaction.guildId, interaction.user.id]
      );
      const available = Number(bag?.quantity || 0);
      if (available < amount) {
        await db.query('ROLLBACK');
        return interaction.editReply(`🗝️ Envanterinde **${available}** Kadim Hazine Sandığı var; **${amount}** tane açamazsın.`);
      }
      if (available === amount) {
        await db.query(
          "DELETE FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key='🗝️ Kadim Hazine Sandığı'",
          [interaction.guildId, interaction.user.id]
        );
      } else {
        await db.query(
          "UPDATE inventory SET quantity=quantity-$3 WHERE guild_id=$1 AND user_id=$2 AND item_key='🗝️ Kadim Hazine Sandığı'",
          [interaction.guildId, interaction.user.id, amount]
        );
      }
      let coins = 0;
      let xp = 0;
      const found = new Map();
      for (let i = 0; i < amount; i++) {
        const roll = Math.random();
        const loot = roll < 0.01 ? RARE_LOOT[1] : roll < 0.04 ? RARE_LOOT[0] : LOOT[Math.floor(Math.random() * LOOT.length)];
        coins += loot.coins;
        xp += loot.xp;
        found.set(loot.name, (found.get(loot.name) || 0) + 1);
        await db.query('INSERT INTO treasure_openings(guild_id,user_id,loot_item,coins,xp) VALUES($1,$2,$3,$4,$5)', [interaction.guildId, interaction.user.id, loot.name, loot.coins, loot.xp]);
      }
      for (const [item, quantity] of found) {
        await db.query(
          `INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,$3,$4)
           ON CONFLICT(guild_id,user_id,item_key) DO UPDATE SET quantity=inventory.quantity+EXCLUDED.quantity`,
          [interaction.guildId, interaction.user.id, item, quantity]
        );
      }
      const newXp = Number(user.xp) + xp;
      const newLevel = levelForXp(newXp);
      await db.query(
        'UPDATE users SET coins=coins+$3, xp=$4, stat_points=stat_points+GREATEST(0,$5-level), level=$5 WHERE guild_id=$1 AND user_id=$2',
        [interaction.guildId, interaction.user.id, coins, newXp, newLevel]
      );
      await db.query('COMMIT');
      const lootText = [...found.entries()].map(([item, quantity]) => `• ${item} × **${quantity}**`).join('\n');
      const embed = new EmbedBuilder()
        .setColor(0x9b8cff)
        .setTitle('🗝️ Kadim Hazine Açıldı!')
        .setDescription(`Açılan sandık: **${amount}**\n\n${lootText}\n\nKazanç: **+${coins} altın** · **+${xp} XP**\nYeni seviye: **${newLevel}**`)
        .setFooter({ text: 'Poğaça Frieren • Hazine ganimetleri kalıcı olarak envantere işlendi.' });
      return interaction.editReply({ embeds: [embed] });
    } catch (error) {
      await db.query('ROLLBACK').catch(() => {});
      console.error('Hazine açma hatası:', error);
      return interaction.editReply('Hazine sandığı açılırken hata oluştu. Sandıkların korunması için işlem geri alındı.');
    } finally {
      db.release();
    }
  }
};
