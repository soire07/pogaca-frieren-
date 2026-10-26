
import { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { pool, ensureUser } from './database/db.js';
import { xpForNextLevel } from './utils.js';
import { equipmentItems, equipmentBonus } from './equipment-data.js';

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
      'SELECT xp, level, coins, class_name, hp, max_hp, mana, max_mana, attack, defense, stat_points FROM users WHERE guild_id=$1 AND user_id=$2',
      [interaction.guildId, target.id]
    );

    const equippedResult = await pool.query('SELECT item_key FROM user_equipment WHERE guild_id=$1 AND user_id=$2', [interaction.guildId, target.id]);
    const equippedItems = equippedResult.rows.map(row => equipmentItems.find(item => item.name === row.item_key)).filter(Boolean);
    const gear = equipmentBonus(equippedItems);
    const effectiveMaxHp = Math.min(2000, Number(u.max_hp) + gear.hp);
    const effectiveMaxMana = Math.min(2000, Number(u.max_mana) + gear.mana);
    const effectiveAttack = Math.min(500, Number(u.attack) + gear.attack);
    const effectiveDefense = Math.min(250, Number(u.defense) + gear.defense);

    if (!u) {
      return interaction.reply({
        content: 'Profil bilgileri bulunamadı. Lütfen tekrar dene.',
        ephemeral: true
      });
    }

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
        { name: 'Sınıf', value: u.class_name ?? 'Gezgin', inline: true },
        { name: '❤️ Can', value: `${Math.min(Number(u.hp), effectiveMaxHp)}/${effectiveMaxHp}`, inline: true },
        { name: '✨ Mana', value: `${Math.min(Number(u.mana), effectiveMaxMana)}/${effectiveMaxMana}`, inline: true },
        { name: '⚔️ Saldırı', value: String(effectiveAttack), inline: true },
        { name: '🛡️ Savunma', value: String(effectiveDefense), inline: true },
        { name: '🌟 Dağıtılabilir puan', value: String(u.stat_points), inline: true },
        { name: '🧥 Kuşanılan ekipman', value: equippedItems.length ? equippedItems.map(item => item.name).join('\n') : 'Henüz ekipman yok', inline: false }
      )
      .setImage('attachment://profil.gif')
      .setFooter({ text: 'Poğaça Frieren • Maceracı Kayıtları' });

    await interaction.reply({
      embeds: [embed],
      files: [gif]
    });
  }
};
