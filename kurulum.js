import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder } from 'discord.js';
import { pool } from './database/db.js';

export default {
  data: new SlashCommandBuilder()
    .setName('kurulum')
    .setDescription('Poğaça Frieren sunucu ayarlarını yönet.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s => s.setName('karsilama')
      .setDescription('Yeni üyeler için karşılama kanalını ve mesajını ayarla.')
      .addChannelOption(o => o.setName('kanal').setDescription('Karşılama mesajlarının gönderileceği kanal').addChannelTypes(ChannelType.GuildText).setRequired(true))
      .addStringOption(o => o.setName('mesaj').setDescription('{user}, {server}, {count} değişkenlerini kullanabilirsin.').setMaxLength(1800).setRequired(false)))
    .addSubcommand(s => s.setName('log')
      .setDescription('Moderasyon log kanalını ayarla.')
      .addChannelOption(o => o.setName('kanal').setDescription('Log mesajlarının gönderileceği kanal').addChannelTypes(ChannelType.GuildText).setRequired(true)))
    .addSubcommand(s => s.setName('durum').setDescription('Mevcut sunucu ayarlarını göster.')),
  async execute(interaction) {
    if (!interaction.guildId) return interaction.reply({ content: 'Bu komut yalnızca sunucularda kullanılabilir.', ephemeral: true });
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: 'Bu komut için **Sunucuyu Yönet** izni gerekiyor.', ephemeral: true });
    }
    const sub = interaction.options.getSubcommand();
    try {
      if (sub === 'karsilama') {
        const channel = interaction.options.getChannel('kanal');
        const message = interaction.options.getString('mesaj') || 'Hoş geldin {user}! 🥐 **{server}** sunucusuna katıldın. Sunucudaki {count}. üyesin!';
        await pool.query(`INSERT INTO guild_settings (guild_id, welcome_channel_id, welcome_message)
          VALUES ($1,$2,$3) ON CONFLICT (guild_id) DO UPDATE
          SET welcome_channel_id=EXCLUDED.welcome_channel_id, welcome_message=EXCLUDED.welcome_message`,
          [interaction.guildId, channel.id, message]);
        return interaction.reply({ content: `✅ Karşılama ayarlandı: ${channel}\nDeğişkenler: ` + '`{user}`, `{server}`, `{count}`' + `\nMesaj: ${message}`, ephemeral: true });
      }
      if (sub === 'log') {
        const channel = interaction.options.getChannel('kanal');
        await pool.query(`INSERT INTO guild_settings (guild_id, log_channel_id)
          VALUES ($1,$2) ON CONFLICT (guild_id) DO UPDATE SET log_channel_id=EXCLUDED.log_channel_id`,
          [interaction.guildId, channel.id]);
        return interaction.reply({ content: `✅ Moderasyon log kanalı kaydedildi: ${channel}\nBu kanala üye katılma/ayrılma, ban olayları, timeout, rol ve takma ad değişiklikleri, mesaj silme/düzenleme ve toplu silme kayıtları gönderilir. Mesaj içeriği Discord izinlerine ve önbelleğe bağlıdır. Botun kanalı görüntüleme ve mesaj gönderme izinleri olmalı.`, ephemeral: true });
      }
      const { rows: [settings] } = await pool.query(
        'SELECT welcome_channel_id, welcome_message, log_channel_id FROM guild_settings WHERE guild_id=$1',
        [interaction.guildId]
      );
      const welcome = settings?.welcome_channel_id ? '<#' + settings.welcome_channel_id + '>' : 'Ayarlanmamış';
      const log = settings?.log_channel_id ? '<#' + settings.log_channel_id + '>' : 'Ayarlanmamış';
      const embed = new EmbedBuilder().setColor(0x9b8cff).setTitle('🥐 Poğaça Frieren • Sunucu Kurulumu')
        .addFields({ name: '👋 Karşılama', value: welcome, inline: true }, { name: '📋 Log kanalı', value: log, inline: true })
        .setFooter({ text: 'Ayarlar PostgreSQL üzerinde saklanır.' });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
      console.error('/kurulum hatası:', error);
      return interaction.reply({ content: 'Ayar kaydedilemedi. Botun veritabanı bağlantısını kontrol et.', ephemeral: true });
    }
  }
};
