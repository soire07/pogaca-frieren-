import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { pool } from './database/db.js';
import { checkModerationPermissions } from './ai-agent/moderation-safety.js';
export default {
  data: new SlashCommandBuilder().setName('ban').setDescription('Bir kullanıcıyı sunucudan yasaklar.')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(o => o.setName('kullanici').setDescription('Yasaklanacak kullanıcı').setRequired(true))
    .addStringOption(o => o.setName('sebep').setDescription('Sebep').setMaxLength(400).setRequired(false)),
  async execute(interaction) {
    const access = checkModerationPermissions(interaction, PermissionFlagsBits.BanMembers);
    if (!access.ok) return interaction.reply({ content: access.reason, ephemeral: true });
    const user = interaction.options.getUser('kullanici');
    const reason = interaction.options.getString('sebep') ?? 'Sebep belirtilmedi';
    await interaction.guild.members.ban(user.id, { reason });
    await pool.query('INSERT INTO moderation_cases(guild_id,target_id,moderator_id,action,reason) VALUES($1,$2,$3,$4,$5)', [interaction.guildId, user.id, interaction.user.id, 'BAN', reason]);
    await interaction.reply({ content: `🔨 **${user.tag}** sunucudan yasaklandı. Sebep: ${reason}`, allowedMentions: { parse: [] } });
  }
};
