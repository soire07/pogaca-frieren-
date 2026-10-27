import { ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { pool, ensureUser } from './database/db.js';
import { equipmentItems, equipmentBonus } from './equipment-data.js';
import { levelForXp } from './utils.js';

const FLOORS = 5;
const COOLDOWN_MS = 30 * 60_000;
const LOOT = ['Orman Kristali', 'Kadim Rün Parçası', 'Kuzey Mührü'];
const FLOOR_NAMES = ['🌲 Köklerin Koridoru', '🗿 Kadim Harabeler', '🌫️ Sisli Geçit', '🔥 Küller Salonu', '👑 Mühürlü İblis Lordu'];
const PARTY_ROLES = { tank: { label: '🛡️ Muhafız', hp: 1.25, attack: 0.85, defense: 1.4 }, healer: { label: '💚 Şifacı', hp: 1, attack: 0.9, defense: 1.05 }, damage: { label: '⚔️ Hasar Ustası', hp: 0.95, attack: 1.3, defense: 0.9 } };
const roleOption = (name, description, required) => option => option.setName(name).setDescription(description).setRequired(required).addChoices({ name: 'Muhafız / Tank', value: 'tank' }, { name: 'Şifacı', value: 'healer' }, { name: 'Hasar Ustası', value: 'damage' });

export default {
  data: new SlashCommandBuilder()
    .setName('katlizindan')
    .setDescription('En fazla 4 maceracıyla beş katlı ortak zindana gir.')
    .addUserOption(o => o.setName('takim_arkadasi').setDescription('Birinci takım arkadaşın').setRequired(true))
    .addStringOption(roleOption('rolun', 'Kendi rolün', true))
    .addStringOption(roleOption('arkadas_rolu', 'Birinci arkadaşının rolü', true))
    .addUserOption(o => o.setName('takim_arkadasi_2').setDescription('İkinci takım arkadaşı (isteğe bağlı)').setRequired(false))
    .addStringOption(roleOption('arkadas_2_rolu', 'İkinci arkadaşının rolü', false))
    .addUserOption(o => o.setName('takim_arkadasi_3').setDescription('Üçüncü takım arkadaşı (isteğe bağlı)').setRequired(false))
    .addStringOption(roleOption('arkadas_3_rolu', 'Üçüncü arkadaşının rolü', false)),

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
    const roles = [interaction.options.getString('rolun', true), interaction.options.getString('arkadas_rolu', true), interaction.options.getString('arkadas_2_rolu'), interaction.options.getString('arkadas_3_rolu')].slice(0, team.length);
    if (team.some((_user, i) => !roles[i])) return interaction.reply({ content: 'Takımdaki her oyuncu için rol seçmelisin.', ephemeral: true });
    if (roles.filter(role => role === 'tank').length > 1 || roles.filter(role => role === 'healer').length > 1) return interaction.reply({ content: 'Takımda en fazla bir Muhafız ve bir Şifacı olabilir.', ephemeral: true });
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
      content: `🧭 ${invited.map((u, i) => `<@${u.id}> (${PARTY_ROLES[roles[i + 1]].label})`).join(' ')} — <@${interaction.user.id}> seni **5 katlı ortak zindana** davet ediyor. Her davetli 60 saniye içinde kendi düğmesine basmalı. Roller: ${team.map((u, i) => `<@${u.id}> ${PARTY_ROLES[roles[i]].label}`).join(' · ')}`,
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

    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      const ids = team.map(u => u.id).sort();
      const result = await db.query(
        `SELECT user_id, level, xp, coins, hp, max_hp, attack, defense, last_dungeon_at
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
        const bonus = equipmentBonus(gearMap.get(p.user_id) || []);
        const role = PARTY_ROLES[roles[i]];
        const maxHp = Math.round(Math.min(2000, Number(p.max_hp) + bonus.hp) * role.hp);
        return { ...p, level: Number(p.level), xp: Number(p.xp), role: roles[i], roleLabel: role.label, maxHp,
          hp: Math.round(Math.min(Number(p.hp), Math.min(2000, Number(p.max_hp) + bonus.hp)) * role.hp),
          attack: Math.round(Math.min(500, Number(p.attack) + bonus.attack) * role.attack),
          defense: Math.round(Math.min(250, Number(p.defense) + bonus.defense) * role.defense) };
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
      const chestRewards = [];

      for (let floor = 1; floor <= FLOORS; floor++) {
        const maxEnemyHp = Math.round((105 + floor * 48) * (1 + avgLevel * 0.045));
        let enemyHp = maxEnemyHp;
        const enemyDamage = Math.max(5, Math.round((5 + floor * 3) * (1 + avgLevel * 0.02)));
        let turn = 0;
        log.push(`**Kat ${floor}: ${FLOOR_NAMES[floor - 1]}** — ${maxEnemyHp} HP.`);
        while (enemyHp > 0 && hpNow.some(hp => hp > 0) && turn < 10) {
          turn++; turns++;
          for (let i = 0; i < players.length && enemyHp > 0; i++) {
            if (hpNow[i] <= 0) continue;
            const p = players[i];
            const damage = Math.max(1, Math.round((Number(p.attack) + Math.floor(p.level / 3)) * (0.88 + ((p.level + floor + turn + i) % 4) * 0.09)));
            enemyHp = Math.max(0, enemyHp - damage);
            if (turn === 1 || enemyHp === 0) log.push(`⚔️ <@${p.user_id}> ${damage} hasar verdi; düşman ${enemyHp}/${maxEnemyHp} HP.`);
          }
          if (enemyHp > 0) {
            const living = hpNow.map((hp, i) => hp > 0 ? i : -1).filter(i => i >= 0);
            const healerIndex = living.find(i => players[i].role === 'healer');
            if (healerIndex !== undefined) {
              for (const i of living) { const healed = Math.min(players[i].maxHp, hpNow[i] + 6); if (healed > hpNow[i]) { log.push(`💚 ${players[healerIndex].roleLabel} <@${players[healerIndex].user_id}> ${healed - hpNow[i]} HP iyileştirdi.`); hpNow[i] = healed; } }
            }
            const tankIndex = living.find(i => players[i].role === 'tank');
            const targetIndex = tankIndex !== undefined && Math.random() < 0.7 ? tankIndex : living[(turn + floor) % living.length];
            const target = players[targetIndex];
            const damage = Math.max(1, Math.round(enemyDamage * (0.9 + ((turn + floor) % 3) * 0.08) - target.defense * 0.3));
            hpNow[targetIndex] = Math.max(0, hpNow[targetIndex] - damage);
            log.push(`💥 Düşman <@${target.user_id}> oyuncusuna ${damage} hasar verdi.`);
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
            log.push(`🪤 ${floor}. kattaki tuzak <@${combatants[targetIndex].user_id}> oyuncusuna ${trapDamage} hasar verdi!`);
          }
        } else {
          log.push(`🧭 ${floor}. katta yol güvenliydi; takım bir sonraki kata ilerliyor.`);
        }
      }

      const victory = floorsCleared === FLOORS;
      const loot = victory && Math.random() < 0.35 ? LOOT[Math.floor(Math.random() * LOOT.length)] : null;
      for (let i = 0; i < players.length; i++) {
        const p = players[i];
        const newXp = p.xp + totalXp;
        const newLevel = levelForXp(newXp);
        await db.query(
          `UPDATE users SET hp=$3, xp=$4, level=$5, coins=coins+$6,
             stat_points=stat_points+$7, dungeon_wins=dungeon_wins+$8,
             dungeon_runs=dungeon_runs+1, last_dungeon_at=NOW()
           WHERE guild_id=$1 AND user_id=$2`,
          [interaction.guildId, p.user_id, hpNow[i], newXp, newLevel, totalCoins,
            Math.max(0, newLevel - oldLevels[i]), victory ? 1 : 0]
        );
        for (const itemKey of [...chestRewards, ...(loot ? [loot] : [])]) await db.query(
          `INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,$3,1)
           ON CONFLICT(guild_id,user_id,item_key) DO UPDATE SET quantity=inventory.quantity+1`,
          [interaction.guildId, p.user_id, itemKey]
        );
      }
      await db.query('COMMIT');

      const embed = new EmbedBuilder()
        .setColor(victory ? 0x55c58a : 0xb86b7d)
        .setTitle(victory ? '🏆 Beş Kat Tamamlandı!' : `🛡️ ${floorsCleared}/${FLOORS} Kat Geçildi`)
        .setDescription(
          `**Takım:** ${team.map(u => `<@${u.id}>`).join(', ')}\n**İlerleme:** ${floorsCleared}/${FLOORS} kat · **Toplam tur:** ${turns}\n\n` +
          players.map((p, i) => `**<@${p.user_id}>** — ${p.roleLabel} · Seviye ${p.level}${levelForXp(p.xp + totalXp) > p.level ? ` → ${levelForXp(p.xp + totalXp)} ✨` : ''}\n❤️ HP: ${p.hp} → ${hpNow[i]} · ⚔️ ${p.attack} · 🛡️ ${p.defense}`).join('\n\n') +
          '\n\n**Kat günlüğü**\n' + log.slice(-12).join('\n')
        )
        .addFields(
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
