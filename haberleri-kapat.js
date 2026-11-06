import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { pool } from './database/db.js';
import { disableNewsGuildChannel } from './news-birds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('haberleri-kapat')
    .setDescription('Bu sunucudaki günlük Frieren haberlerini durdur.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  async execute(interaction) {
    if (!interaction.guildId) {
      return interaction.reply({content:'Bu komut yalnızca sunucuda kullanılabilir.',flags:MessageFlags.Ephemeral});
    }
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({content:'Bu ayar için Sunucuyu Yönet yetkisi gerekiyor.',flags:MessageFlags.Ephemeral});
    }
    const result=await disableNewsGuildChannel(pool,interaction.guildId);
    return interaction.reply({content:result.status==='disabled'?'Bu sunucudaki günlük Frieren haberleri durduruldu. Yeniden açmak için /haberleri-ayarla komutunu istediğin kanalda kullan.':'Bu sunucu için etkin bir haber kanalı ayarlanmamış.',flags:MessageFlags.Ephemeral});
  }
};
