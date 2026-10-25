
import { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { pool, ensureUser } from './database/db.js';
import { xpForNextLevel } from './utils.js';

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
    const target =
      interaction.options.getUser('kullanici') ?? interaction.user;

    await ensureUser(interaction.guildId, target.id);

    const { rows: [u] } = await pool.query(
      'SELECT xp, level, coins, class_name FROM users WHERE guild_id=$1 AND user_id=$2',
      [interaction.guildId, target.id]
    );

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
        { name: '🥐 Poğaça altını', value: String(u.coins), inline: true },
        { name: 'Sınıf', value: u.class_name ?? 'Belirlenmedi', inline: true }
      )
      .setImage('attachment://profil.gif')
      .setFooter({ text: 'Poğaça Frieren • Maceracı Kayıtları' });

    await interaction.reply({
      embeds: [embed],
      files: [gif]
    });
  }
};
