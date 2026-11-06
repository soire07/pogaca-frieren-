import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { pool } from './database/db.js';
import { ensureNewsBirdSchema, setNewsGuildChannel } from './news-birds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('haberleri-ayarla')
    .setDescription('Günlük anime, manga ve oyun haberlerini bu kanala gönder.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  async execute(interaction) {
    if (!interaction.guildId || !interaction.guild) {
      return interaction.reply({content:'Bu komut yalnızca sunucuda kullanılabilir.',flags:MessageFlags.Ephemeral});
    }
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({content:'Bu ayar için Sunucuyu Yönet yetkisi gerekiyor.',flags:MessageFlags.Ephemeral});
    }
    const channel=interaction.channel;
    if (!channel?.isTextBased?.() || typeof channel.send!=='function') {
      return interaction.reply({content:'Haberler yalnızca mesaj gönderilebilen metin kanallarına ayarlanabilir.',flags:MessageFlags.Ephemeral});
    }
    const botMember=interaction.guild.members.me;
    const permissions=botMember ? channel.permissionsFor(botMember) : null;
    if (!permissions?.has([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.EmbedLinks])) {
      return interaction.reply({content:'Bu kanalda Görüntüle, Mesaj Gönder ve Bağlantı Yerleştir izinlerimin üçü de açık olmalı.',flags:MessageFlags.Ephemeral});
    }
    await ensureNewsBirdSchema(pool);
    await setNewsGuildChannel(pool,{guildId:interaction.guildId,channelId:channel.id});
    return interaction.reply({content:'🐦 Günlük Frieren haberleri artık '+channel+' kanalına gönderilecek. Başka bir kanala taşımak için komutu orada yeniden çalıştırabilirsin.',flags:MessageFlags.Ephemeral});
  }
};
