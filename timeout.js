import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { pool } from './database/db.js';
export default {
  data: new SlashCommandBuilder().setName('timeout').setDescription('Bir üyeyi belirli süre susturur.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName('kullanici').setDescription('Susturulacak üye').setRequired(true))
    .addIntegerOption(o => o.setName('dakika').setDescription('1-10080 dakika').setMinValue(1).setMaxValue(10080).setRequired(true))
    .addStringOption(o => o.setName('sebep').setDescription('Sebep').setMaxLength(400).setRequired(false)),
  async execute(interaction) {
    const user = interaction.options.getUser('kullanici');
    const minutes = interaction.options.getInteger('dakika', true);
    const reason = interaction.options.getString('sebep') ?? 'Sebep belirtilmedi';
    const member = await interaction.guild.members.fetch(user.id);
    if (!member.moderatable) return interaction.reply({ content: 'Bu üyeye timeout uygulayamıyorum. Bot rolünün sırasını ve izinlerini kontrol et.', ephemeral: true });
    await member.timeout(minutes * 60_000, reason);
    await pool.query('INSERT INTO moderation_cases(guild_id,target_id,moderator_id,action,reason) VALUES($1,$2,$3,$4,$5)', [interaction.guildId, user.id, interaction.user.id, `TIMEOUT ${minutes}m`, reason]);
    await interaction.reply(`🔇 ${user} kullanıcısına **${minutes} dakika** timeout uygulandı. Sebep: ${reason}`);
  }
};
