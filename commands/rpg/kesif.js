import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { pool, ensureUser } from '../../database/db.js';
import { equipmentItems, equipmentBonus } from '../../equipment-data.js';
import { levelForXp } from '../../utils.js';
import { applyClassDefense, applyClassManaCost, applyEquipmentSetBonus, getCharacterBuild } from '../../rpg-mechanics.js';

const COOLDOWN_MS = 15 * 60 * 1000;
const regions = {
  merkez: {
    name: '🌾 Merkez Topraklar',
    minLevel: 1,
    encounters: [
      { title: '🏘️ Yol Kenarı Kasabası', text: 'Kasaba halkına yardım ettin. Bir tüccar yol masrafın için altın verdi.', xp: 25, coins: 35, manaCost: 0, hpDamage: 0, item: null },
      { title: '🌼 Çiçek Tarlası', text: 'Yol boyunca nadir çiçekler topladın ve Himmel’in eski bir anıtında kısa bir mola verdin.', xp: 30, coins: 18, manaCost: 0, hpDamage: 0, item: '🌼 Kurutulmuş Çiçek' },
      { title: '🥐 Gezgin Fırın', text: 'Fırıncıya yardım ettin; karşılığında taze poğaça ve birkaç altın aldın.', xp: 20, coins: 45, manaCost: 0, hpDamage: 0, item: '🥐 Büyülü Poğaça' }
    ]
  },
  orman: {
    name: '🌲 Büyük Orman Yolu',
    minLevel: 5,
    encounters: [
      { title: '🌲 Mana İzleri', text: 'Ağaçların arasında eski bir büyünün izlerini takip edip büyü kalıntısı buldun.', xp: 42, coins: 30, manaCost: 8, hpDamage: 0, item: '✨ Eski Büyü Kalıntısı' },
      { title: '🐺 Orman Yaratığı', text: 'Bir yaratık yolunu kesti. Dikkatli bir hamleyle onu savuşturup ganimetini aldın.', xp: 50, coins: 38, manaCost: 8, hpDamage: 12, item: '🌼 Kurutulmuş Çiçek' },
      { title: '🧙 Gezgin Büyücü', text: 'Yaşlı bir büyücü sana büyü kontrolü hakkında kısa bir ders verdi.', xp: 38, coins: 45, manaCost: 0, hpDamage: 0, item: null }
    ]
  },
  harabeler: {
    name: '🏚️ Kadim Harabeler',
    minLevel: 12,
    encounters: [
      { title: '🗝️ Mühürlü Oda', text: 'Harabelerdeki eski bir mührü çözdün. Sandıktan bir anahtar ve altın çıktı.', xp: 65, coins: 55, manaCost: 0, hpDamage: 10, item: '🗝️ Harabe Anahtarı' },
      { title: '✨ Unutulmuş Grimoire', text: 'Taş bir nişin içinde eski büyü notları buldun; araştırırken mana harcadın.', xp: 78, coins: 48, manaCost: 12, hpDamage: 0, item: '✨ Eski Büyü Kalıntısı' },
      { title: '🪤 Harabe Tuzağı', text: 'Bir tuzağı fark edip atlattın, ancak çıkış yolunda hafifçe yaralandın.', xp: 70, coins: 68, manaCost: 0, hpDamage: 18, item: '🗝️ Harabe Anahtarı' }
    ]
  },
  kuzey: {
    name: '❄️ Kuzey Topraklarına Giden Yol',
    minLevel: 20,
    encounters: [
      { title: '❄️ Kar Fırtınası', text: 'Fırtınadan korunmak için mana kullandın ve terk edilmiş bir kampın malzemelerini buldun.', xp: 95, coins: 90, manaCost: 12, hpDamage: 12, item: '🩸 İblis Özü' },
      { title: '👹 İblis İzleri', text: 'Kuzey yolunda bir iblisin izini sürdün. Kısa ama zorlu çatışmadan ganimetle çıktın.', xp: 115, coins: 105, manaCost: 16, hpDamage: 22, item: '🩸 İblis Özü' },
      { title: '🪨 Eski Geçit', text: 'Kayalık geçitte saklı bir sandık keşfettin; içindeki eşyalar yolculuğunu kolaylaştıracak.', xp: 100, coins: 120, manaCost: 0, hpDamage: 15, item: '🗝️ Harabe Anahtarı' }
    ]
  },
  yayla: {
    name: '🏔️ Kuzey Yaylaları',
    minLevel: 35,
    encounters: [
      { title: '👁️ Güçlü İblisin Aurası', text: 'Tehlikeli bir iblisin aurasını fark edip doğrudan çatışmadan kaçındın; geride bıraktığı kalıntıları topladın.', xp: 150, coins: 155, manaCost: 20, hpDamage: 20, item: '🩸 İblis Özü' },
      { title: '🔮 Kadim Mana Damarı', text: 'Buzların altında yoğun mana taşıyan bir damar keşfettin ve enerjisini dikkatle topladın.', xp: 175, coins: 135, manaCost: 10, hpDamage: 0, item: '✨ Eski Büyü Kalıntısı' },
      { title: '⚔️ Kuzey Geçidi Çatışması', text: 'Geçidi tutan güçlü bir yaratıkla savaştın. Zaferin pahalıya mal oldu ama ganimetin değerli.', xp: 190, coins: 185, manaCost: 22, hpDamage: 28, item: '🩸 İblis Özü' }
    ]
  },
  aus: {
    name: '🏰 Äußerst Sınav Rotası',
    minLevel: 50,
    encounters: [
      { title: '🎖️ Büyücü Sınavı Kalıntısı', text: 'Sınav rotasının eski bir alanında büyü kontrolünü sınayan bir mekanizmayı çözdün.', xp: 220, coins: 230, manaCost: 24, hpDamage: 12, item: '✨ Eski Büyü Kalıntısı' },
      { title: '🛡️ Sınav Muhafızı', text: 'Sınav alanındaki güçlü muhafızı alt edip nadir malzemeler topladın.', xp: 260, coins: 270, manaCost: 28, hpDamage: 32, item: '🩸 İblis Özü' },
      { title: '📜 Mühürlü Büyü Arşivi', text: 'Zorlu bir büyü bilmecesini çözüp eski bir arşive ulaştın.', xp: 245, coins: 290, manaCost: 18, hpDamage: 0, item: '🗝️ Harabe Anahtarı' }
    ]
  }
};

export default {
  data: new SlashCommandBuilder()
    .setName('kesif')
    .setDescription('Frieren evreninde bölge seçerek keşfe çık; seviye ve ganimet kazan.')
    .addStringOption(option =>
      option.setName('bolge')
        .setDescription('Keşfe çıkmak istediğin bölge')
        .setRequired(true)
        .addChoices(
          { name: 'Merkez Topraklar (Seviye 1+)', value: 'merkez' },
          { name: 'Büyük Orman Yolu (Seviye 5+)', value: 'orman' },
          { name: 'Kadim Harabeler (Seviye 12+)', value: 'harabeler' },
          { name: 'Kuzey Topraklarına Giden Yol (Seviye 20+)', value: 'kuzey' },
          { name: 'Kuzey Yaylaları (Seviye 35+)', value: 'yayla' },
          { name: 'Äußerst Sınav Rotası (Seviye 50+)', value: 'aus' }
        )
    ),

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
         `SELECT xp, level, coins, hp, max_hp, mana, max_mana, attack, defense, class_name, active_build, stat_points, last_exploration_at,
          COALESCE((SELECT hp_rank FROM user_talents t WHERE t.guild_id=users.guild_id AND t.user_id=users.user_id),0) AS talent_hp,
          COALESCE((SELECT defense_rank FROM user_talents t WHERE t.guild_id=users.guild_id AND t.user_id=users.user_id),0) AS talent_defense,
          COALESCE((SELECT mana_rank FROM user_talents t WHERE t.guild_id=users.guild_id AND t.user_id=users.user_id),0) AS talent_mana
         FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE`,
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

      const equippedResult = await client.query(
        'SELECT item_key FROM user_equipment WHERE guild_id=$1 AND user_id=$2',
        [interaction.guildId, interaction.user.id]
      );
      const equippedItems = equippedResult.rows.map(row => equipmentItems.find(item => item.name === row.item_key)).filter(Boolean);
      const gear = applyEquipmentSetBonus(equippedItems, equipmentBonus(equippedItems));
      const build = getCharacterBuild(player.active_build);
      const baseMaxHp = Math.max(1, Number(player.max_hp));
      const baseMaxMana = Math.max(1, Number(player.max_mana));
      const effectiveMaxHp = Math.min(2000, Math.round((baseMaxHp + gear.hp) * build.hp * (1 + Number(player.talent_hp) * 0.05)));
      const effectiveMaxMana = Math.min(2000, Math.round((baseMaxMana + gear.mana) * build.mana * (1 + Number(player.talent_mana) * 0.05)));
      const effectiveDefense = Math.min(250, Math.round(applyClassDefense(Number(player.defense) + gear.defense, player.class_name) * build.defense * (1 + Number(player.talent_defense) * 0.04)));
      const currentHp = Math.min(effectiveMaxHp, Math.round((Number(player.hp) / baseMaxHp) * effectiveMaxHp));
      const currentMana = Math.min(effectiveMaxMana, Math.round((Number(player.mana) / baseMaxMana) * effectiveMaxMana));

      const regionKey = interaction.options.getString('bolge');
      const region = regions[regionKey];
      if (Number(player.level) < region.minLevel) {
        await client.query('ROLLBACK');
        return interaction.editReply(`🔒 **${region.name}** için en az **${region.minLevel}. seviye** olmalısın. Şu anki seviyen: **${player.level}**.`);
      }

      if (player.last_exploration_at) {
        const remaining = COOLDOWN_MS - (Date.now() - new Date(player.last_exploration_at).getTime());
        if (remaining > 0) {
          await client.query('ROLLBACK');
          const readyAt = Math.ceil((Date.now() + remaining) / 1000);
          return interaction.editReply(`⏳ Yeni keşif için biraz beklemelisin. Yeniden deneyebilirsin: <t:${readyAt}:R>`);
        }
      }

      const encounter = region.encounters[Math.floor(Math.random() * region.encounters.length)];
      // Rewards rise with player level: +10% per 10 levels, capped at 5x.
      const rewardMultiplier = Math.min(5, 1 + Math.floor((Number(player.level) - 1) / 10) * 0.1);
      const rewardXp = Math.round(encounter.xp * rewardMultiplier);
      const rewardCoins = Math.round(encounter.coins * rewardMultiplier);
      const manaCost = encounter.manaCost > 0 ? applyClassManaCost(encounter.manaCost, player.class_name) : 0;
      const actualManaCost = currentMana >= manaCost ? manaCost : 0;
      const hpDamage = Math.max(0, Math.round(encounter.hpDamage - effectiveDefense * 0.12));
      const newXp = Number(player.xp) + rewardXp;
      const newLevel = levelForXp(newXp);
      const newHp = Math.max(0, currentHp - hpDamage);
      const newMana = Math.max(0, currentMana - actualManaCost);
      const persistedHp = Math.max(0, Math.min(baseMaxHp, Math.round((newHp / Math.max(1, effectiveMaxHp)) * baseMaxHp)));
      const persistedMana = Math.max(0, Math.min(baseMaxMana, Math.round((newMana / Math.max(1, effectiveMaxMana)) * baseMaxMana)));
      const gainedPoints = Math.max(0, newLevel - Number(player.level));

      await client.query(
        `UPDATE users SET
          xp=$3,
          level=$4,
          coins=coins+$5,
          hp=$6,
          mana=$7,
          stat_points=stat_points+$8,
          last_exploration_at=NOW(),
          exploration_count=exploration_count+1
         WHERE guild_id=$1 AND user_id=$2`,
        [interaction.guildId, interaction.user.id, newXp, newLevel, rewardCoins, persistedHp, persistedMana, gainedPoints]
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
        `**Ödüller:** +${rewardCoins} altın · +${rewardXp} XP`,
        rewardMultiplier > 1 ? `**Seviye bonusu:** x${rewardMultiplier.toFixed(1)}` : '',
        encounter.item ? `**Bulunan eşya:** ${encounter.item}` : '',
        hpDamage ? `**Can kaybı:** −${hpDamage} HP (savunma dahil)` : '',
        actualManaCost ? `**Büyü maliyeti:** −${actualManaCost} Mana` : encounter.manaCost ? 'Mana yetersiz olduğu için büyü kullanmadın.' : '',
        `**Sınıf / savaş yapısı:** ${player.class_name || 'Gezgin'} · ${build.label}`,
        gear.setText ? `**Etkin ekipman seti:** ${gear.setText}` : '',
        effectiveDefense ? `**Savunma etkisi:** ${effectiveDefense} savunma tuzak ve çatışma hasarını azalttı.` : '',
        gainedPoints ? `**Seviye atladın!** +${gainedPoints} stat puanı kazandın.` : ''
      ].filter(Boolean).join('\n');

      const embed = new EmbedBuilder()
        .setColor(newHp === 0 ? 0xc0392b : 0x9b8cff)
        .setTitle(`${region.name} • ${encounter.title}`)
        .setDescription(description)
        .addFields(
          { name: '❤️ HP', value: `${newHp}/${effectiveMaxHp}`, inline: true },
          { name: '🔮 Mana', value: `${newMana}/${effectiveMaxMana}`, inline: true },
          { name: '🧭 Seviye', value: String(newLevel), inline: true }
        )
        .setFooter({ text: 'Keşif bekleme süresi: 15 dakika • Ödüller seviye ile artar • Poğaça Frieren' });

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
