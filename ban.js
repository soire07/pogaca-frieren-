import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { pool } from './database/db.js';
export default {
  data: new SlashCommandBuilder().setName('ban').setDescription('Bir kullanıcıyı sunucudan yasaklar.')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(o => o.setName('kullanici').setDescription('Yasaklanacak kullanıcı').setRequired(true))
    .addStringOption(o => o.setName('sebep').setDescription('Sebep').setMaxLength(400).setRequired(false)),
  async execute(interaction) {
    const user = interaction.options.getUser('kullanici');
    const reason = interaction.options.getString('sebep') ?? 'Sebep belirtilmedi';
    await interaction.guild.members.ban(user.id, { reason });
    await pool.query('INSERT INTO moderation_cases(guild_id,target_id,moderator_id,action,reason) VALUES($1,$2,$3,$4,$5)', [interaction.guildId, user.id, interaction.user.id, 'BAN', reason]);
    await interaction.reply(`🔨 **${user.tag}** sunucudan yasaklandı. Sebep: ${reason}`);
  }
};
