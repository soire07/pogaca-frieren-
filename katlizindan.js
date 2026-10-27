import { ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, EmbedBuilder, ComponentType } from 'discord.js';
import { pool, ensureUser } from './database/db.js';
import { equipmentItems, equipmentBonus } from './equipment-data.js';
import { levelForXp } from './utils.js';
import { dungeonChoiceOutcome, dungeonEnemyStats, applyEquipmentSetBonus, progressionMilestone, applyClassDamage, applyClassDefense, applyClassHealing, applyClassManaCost, getCharacterClass, getCharacterBuild } from './rpg-mechanics.js';

const FLOORS = 5;
const COOLDOWN_MS = 30 * 60_000;
const LOOT = ['Orman Kristali', 'Kadim Rün Parçası', 'Kuzey Mührü'];
const FLOOR_NAMES = ['🌲 Köklerin Koridoru', '🗿 Kadim Harabeler', '🌫️ Sisli Geçit', '🔥 Küller Salonu', '👑 Mühürlü İblis Lordu'];
const PARTY_ROLES = { tank: { label: '🛡️ Muhafız', hp: 1.25, attack: 0.85, defense: 1.4 }, healer: { label: '💚 Şifacı', hp: 1, attack: 0.9, defense: 1.05 }, damage: { label: '⚔️ Hasar Ustası', hp: 0.95, attack: 1.3, defense: 0.9 } };

export default {
  data: new SlashCommandBuilder()
    .setName('katlizindan')
    .setDescription('En fazla 4 maceracıyla beş katlı ortak zindana gir.')
    .addUserOption(o => o.setName('takim_arkadasi').setDescription('Birinci takım arkadaşın').setRequired(true))
    .addUserOption(o => o.setName('takim_arkadasi_2').setDescription('İkinci takım arkadaşı (isteğe bağlı)').setRequired(false))
    .addUserOption(o => o.setName('takim_arkadasi_3').setDescription('Üçüncü takım arkadaşı (isteğe bağlı)').setRequired(false))
    .addStringOption(o => o.setName('zorluk').setDescription('Zindan zorluğu').setRequired(false).addChoices({name:'Kolay',value:'easy'},{name:'Normal',value:'normal'},{name:'Kâbus',value:'nightmare'})),

  async execute(interaction) {
    if (!interaction.guildId || !interaction.channel) {
      return interaction.reply({ content: 'Katlı zindan yalnızca sunucularda kullanılabilir.', ephemeral: true });
    }
    if (interaction.options.getUser('takim_arkadasi_3') && !interaction.options.getUser('takim_arkadasi_2')) {
      return interaction.reply({ content: 'Üçüncü takım arkadaşını eklemek için ikinci takım arkadaşını da seçmelisin.', ephemeral: true });
    }
    const team = [
      interaction.user,
      interaction.options.getUser('takim_arkadasi', true),
      interaction.options.getUser('takim_arkadasi_2'),
      interaction.options.getUser('takim_arkadasi_3')
    ].filter(Boolean);
    if (new Set(team.map(u => u.id)).size !== team.length || team.some((u, i) => i > 0 && u.bot)) {
      return interaction.reply({ content: 'Takımda bot veya tekrar eden oyuncu olamaz.', ephemeral: true });
    }
    for (const user of team) await ensureUser(interaction.guildId, user.id);

    const invited = team.slice(1);
    const row = new ActionRowBuilder().addComponents(
      ...invited.map(u => new ButtonBuilder()
        .setCustomId(`katlizindan:accept:${interaction.id}:${u.id}`)
        .setLabel(`Katıl: ${u.username}`.slice(0, 80))
        .setStyle(ButtonStyle.Success)),
      new ButtonBuilder().setCustomId(`katlizindan:decline:${interaction.id}`).setLabel('Reddet').setStyle(ButtonStyle.Secondary)
    );
    const message = await interaction.reply({
      content: `🧭 ${invited.map(u => `<@${u.id}>`).join(' ')} — <@${interaction.user.id}> seni **5 katlı ortak zindana** davet ediyor. Her davetli 60 saniye içinde kendi düğmesine basmalı. Davet kabul edilince herkes kendi rolünü seçecek.`,
      components: [row], allowedMentions: { users: team.map(u => u.id) }, fetchReply: true
    });

    const inviteIds = new Set(invited.map(u => u.id));
    const accepted = new Set();
    const started = await new Promise(resolve => {
      const collector = message.createMessageComponentCollector({
        time: 60_000,
        filter: c => inviteIds.has(c.user.id) &&
          (c.customId === `katlizindan:decline:${interaction.id}` ||
           c.customId === `katlizindan:accept:${interaction.id}:${c.user.id}`)
      });
      collector.on('collect', async c => {
        if (c.customId === `katlizindan:decline:${interaction.id}`) {
          await c.update({ content: `❌ <@${c.user.id}> daveti reddetti. Zindan başlamadı.`, components: [] });
          collector.stop('declined');
          return;
        }
        accepted.add(c.user.id);
        await c.deferUpdate();
        if (accepted.size === inviteIds.size) collector.stop('accepted');
      });
      collector.once('end', async (_collected, reason) => {
        const ok = reason === 'accepted';
        if (ok) await interaction.editReply({ content: '⚔️ Bütün yol arkadaşları hazır. Beş katlı zindan açılıyor...', components: [] });
        else await interaction.editReply({
          content: reason === 'time' ? '⌛ Davet süresi doldu; herkes kabul etmediği için zindan başlamadı.' : '❌ Zindan daveti iptal edildi.',
          components: []
        }).catch(() => {});
        resolve(ok);
      });
    });
    if (!started) return;

    const roleRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`katlizindan:role:tank:${interaction.id}`).setLabel('🛡️ Muhafız').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`katlizindan:role:healer:${interaction.id}`).setLabel('💚 Şifacı').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`katlizindan:role:damage:${interaction.id}`).setLabel('⚔️ Hasar Ustası').setStyle(ButtonStyle.Primary)
    );
    const roleMessage = await interaction.editReply({
      content: `🎭 **Herkes kendi rolünü seçsin!** ${team.map(u => `<@${u.id}>`).join(' ')}\nEn fazla bir Muhafız ve bir Şifacı olabilir. Her oyuncu rol düğmelerinden birine bassın.`,
      components: [roleRow],
      allowedMentions: { users: team.map(u => u.id) }
    });
    const chosenRoles = new Map();
    const roleResult = await new Promise(resolve => {
      const collector = roleMessage.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 60_000,
        filter: c => team.some(u => u.id === c.user.id) && c.customId.startsWith('katlizindan:role:') && c.customId.endsWith(interaction.id)
      });
      collector.on('collect', async c => {
        const role = c.customId.split(':')[2];
        const previous = chosenRoles.get(c.user.id);
        const conflict = [...chosenRoles.entries()].some(([userId, selected]) =>
          userId !== c.user.id && selected === role && (role === 'tank' || role === 'healer')
        );
        if (conflict) {
          await c.reply({ content: role === 'tank' ? 'Bu takımda Muhafız rolü zaten seçildi. Şifacı veya Hasar Ustası seç.' : 'Bu takımda Şifacı rolü zaten seçildi. Muhafız veya Hasar Ustası seç.', ephemeral: true }).catch(() => {});
          return;
        }
        chosenRoles.set(c.user.id, role);
        await c.reply({ content: `Rolün: ${PARTY_ROLES[role].label}`, ephemeral: true }).catch(() => {});
        if (chosenRoles.size === team.length) collector.stop('roles-ready');
      });
      collector.once('end', (_all, reason) => resolve(reason === 'roles-ready'));
    });
    if (!roleResult) {
      return interaction.editReply({ content: '⌛ Herkes rol seçmediği için zindan başlamadı. Yeniden davet oluşturabilirsin.', components: [] });
    }
    const roles = team.map(user => chosenRoles.get(user.id));
    await interaction.editReply({
      content: `⚔️ Takım hazır: ${team.map((u, i) => `<@${u.id}> — ${PARTY_ROLES[roles[i]].label}`).join(' · ')}\nZindan kapıları açılıyor…`,
      components: []
    });

    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      const ids = team.map(u => u.id).sort();
      const result = await db.query(
        `SELECT user_id, level, xp, coins, hp, max_hp, mana, max_mana, attack, defense, class_name, active_build, last_dungeon_at,
         COALESCE((SELECT attack_rank FROM user_talents t WHERE t.guild_id=users.guild_id AND t.user_id=users.user_id),0) AS talent_attack,
         COALESCE((SELECT defense_rank FROM user_talents t WHERE t.guild_id=users.guild_id AND t.user_id=users.user_id),0) AS talent_defense,
         COALESCE((SELECT hp_rank FROM user_talents t WHERE t.guild_id=users.guild_id AND t.user_id=users.user_id),0) AS talent_hp,
         COALESCE((SELECT mana_rank FROM user_talents t WHERE t.guild_id=users.guild_id AND t.user_id=users.user_id),0) AS talent_mana
         FROM users WHERE guild_id=$1 AND user_id=ANY($2::text[]) FOR UPDATE`,
        [interaction.guildId, ids]
      );
      if (result.rowCount !== ids.length) {
        await db.query('ROLLBACK');
        return interaction.editReply({ content: 'Takım verileri alınamadı. Biraz sonra yeniden dene.', components: [] });
      }
      const byId = new Map(result.rows.map(p => [p.user_id, p]));
      const rawPlayers = team.map(u => byId.get(u.id));
      const now = Date.now();
      const cooldown = rawPlayers.find(p => p.last_dungeon_at && now - new Date(p.last_dungeon_at).getTime() < COOLDOWN_MS);
      if (cooldown) {
        const mins = Math.ceil((COOLDOWN_MS - (now - new Date(cooldown.last_dungeon_at).getTime())) / 60_000);
        await db.query('ROLLBACK');
        return interaction.editReply({ content: `⏳ <@${cooldown.user_id}> yaklaşık **${mins} dakika** daha beklemeli.`, components: [] });
      }

      const gearRows = await db.query(
        'SELECT user_id, item_key FROM user_equipment WHERE guild_id=$1 AND user_id=ANY($2::text[])',
        [interaction.guildId, ids]
      );
      const gearMap = new Map(rawPlayers.map(p => [p.user_id, []]));
      for (const row of gearRows.rows) {
        const item = equipmentItems.find(x => x.name === row.item_key);
        if (item) gearMap.get(row.user_id).push(item);
      }
      const players = rawPlayers.map((p, i) => {
        const equipped = gearMap.get(p.user_id) || []; const bonus = applyEquipmentSetBonus(equipped, equipmentBonus(equipped));
        const role = PARTY_ROLES[roles[i]]; const build = getCharacterBuild(p.active_build);
        const baseMaxHp = Math.min(2000, Number(p.max_hp) + bonus.hp) * (1 + Number(p.talent_hp) * 0.05);
        const maxHp = Math.round(baseMaxHp * build.hp * role.hp);
        const maxMana = Math.min(500, Math.round((Number(p.max_mana) + bonus.mana) * build.mana * (1 + Number(p.talent_mana) * 0.05)));
        return { ...p, build, classProfile: getCharacterClass(p.class_name), level: Number(p.level), xp: Number(p.xp), mana: Math.min(maxMana, Math.round((Number(p.mana) / Math.max(1, Number(p.max_mana))) * maxMana)), maxMana, role: roles[i], roleLabel: role.label, maxHp,
          hp: Math.round((Number(p.hp) / Math.max(1, Number(p.max_hp))) * maxHp),
          attack: Math.round(Math.min(500, Number(p.attack) + bonus.attack) * build.attack * role.attack * (1 + Number(p.talent_attack) * 0.04)),
          defense: Math.round(Math.min(250, applyClassDefense(Number(p.defense) + bonus.defense, p.class_name) * build.defense * (1 + Number(p.talent_defense) * 0.04)) * role.defense) };
      });
      if (players.some(p => p.hp <= 0)) {
        await db.query('ROLLBACK');
        return interaction.editReply({ content: '❤️ Takımdaki herkesin HP değeri sıfırdan yüksek olmalı. Önce **/dinlen** kullanın.', components: [] });
      }

      const avgLevel = Math.floor(players.reduce((n, p) => n + p.level, 0) / players.length);
      const hpNow = players.map(p => p.hp);
      const oldLevels = players.map(p => p.level);
      let floorsCleared = 0, totalXp = 0, totalCoins = 0, turns = 0;
      const log = [];
      const spellCasts = new Map();
      const chestRewards = [];

      for (let floor = 1; floor <= FLOORS; floor++) {
        const enemyStats = dungeonEnemyStats(floor, avgLevel, players.length, interaction.options.getString('zorluk') || 'normal');
        const maxEnemyHp = enemyStats.hp;
        let enemyHp = maxEnemyHp;
        const enemyDamage = enemyStats.damage;
        let turn = 0;
        let bossRageAnnounced = false;
        log.push(`**Kat ${floor}: ${FLOOR_NAMES[floor - 1]}** — ${maxEnemyHp} HP.`);
        while (enemyHp > 0 && hpNow.some(hp => hp > 0) && turn < 10) {
          turn++;
          turns++;
          const livingAtStart = players.filter((_p, i) => hpNow[i] > 0);
          const suffix = `${interaction.id}:${floor}:${turn}`;
          const actionRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`katlizindan:act:attack:${suffix}`).setLabel('⚔️ Saldır').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`katlizindan:act:spell:${suffix}`).setLabel('✨ Zoltraak (12)').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`katlizindan:act:heal:${suffix}`).setLabel('💚 Heilen (18)').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`katlizindan:act:shield:${suffix}`).setLabel('🔮 Kalkan (10)').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`katlizindan:act:defend:${suffix}`).setLabel('🛡️ Savun').setStyle(ButtonStyle.Secondary)
          );
          const actionMessage = await interaction.editReply({
            content: `**Kat ${floor}/${FLOORS} · Tur ${turn}**\n🌑 Düşman: ${enemyHp}/${maxEnemyHp} HP\n${livingAtStart.map(p => `<@${p.user_id}> (${p.mana}/${p.maxMana} mana)`).join(' · ')}\n\nHer yaşayan oyuncu Saldır, Zoltraak (12), Heilen (18), Mana Kalkanı (10) veya Savun seçsin. 20 saniye içinde seçim yapmayan oyuncu savunur.`,
            embeds: [],
            components: [actionRow]
          });
          const choices = new Map();
          const collector = actionMessage.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 20_000,
            filter: c => livingAtStart.some(p => p.user_id === c.user.id) &&
              c.customId.startsWith('katlizindan:act:') &&
              c.customId.endsWith(suffix)
          });
          const collected = new Promise(resolve => {
            collector.on('collect', async c => {
              if (choices.has(c.user.id)) {
                await c.reply({ content: 'Bu tur için seçimini zaten yaptın.', ephemeral: true }).catch(() => {});
                return;
              }
              const action = c.customId.split(':')[2];
              choices.set(c.user.id, action);
              await c.deferUpdate().catch(() => {});
              if (choices.size >= livingAtStart.length) collector.stop('all-selected');
            });
            collector.once('end', resolve);
          });
          await collected;

          const defending = new Set();
          for (let i = 0; i < players.length && enemyHp > 0; i++) {
            if (hpNow[i] <= 0) continue;
            const p = players[i];
            const action = choices.get(p.user_id) || 'defend';
            if (action === 'defend' || action === 'shield') {
              const shieldCost = applyClassManaCost(10, p.class_name);
              if (action === 'shield' && p.mana >= shieldCost) { p.mana -= shieldCost; defending.add(i); log.push(`🔮 <@${p.user_id}> Mana Kalkanı açtı (-${shieldCost} mana).`); }
              else if (action === 'shield') { defending.add(i); log.push(`🔹 <@${p.user_id}> için mana yetersiz; normal savunma yaptı.`); }
              else { defending.add(i); log.push(`🛡️ <@${p.user_id}> savunma duruşu aldı.`); }
              continue;
            }
            if (action === 'heal') {
              const healCost = applyClassManaCost(18, p.class_name);
              if (p.mana >= healCost) {
                p.mana -= healCost;
                const healAmount = applyClassHealing(26, p.class_name);
                const healed = Math.min(p.maxHp, hpNow[i] + healAmount);
                log.push(`💚 <@${p.user_id}> Heilen kullandı: +${healed-hpNow[i]} HP (-${healCost} mana).`);
                hpNow[i] = healed;
              } else log.push(`🔹 <@${p.user_id}> için mana yetersiz; büyü kullanılamadı.`);
              continue;
            }
            const baseDamage = Math.max(1, Math.round((Number(p.attack) + Math.floor(p.level / 3)) * (0.88 + ((p.level + floor + turn + i) % 4) * 0.09)));
            let damage = baseDamage;
            const spellCost = applyClassManaCost(12, p.class_name);
            if (action === 'spell' && p.mana >= spellCost) {
              p.mana -= spellCost;
              damage = Math.round(baseDamage * 1.8);
              damage = applyClassDamage(damage, p.class_name);
              spellCasts.set(p.user_id, (spellCasts.get(p.user_id) || 0) + 1);
              log.push(`✨ <@${p.user_id}> Zoltraak kullandı (-${spellCost} mana).`);
            } else if (action === 'spell') {
              log.push(`🔹 <@${p.user_id}> için mana yetersiz; normal saldırı yaptı.`);
            }
            enemyHp = Math.max(0, enemyHp - damage);
            log.push(`⚔️ <@${p.user_id}> ${damage} hasar verdi; düşman ${enemyHp}/${maxEnemyHp} HP.`);
          }
          if (enemyHp > 0) {
            const living = hpNow.map((hp, i) => hp > 0 ? i : -1).filter(i => i >= 0);
            const healerIndex = living.find(i => players[i].role === 'healer');
            if (healerIndex !== undefined) {
              for (const i of living) {
                const classHeal = applyClassHealing(6, players[healerIndex].class_name);
                const healed = Math.min(players[i].maxHp, hpNow[i] + classHeal);
                if (healed > hpNow[i]) {
                  log.push(`💚 ${players[healerIndex].roleLabel} <@${players[healerIndex].user_id}> ${healed - hpNow[i]} HP iyileştirdi.`);
                  hpNow[i] = healed;
                }
              }
            }
            const tankIndex = living.find(i => players[i].role === 'tank');
            const targetIndex = tankIndex !== undefined && Math.random() < 0.7 ? tankIndex : living[(turn + floor) % living.length];
            const target = players[targetIndex];
            const finalBoss = floor === FLOORS;
            const enraged = finalBoss && enemyHp <= maxEnemyHp * 0.5;
            const specialAttack = finalBoss && turn % 3 === 0;
            const bossPower = finalBoss ? 1.35 : 1;
            let incoming = Math.max(1, Math.round(enemyDamage * bossPower * (0.9 + ((turn + floor) % 3) * 0.08) + (enraged ? 7 : 0) + (specialAttack ? 6 : 0) - target.defense * 0.3));
            if (defending.has(targetIndex)) incoming = Math.max(1, Math.round(incoming * 0.45));
            hpNow[targetIndex] = Math.max(0, hpNow[targetIndex] - incoming);
            if (enraged && !bossRageAnnounced) { log.push('🔥 İblis Lordu öfke evresine girdi; saldırıları güçlendi!'); bossRageAnnounced = true; }
            if (specialAttack) log.push('☄️ İblis Lordu yıldız biçimli mana patlaması kullandı!');
            log.push(`💥 ${finalBoss ? 'İblis Lordu' : 'Düşman'} <@${target.user_id}> oyuncusuna ${incoming} hasar verdi${defending.has(targetIndex) ? ' (savunma azaltımı uygulandı)' : ''}.`);
          }
        }
        if (enemyHp > 0) {
          log.push(`☠️ Takım ${floor}. katta durduruldu.`);
          break;
        }
        floorsCleared++;
        const floorXp = 25 + floor * 12 + avgLevel * 2;
        const floorCoins = 20 + floor * 10;
        totalXp += floorXp; totalCoins += floorCoins;
        log.push(`✅ ${floor}. kat temizlendi: +${floorXp} XP, +${floorCoins} altın (kişi başı).`);
        const pathRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`katlizindan:path:secret:${interaction.id}:${floor}`).setLabel('🗝️ Gizli geçit').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`katlizindan:path:shrine:${interaction.id}:${floor}`).setLabel('✨ Mana mabedi').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`katlizindan:path:safe:${interaction.id}:${floor}`).setLabel('🧭 Güvenli yol').setStyle(ButtonStyle.Secondary)
        );
        const pathMessage = await interaction.editReply({ content: `🧭 **${floor}. kat temizlendi!** Bir sonraki geçidi seç. Gizli geçit daha çok ganimet ama yaralanma riski taşır; mabed iyileştirir; güvenli yol dengelidir.`, embeds: [], components: [pathRow] });
        let pathChoice = 'safe';
        await new Promise(resolve => {
          const pathCollector = pathMessage.createMessageComponentCollector({ time: 15_000, filter: c => c.user.id === interaction.user.id && c.customId.startsWith('katlizindan:path:') && c.customId.endsWith(`:${interaction.id}:${floor}`) });
          pathCollector.on('collect', async c => { pathChoice = c.customId.split(':')[2]; await c.deferUpdate().catch(()=>{}); pathCollector.stop('chosen'); });
          pathCollector.once('end', resolve);
        });
        const pathOutcome = dungeonChoiceOutcome(pathChoice, floor);
        totalCoins += pathOutcome.coins;
        log.push(pathOutcome.log);
        if (pathOutcome.hp > 0) {
          for (let i = 0; i < hpNow.length; i++) if (hpNow[i] > 0) hpNow[i] = Math.min(players[i].maxHp, hpNow[i] + pathOutcome.hp);
        } else if (pathOutcome.hp < 0) {
          const living = hpNow.map((hp, i) => hp > 1 ? i : -1).filter(i => i >= 0);
          if (living.length) { const target = living[Math.floor(Math.random() * living.length)]; hpNow[target] = Math.max(1, hpNow[target] + pathOutcome.hp); }
        }
        if (pathOutcome.mana > 0) {
          for (let i = 0; i < players.length; i++) {
            if (hpNow[i] > 0) {
              const restored = Math.min(players[i].maxMana, players[i].mana + pathOutcome.mana);
              if (restored > players[i].mana) log.push(`✨ <@${players[i].user_id}> Mana Mabedi'nden ${restored - players[i].mana} mana kazandı.`);
              players[i].mana = restored;
            }
          }
        }
        if (Math.random() < pathOutcome.lootChance) {
          const pathLoot = LOOT[Math.floor(Math.random() * LOOT.length)];
          chestRewards.push(pathLoot);
          log.push(`🎁 Yol seçiminin ödülü: ${pathLoot} (her oyuncuya).`);
        }
        const eventRoll = Math.random();
        if (eventRoll < 0.24) {
          const chestLoot = LOOT[Math.floor(Math.random() * LOOT.length)];
          chestRewards.push(chestLoot);
          totalCoins += 15 + floor * 5;
          log.push(`🧰 ${floor}. katta gizli sandık bulundu! Her oyuncu ${chestLoot} ve ek ${15 + floor * 5} altın kazanacak.`);
        } else if (eventRoll < 0.42) {
          const living = hpNow.map((hp, index) => hp > 0 ? index : -1).filter(index => index >= 0);
          if (living.length) {
            const targetIndex = living[Math.floor(Math.random() * living.length)];
            const trapDamage = 8 + floor * 4;
            hpNow[targetIndex] = Math.max(1, hpNow[targetIndex] - trapDamage);
            log.push(`🪤 ${floor}. kattaki tuzak <@${players[targetIndex].user_id}> oyuncusuna ${trapDamage} hasar verdi!`);
          }
        } else {
          log.push(`🧭 ${floor}. katta yol güvenliydi; takım bir sonraki kata ilerliyor.`);
        }
      }

      const victory = floorsCleared === FLOORS;
      const loot = victory && Math.random() < 0.35 ? LOOT[Math.floor(Math.random() * LOOT.length)] : null;
      const persistedHpNow = hpNow.map((hp, i) => {
        const combatMaxHp = Math.max(1, Number(players[i].maxHp));
        const baseMaxHp = Math.max(1, Number(players[i].max_hp));
        return Math.max(0, Math.min(baseMaxHp, Math.round((hp / combatMaxHp) * baseMaxHp)));
      });
      const persistedManaNow = players.map(p => Math.max(0, Math.min(
        Math.max(1, Number(p.max_mana)),
        Math.round((Number(p.mana) / Math.max(1, Number(p.maxMana))) * Math.max(1, Number(p.max_mana)))
      )));
      for (const [userId, casts] of spellCasts) {
        const mastery = await db.query(
          `INSERT INTO spell_mastery (guild_id,user_id,spell_key,casts,mastery_level,updated_at)
           VALUES ($1,$2,'zoltraak',$3,LEAST(10,FLOOR($3/10.0)::int),NOW())
           ON CONFLICT (guild_id,user_id,spell_key) DO UPDATE
           SET casts=spell_mastery.casts+EXCLUDED.casts,
               mastery_level=LEAST(10,FLOOR((spell_mastery.casts+EXCLUDED.casts)/10.0)::int),
               updated_at=NOW()
           RETURNING casts,mastery_level`,
          [interaction.guildId, userId, casts]
        );
        log.push(`📈 <@${userId}> Zoltraak ustalığı: ${mastery.rows[0].casts} kullanım · Seviye ${mastery.rows[0].mastery_level}/10.`);
      }
      for (let i = 0; i < players.length; i++) {
        const p = players[i];
        const newXp = p.xp + totalXp;
        const newLevel = levelForXp(newXp);
        await db.query(
          `UPDATE users SET hp=$3, xp=$4, level=$5, coins=coins+$6,
             stat_points=stat_points+$7, dungeon_wins=dungeon_wins+$8,
             dungeon_runs=dungeon_runs+1, last_dungeon_at=NOW(), mana=$9
           WHERE guild_id=$1 AND user_id=$2`,
          [interaction.guildId, p.user_id, persistedHpNow[i], newXp, newLevel, totalCoins,
            Math.max(0, newLevel - oldLevels[i]), victory ? 1 : 0, persistedManaNow[i]]
        );
        for (const itemKey of [...chestRewards, ...(loot ? [loot] : [])]) await db.query(
          `INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,$3,1)
           ON CONFLICT(guild_id,user_id,item_key) DO UPDATE SET quantity=inventory.quantity+1`,
          [interaction.guildId, p.user_id, itemKey]
        );
      }
      await db.query('COMMIT');
      const milestoneRows = await db.query('SELECT user_id,level,boss_defeats,dungeon_wins FROM users WHERE guild_id=$1 AND user_id=ANY($2::text[])',[interaction.guildId,ids]);
      const milestoneText = milestoneRows.rows.map(row => {
        const titles = progressionMilestone(Number(row.level), Number(row.boss_defeats), Number(row.dungeon_wins));
        return `<@${row.user_id}>: ${titles.length ? titles.join(', ') : 'Henüz unvan açılmadı'}`;
      }).join('\n');

      const embed = new EmbedBuilder()
        .setColor(victory ? 0x55c58a : 0xb86b7d)
        .setTitle(victory ? '🏆 Beş Kat Tamamlandı!' : `🛡️ ${floorsCleared}/${FLOORS} Kat Geçildi`)
        .setDescription(
          `**Takım:** ${team.map(u => `<@${u.id}>`).join(', ')}\n**İlerleme:** ${floorsCleared}/${FLOORS} kat · **Toplam tur:** ${turns}\n\n` +
          players.map((p, i) => `**<@${p.user_id}>** — ${p.roleLabel} · ${p.classProfile.label} · ${p.build.label} · Seviye ${p.level}${levelForXp(p.xp + totalXp) > p.level ? ` → ${levelForXp(p.xp + totalXp)} ✨` : ''}\n❤️ HP: ${p.hp} → ${persistedHpNow[i]} · ✨ Mana: ${p.mana}/${p.maxMana} · ⚔️ ${p.attack} · 🛡️ ${p.defense}`).join('\n\n') +
          '\n\n**Kat günlüğü**\n' + log.slice(-12).join('\n')
        )
        .addFields(
          { name: '🏅 Kalıcı unvanlar', value: milestoneText.slice(0,1024), inline: false },
          { name: '🎁 Kişi başı ödül', value: `✨ ${totalXp} XP\n🥐 ${totalCoins} altın`, inline: true },
          { name: '💎 Ganimet ve sandıklar', value: [...chestRewards, ...(loot ? [loot] : [])].length ? [...chestRewards, ...(loot ? [loot] : [])].map(item => `• ${item}`).join('\\n') : 'Bu sefer ganimet çıkmadı.', inline: true },
          { name: '⏳ Bekleme', value: '30 dakika', inline: true }
        )
        .setFooter({ text: 'Poğaça Frieren • Kat kat ilerleyin, takımınızı koruyun.' });
      return interaction.editReply({ content: null, embeds: [embed], components: [] });
    } catch (error) {
      await db.query('ROLLBACK').catch(() => {});
      console.error('/katlizindan hatası:', error);
      return interaction.editReply({ content: 'Katlı zindan sırasında hata oluştu. Daha sonra yeniden dene.', components: [] }).catch(() => {});
    } finally {
      db.release();
    }
  }
};
