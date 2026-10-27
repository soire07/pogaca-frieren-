import { ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { pool, ensureUser } from './database/db.js';
import { equipmentItems, equipmentBonus } from './equipment-data.js';
import { levelForXp } from './utils.js';

const COOLDOWN_MS = 45 * 60_000;
const BOSS = { name: '🌑 Kuzey Platosu İblis Generali', hp: 220, damage: 14, xp: 180, coins: 220, loot: 'İblis Mührü' };
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
      content: `🌌 <@${interaction.user.id}> **${BOSS.name}** baskını için takım kuruyor! ${invited.map(x => `<@${x.user.id}> (${ROLES[x.role].label})`).join(' ')}\nHer davetli 60 saniye içinde katılmalı. Roller: ${team.map(x => `<@${x.user.id}> — ${ROLES[x.role].label}`).join(' · ')}`,
      components: [row], allowedMentions: { users: team.map(x => x.user.id) }, fetchReply: true
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
      content: `🎭 **Herkes baskın rolünü kendisi seçsin!** ${team.map(u => `<@${u.id}>`).join(' ')}\\nEn fazla bir Muhafız ve bir Şifacı olabilir.`,
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
    for (const user of team) user.role = chosenRoles.get(user.id);
    await interaction.editReply({
      content: `⚔️ Baskın takımı hazır: ${team.map(u => `<@${u.id}> — ${ROLES[u.role].label}`).join(' · ')}`,
      components: []
    });

    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      const ids = team.map(x => x.id).sort();
      const result = await db.query(
        `SELECT user_id,level,xp,coins,hp,max_hp,attack,defense,last_boss_at FROM users
         WHERE guild_id=$1 AND user_id=ANY($2::text[]) FOR UPDATE`,
        [interaction.guildId, ids]
      );
      if (result.rowCount !== ids.length) {
        await db.query('ROLLBACK');
        return interaction.editReply({ content: 'Takım verileri okunamadı. Yeniden dene.', components: [] });
      }
      const byId = new Map(result.rows.map(x => [x.user_id,x]));
      const raw = team.map(user => ({ user, role: user.role, stats: byId.get(user.id) }));
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
        const p = x.stats; const gear = equipmentBonus(gearMap.get(x.user.id) || []); const role = ROLES[x.role];
        return {
          userId:x.user.id, username:x.user.username, role:x.role, roleData:role,
          level:Number(p.level), xp:Number(p.xp), coins:Number(p.coins),
          hp:Math.round(Math.max(0,Math.min(Number(p.hp),Math.min(2000,Number(p.max_hp)+gear.hp))*role.hp)),
          maxHp:Math.round(Math.min(2000,Number(p.max_hp)+gear.hp)*role.hp),
          attack:(Number(p.attack)+gear.attack)*role.attack,
          defense:(Number(p.defense)+gear.defense)*role.defense
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
            const healed = Math.min(Math.round(fighters[i].maxHp),hpNow[i]+12);
            if (healed > hpNow[i]) { log.push(`💚 <@${fighters[healer].userId}> ${fighters[i].username} oyuncusuna ${healed-hpNow[i]} HP iyileştirdi.`); hpNow[i]=healed; }
          }
        }
        for (const i of alive) {
          if (bossHp <= 0 || hpNow[i] <= 0) continue;
          const f=fighters[i];
          const damage=Math.max(1,Math.round(f.attack*(0.9+Math.random()*0.25)));
          bossHp=Math.max(0,bossHp-damage);
          log.push(`⚔️ ${f.username} (${f.roleData.label}) ${damage} hasar verdi.`);
        }
        if (bossHp <= 0) break;
        const living=fighters.map((x,i)=>hpNow[i]>0?i:-1).filter(i=>i>=0);
        const tank=living.find(i=>fighters[i].role==='tank');
        const targetIndex=tank !== undefined && Math.random()<0.7 ? tank : living[Math.floor(Math.random()*living.length)];
        const target=fighters[targetIndex];
        const enraged = bossHp <= maxBossHp * 0.5;
        const special = rounds % 3 === 0;
        const rawDamage=BOSS.damage+Math.floor(Math.random()*8)+rounds+(enraged?8:0)+(special?6:0);
        if (enraged && !rageAnnounced) { log.push('🔥 Boss öfke evresine girdi! Saldırıları güçlendi.'); rageAnnounced = true; }
        if (special) log.push('💥 Boss özel saldırı hazırladı; bu vuruş daha güçlü.');
        const incoming=Math.max(1,Math.round(rawDamage-target.defense*0.28));
        hpNow[targetIndex]=Math.max(0,hpNow[targetIndex]-incoming);
        log.push(`💥 ${BOSS.name} ${target.username} oyuncusuna ${incoming} hasar verdi.`);
      }
      const win=bossHp<=0;
      const xpReward=win?BOSS.xp:Math.floor(BOSS.xp*0.25);
      const coinReward=win?BOSS.coins:Math.floor(BOSS.coins*0.2);
      const loot=win && Math.random()<0.4 ? BOSS.loot : null;
      for (let i=0;i<fighters.length;i++) {
        const f=fighters[i]; const newXp=f.xp+xpReward; const newLevel=levelForXp(newXp);
        await db.query(
          `UPDATE users SET hp=$3,xp=$4,level=$5,coins=coins+$6,
           stat_points=stat_points+$7,boss_defeats=boss_defeats+$8,last_boss_at=NOW()
           WHERE guild_id=$1 AND user_id=$2`,
          [interaction.guildId,f.userId,hpNow[i],newXp,newLevel,coinReward,Math.max(0,newLevel-f.level),win?1:0]
        );
        if (loot) await db.query(
          `INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,$3,1)
           ON CONFLICT(guild_id,user_id,item_key) DO UPDATE SET quantity=inventory.quantity+1`,
          [interaction.guildId,f.userId,loot]
        );
      }
      await db.query('COMMIT');
      const embed=new EmbedBuilder().setColor(win?0x5bc98a:0x9b8cff)
        .setTitle(win?`🏆 ${BOSS.name} yenildi!`:'🌌 Baskın sona erdi')
        .setDescription(`**Boss HP:** ${Math.max(0,bossHp)}/${maxBossHp}\n**Tur:** ${rounds}/10\n\n`+
          fighters.map((f,i)=>`**<@${f.userId}>** — ${f.roleData.label}\n❤️ ${hpNow[i]}/${Math.round(f.maxHp)} HP · ⚔️ ${Math.round(f.attack)} saldırı · 🛡️ ${Math.round(f.defense)} savunma`).join('\n\n')+
          '\n\n**Savaş günlüğü**\n'+log.slice(-15).join('\n'))
        .addFields(
          {name:'🎁 Kişi başı ödül',value:`✨ ${xpReward} XP\n🥐 ${coinReward} altın`,inline:true},
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
