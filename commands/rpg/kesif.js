import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { pool, ensureUser } from '../../database/db.js';

const COOLDOWN_MS = 15 * 60 * 1000;
const encounters = [
  { title: '🌲 Kuzey Ormanı', text: 'Sislerin arasından eski bir büyü kalıntısı buldun.', xp: 35, coins: 24, manaCost: 8, hpDamage: 0, item: '✨ Eski Büyü Kalıntısı' },
  { title: '🪨 Sessiz Harabeler', text: 'Taşların arasında saklı bir sandık keşfettin; tuzağı atlatırken hafifçe yaralandın.', xp: 45, coins: 32, manaCost: 0, hpDamage: 12, item: '🗝️ Harabe Anahtarı' },
  { title: '🧙 Gezgin Büyücü', text: 'Yaşlı bir büyücü sana küçük bir ders verdi ve yol masrafı için altın bıraktı.', xp: 30, coins: 45, manaCost: 0, hpDamage: 0, item: null },
  { title: '👹 İblis İzleri', text: 'Bir iblisin izini sürdün. Kısa bir çatışmadan sonra ganimetini aldın.', xp: 55, coins: 38, manaCost: 10, hpDamage: 18, item: '🩸 İblis Özü' },
  { title: '🌼 Çiçek Tarlası', text: 'Fern’in öğrettiği sakinleştirici nefes tekniğini hatırladın; yolculuğun sana iyi geldi.', xp: 25, coins: 15, manaCost: 0, hpDamage: 0, item: '🌼 Kurutulmuş Çiçek' },
  { title: '🥐 Gezgin Fırın', text: 'Yol kenarındaki fırıncı, yardımın karşılığında sana altın ve taze poğaça verdi.', xp: 20, coins: 55, manaCost: 0, hpDamage: 0, item: '🥐 Büyülü Poğaça' }
];

export default {
  data: new SlashCommandBuilder()
    .setName('kesif')
    .setDescription('Frieren evreninde keşfe çık; XP, altın ve nadir eşyalar bul.'),

  async execute(interaction) {
    if (!interaction.guildId) {
      return interaction.reply({ content: 'Keşif yalnızca Discord sunucularında kullanılabilir.', ephemeral: true });
    }

    await interaction.deferReply();
    await ensureUser(interaction.guildId, interaction.user.id);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      const { rows: [player] } = await client.query(
        'SELECT xp, level, coins, hp, max_hp, mana, max_mana, stat_points, last_exploration_at FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE',
        [interaction.guildId, interaction.user.id]
      );

      if (!player) {
        await client.query('ROLLBACK');
        return interaction.editReply('Maceracı kaydın bulunamadı. Lütfen komutu yeniden dene.');
      }

      if (Number(player.hp) <= 0) {
        await client.query('ROLLBACK');
        return interaction.editReply('❤️ Canın tükenmiş. Keşfe çıkmadan önce **/dinlen** komutuyla HP ve Mana değerlerini yenile.');
      }

      if (player.last_exploration_at) {
        const remaining = COOLDOWN_MS - (Date.now() - new Date(player.last_exploration_at).getTime());
        if (remaining > 0) {
          await client.query('ROLLBACK');
          const readyAt = Math.ceil((Date.now() + remaining) / 1000);
          return interaction.editReply(`⏳ Yeni keşif için biraz beklemelisin. Yeniden deneyebilirsin: <t:${readyAt}:R>`);
        }
      }

      const encounter = encounters[Math.floor(Math.random() * encounters.length)];
      const manaCost = Number(player.mana) >= encounter.manaCost ? encounter.manaCost : 0;
      const hpDamage = encounter.hpDamage;
      const newXp = Number(player.xp) + encounter.xp;
      const newLevel = Math.floor(Math.sqrt(newXp / 100)) + 1;
      const newHp = Math.max(0, Number(player.hp) - hpDamage);
      const newMana = Math.max(0, Number(player.mana) - manaCost);
      const gainedPoints = Math.max(0, newLevel - Number(player.level));

      await client.query(
        `UPDATE users SET
          xp=$3,
          level=$4,
          coins=coins+$5,
          hp=$6,
          mana=$7,
          stat_points=stat_points+$8,
          last_exploration_at=NOW()
         WHERE guild_id=$1 AND user_id=$2`,
        [interaction.guildId, interaction.user.id, newXp, newLevel, encounter.coins, newHp, newMana, gainedPoints]
      );

      if (encounter.item) {
        await client.query(
          `INSERT INTO inventory(guild_id,user_id,item_key,quantity)
           VALUES($1,$2,$3,1)
           ON CONFLICT(guild_id,user_id,item_key)
           DO UPDATE SET quantity=inventory.quantity+1`,
          [interaction.guildId, interaction.user.id, encounter.item]
        );
      }

      await client.query('COMMIT');

      const description = [
        encounter.text,
        '',
        `**Ödüller:** +${encounter.coins} altın · +${encounter.xp} XP`,
        encounter.item ? `**Bulunan eşya:** ${encounter.item}` : '',
        hpDamage ? `**Can kaybı:** −${hpDamage} HP` : '',
        manaCost ? `**Büyü maliyeti:** −${manaCost} Mana` : encounter.manaCost ? 'Mana yetersiz olduğu için büyü kullanmadın.' : '',
        gainedPoints ? `**Seviye atladın!** +${gainedPoints} stat puanı kazandın.` : ''
      ].filter(Boolean).join('\n');

      const embed = new EmbedBuilder()
        .setColor(newHp === 0 ? 0xc0392b : 0x9b8cff)
        .setTitle(encounter.title)
        .setDescription(description)
        .addFields(
          { name: '❤️ HP', value: `${newHp}/${player.max_hp}`, inline: true },
          { name: '🔮 Mana', value: `${newMana}/${player.max_mana}`, inline: true },
          { name: '🧭 Seviye', value: String(newLevel), inline: true }
        )
        .setFooter({ text: 'Keşif bekleme süresi: 15 dakika • Poğaça Frieren RPG' });

      return interaction.editReply({ embeds: [embed] });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('Keşif komutu başarısız:', error);
      return interaction.editReply('Keşif sırasında beklenmeyen bir hata oluştu. İlerlemen korunmaya çalışıldı; lütfen daha sonra tekrar dene.');
    } finally {
      client.release();
    }
  }
};
