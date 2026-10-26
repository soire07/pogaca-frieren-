import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { pool, ensureUser } from './database/db.js';

const usableItems = {
  frieren_staff: { name: '🪄 Frieren’in Asası', key: '🪄 Frieren’in Asası', description: '120 XP kazandın.', xp: 120, coins: 0 },
  mana_crystal: { name: '💎 Mana Kristali', key: '💎 Mana Kristali', description: '50 Mana yeniledin.', xp: 0, coins: 0, mana: 50 },
  grimoire: { name: '📖 Yasak Büyü Kitabı', key: '📖 Yasak Büyü Kitabı', description: '100 XP kazandın.', xp: 100, coins: 0 },
  mimic_chest: { name: '📦 Mimic Sandığı', key: '📦 Mimic Sandığı', description: 'Sandıktan 60 altın çıktı!', xp: 0, coins: 60 },
  fern_ribbon: { name: '🎀 Fern’in Kurdelası', key: '🎀 Fern’in Kurdelası', description: '35 XP kazandın.', xp: 35, coins: 0 },
  himmel_flower: { name: '🌼 Himmel’in Mavi Çiçeği', key: '🌼 Himmel’in Mavi Çiçeği', description: '80 XP kazandın.', xp: 80, coins: 0 },
  goku_orb: { name: '🔴 Dört Yıldızlı Ejder Topu', key: '🔴 Dört Yıldızlı Ejder Topu', description: '90 XP kazandın.', xp: 90, coins: 0 },
  ninja_scroll: { name: '📜 Gizli Ninja Parşömeni', key: '📜 Gizli Ninja Parşömeni', description: '30 XP kazandın.', xp: 30, coins: 0 },
  cursed_charm: { name: '🧿 Lanetli Muska', key: '🧿 Lanetli Muska', description: '45 XP ve 15 altın kazandın.', xp: 45, coins: 15 },
  breathing_mask: { name: '🌊 Su Nefesi Tılsımı', key: '🌊 Su Nefesi Tılsımı', description: '30 XP kazandın.', xp: 30, coins: 0 },
  survey_badge: { name: '🪽 Keşif Birliği Rozeti', key: '🪽 Keşif Birliği Rozeti', description: '40 XP kazandın.', xp: 40, coins: 0 },
  lucky_charm: { name: '🍀 Şans Tılsımı', key: '🍀 Şans Tılsımı', description: 'Rastgele altın ödülü kazandın.', xp: 0, coins: 25 },
  frieren_tea: {
    name: '🍵 Frieren Çayı',
    key: '🍵 Frieren Çayı',
    description: 'Huzurlu bir mola verdin ve 25 XP kazandın.',
    xp: 25,
    coins: 0
  },
  poagaca_box: {
    name: '🥐 Büyülü Poğaça Kutusu',
    key: '🥐 Büyülü Poğaça Kutusu',
    description: 'Kutudaki özel poğaçaları değerlendirdin ve 40 altın kazandın.',
    xp: 0,
    coins: 40
  },
  star_potion: {
    name: '🌠 Yıldız İksiri',
    key: '🌠 Yıldız İksiri',
    description: 'Yıldız büyüsü sana 100 XP kazandırdı.',
    xp: 100,
    coins: 0
  }
};

export default {
  data: new SlashCommandBuilder()
    .setName('esyakullan')
    .setDescription('Envanterindeki kullanılabilir bir eşyayı kullan.')
    .addStringOption(option =>
      option.setName('esya')
        .setDescription('Kullanmak istediğin eşya')
        .setRequired(true)
        .addChoices(
          { name: '🪄 Frieren’in Asası (+120 XP)', value: 'frieren_staff' },
          { name: '💎 Mana Kristali (+50 Mana)', value: 'mana_crystal' },
          { name: '📖 Yasak Büyü Kitabı (+100 XP)', value: 'grimoire' },
          { name: '📦 Mimic Sandığı (+60 altın)', value: 'mimic_chest' },
          { name: '🎀 Fern’in Kurdelası (+35 XP)', value: 'fern_ribbon' },
          { name: '🌼 Himmel’in Mavi Çiçeği (+80 XP)', value: 'himmel_flower' },
          { name: '🔴 Dört Yıldızlı Ejder Topu (+90 XP)', value: 'goku_orb' },
          { name: '📜 Gizli Ninja Parşömeni (+30 XP)', value: 'ninja_scroll' },
          { name: '🧿 Lanetli Muska (+45 XP, +15 altın)', value: 'cursed_charm' },
          { name: '🌊 Su Nefesi Tılsımı (+30 XP)', value: 'breathing_mask' },
          { name: '🪽 Keşif Birliği Rozeti (+40 XP)', value: 'survey_badge' },
          { name: '🍀 Şans Tılsımı (+25 altın)', value: 'lucky_charm' },
          { name: '🍵 Frieren Çayı (+25 XP)', value: 'frieren_tea' },
          { name: '🥐 Büyülü Poğaça Kutusu (+40 altın)', value: 'poagaca_box' },
          { name: '🌠 Yıldız İksiri (+100 XP)', value: 'star_potion' }
        )
    ),

  async execute(interaction) {
    if (!interaction.guildId) {
      return interaction.reply({ content: 'Bu komut yalnızca sunucularda kullanılabilir.', ephemeral: true });
    }

    const itemId = interaction.options.getString('esya', true);
    const item = usableItems[itemId];
    await ensureUser(interaction.guildId, interaction.user.id);

    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      const found = await db.query(
        'SELECT quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key=$3 FOR UPDATE',
        [interaction.guildId, interaction.user.id, item.key]
      );

      if (!found.rowCount || Number(found.rows[0].quantity) < 1) {
        await db.query('ROLLBACK');
        return interaction.reply({
          content: 'Bu eşya envanterinde yok. Önce /market üzerinden satın alman gerekiyor.',
          ephemeral: true
        });
      }

      if (Number(found.rows[0].quantity) === 1) {
        await db.query(
          'DELETE FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key=$3',
          [interaction.guildId, interaction.user.id, item.key]
        );
      } else {
        await db.query(
          'UPDATE inventory SET quantity=quantity-1 WHERE guild_id=$1 AND user_id=$2 AND item_key=$3',
          [interaction.guildId, interaction.user.id, item.key]
        );
      }

      const updated = await db.query(
        `UPDATE users SET
          xp = xp + $3,
          coins = coins + $4,
          mana = LEAST(max_mana, mana + $5),
          stat_points = stat_points + GREATEST(0, (FLOOR(SQRT((xp + $3)::numeric / 100))::int + 1) - level),
          level = FLOOR(SQRT((xp + $3)::numeric / 100))::int + 1
         WHERE guild_id=$1 AND user_id=$2
         RETURNING xp, coins, level, mana, max_mana, stat_points`,
        [interaction.guildId, interaction.user.id, item.xp, item.coins, item.mana || 0]
      );

      await db.query('COMMIT');
      const user = updated.rows[0];
      const embed = new EmbedBuilder()
        .setColor(0x9b8cff)
        .setTitle('✨ Eşya kullanıldı!')
        .setDescription(item.mana ? `${item.description} Şu anki Mana: **${user.mana}/${user.max_mana}**.` : item.description)
        .addFields(
          { name: '⭐ Toplam XP', value: Number(user.xp).toLocaleString('tr-TR'), inline: true },
          { name: '🪙 Altın', value: Number(user.coins).toLocaleString('tr-TR'), inline: true },
          { name: '🧭 Seviye', value: String(user.level), inline: true },
          { name: '✨ Harcanabilir stat puanı', value: String(user.stat_points), inline: true }
        )
        .setFooter({ text: 'Poğaça Frieren • Eşyalar kalıcı envanterinden düşülür' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
      await db.query('ROLLBACK').catch(() => {});
      console.error('Eşya kullanma hatası:', error);
      return interaction.reply({ content: 'Eşya kullanılırken bir sorun oluştu. Daha sonra tekrar dene.', ephemeral: true }).catch(() => {});
    } finally {
      db.release();
    }
  }
};
