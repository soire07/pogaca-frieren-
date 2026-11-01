import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { ownerOnly, listUserMemories, deleteUserMemory, createOwnerEmbed } from '../owner-admin.js';
import { pool } from '../database/db.js';

export default {
  data: new SlashCommandBuilder().setName('owner-bellek').setDescription('Frieren kullanıcı hafızalarını yönetir.')
    .addSubcommand(sub => sub.setName('listele').setDescription('Bir kullanıcının kayıtlı hafızalarını gösterir.')
      .addStringOption(option => option.setName('kullanici').setDescription('Discord kullanıcı ID').setRequired(true))
      .addStringOption(option => option.setName('sunucu').setDescription('İsteğe bağlı sunucu ID')))
    .addSubcommand(sub => sub.setName('sil').setDescription('Bir hafıza kaydını siler.')
      .addIntegerOption(option => option.setName('kayit').setDescription('Hafıza kayıt numarası').setRequired(true).setMinValue(1))
      .addBooleanOption(option => option.setName('onay').setDescription('Kalıcı silme işlemini onayla').setRequired(true))),
  async execute(interaction) {
    if (!await ownerOnly(interaction)) return;
    const sub = interaction.options.getSubcommand();
    if (sub === 'listele') {
      const userId = interaction.options.getString('kullanici', true);
      const guildId = interaction.options.getString('sunucu');
      const rows = await listUserMemories(pool, userId, guildId, 8);
      const description = rows.length ? rows.map(row => '**#' + row.id + ' · ' + row.memory_key + '** (sunucu ' + row.guild_id + ')\n' + row.memory_value).join('\n\n') : 'Bu kullanıcı için kayıtlı hafıza bulunamadı.';
      return interaction.reply({ embeds: [createOwnerEmbed('Kullanıcı hafızaları', description)], flags: MessageFlags.Ephemeral });
    }
    if (!interaction.options.getBoolean('onay', true)) return interaction.reply({ content: 'Silme işlemi için onay=true seçmelisin.', flags: MessageFlags.Ephemeral });
    const id = interaction.options.getInteger('kayit', true);
    const deleted = await deleteUserMemory(pool, id, interaction.user.id);
    return interaction.reply({ content: deleted ? '#' + deleted.id + ' numaralı hafıza kaydı silindi.' : 'Bu kayıt bulunamadı.', flags: MessageFlags.Ephemeral });
  }
};
