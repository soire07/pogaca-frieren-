import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { pool, ensureUser } from './database/db.js';
import { equipmentItems, equipmentSlots, formatEquipmentBonus } from './equipment-data.js';

const rarityEmoji = { Yaygın: '⚪', Nadir: '🔹', Destansı: '🟣', Efsanevi: '🟡' };

export default {
  data: new SlashCommandBuilder()
    .setName('ekipman')
    .setDescription('Silahını, zırhını ve iki yüzüğünü yönet.')
    .addStringOption(option => option.setName('islem').setDescription('Yapılacak işlem').setRequired(true)
      .addChoices({ name: 'Kuşan', value: 'equip' }, { name: 'Çıkar', value: 'unequip' }))
    .addStringOption(option => option.setName('esya').setDescription('Kuşanılacak ekipman').setRequired(false)
      .addChoices(...equipmentItems.map(item => ({ name: item.name.slice(0, 100), value: item.id }))))
    .addStringOption(option => option.setName('yuva').setDescription('Yüzük yuvası veya çıkarılacak yuva').setRequired(false)
      .addChoices(
        { name: 'Silah', value: 'weapon' },
        { name: 'Zırh', value: 'armor' },
        { name: 'Birinci yüzük', value: 'ring1' },
        { name: 'İkinci yüzük', value: 'ring2' }
      )),

  async execute(interaction) {
    if (!interaction.guildId) return interaction.reply({ content: 'Ekipman yalnızca sunucularda kullanılabilir.', ephemeral: true });
    await ensureUser(interaction.guildId, interaction.user.id);
    const action = interaction.options.getString('islem', true);
    const itemId = interaction.options.getString('esya');
    const requestedSlot = interaction.options.getString('yuva');
    const stats = await pool.query('SELECT level FROM users WHERE guild_id=$1 AND user_id=$2', [interaction.guildId, interaction.user.id]);
    const level = Number(stats.rows[0]?.level || 1);

    if (action === 'unequip') {
      if (!requestedSlot) return interaction.reply({ content: 'Çıkarmak istediğin yuvayı **yuva** seçeneğinden belirt.', ephemeral: true });
      const removed = await pool.query('DELETE FROM user_equipment WHERE guild_id=$1 AND user_id=$2 AND slot=$3 RETURNING item_key', [interaction.guildId, interaction.user.id, requestedSlot]);
      if (!removed.rowCount) return interaction.reply({ content: 'Bu yuvada takılı ekipman yok.', ephemeral: true });
      return interaction.reply({ content: '↩️ **' + removed.rows[0].item_key + '** çıkarıldı. Eşya envanterinde duruyor; istediğin zaman tekrar kuşanabilirsin.', ephemeral: true });
    }

    const item = equipmentItems.find(entry => entry.id === itemId);
    if (!item) return interaction.reply({ content: 'Kuşanmak için **esya** seçeneğinden bir ekipman seçmelisin.', ephemeral: true });
    if (level < item.levelReq) return interaction.reply({ content: '🔒 Bu ekipman için **Seviye ' + item.levelReq + '** gerekiyor. Şu anki seviyen: **' + level + '**.', ephemeral: true });

    let slot = item.slot;
    if (item.slot === 'ring') {
      if (!requestedSlot || !['ring1', 'ring2'].includes(requestedSlot)) {
        return interaction.reply({ content: '💍 Yüzük için **yuva** seçeneğinden Birinci yüzük veya İkinci yüzük seç.', ephemeral: true });
      }
      slot = requestedSlot;
    } else if (requestedSlot && requestedSlot !== item.slot) {
      return interaction.reply({ content: 'Bu eşya **' + (item.slot === 'weapon' ? 'Silah' : 'Zırh') + '** yuvasına takılır.', ephemeral: true });
    }

    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      const owned = await db.query('SELECT quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key=$3 FOR UPDATE', [interaction.guildId, interaction.user.id, item.name]);
      const equipped = await db.query('SELECT slot FROM user_equipment WHERE guild_id=$1 AND user_id=$2 AND item_key=$3', [interaction.guildId, interaction.user.id, item.name]);
      const sameItemInTarget = equipped.rows.some(row => row.slot === slot);
      if (!owned.rowCount || Number(owned.rows[0].quantity) < equipped.rowCount + (sameItemInTarget ? 0 : 1)) {
        await db.query('ROLLBACK');
        return interaction.reply({ content: 'Bu ekipman envanterinde yeterli sayıda yok. Önce **/market** üzerinden satın al.', ephemeral: true });
      }
      await db.query('INSERT INTO user_equipment(guild_id,user_id,slot,item_key) VALUES($1,$2,$3,$4) ON CONFLICT(guild_id,user_id,slot) DO UPDATE SET item_key=EXCLUDED.item_key,equipped_at=NOW()', [interaction.guildId, interaction.user.id, slot, item.name]);
      await db.query('COMMIT');
      const slotLabel = equipmentSlots.find(entry => entry.id === slot)?.label || slot;
      return interaction.reply({ content: '✨ **' + item.name + '** kuşanıldı!\n' + slotLabel + '\n' + rarityEmoji[item.rarity] + ' ' + item.rarity + ' · Seviye ' + item.levelReq + '+\n' + formatEquipmentBonus(item) + '\n\nEkipman bonusları **/iblisavasi** savaşında uygulanır.', ephemeral: true });
    } catch (error) {
      await db.query('ROLLBACK').catch(() => {});
      console.error('/ekipman hatası:', error);
      return interaction.reply({ content: 'Ekipman değiştirilirken hata oluştu. Biraz sonra tekrar dene.', ephemeral: true });
    } finally {
      db.release();
    }
  }
};
