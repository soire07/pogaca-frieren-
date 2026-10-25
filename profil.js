import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { pool, ensureUser } from './database/db.js';
import { xpForNextLevel } from './utils.js';
  data: new SlashCommandBuilder().setName('profil').setDescription('RPG profilini veya başka bir oyuncunun profilini gösterir.')
    .addUserOption(o => o.setName('kullanici').setDescription('Profilini görmek istediğin kullanıcı').setRequired(false)),
  async execute(interaction) {
    const target = interaction.options.getUser('kullanici') ?? interaction.user;
    await ensureUser(interaction.guildId, target.id);
    const { rows: [u] } = await pool.query('SELECT xp, level, coins, class_name FROM users WHERE guild_id=$1 AND user_id=$2', [interaction.guildId, target.id]);
    const embed = new EmbedBuilder().setColor(0x9b8cff).setTitle(`🧙 ${target.username} | Maceracı Profili`).setThumbnail(target.displayAvatarURL())
      .addFields(
        { name: 'Seviye', value: String(u.level), inline: true },
        { name: 'XP', value: `${u.xp} / ${xpForNextLevel(u.level)}`, inline: true },
        { name: '🥐 Poğaça altını', value: String(u.coins), inline: true },
        { name: 'Sınıf', value: u.class_name, inline: true }
      );
    await interaction.reply({ embeds: [embed] });
  }
};
