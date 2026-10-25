import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { pool } from './database/db.js';
export default {
  data: new SlashCommandBuilder().setName('uyar').setDescription('Bir kullanıcıya uyarı verir ve kaydeder.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName('kullanici').setDescription('Uyarılacak kullanıcı').setRequired(true))
    .addStringOption(o => o.setName('sebep').setDescription('Uyarı sebebi').setMaxLength(400).setRequired(true)),
  async execute(interaction) {
    const target = interaction.options.getUser('kullanici');
    const reason = interaction.options.getString('sebep', true);
    await pool.query('INSERT INTO moderation_cases(guild_id,target_id,moderator_id,action,reason) VALUES($1,$2,$3,$4,$5)', [interaction.guildId, target.id, interaction.user.id, 'UYARI', reason]);
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xe0b44c).setTitle('⚠️ Uyarı kaydedildi').addFields({ name: 'Kullanıcı', value: `${target}`, inline: true }, { name: 'Moderatör', value: `${interaction.user}`, inline: true }, { name: 'Sebep', value: reason })] });
  }
};
