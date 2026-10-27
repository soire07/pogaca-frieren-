import { ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, EmbedBuilder, ComponentType } from 'discord.js';
import { pool, ensureUser } from './database/db.js';
import { equipmentItems, equipmentBonus } from './equipment-data.js';
import { levelForXp } from './utils.js';
import { chooseRaidBoss, applyRaidWeakness, applyEquipmentSetBonus, progressionMilestone, applyClassDamage, applyClassDefense, applyClassHealing, getCharacterClass } from './rpg-mechanics.js';

const COOLDOWN_MS = 45 * 60_000;
const ROLES = {
  tank: { label: '🛡️ Muhafız', description: 'Daha çok hasar üzerine çeker ve daha dayanıklıdır.', hp: 1.25, attack: 0.85, defense: 1.45 },
  healer: { label: '💚 Şifacı', description: 'Her tur takıma küçük bir iyileştirme sağlar.', hp: 1, attack: 0.85, defense: 1.05 },
  damage: { label: '⚔️ Hasar Ustası', description: 'Boss’a daha yüksek hasar verir.', hp: 0.95, attack: 1.35, defense: 0.9 }
};

export default {
  data: new SlashCommandBuilder()
    .setName('ortakboss')
    .setDescription('En fazla dört oyuncuyla takım rolleri kullanarak ortak boss baskını yap.')
    .addUserOption(o => o.setName('takim_arkadasi').setDescription('Birinci takım arkadaşı').setRequired(true))
    .addUserOption(o => o.setName('takim_arkadasi_2').setDescription('İkinci takım arkadaşı (isteğe bağlı)').setRequired(false))
    .addUserOption(o => o.setName('takim_arkadasi_3').setDescription('Üçüncü takım arkadaşı (isteğe bağlı)').setRequired(false)),

  async execute(interaction) {
    const BOSS = chooseRaidBoss();
    if (!interaction.guildId || !interaction.channel) return interaction.reply({ content: 'Ortak boss baskını yalnızca sunucularda kullanılabilir.', ephemeral: true });
    const team = [
      interaction.user,
      interaction.options.getUser('takim_arkadasi', true),
      interaction.options.getUser('takim_arkadasi_2'),
      interaction.options.getUser('takim_arkadasi_3')
    ].filter(Boolean);
    if (team.some(x => x.bot) || new Set(team.map(x => x.id)).size !== team.length) {
      return interaction.reply({ content: 'Takımda bot veya tekrar eden oyuncu olamaz.', ephemeral: true });
    }
    for (const user of team) await ensureUser(interaction.guildId, user.id);
    const invited = team.slice(1);
    const row = new ActionRowBuilder().addComponents(
      ...invited.map(x => new ButtonBuilder().setCustomId(`raid:yes:${interaction.id}:${x.id}`).setLabel(`Katıl: ${x.username}`.slice(0,80)).setStyle(ButtonStyle.Success)),
      new ButtonBuilder().setCustomId(`raid:no:${interaction.id}`).setLabel('Reddet').setStyle(ButtonStyle.Secondary)
    );
    const msg = await interaction.reply({
      content: `🌌 <@${interaction.user.id}> **${BOSS.name}** baskını için takım kuruyor! ${invited.map(x => `<@${x.id}>`).join(' ')}\nHer davetli 60 saniye içinde katılmalı. Kabulden sonra herkes kendi rolünü seçecek.`,
      components: [row], allowedMentions: { users: team.map(x => x.id) }, fetchReply: true
    });
    const inviteIds = new Set(invited.map(x => x.id));
    const accepted = new Set();
    const start = await new Promise(resolve => {
      const collector = msg.createMessageComponentCollector({ time: 60_000, filter: c => inviteIds.has(c.user.id) && (c.customId === `raid:no:${interaction.id}` || c.customId === `raid:yes:${interaction.id}:${c.user.id}`) });
      collector.on('collect', async c => {
        if (c.customId === `raid:no:${interaction.id}`) {
          await c.update({ content: `❌ <@${c.user.id}> baskını reddetti. Takım dağılmadı ama savaş başlamadı.`, components: [] });
          collector.stop('declined'); return;
        }
        accepted.add(c.user.id);
        await c.deferUpdate();
        if (accepted.size === inviteIds.size) collector.stop('accepted');
      });
      collector.once('end', async (_all, reason) => {
        const ok = reason === 'accepted';
        await interaction.editReply({ content: ok ? '⚔️ Takım hazır! Ortak boss baskını başlıyor…' : reason === 'time' ? '⌛ Davet süresi doldu; herkes onaylamadığı için baskın başlamadı.' : '❌ Baskın iptal edildi.', components: [] }).catch(()=>{});
        resolve(ok);
      });
    });
    if (!start) return;

    const roleRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`raid:role:tank:${interaction.id}`).setLabel('🛡️ Muhafız').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`raid:role:healer:${interaction.id}`).setLabel('💚 Şifacı').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`raid:role:damage:${interaction.id}`).setLabel('⚔️ Hasar Ustası').setStyle(ButtonStyle.Primary)
    );
    const roleMessage = await interaction.editReply({
      content: `🎭 **Herkes baskın rolünü kendisi seçsin!** ${team.map(u => `<@${u.id}>`).join(' ')}\nEn fazla bir Muhafız ve bir Şifacı olabilir.`,
      components: [roleRow],
      allowedMentions: { users: team.map(u => u.id) }
    });
    const chosenRoles = new Map();
    const rolesReady = await new Promise(resolve => {
      const collector = roleMessage.createMessageComponentCollector({
        time: 60_000,
        filter: c => team.some(u => u.id === c.user.id) && c.customId.startsWith('raid:role:') && c.customId.endsWith(interaction.id)
      });
      collector.on('collect', async c => {
        const role = c.customId.split(':')[2];
        const conflict = [...chosenRoles.entries()].some(([userId, selected]) =>
          userId !== c.user.id && selected === role && (role === 'tank' || role === 'healer')
        );
        if (conflict) {
          await c.reply({ content: role === 'tank' ? 'Muhafız rolü zaten seçildi; başka bir rol seç.' : 'Şifacı rolü zaten seçildi; başka bir rol seç.', ephemeral: true }).catch(() => {});
          return;
        }
        chosenRoles.set(c.user.id, role);
        await c.reply({ content: `Seçtiğin rol: ${ROLES[role].label}`, ephemeral: true }).catch(() => {});
        if (chosenRoles.size === team.length) collector.stop('ready');
      });
      collector.once('end', (_all, reason) => resolve(reason === 'ready'));
    });
    if (!rolesReady) return interaction.editReply({ content: '⌛ Herkes rol seçmediği için baskın başlamadı. Yeniden deneyebilirsin.', components: [] });
    const teamRoles = new Map(team.map(user => [user.id, chosenRoles.get(user.id)]));
    await interaction.editReply({
      content: `⚔️ Baskın takımı hazır: ${team.map(u => `<@${u.id}> — ${ROLES[teamRoles.get(u.id)].label}`).join(' · ')}`,
      components: []
    });

    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      const ids = team.map(x => x.id).sort();
      const result = await db.query(
        `SELECT user_id,level,xp,coins,hp,max_hp,mana,max_mana,attack,defense,class_name,last_boss_at FROM users
         WHERE guild_id=$1 AND user_id=ANY($2::text[]) FOR UPDATE`,
        [interaction.guildId, ids]
      );
      if (result.rowCount !== ids.length) {
        await db.query('ROLLBACK');
        return interaction.editReply({ content: 'Takım verileri okunamadı. Yeniden dene.', components: [] });
      }
      const byId = new Map(result.rows.map(x => [x.user_id,x]));
      const raw = team.map(user => ({ user, role: teamRoles.get(user.id), stats: byId.get(user.id) }));
      const now = Date.now();
      const cooling = raw.find(x => x.stats.last_boss_at && now - new Date(x.stats.last_boss_at).getTime() < COOLDOWN_MS);
      if (cooling) {
        const remaining = Math.ceil((COOLDOWN_MS - (now - new Date(cooling.stats.last_boss_at).getTime())) / 60_000);
        await db.query('ROLLBACK');
        return interaction.editReply({ content: `⏳ <@${cooling.user.id}> yaklaşık ${remaining} dakika daha beklemeli.`, components: [] });
      }
      const gearRows = await db.query('SELECT user_id,item_key FROM user_equipment WHERE guild_id=$1 AND user_id=ANY($2::text[])',[interaction.guildId,ids]);
      const gearMap = new Map(raw.map(x => [x.user.id,[]]));
      for (const g of gearRows.rows) {
        const item = equipmentItems.find(i => i.name === g.item_key);
        if (item) gearMap.get(g.user_id).push(item);
      }
      const fighters = raw.map(x => {
        const p = x.stats; const equipped = gearMap.get(x.user.id) || []; const gear = applyEquipmentSetBonus(equipped, equipmentBonus(equipped)); const role = ROLES[x.role];
        return {
          userId:x.user.id, username:x.user.username, role:x.role, roleData:role, className:p.class_name, classProfile:getCharacterClass(p.class_name), baseMaxHp:Number(p.max_hp),
          level:Number(p.level), xp:Number(p.xp), coins:Number(p.coins), mana:Math.min(Number(p.mana), Math.min(500, Number(p.max_mana) + gear.mana)), maxMana:Math.min(500, Number(p.max_mana) + gear.mana),
          hp:Math.round(Math.max(0,Math.min(Number(p.hp),Math.min(2000,Number(p.max_hp)+gear.hp))*role.hp)),
          maxHp:Math.round(Math.min(2000,Number(p.max_hp)+gear.hp)*role.hp),
          attack:(Number(p.attack)+gear.attack)*role.attack,
          defense:applyClassDefense(Number(p.defense)+gear.defense,p.class_name)*role.defense
        };
      });
      if (fighters.some(x => x.hp <= 0)) {
        await db.query('ROLLBACK');
        return interaction.editReply({ content: '❤️ Her oyuncunun HP değeri sıfırdan yüksek olmalı. Önce /dinlen kullanın.', components: [] });
      }
      const averageLevel = Math.floor(fighters.reduce((sum, fighter) => sum + fighter.level, 0) / fighters.length);
      let bossHp = BOSS.hp + averageLevel * 18 + Math.max(0,fighters.length-2)*90;
      const maxBossHp = bossHp;
      const hpNow = fighters.map(x => Math.round(x.hp));
      const log = [];
      let rounds = 0;
      let rageAnnounced = false;
      while (bossHp > 0 && hpNow.some(hp=>hp>0) && rounds < 12) {
        rounds++;
        const alive = fighters.map((x,i)=>hpNow[i]>0?i:-1).filter(i=>i>=0);
        if (!alive.length) break;
        const healer = alive.find(i=>fighters[i].role==='healer');
        if (healer !== undefined) {
          for (const i of alive) {
            const classHeal = applyClassHealing(12, fighters[healer].className);
            const healed = Math.min(Math.round(fighters[i].maxHp),hpNow[i]+classHeal);
            if (healed > hpNow[i]) { log.push(`💚 <@${fighters[healer].userId}> ${fighters[i].username} oyuncusuna ${healed-hpNow[i]} HP iyileştirdi.`); hpNow[i]=healed; }
          }
        }
        const actionRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`raid:act:attack:${interaction.id}:${rounds}`).setLabel('⚔️ Saldır').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`raid:act:spell:${interaction.id}:${rounds}`).setLabel('✨ Zoltraak (12)').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`raid:act:heal:${interaction.id}:${rounds}`).setLabel('💚 Heilen (18)').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`raid:act:shield:${interaction.id}:${rounds}`).setLabel('🔮 Kalkan (10)').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`raid:act:defend:${interaction.id}:${rounds}`).setLabel('🛡️ Savun').setStyle(ButtonStyle.Secondary)
        );
        const actionMessage = await interaction.editReply({
          content: `**${BOSS.name} · Tur ${rounds}**\n❤️ Boss: ${bossHp}/${maxBossHp} HP\n${alive.map(i => `<@${fighters[i].userId}> (${fighters[i].mana}/${fighters[i].maxMana} mana)`).join(' · ')}\nHer oyuncu Saldır, Zoltraak, Heilen, Mana Kalkanı veya Savun seçsin. Zayıflık: **${BOSS.weaknessLabel}**. 20 saniye içinde seçim yapmayan oyuncu savunur.`,
          embeds: [],
          components: [actionRow]
        });
        const choices = new Map();
        await new Promise(resolve => {
          const collector = actionMessage.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 20_000,
            filter: c => alive.some(i => fighters[i].userId === c.user.id) &&
              c.customId.startsWith('raid:act:') && c.customId.endsWith(`${interaction.id}:${rounds}`)
          });
          collector.on('collect', async c => {
            if (choices.has(c.user.id)) {
              await c.reply({ content: 'Bu tur için seçimini zaten yaptın.', ephemeral: true }).catch(() => {});
              return;
            }
            choices.set(c.user.id, c.customId.split(':')[2]);
            await c.deferUpdate().catch(() => {});
            if (choices.size >= alive.length) collector.stop('all-selected');
          });
          collector.once('end', resolve);
        });
        const defending = new Set();
        for (const i of alive) {
          if (bossHp <= 0 || hpNow[i] <= 0) continue;
          const f = fighters[i];
          const action = choices.get(f.userId) || 'defend';
          if (action === 'defend' || action === 'shield') {
            if (action === 'shield' && f.mana >= 10) { f.mana -= 10; defending.add(i); log.push(`🔮 ${f.username} Mana Kalkanı açtı (-10 mana).`); }
            else if (action === 'shield') { defending.add(i); log.push(`🔹 ${f.username} için mana yetersiz; normal savunma yaptı.`); }
            else { defending.add(i); log.push(`🛡️ ${f.username} savunma duruşu aldı.`); }
            continue;
          }
          if (action === 'heal') {
            if (f.mana >= 18) { f.mana -= 18; const healed = Math.min(f.maxHp, hpNow[i] + 26); log.push(`💚 ${f.username} Heilen kullandı: +${healed-hpNow[i]} HP (-18 mana).`); hpNow[i] = healed; }
            else log.push(`🔹 ${f.username} için mana yetersiz; büyü kullanılamadı.`);
            continue;
          }
          let damage = Math.max(1, Math.round(f.attack * (0.9 + Math.random() * 0.25)));
          if (action === 'spell' && f.mana >= 12) {
            f.mana -= 12;
            damage = Math.round(damage * 1.8);
            damage = applyClassDamage(damage, f.className);
            log.push(`✨ ${f.username} Zoltraak kullandı (-12 mana).`);
          } else if (action === 'spell') {
            log.push(`🔹 ${f.username} için mana yetersiz; normal saldırı yaptı.`);
          }
          damage = applyRaidWeakness(damage, BOSS, action === 'spell' ? 'spell' : 'attack');
          bossHp = Math.max(0, bossHp - damage);
          log.push(`⚔️ ${f.username} (${f.roleData.label}) ${damage} hasar verdi.`);
        }
        if (bossHp <= 0) break;
        const living=fighters.map((x,i)=>hpNow[i]>0?i:-1).filter(i=>i>=0);
        const tank=living.find(i=>fighters[i].role==='tank');
        const targetIndex=tank !== undefined && Math.random()<0.7 ? tank : living[Math.floor(Math.random()*living.length)];
        const target=fighters[targetIndex];
        const enraged = bossHp <= maxBossHp * 0.5;
        const starburst = BOSS.special === 'mana-star' && rounds % 3 === 0;
        const shardRain = BOSS.special === 'shard-rain' && rounds % 2 === 0;
        const manaCurse = BOSS.special === 'mana-curse' && rounds % 3 === 0;
        const rawDamage=BOSS.damage+Math.floor(Math.random()*8)+rounds+(enraged?8:0)+(starburst?6:0)+(shardRain?3:0)+(manaCurse?3:0);
        if (enraged && !rageAnnounced) { log.push('🔥 Boss öfke evresine girdi! Saldırıları güçlendi.'); rageAnnounced = true; }
        if (starburst || shardRain) {
          log.push(BOSS.special === 'shard-rain' ? '🐉 Cam Pullar Ejderhası keskin kristal parçalarını tüm takıma yağdırıyor!' : '☄️ Boss yıldız biçimli mana patlamasıyla tüm yaşayan oyuncuları hedef alıyor!');
          for (const i of living) {
            const f=fighters[i];
            const specialMultiplier = shardRain ? 0.5 : 0.68;
            let incoming=Math.max(1,Math.round(rawDamage*specialMultiplier-f.defense*0.22));
            if (defending.has(i)) incoming=Math.max(1,Math.round(incoming*0.45));
            hpNow[i]=Math.max(0,hpNow[i]-incoming);
            log.push(`☄️ ${f.username} ${shardRain ? 'kristal yağmurundan' : 'mana patlamasından'} ${incoming} hasar aldı${defending.has(i)?' (savunma azaltımı uygulandı)':''}.`);
          }
        } else {
          let incoming=Math.max(1,Math.round(rawDamage-target.defense*0.28));
          if (defending.has(targetIndex)) incoming=Math.max(1,Math.round(incoming*0.45));
          hpNow[targetIndex]=Math.max(0,hpNow[targetIndex]-incoming);
          if (manaCurse) {
            const drained=Math.min(target.mana,8);
            target.mana-=drained;
            log.push(`🕯️ Boss ${target.username} oyuncusuna mana laneti uyguladı (-${drained} mana).`);
          }
          log.push(`💥 ${BOSS.name} ${target.username} oyuncusuna ${incoming} hasar verdi${defending.has(targetIndex)?' (savunma azaltımı uygulandı)':''}.`);
        }
      }
      const win=bossHp<=0;
      const persistedHpNow=hpNow.map((hp,i)=>Math.min(hp,fighters[i].baseMaxHp));
      const xpReward=win?BOSS.xp:Math.floor(BOSS.xp*0.25);
      const coinReward=win?BOSS.coins:Math.floor(BOSS.coins*0.2);
      const loot=win && Math.random()<0.4 ? BOSS.loot : null;
      for (let i=0;i<fighters.length;i++) {
        const f=fighters[i]; const newXp=f.xp+xpReward; const newLevel=levelForXp(newXp);
        await db.query(
          `UPDATE users SET hp=$3,xp=$4,level=$5,coins=coins+$6,
           stat_points=stat_points+$7,boss_defeats=boss_defeats+$8,last_boss_at=NOW(),mana=$9
           WHERE guild_id=$1 AND user_id=$2`,
          [interaction.guildId,f.userId,persistedHpNow[i],newXp,newLevel,coinReward,Math.max(0,newLevel-f.level),win?1:0,f.mana]
        );
        if (loot) await db.query(
          `INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,$3,1)
           ON CONFLICT(guild_id,user_id,item_key) DO UPDATE SET quantity=inventory.quantity+1`,
          [interaction.guildId,f.userId,loot]
        );
      }
      await db.query('COMMIT');
      const milestoneRows = await db.query('SELECT user_id,level,boss_defeats,dungeon_wins FROM users WHERE guild_id=$1 AND user_id=ANY($2::text[])',[interaction.guildId,ids]);
      const milestoneText = milestoneRows.rows.map(row => {
        const titles = progressionMilestone(Number(row.level), Number(row.boss_defeats), Number(row.dungeon_wins));
        return `<@${row.user_id}>: ${titles.length ? titles.join(', ') : 'Henüz unvan açılmadı'}`;
      }).join('\n');
      const embed=new EmbedBuilder().setColor(win?0x5bc98a:0x9b8cff)
        .setTitle(win?`🏆 ${BOSS.name} yenildi!`:'🌌 Baskın sona erdi')
        .setDescription(`**Boss HP:** ${Math.max(0,bossHp)}/${maxBossHp}\n**Tur:** ${rounds}/12\n\n`+
          fighters.map((f,i)=>`**<@${f.userId}>** — ${f.roleData.label} · ${f.classProfile.label}\n❤️ ${persistedHpNow[i]}/${f.baseMaxHp} HP · ✨ ${f.mana}/${f.maxMana} mana · ⚔️ ${Math.round(f.attack)} saldırı · 🛡️ ${Math.round(f.defense)} savunma`).join('\n\n')+
          '\n\n**Savaş günlüğü**\n'+log.slice(-15).join('\n'))
        .addFields(
          {name:'🎁 Kişi başı ödül',value:`✨ ${xpReward} XP\n🥐 ${coinReward} altın`,inline:true},
          {name:'🏅 Kalıcı unvanlar',value:milestoneText.slice(0,1024),inline:false},
          {name:'🧭 Boss bilgisi',value:`Zayıflık: **${BOSS.weaknessLabel}**\nÖzel hareket: **${BOSS.special === 'shard-rain' ? 'Kristal Yağmuru (iki turda bir, alan hasarı)' : BOSS.special === 'mana-curse' ? 'Mana Laneti (üç turda bir, mana tüketir)' : 'Mana Yıldız Patlaması (üç turda bir, alan hasarı)'}**`,inline:true},
          {name:'💎 Ortak ganimet',value:loot?`Herkes **${loot}** kazandı!`:win?'Bu kez nadir ganimet çıkmadı.':'Boss yenilemediği için nadir ganimet yok.',inline:true},
          {name:'⏳ Bekleme süresi',value:'45 dakika',inline:true}
        ).setFooter({text:'Poğaça Frieren • Rollerini seç, takımını koru, birlikte kazan.'});
      return interaction.editReply({embeds:[embed],components:[]});
    } catch(error) {
      await db.query('ROLLBACK').catch(()=>{});
      console.error('/ortakboss hatası:',error);
      return interaction.editReply({content:'Ortak boss baskınında hata oluştu. Daha sonra yeniden dene.',components:[]}).catch(()=>{});
    } finally { db.release(); }
  }
};
