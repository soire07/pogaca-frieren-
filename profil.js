
import { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { pool, ensureUser } from './database/db.js';
import { xpForNextLevel } from './utils.js';
import { equipmentItems, equipmentBonus } from './equipment-data.js';
import { applyClassDefense, applyEquipmentSetBonus, getCharacterBuild } from './rpg-mechanics.js';

export default {
  data: new SlashCommandBuilder()
    .setName('profil')
    .setDescription('RPG profilini veya başka bir oyuncunun profilini gösterir.')
    .addUserOption(o =>
      o.setName('kullanici')
        .setDescription('Profilini görmek istediğin kullanıcı')
        .setRequired(false)
    ),

  async execute(interaction) {
    if (!interaction.guildId) {
      return interaction.reply({ content: 'Bu komut yalnızca sunucularda kullanılabilir.', ephemeral: true });
    }

    const target =
      interaction.options.getUser('kullanici') ?? interaction.user;

    await ensureUser(interaction.guildId, target.id);

    const { rows: [u] } = await pool.query(
      `SELECT xp, level, coins, class_name, active_build, hp, max_hp, mana, max_mana, attack, defense, stat_points, daily_streak, best_daily_streak,
        COALESCE((SELECT attack_rank FROM user_talents t WHERE t.guild_id=users.guild_id AND t.user_id=users.user_id),0) AS talent_attack,
        COALESCE((SELECT defense_rank FROM user_talents t WHERE t.guild_id=users.guild_id AND t.user_id=users.user_id),0) AS talent_defense,
        COALESCE((SELECT hp_rank FROM user_talents t WHERE t.guild_id=users.guild_id AND t.user_id=users.user_id),0) AS talent_hp,
        COALESCE((SELECT mana_rank FROM user_talents t WHERE t.guild_id=users.guild_id AND t.user_id=users.user_id),0) AS talent_mana
       FROM users WHERE guild_id=$1 AND user_id=$2`,
      [interaction.guildId, target.id]
    );

    if (!u) {
      return interaction.reply({
        content: 'Profil bilgileri bulunamadı. Lütfen tekrar dene.',
        ephemeral: true
      });
    }

    const equippedResult = await pool.query('SELECT item_key FROM user_equipment WHERE guild_id=$1 AND user_id=$2', [interaction.guildId, target.id]);
    const equippedItems = equippedResult.rows.map(row => equipmentItems.find(item => item.name === row.item_key)).filter(Boolean);
    const gear = applyEquipmentSetBonus(equippedItems, equipmentBonus(equippedItems));
    const build = getCharacterBuild(u.active_build);
    const effectiveMaxHp = Math.min(2000, Math.round((Number(u.max_hp) + gear.hp) * build.hp * (1 + Number(u.talent_hp) * 0.05)));
    const effectiveMaxMana = Math.min(2000, Math.round((Number(u.max_mana) + gear.mana) * build.mana * (1 + Number(u.talent_mana) * 0.05)));
    const effectiveAttack = Math.min(500, Math.round((Number(u.attack) + gear.attack) * build.attack * (1 + Number(u.talent_attack) * 0.04)));
    const effectiveDefense = Math.min(250, Math.round(applyClassDefense(Number(u.defense) + gear.defense, u.class_name) * build.defense * (1 + Number(u.talent_defense) * 0.04)));
    const currentHp = Math.max(0, Math.min(effectiveMaxHp, Math.round((Number(u.hp) / Math.max(1, Number(u.max_hp))) * effectiveMaxHp)));
    const currentMana = Math.max(0, Math.min(effectiveMaxMana, Math.round((Number(u.mana) / Math.max(1, Number(u.max_mana))) * effectiveMaxMana)));

    const gif = new AttachmentBuilder('./profil.gif');

    const embed = new EmbedBuilder()
      .setColor(0x9b8cff)
      .setTitle(`🧙 ${target.username} | Maceracı Profili`)
      .setThumbnail(target.displayAvatarURL())
      .addFields(
        { name: 'Seviye', value: String(u.level), inline: true },
        {
          name: 'XP',
          value: `${u.xp} / ${xpForNextLevel(u.level)}`,
          inline: true
        },
        { name: '🥐 Poğaça altını', value: Number(u.coins).toLocaleString('tr-TR'), inline: true },
        { name: '🔥 Günlük seri', value: `${Number(u.daily_streak || 0)} gün`, inline: true },
        { name: '🏆 En iyi seri', value: `${Number(u.best_daily_streak || 0)} gün`, inline: true },
        { name: 'Sınıf', value: u.class_name ?? 'Gezgin', inline: true },
        { name: '⚔️ Savaş yapısı', value: build.label, inline: true },
        { name: '❤️ Can', value: `${currentHp}/${effectiveMaxHp}`, inline: true },
        { name: '✨ Mana', value: `${currentMana}/${effectiveMaxMana}`, inline: true },
        { name: '⚔️ Saldırı', value: String(effectiveAttack), inline: true },
        { name: '🛡️ Savunma', value: String(effectiveDefense), inline: true },
        { name: '🌟 Dağıtılabilir puan', value: String(u.stat_points), inline: true },
        { name: '🧥 Kuşanılan ekipman', value: equippedItems.length ? equippedItems.map(item => item.name).join('\n') : 'Henüz ekipman yok', inline: false },
        { name: '🧩 Ekipman set bonusu', value: gear.setText || 'Henüz set bonusu etkin değil', inline: false }
      )
      .setImage('attachment://profil.gif')
      .setFooter({ text: 'Poğaça Frieren • Maceracı Kayıtları' });

    await interaction.reply({
      embeds: [embed],
      files: [gif]
    });
  }
};
