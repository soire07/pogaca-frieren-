import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { pool, ensureUser } from './database/db.js';
import { equipmentItems } from './equipment-data.js';

const SALVAGE_YIELD = {
  iron_sword: { item: '🥐 Büyülü Poğaça Kutusu', quantity: 1 },
  mage_staff: { item: '📖 Yasak Büyü Kitabı', quantity: 1 },
  traveler_cloak: { item: '🥐 Büyülü Poğaça Kutusu', quantity: 1 },
  mana_ring: { item: '💎 Mana Kristali', quantity: 1 },
  fern_robe: { item: '🌙 Efsunlu Elf Yadigârı', quantity: 1 },
  frieren_robe: { item: '💎 Mana Kristali', quantity: 1 },
  himmel_sword: { item: '🐉 Ejderha Pulu', quantity: 1 },
  demon_blade: { item: '🐉 Ejderha Pulu', quantity: 2 },
  rune_ring: { item: '💎 Mana Kristali', quantity: 1 },
  hero_ring: { item: '🌙 Efsunlu Elf Yadigârı', quantity: 1 }
};

export default {
  data: new SlashCommandBuilder()
    .setName('ekipmanparcala')
    .setDescription('Kullanmadığın ekipmanı malzemeye dönüştür; kuşanılan ekipman korunur.')
    .addStringOption(option => option.setName('esya').setDescription('Parçalanacak ekipman.')
      .setRequired(true).addChoices(...equipmentItems.map(item => ({ name: item.name.slice(0, 100), value: item.id }))))
    .addIntegerOption(option => option.setName('adet').setDescription('Parçalanacak adet (1–5).')
      .setRequired(false).setMinValue(1).setMaxValue(5)),
  async execute(interaction) {
    if (!interaction.guildId) return interaction.reply({ content: 'Bu komut yalnızca sunucularda kullanılabilir.', ephemeral: true });
    await ensureUser(interaction.guildId, interaction.user.id);
    await interaction.deferReply({ ephemeral: true });
    const itemId = interaction.options.getString('esya', true);
    const amount = interaction.options.getInteger('adet') || 1;
    const item = equipmentItems.find(entry => entry.id === itemId);
    const salvage = SALVAGE_YIELD[itemId];
    if (!item || !salvage) return interaction.editReply('Bu ekipmanı parçalama tarifi bulunamadı.');
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      await db.query('SELECT user_id FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE', [interaction.guildId, interaction.user.id]);
      const { rows: [owned] } = await db.query(
        'SELECT quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key=$3 FOR UPDATE',
        [interaction.guildId, interaction.user.id, item.name]
      );
      const { rows: equippedRows } = await db.query(
        'SELECT slot FROM user_equipment WHERE guild_id=$1 AND user_id=$2 AND item_key=$3 FOR UPDATE',
        [interaction.guildId, interaction.user.id, item.name]
      );
      const quantity = Number(owned?.quantity || 0);
      const equipped = equippedRows.length;
      if (quantity - equipped < amount) {
        await db.query('ROLLBACK');
        return interaction.editReply(`Envanterinde **${quantity}** adet var, **${equipped}** tanesi kuşanılmış. Kuşanılan eşyaları koruyarak en fazla **${Math.max(0, quantity - equipped)}** adet parçalayabilirsin.`);
      }
      if (quantity === amount) {
        await db.query('DELETE FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key=$3', [interaction.guildId, interaction.user.id, item.name]);
      } else {
        await db.query('UPDATE inventory SET quantity=quantity-$4 WHERE guild_id=$1 AND user_id=$2 AND item_key=$3', [interaction.guildId, interaction.user.id, item.name, amount]);
      }
      const returned = salvage.quantity * amount;
      await db.query(
        'INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,$3,$4) ON CONFLICT(guild_id,user_id,item_key) DO UPDATE SET quantity=inventory.quantity+EXCLUDED.quantity',
        [interaction.guildId, interaction.user.id, salvage.item, returned]
      );
      await db.query('COMMIT');
      const embed = new EmbedBuilder().setColor(0x9b8cff).setTitle('♻️ Ekipman Parçalandı')
        .setDescription(`Parçalanan: **${item.name} × ${amount}**\nGeri kazanılan malzeme: **${salvage.item} × ${returned}**\n\nKuşanılmış ekipman korunur. Geri kazanım, üretimde harcanandan daha az malzeme verir.`)
        .setFooter({ text: 'Poğaça Frieren • Parçalama ve malzeme iadesi tek işlemde kaydedildi.' });
      return interaction.editReply({ embeds: [embed] });
    } catch (error) {
      await db.query('ROLLBACK').catch(() => {});
      console.error('Ekipman parçalama hatası:', error);
      return interaction.editReply('Ekipman parçalanamadı. Malzemelerin korunması için işlem geri alındı.');
    } finally {
      db.release();
    }
  }
};
