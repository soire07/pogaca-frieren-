import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { pool } from './database/db.js';
import { checkModerationPermissions } from './ai-agent/moderation-safety.js';
export default {
  data: new SlashCommandBuilder().setName('uyar').setDescription('Bir kullanıcıya uyarı verir ve kaydeder.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName('kullanici').setDescription('Uyarılacak kullanıcı').setRequired(true))
    .addStringOption(o => o.setName('sebep').setDescription('Uyarı sebebi').setMaxLength(400).setRequired(true)),
  async execute(interaction) {
    const access = checkModerationPermissions(interaction, PermissionFlagsBits.ModerateMembers);
    if (!access.ok) return interaction.reply({ content: access.reason, ephemeral: true });
    const target = interaction.options.getUser('kullanici');
    const reason = interaction.options.getString('sebep', true);
    await pool.query('INSERT INTO moderation_cases(guild_id,target_id,moderator_id,action,reason) VALUES($1,$2,$3,$4,$5)', [interaction.guildId, target.id, interaction.user.id, 'UYARI', reason]);
    try {
      const settings = await pool.query('SELECT log_channel_id FROM guild_settings WHERE guild_id=$1', [interaction.guildId]);
      const channelId = settings.rows[0]?.log_channel_id;
      const channel = channelId ? await interaction.guild.channels.fetch(channelId).catch(() => null) : null;
      if (channel?.isTextBased() && channel.send) {
        await channel.send({
          content: `⚠️ **Uyarı kaydedildi**\nKullanıcı: ${target.tag} (${target.id})\nModeratör: ${interaction.user.tag}\nSebep: ${reason}`,
          allowedMentions: { parse: [] }
        });
      }
    } catch (error) {
      console.error('Uyarı logu gönderilemedi:', error);
    }
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xe0b44c).setTitle('⚠️ Uyarı kaydedildi').addFields({ name: 'Kullanıcı', value: `${target}`, inline: true }, { name: 'Moderatör', value: `${interaction.user}`, inline: true }, { name: 'Sebep', value: reason })] });
  }
};
