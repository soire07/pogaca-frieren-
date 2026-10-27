import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType
} from 'discord.js';
import { pool, ensureUser } from './database/db.js';
import { getBossArtUrl } from './boss-art.js';
import { recordJournalEntry } from './gameplay-journal.js';
import { equipmentItems, equipmentBonus, formatEquipmentBonus } from './equipment-data.js';
import { applyClassDamage, applyClassDefense, applyClassHealing, applyClassManaCost, applyEquipmentSetBonus, getCharacterClass, getCharacterBuild, getBossPhase, calculateBossIncomingDamage, bossPhaseSpecialBonus, getSpellMasteryAwakening } from './rpg-mechanics.js';

const PLAYER_MAX_HP = 100;
const COOLDOWN_MS = 30 * 60 * 1000;

const bossTiers = [
  { minLevel: 1, name: '🐺 Schattenwolf', region: 'Merkez Topraklar', maxHp: 120, minDamage: 7, maxDamage: 12, coinMin: 90, coinMax: 130, xpMin: 55, xpMax: 85, lootChance: 0.2, loot: ['🐺 Schattenwolfzahn'], craftingMaterial: '🥐 Büyülü Poğaça Kutusu', artUrl: getBossArtUrl('schattenwolf'), special: 'Rudelstoß', specialType: 'heavy' },
  { minLevel: 10, name: '🗿 Kadim Harabe Muhafızı', region: 'Kadim Harabeler', maxHp: 210, minDamage: 10, maxDamage: 16, coinMin: 150, coinMax: 210, xpMin: 95, xpMax: 140, lootChance: 0.3, loot: ['🗿 Muhafız Rünü'], craftingMaterial: '📖 Yasak Büyü Kitabı', artUrl: getBossArtUrl('ruinGuardian'), special: 'Kadim Sarsıntı', specialType: 'heavy' },
  { minLevel: 20, name: '👹 Kuzey İblisi', region: 'Kuzey Toprakları', maxHp: 330, minDamage: 13, maxDamage: 20, coinMin: 230, coinMax: 320, xpMin: 150, xpMax: 210, lootChance: 0.35, loot: ['🩸 Kuzey İblisinin Kalbi'], craftingMaterial: '🐉 Ejderha Pulu', artUrl: getBossArtUrl('northDemon'), special: 'Mana Kemiren Lanet', specialType: 'drain' },
  { minLevel: 35, name: '🩸 Büyük İblis Komutanı', region: 'Kuzey Yaylaları', maxHp: 470, minDamage: 16, maxDamage: 24, coinMin: 340, coinMax: 470, xpMin: 220, xpMax: 310, lootChance: 0.45, loot: ['🩸 İblis Komutanının Kanı'], craftingMaterial: '🌙 Efsunlu Elf Yadigârı', artUrl: getBossArtUrl('demonCommander'), special: 'Komutanın Hiddeti', specialType: 'heavy' },
  { minLevel: 50, name: '👑 Äußerst Sınavının İblis Efendisi', region: 'Äußerst Sınav Rotası', maxHp: 650, minDamage: 20, maxDamage: 29, coinMin: 500, coinMax: 700, xpMin: 330, xpMax: 460, lootChance: 0.55, loot: ['🩸 İblis Komutanının Kanı', '🗿 Muhafız Rünü', '🩸 Kuzey İblisinin Kalbi'], craftingMaterial: '👑 Himmel’in Efsanevi Yadigârı', artUrl: getBossArtUrl('ausserstLord'), special: 'Äußerst Büyü Patlaması', specialType: 'arcane' }
];

function hpBar(current, maximum, width = 10) {
  const max = Math.max(1, Number(maximum) || 1);
  const ratio = Math.max(0, Math.min(1, Number(current) / max));
  const filled = Math.round(ratio * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function battleEmbed({ player, bossHp, bossMaxHp = 160, bossName = 'İblis', bossRegion = 'Kuzey Sınırı', playerHp, playerMaxHp = PLAYER_MAX_HP, playerMana = 100, playerMaxMana = 100, attack = 10, defense = 5, bonus, description, bossImageUrl = null, won = false, lost = false }) {
  const embed = new EmbedBuilder()
    .setColor(won ? 0x65d6a6 : lost ? 0xe06c75 : 0x9b8cff)
    .setTitle(won ? `🏆 ${bossName} yenildi!` : lost ? '🌑 Büyücü düştü...' : `⚔️ ${bossName} • ${bossRegion}`)
    .setDescription(description)
    .addFields(
      {
        name: '🧙 Gezgin',
        value: `❤️ \`${hpBar(playerHp, playerMaxHp)}\` **${Math.max(0, playerHp)}/${playerMaxHp} HP** · 🔮 **${playerMana}/${playerMaxMana} Mana**\n⚔️ Saldırı: **${attack}** · 🛡️ Savunma: **${defense}**\n✨ Karakter bonusu: +${bonus} hasar`,
        inline: true
      },
      {
        name: `👹 ${bossName}`,
        value: `🩸 \`${hpBar(bossHp, bossMaxHp)}\` **${Math.max(0, bossHp)}/${bossMaxHp} HP**\n${getBossPhase(bossHp, bossMaxHp) === 3 ? '🌑 Son aşama' : getBossPhase(bossHp, bossMaxHp) === 2 ? '🔥 İkinci aşama' : '🌒 İlk aşama'}`,
        inline: true
      }
    )
    .setFooter({ text: 'Poğaça Frieren • Kuzey sınırında her büyü önemlidir.' })
    .setTimestamp();
  if (player?.displayAvatarURL) embed.setThumbnail(player.displayAvatarURL());
  if (bossImageUrl) embed.setImage(bossImageUrl);
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

function rareActionRow(disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('demon_chain').setLabel('Yıldırım Zinciri · 22').setEmoji('⚡').setStyle(ButtonStyle.Danger).setDisabled(disabled),
    new ButtonBuilder().setCustomId('demon_wall').setLabel('Taş Duvar · 12').setEmoji('🪨').setStyle(ButtonStyle.Primary).setDisabled(disabled),
    new ButtonBuilder().setCustomId('demon_burst').setLabel('Mana Patlaması · 30').setEmoji('🌌').setStyle(ButtonStyle.Danger).setDisabled(disabled)
  );
}

export default {
  data: new SlashCommandBuilder()
    .setName('iblisavasi')
    .setDescription('Hazırlığını kontrol et, büyü hamlelerini seç ve aşamalı bir iblis boss ile tek başına savaş.'),

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
    // Zoltraak is the player's starting spell; it must remain usable even before any paid spell is learned.
    const learnedSpells = new Set(['zoltraak', ...knownSpellResult.rows.map(row => row.spell_key)]);

    const masteryResult = await pool.query(
      'SELECT spell_key, casts, mastery_level FROM spell_mastery WHERE guild_id=$1 AND user_id=$2',
      [interaction.guildId, interaction.user.id]
    );
    const spellMastery = new Map(masteryResult.rows.map(row => [row.spell_key, Number(row.mastery_level)]));

    const statsResult = await pool.query(
      `SELECT hp, max_hp, mana, max_mana, attack, defense, level, class_name, active_build,
        COALESCE((SELECT attack_rank FROM user_talents t WHERE t.guild_id=users.guild_id AND t.user_id=users.user_id),0) AS talent_attack,
        COALESCE((SELECT defense_rank FROM user_talents t WHERE t.guild_id=users.guild_id AND t.user_id=users.user_id),0) AS talent_defense,
        COALESCE((SELECT hp_rank FROM user_talents t WHERE t.guild_id=users.guild_id AND t.user_id=users.user_id),0) AS talent_hp,
        COALESCE((SELECT mana_rank FROM user_talents t WHERE t.guild_id=users.guild_id AND t.user_id=users.user_id),0) AS talent_mana
        FROM users WHERE guild_id=$1 AND user_id=$2`,
      [interaction.guildId, interaction.user.id]
    );
    const stats = statsResult.rows[0];
    if (Number(stats.hp) <= 0) {
      return interaction.editReply('🌑 Canın tükenmiş. Yeniden savaşa çıkmadan önce **/dinlen** komutuyla HP ve mananı yenilemelisin.');
    }

    // Bir gezgin aynı anda keşif, zindan veya birden fazla boss savaşında HP/Mana durumunu ezmesin.
    const reservationDb = await pool.connect();
    let reservationCreated = false;
    try {
      await reservationDb.query('BEGIN');
      await reservationDb.query(
        'DELETE FROM active_rpg_encounters WHERE guild_id=$1 AND user_id=$2 AND expires_at <= NOW()',
        [interaction.guildId, interaction.user.id]
      );
      const reserved = await reservationDb.query(
        "INSERT INTO active_rpg_encounters (guild_id,user_id,encounter_id,encounter_type,expires_at) VALUES ($1,$2,$3,'boss',NOW()+INTERVAL '30 minutes') ON CONFLICT (guild_id,user_id) DO NOTHING",
        [interaction.guildId, interaction.user.id, interaction.id]
      );
      if (!reserved.rowCount) {
        await reservationDb.query('ROLLBACK');
        return interaction.editReply('⚔️ Zaten devam eden bir savaşın veya karşılaşman var. Önce onu bitir ya da süresinin dolmasını bekle.');
      }
      await reservationDb.query('COMMIT');
      reservationCreated = true;
    } catch (error) {
      await reservationDb.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      reservationDb.release();
    }
    const releaseReservation = async () => {
      if (!reservationCreated) return;
      await pool.query(
        'DELETE FROM active_rpg_encounters WHERE guild_id=$1 AND user_id=$2 AND encounter_id=$3',
        [interaction.guildId, interaction.user.id, interaction.id]
      ).catch(error => console.error('Boss karşılaşma kilidi kaldırılamadı:', error));
      reservationCreated = false;
    };
    const equippedResult = await pool.query(
      'SELECT item_key, slot FROM user_equipment WHERE guild_id=$1 AND user_id=$2',
      [interaction.guildId, interaction.user.id]
    );
    const equippedItems = equippedResult.rows
      .map(row => equipmentItems.find(item => item.name === row.item_key))
      .filter(Boolean);
    const gearBonus = applyEquipmentSetBonus(equippedItems, equipmentBonus(equippedItems));
    const build = getCharacterBuild(stats.active_build);
    const playerMaxHp = Math.min(2000, Math.round((Number(stats.max_hp) + gearBonus.hp) * build.hp * (1 + Number(stats.talent_hp) * 0.05)));
    const playerMaxMana = Math.min(2000, Math.round((Number(stats.max_mana) + gearBonus.mana) * build.mana * (1 + Number(stats.talent_mana) * 0.05)));
    const classProfile = getCharacterClass(stats.class_name);
    const attack = Math.min(500, Math.round((Number(stats.attack) + gearBonus.attack) * build.attack * (1 + Number(stats.talent_attack) * 0.04)));
    const defense = Math.min(250, Math.round(applyClassDefense(Number(stats.defense) + gearBonus.defense, stats.class_name) * build.defense * (1 + Number(stats.talent_defense) * 0.04)));
    let playerHp = Math.min(playerMaxHp, Math.round((Number(stats.hp) / Math.max(1, Number(stats.max_hp))) * playerMaxHp));
    let playerMana = Math.min(playerMaxMana, Math.round((Number(stats.mana) / Math.max(1, Number(stats.max_mana))) * playerMaxMana));
    // Combat HP and mana are scaled by gear/build; persist each value as a base-stat ratio.
    const toPersistentHp = hp => Math.max(0, Math.min(Number(stats.max_hp), Math.round((hp / Math.max(1, playerMaxHp)) * Number(stats.max_hp))));
    const toPersistentMana = mana => Math.max(0, Math.min(Number(stats.max_mana), Math.round((mana / Math.max(1, playerMaxMana)) * Number(stats.max_mana))));
    const gearSummary = [
      equippedItems.length
        ? equippedItems.map(item => item.name + ' (' + formatEquipmentBonus(item) + ')').join('\n')
        : 'Henüz ekipman kuşanılmadı. /market ve /ekipman komutlarını kullan.',
      gearBonus.setText ? '✨ **' + gearBonus.setText + '**' : null
    ].filter(Boolean).join('\n');

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
      await releaseReservation();
      return interaction.editReply(`⏳ Mana gücünü toparlamalısın. Yeni iblis avına <t:${Math.ceil(next / 1000)}:R> çıkabilirsin.`);
    }

    const upgrades = await pool.query(
      'SELECT COALESCE(MAX(upgrade_level),0)::int AS level FROM character_upgrades WHERE guild_id=$1 AND user_id=$2',
      [interaction.guildId, interaction.user.id]
    );
    const upgradeBonus = Number(upgrades.rows[0]?.level || 0) * 2;
    const playerLevel = Number(stats.level || 1);
    const unlockedBossTiers = bossTiers.filter(tier => playerLevel >= tier.minLevel);
    // Rotate among unlocked tiers so earlier bosses remain replayable and journal collections can be completed.
    const boss = unlockedBossTiers[Math.floor(Math.random() * unlockedBossTiers.length)] || bossTiers[0];
    let bossHp = boss.maxHp;
    let bossPhase = 1;
    let turnCount = 0;
    let shield = false;
    let shieldReduction = 0.5;
    let fortifiedReduction = 0.75;
    let healUsed = false;
    let busy = false;
    let finished = false;

    const renderBattleEmbed = options => battleEmbed({
      ...options,
      bossMaxHp: boss.maxHp,
      bossName: boss.name,
      bossRegion: boss.region,
      bossImageUrl: boss.artUrl,
      playerMaxHp,
      playerMana,
      playerMaxMana,
      attack,
      defense
    });

    const initial = renderBattleEmbed({
      player: interaction.user,
      bossHp,
      playerHp,
      bonus: upgradeBonus,
      description: `Kuzey sınırında yolunu kesen **${boss.name}** ile karşı karşıyasın, <@${interaction.user.id}>. Hamle yapmak için aşağıdaki büyü düğmelerini kullan; mana bedelini ve öğrenme gereksinimini düğme adından kontrol et.\n\n**Hamle rehberi**\n⚡ **Zoltraak:** temel, dengeli saldırı.\n🔥 **Alev Küresi:** daha yüksek hasar.\n🧊 **Buz Mızrağı:** uygun olduğunda boss’un karşı hamlesini durdurabilir.\n🛡️ **Kalkan / Taş Duvar:** gelen hasarı azaltmaya yardımcı olur.\n💚 **Şifa:** bu savaşta sınırlı kullanım hakkıyla can yeniler.\n🌌 **Mana Patlaması / Yıldırım Zinciri:** açılmış ve öğrenilmişse özel saldırı seçenekleri sunar.\n\n**Savaşa girmeden önce**\n• HP ve Mana düşükse **/dinlen** kullan.\n• **/ekipman**, **/buyular** ve **/profil** ile hazırlığını kontrol et.\n• Boss’un canı azaldıkça yeni aşamalara geçebileceğini unutma; son aşamalar daha tehlikelidir.\n\n**Kuşanılan ekipman**\n${gearSummary}\nEkipman bonusları saldırı, savunma ve maksimum kaynak değerlerine uygulanır.\n**Sınıf:** ${classProfile.label} — ${classProfile.description}\n**Savaş yapısı:** ${build.label} — ${build.description}`
    });
    await interaction.editReply({ embeds: [initial], components: [actionRow(), rareActionRow()] });
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
          demon_heal: 'sifa_isigi',
          demon_chain: 'yildirim_zinciri',
          demon_wall: 'tas_duvar',
          demon_burst: 'mana_patlamasi'
        }[button.customId];
        if (requiredSpell && !learnedSpells.has(requiredSpell)) {
          busy = false;
          const spellNames = {
            zoltraak: 'Zoltraak',
            alev_kuresi: 'Alev Küresi',
            buz_mizragi: 'Buz Mızrağı',
            koruyucu_bariyer: 'Koruyucu Bariyer',
            sifa_isigi: 'Şifa Işığı',
            yildirim_zinciri: 'Yıldırım Zinciri',
            tas_duvar: 'Taş Duvar',
            mana_patlamasi: 'Mana Patlaması'
          };
          return button.reply({
            content: `Bu büyüyü henüz öğrenmedin. ${spellNames[requiredSpell] ? `**${spellNames[requiredSpell]}** için /buyuogren komutunu kullan.` : 'Başlangıç büyün hazır.'}`,
            ephemeral: true
          });
        }

        let actionText = '';
        let spellUsed = null;
        let fortified = false;
        let frozenBoss = false;
        if (button.customId === 'demon_attack') {
          const spellCost = applyClassManaCost(8, stats.class_name);
          if (playerMana < spellCost) {
            busy = false;
            return button.reply({ content: `Zoltraak için en az **${spellCost} Mana** gerekiyor. /dinlen ile mananı yenileyebilirsin.`, ephemeral: true });
          }
          playerMana -= spellCost;
          spellUsed = 'zoltraak';
          const damage = applyClassDamage(Math.floor(Math.random() * 13) + 18 + attack + upgradeBonus + (spellMastery.get('zoltraak') || 0) * 2 + getSpellMasteryAwakening('zoltraak', spellMastery.get('zoltraak')).damage, stats.class_name);
          bossHp = Math.max(0, bossHp - damage);
          actionText = `⚡ Zoltraak isabet etti! İblise **${damage} hasar** verdin. (Saldırı: ${attack}, Mana: −${spellCost})`;
        } else if (button.customId === 'demon_fire') {
          const spellCost = applyClassManaCost(14, stats.class_name);
          if (playerMana < spellCost) {
            busy = false;
            return button.reply({ content: `Alev Küresi için en az **${spellCost} Mana** gerekiyor.`, ephemeral: true });
          }
          playerMana -= spellCost;
          spellUsed = 'alev_kuresi';
          const damage = applyClassDamage(Math.floor(Math.random() * 13) + 28 + attack + upgradeBonus + (spellMastery.get('alev_kuresi') || 0) * 2 + getSpellMasteryAwakening('alev_kuresi', spellMastery.get('alev_kuresi')).damage, stats.class_name);
          bossHp = Math.max(0, bossHp - damage);
          actionText = `🔥 Alev Küresi patladı! İblise **${damage} hasar** verdin. (Mana: −${spellCost})`;
        } else if (button.customId === 'demon_ice') {
          const spellCost = applyClassManaCost(12, stats.class_name);
          if (playerMana < spellCost) {
            busy = false;
            return button.reply({ content: `Buz Mızrağı için en az **${spellCost} Mana** gerekiyor.`, ephemeral: true });
          }
          playerMana -= spellCost;
          spellUsed = 'buz_mizragi';
          const damage = applyClassDamage(Math.floor(Math.random() * 11) + 22 + attack + upgradeBonus + (spellMastery.get('buz_mizragi') || 0) * 2 + getSpellMasteryAwakening('buz_mizragi', spellMastery.get('buz_mizragi')).damage, stats.class_name);
          bossHp = Math.max(0, bossHp - damage);
          const freezeChance = Math.min(0.7, 0.35 + (spellMastery.get(spellUsed) || 0) * 0.025 + getSpellMasteryAwakening(spellUsed, spellMastery.get(spellUsed)).freezeChance);
          frozenBoss = Math.random() < freezeChance;
          actionText = `🧊 Buz Mızrağı isabet etti! İblise **${damage} hasar** verdin. Donma ihtimali: **%${Math.round(freezeChance * 100)}** (Mana: −${spellCost})${frozenBoss ? '\n❄️ İblis dondu ve bu tur karşı saldırı yapamadı!' : ''}`;
        } else if (button.customId === 'demon_defend') {
          const spellCost = applyClassManaCost(6, stats.class_name);
          if (playerMana < spellCost) {
            busy = false;
            return button.reply({ content: `Savunma büyüsü için en az **${spellCost} Mana** gerekiyor. /dinlen ile mananı yenileyebilirsin.`, ephemeral: true });
          }
          playerMana -= spellCost;
          spellUsed = 'koruyucu_bariyer';
          shield = true;
          shieldReduction = Math.min(0.85, 0.5 + (spellMastery.get(spellUsed) || 0) * 0.03 + getSpellMasteryAwakening(spellUsed, spellMastery.get(spellUsed)).shieldReduction);
          actionText = `🛡️ Koruyucu büyü kurdun. Bir sonraki boss saldırısının **%${Math.round(shieldReduction * 100)}** kadarını engelleyecek. (Mana: −${spellCost})`;
        } else if (button.customId === 'demon_heal') {
          if (healUsed) {
            busy = false;
            return button.reply({ content: 'İyileşme büyünü bu savaşta zaten kullandın.', ephemeral: true });
          }
          const spellCost = applyClassManaCost(20, stats.class_name);
          if (playerMana < spellCost) {
            busy = false;
            return button.reply({ content: `İyileşme büyüsü için en az **${spellCost} Mana** gerekiyor. /dinlen ile mananı yenileyebilirsin.`, ephemeral: true });
          }
          playerMana -= spellCost;
          spellUsed = 'sifa_isigi';
          const before = playerHp;
          const healAmount = applyClassHealing(Math.floor(Math.random() * 16) + 20 + (spellMastery.get(spellUsed) || 0) * 3 + getSpellMasteryAwakening(spellUsed, spellMastery.get(spellUsed)).healing, stats.class_name);
          playerHp = Math.min(playerMaxHp, playerHp + healAmount);
          healUsed = true;
          actionText = `💚 İyileşme büyüsüyle **${playerHp - before} HP** geri kazandın. Ustalık bonusu: **+${(spellMastery.get(spellUsed) || 0) * 3}** iyileştirme. (Mana: −${spellCost})`;
        }

        if (button.customId === 'demon_chain') {
          const spellCost = applyClassManaCost(22, stats.class_name);
          if (playerMana < spellCost) { busy = false; return button.reply({ content: `Yıldırım Zinciri için en az **${spellCost} Mana** gerekiyor.`, ephemeral: true }); }
          playerMana -= spellCost; spellUsed = 'yildirim_zinciri';
          const damage = applyClassDamage(Math.floor(Math.random() * 16) + 42 + attack + upgradeBonus + (spellMastery.get(spellUsed) || 0) * 2 + getSpellMasteryAwakening(spellUsed, spellMastery.get(spellUsed)).damage, stats.class_name);
          bossHp = Math.max(0, bossHp - damage); actionText = `⚡ **Yıldırım Zinciri** hedefi sardı ve **${damage} hasar** verdi. (Mana: −${spellCost})`;
        } else if (button.customId === 'demon_wall') {
          const spellCost = applyClassManaCost(12, stats.class_name);
          if (playerMana < spellCost) { busy = false; return button.reply({ content: `Taş Duvar için en az **${spellCost} Mana** gerekiyor.`, ephemeral: true }); }
          playerMana -= spellCost; spellUsed = 'tas_duvar'; fortified = true;
          fortifiedReduction = Math.min(0.95, 0.75 + (spellMastery.get(spellUsed) || 0) * 0.015 + getSpellMasteryAwakening(spellUsed, spellMastery.get(spellUsed)).wallReduction);
          actionText = `🪨 **Taş Duvar** yükseldi. Bu tur boss hasarının **%${Math.round(fortifiedReduction * 100)}** kadarını engelleyecek. (Mana: −${spellCost})`;
        } else if (button.customId === 'demon_burst') {
          const spellCost = applyClassManaCost(30, stats.class_name);
          if (playerMana < spellCost) { busy = false; return button.reply({ content: `Mana Patlaması için en az **${spellCost} Mana** gerekiyor.`, ephemeral: true }); }
          playerMana -= spellCost; spellUsed = 'mana_patlamasi';
          const damage = applyClassDamage(Math.floor(Math.random() * 21) + 65 + attack + upgradeBonus + (spellMastery.get(spellUsed) || 0) * 3 + getSpellMasteryAwakening(spellUsed, spellMastery.get(spellUsed)).damage, stats.class_name);
          bossHp = Math.max(0, bossHp - damage); actionText = `🌌 **Mana Patlaması** büyük bir enerji dalgası oluşturdu: **${damage} hasar**! (Mana: −${spellCost})`;
        }

        if (bossHp <= 0) {
          const rewardCoins = boss.coinMin + Math.floor(Math.random() * (boss.coinMax - boss.coinMin + 1));
          const rewardXp = boss.xpMin + Math.floor(Math.random() * (boss.xpMax - boss.xpMin + 1));
          const bonusLoot = Math.random() < boss.lootChance
            ? boss.loot[Math.floor(Math.random() * boss.loot.length)]
            : null;
          const db = await pool.connect();
          try {
            await db.query('BEGIN');
            await db.query(
              `UPDATE users SET hp=$3, mana=$4, coins=coins+$5, xp=xp+$6, boss_defeats=boss_defeats+1, last_boss_win_at=NOW(),
                stat_points=stat_points+GREATEST(0,(FLOOR(SQRT((xp+$6)::numeric / 100))::int + 1)-level),
                level=FLOOR(SQRT((xp+$6)::numeric / 100))::int + 1
               WHERE guild_id=$1 AND user_id=$2`,
              [interaction.guildId, interaction.user.id, toPersistentHp(playerHp), toPersistentMana(playerMana), rewardCoins, rewardXp]
            );
            const journalBossKey = boss.name.includes('Schattenwolf') ? 'schattenwolf'
              : boss.name.includes('Harabe Muhafızı') ? 'ruinGuardian'
                : boss.name.includes('Kuzey İblisi') ? 'northDemon'
                  : boss.name.includes('Komutanı') ? 'demonCommander'
                    : boss.name.includes('Äußerst') || boss.name.includes('Außerst') || boss.name.includes('Ausserst') ? 'ausserstLord'
                      : null;
            if (journalBossKey) await recordJournalEntry(db, interaction.guildId, interaction.user.id, 'bosses', journalBossKey);
            if (spellUsed) {
              const masteryUpdate = await db.query(
                `INSERT INTO spell_mastery (guild_id,user_id,spell_key,casts,mastery_level,updated_at)
                 VALUES ($1,$2,$3,1,0,NOW())
                 ON CONFLICT (guild_id,user_id,spell_key) DO UPDATE
                 SET casts=spell_mastery.casts+1,
                     mastery_level=LEAST(10,FLOOR((spell_mastery.casts+1)/10.0)::int),
                     updated_at=NOW()
                 RETURNING casts,mastery_level`,
                [interaction.guildId, interaction.user.id, spellUsed]
              );
              spellMastery.set(spellUsed, Number(masteryUpdate.rows[0].mastery_level));
              actionText += `\n📈 **${spellUsed.replaceAll('_', ' ')} ustalığı:** ${masteryUpdate.rows[0].casts} kullanım · Seviye ${masteryUpdate.rows[0].mastery_level}/10`;
            }
            await db.query(
              `INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,'💎 Mana Kristali',1)
               ON CONFLICT(guild_id,user_id,item_key) DO UPDATE SET quantity=inventory.quantity+1`,
              [interaction.guildId, interaction.user.id]
            );
            if (bonusLoot) {
              await db.query(
                `INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,$3,1)
                 ON CONFLICT(guild_id,user_id,item_key) DO UPDATE SET quantity=inventory.quantity+1`,
                [interaction.guildId, interaction.user.id, bonusLoot]
              );
            }
            await db.query(
              `INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,$3,1)
               ON CONFLICT(guild_id,user_id,item_key) DO UPDATE SET quantity=inventory.quantity+1`,
              [interaction.guildId, interaction.user.id, boss.craftingMaterial]
            );
            await db.query(
              'DELETE FROM active_rpg_encounters WHERE guild_id=$1 AND user_id=$2 AND encounter_id=$3',
              [interaction.guildId, interaction.user.id, interaction.id]
            );
            await db.query('COMMIT');
            reservationCreated = false;
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
              description: `${actionText}\n\n🌟 **Zafer!** **${boss.name}** yenildi.\nÖdülün: **${rewardCoins} altın**, **${rewardXp} XP** ve **💎 Mana Kristali ×1** ve ⚒️ **${boss.craftingMaterial} ×1**.${bonusLoot ? `\n🎁 Ek ganimet: **${bonusLoot} ×1** (%${Math.round(boss.lootChance * 100)} ihtimal).` : ''}`
            })],
            components: []
          });
        }

        const nextBossPhase = getBossPhase(bossHp, boss.maxHp);
        if (nextBossPhase > bossPhase) {
          bossPhase = nextBossPhase;
          actionText += bossPhase === 2
            ? `\n🔥 **${boss.name} ikinci aşamaya girdi!** Saldırıları artık %10 daha güçlü.`
            : `\n🌑 **${boss.name} son aşamasına geçti!** Saldırıları artık %25 daha güçlü ve özel hamleleri sertleşti.`;
        }
        turnCount += 1;
        const rawBossDamage = Math.floor(Math.random() * (boss.maxDamage - boss.minDamage + 1)) + boss.minDamage;
        let bossDamage = calculateBossIncomingDamage(rawBossDamage, defense, bossPhase);
        if (turnCount % 3 === 0 && !frozenBoss) {
          const specialDamage = (boss.specialType === 'arcane' ? 12 : boss.specialType === 'heavy' ? 8 : 5) + bossPhaseSpecialBonus(bossPhase);
          bossDamage += specialDamage;
          actionText += `\n💥 **${boss.special}**! Boss özel saldırı yaptı ve hasarını **+${specialDamage}** artırdı.`;
          if (boss.specialType === 'drain') {
            const drainedMana = Math.min(10, playerMana);
            playerMana -= drainedMana;
            actionText += `\n🔮 Lanet **${drainedMana} Mana** emdi!`;
          }
        } else if (turnCount % 3 === 0 && frozenBoss) {
          actionText += '\n❄️ Donma etkisi bossun özel saldırısını da durdurdu!';
        }
        if (frozenBoss) bossDamage = 0;
        if (fortified && bossDamage > 0) {
          bossDamage = Math.ceil(bossDamage * (1 - fortifiedReduction));
          fortified = false;
          actionText += `\n🪨 Taş Duvar boss saldırısının %${Math.round(fortifiedReduction * 100)} kadarını engelledi.`;
        }
        if (shield && bossDamage > 0) {
          bossDamage = Math.ceil(bossDamage * (1 - shieldReduction));
          shield = false;
          actionText += `\n🛡️ Koruyucu Bariyer saldırının %${Math.round(shieldReduction * 100)} kadarını engelledi.`;
        }
        playerHp = Math.max(0, playerHp - bossDamage);
        actionText += bossDamage > 0
          ? `\n👹 İblis karşılık verdi: **${bossDamage} hasar** aldın.`
          : '\n❄️ Donduğu için iblis bu tur saldıramadı.';

        // Persist each non-victory turn's HP/mana and spell mastery atomically.
        const turnDb = await pool.connect();
        try {
          await turnDb.query('BEGIN');
          await turnDb.query(
            'UPDATE users SET hp=$3, mana=$4 WHERE guild_id=$1 AND user_id=$2',
            [interaction.guildId, interaction.user.id, toPersistentHp(playerHp), toPersistentMana(playerMana)]
          );
          if (spellUsed) {
            const masteryUpdate = await turnDb.query(
              `INSERT INTO spell_mastery (guild_id,user_id,spell_key,casts,mastery_level,updated_at)
               VALUES ($1,$2,$3,1,0,NOW())
               ON CONFLICT (guild_id,user_id,spell_key) DO UPDATE
               SET casts=spell_mastery.casts+1,
                   mastery_level=LEAST(10,FLOOR((spell_mastery.casts+1)/10.0)::int),
                   updated_at=NOW()
               RETURNING casts,mastery_level`,
              [interaction.guildId, interaction.user.id, spellUsed]
            );
            spellMastery.set(spellUsed, Number(masteryUpdate.rows[0].mastery_level));
            actionText += `\n📈 **${spellUsed.replaceAll('_', ' ')} ustalığı:** ${masteryUpdate.rows[0].casts} kullanım · Seviye ${masteryUpdate.rows[0].mastery_level}/10`;
          }
          if (playerHp <= 0) {
            await turnDb.query(
              'DELETE FROM active_rpg_encounters WHERE guild_id=$1 AND user_id=$2 AND encounter_id=$3',
              [interaction.guildId, interaction.user.id, interaction.id]
            );
            reservationCreated = false;
          }
          await turnDb.query('COMMIT');
        } catch (error) {
          await turnDb.query('ROLLBACK').catch(() => {});
          throw error;
        } finally {
          turnDb.release();
        }

        if (playerHp <= 0) {
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

        await button.update({
          embeds: [renderBattleEmbed({ player: interaction.user, bossHp, playerHp, bonus: upgradeBonus, description: actionText })],
          components: [actionRow(), rareActionRow()]
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
      await releaseReservation();
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
