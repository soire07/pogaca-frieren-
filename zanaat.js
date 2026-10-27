import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { pool, ensureUser } from './database/db.js';
import { equipmentItems, formatEquipmentBonus } from './equipment-data.js';

const RECIPES = {
  iron_sword: { materials: [{ item: '💎 Mana Kristali', quantity: 1 }, { item: '🥐 Büyülü Poğaça Kutusu', quantity: 1 }] },
  mage_staff: { materials: [{ item: '💎 Mana Kristali', quantity: 2 }, { item: '📖 Yasak Büyü Kitabı', quantity: 1 }] },
  traveler_cloak: { materials: [{ item: '🥐 Büyülü Poğaça Kutusu', quantity: 2 }, { item: '📖 Yasak Büyü Kitabı', quantity: 1 }] },
  mana_ring: { materials: [{ item: '💎 Mana Kristali', quantity: 3 }, { item: '📖 Yasak Büyü Kitabı', quantity: 1 }] },
  fern_robe: { materials: [{ item: '🌙 Efsunlu Elf Yadigârı', quantity: 1 }, { item: '📖 Yasak Büyü Kitabı', quantity: 2 }] },
  frieren_robe: { materials: [{ item: '🌙 Efsunlu Elf Yadigârı', quantity: 2 }, { item: '💎 Mana Kristali', quantity: 3 }] },
  himmel_sword: { materials: [{ item: '👑 Himmel’in Efsanevi Yadigârı', quantity: 1 }, { item: '🐉 Ejderha Pulu', quantity: 2 }] },
  demon_blade: { materials: [{ item: '🐉 Ejderha Pulu', quantity: 3 }, { item: '📜 Frieren’in Kayıp Notları', quantity: 1 }] },
  rune_ring: { materials: [{ item: '🌙 Efsunlu Elf Yadigârı', quantity: 1 }, { item: '💎 Mana Kristali', quantity: 2 }] },
  hero_ring: { materials: [{ item: '👑 Himmel’in Efsanevi Yadigârı', quantity: 1 }, { item: '🌙 Efsunlu Elf Yadigârı', quantity: 2 }] }
};

export default {
  data: new SlashCommandBuilder()
    .setName('zanaat')
    .setDescription('Maceralarda bulduğun malzemelerle ekipman üret.')
    .addStringOption(option => option.setName('tarif').setDescription('Üretilecek ekipman tarifi.')
      .setRequired(false).addChoices(
        { name: '⚔️ Gezginin Demir Kılıcı', value: 'iron_sword' },
        { name: '🪄 Büyücü Asası', value: 'mage_staff' },
        { name: '🧥 Gezgin Pelerini', value: 'traveler_cloak' },
        { name: '🔮 Mana Dairesi Yüzüğü', value: 'mana_ring' },
        { name: '🟣 Fern’in Büyücü Cübbesi', value: 'fern_robe' },
        { name: '✨ Frieren’in Kadim Cübbesi', value: 'frieren_robe' },
        { name: '🌟 Himmel’in Kahraman Kılıcı', value: 'himmel_sword' },
        { name: '🩸 Kuzey İblisi Keseni', value: 'demon_blade' },
        { name: '🗿 Kadim Rün Yüzüğü', value: 'rune_ring' },
        { name: '🌠 Kahramanların Efsanevi Yüzüğü', value: 'hero_ring' }
      ))
    .addIntegerOption(option => option.setName('adet').setDescription('Üretilecek adet (1–5).')
      .setRequired(false).setMinValue(1).setMaxValue(5)),
  async execute(interaction) {
    if (!interaction.guildId) return interaction.reply({ content: 'Zanaat yalnızca sunucularda kullanılabilir.', ephemeral: true });
    await ensureUser(interaction.guildId, interaction.user.id);
    await interaction.deferReply({ ephemeral: true });
    const recipeId = interaction.options.getString('tarif');
    const amount = interaction.options.getInteger('adet') || 1;
    if (!recipeId) {
      const lines = Object.entries(RECIPES).map(([id, recipe]) => {
        const item = equipmentItems.find(entry => entry.id === id);
        return `**${item.name}** · Seviye ${item.levelReq}+\nMalzeme: ${recipe.materials.map(material => `${material.item} × ${material.quantity}`).join(' + ')}\n${formatEquipmentBonus(item)}`;
      });
      const catalog = new EmbedBuilder().setColor(0x9b8cff).setTitle('⚒️ Zanaat Tarif Defteri')
        .setDescription(lines.join('\n\n').slice(0, 4000))
        .setFooter({ text: 'Nadir tarifler için nadir macera ve hazine ganimetleri gerekir.' });
      return interaction.editReply({ embeds: [catalog] });
    }
    const equipment = equipmentItems.find(item => item.id === recipeId);
    const recipe = RECIPES[recipeId];
    if (!equipment || !recipe) return interaction.editReply('Bu zanaat tarifi bulunamadı.');
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      await db.query('SELECT user_id FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE', [interaction.guildId, interaction.user.id]);
      const shortages = [];
      for (const material of recipe.materials) {
        const { rows: [row] } = await db.query(
          'SELECT quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key=$3 FOR UPDATE',
          [interaction.guildId, interaction.user.id, material.item]
        );
        const available = Number(row?.quantity || 0);
        const required = material.quantity * amount;
        if (available < required) shortages.push(`• ${material.item}: ${available}/${required}`);
      }
      if (shortages.length) {
        await db.query('ROLLBACK');
        return interaction.editReply('Bu tarifi üretmek için malzemen yetmiyor:\n' + shortages.join('\n'));
      }
      for (const material of recipe.materials) {
        const required = material.quantity * amount;
        const { rows: [row] } = await db.query(
          'SELECT quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key=$3 FOR UPDATE',
          [interaction.guildId, interaction.user.id, material.item]
        );
        const available = Number(row.quantity);
        if (available === required) {
          await db.query('DELETE FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key=$3', [interaction.guildId, interaction.user.id, material.item]);
        } else {
          await db.query('UPDATE inventory SET quantity=quantity-$4 WHERE guild_id=$1 AND user_id=$2 AND item_key=$3', [interaction.guildId, interaction.user.id, material.item, required]);
        }
      }
      await db.query(
        'INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,$3,$4) ON CONFLICT(guild_id,user_id,item_key) DO UPDATE SET quantity=inventory.quantity+EXCLUDED.quantity',
        [interaction.guildId, interaction.user.id, equipment.name, amount]
      );
      const craftXp = amount * ({ Yaygın: 10, Nadir: 20, Destansı: 35, Efsanevi: 50 }[equipment.rarity] || 10);
      const { rows: [craftProgress] } = await db.query(
        `INSERT INTO user_crafting_progress(guild_id,user_id,xp,level,successful_crafts)
         VALUES($1,$2,$3,GREATEST(1,FLOOR($3/100.0)::int+1),$4)
         ON CONFLICT(guild_id,user_id) DO UPDATE SET
           xp=user_crafting_progress.xp+EXCLUDED.xp,
           level=GREATEST(1,FLOOR((user_crafting_progress.xp+EXCLUDED.xp)/100.0)::int+1),
           successful_crafts=user_crafting_progress.successful_crafts+EXCLUDED.successful_crafts,
           updated_at=NOW()
         RETURNING xp, level, successful_crafts`,
        [interaction.guildId, interaction.user.id, craftXp, amount]
      );
      const refundChance = craftProgress.level >= 10 ? 0.20 : craftProgress.level >= 5 ? 0.10 : 0;
      let refundedMaterial = null;
      if (refundChance > 0 && Math.random() < refundChance) {
        const material = recipe.materials[Math.floor(Math.random() * recipe.materials.length)];
        await db.query(
          'INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,$3,1) ON CONFLICT(guild_id,user_id,item_key) DO UPDATE SET quantity=inventory.quantity+1',
          [interaction.guildId, interaction.user.id, material.item]
        );
        refundedMaterial = material.item;
      }
      await db.query('COMMIT');
      const ingredients = recipe.materials.map(item => `${item.item} × ${item.quantity * amount}`).join('\n');
      const embed = new EmbedBuilder()
        .setColor(0x9b8cff)
        .setTitle('⚒️ Zanaat Başarılı')
        .setDescription(`Üretilen: **${equipment.name} × ${amount}**\n\n**Harcanan malzemeler**\n${ingredients}\n\n**Ekipman özellikleri**\n${formatEquipmentBonus(equipment)}\n\n**Zanaat ustalığı**\nSeviye: **${craftProgress.level}** · XP: **${craftProgress.xp}** · Başarılı üretim: **${craftProgress.successful_crafts}**\nKazandığın zanaat XP: **+${craftXp}**${refundedMaterial ? `\n🍀 Ustalık bonusu: **${refundedMaterial}** malzemesinden 1 adet geri kazandın!` : craftProgress.level >= 5 ? `\n🍀 Ustalık seviyesi nedeniyle %${craftProgress.level >= 10 ? 20 : 10} malzeme iade şansın var.` : ''}\n\nÜrettiğin ekipmanı /ekipman komutuyla kuşanabilirsin. Ekipman seviye gereksinimleri geçerlidir.`)
        .setFooter({ text: 'Poğaça Frieren • Malzemeler ve üretim sonucu tek işlemde kaydedildi.' });
      return interaction.editReply({ embeds: [embed] });
    } catch (error) {
      await db.query('ROLLBACK').catch(() => {});
      console.error('Zanaat hatası:', error);
      return interaction.editReply('Zanaat işlemi başarısız oldu; malzemelerin korunması için işlem geri alındı.');
    } finally {
      db.release();
    }
  }
};
