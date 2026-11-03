import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { pool } from './database/db.js';
import { createSiteLinkToken } from './adventurer-platform.js';

export default {
  data: new SlashCommandBuilder()
    .setName('maceraci')
    .setDescription('Web Maceracı Panelini bağla ve RPG profilini görüntüle.')
    .addSubcommand(command => command.setName('bagla').setDescription('Discord karakterini web hesabına güvenli şekilde bağla.')),
  async execute(interaction) {
    if (!interaction.guildId) return interaction.reply({ content: 'Bu komut bir sunucuda kullanılmalıdır.', flags: MessageFlags.Ephemeral });
    if (interaction.options.getSubcommand() === 'bagla') {
      const result = await createSiteLinkToken(pool, { guildId: interaction.guildId, userId: interaction.user.id });
      const base = String(process.env.SITE_BASE_URL || 'https://frierenbot.vercel.app').replace(/\/+$/, '');
      return interaction.reply({
        content: `**Web Maceracı Paneli bağlantı kodun**\n\n\```\n${result.token}\n\```\n\n1. [Frieren Portalı aç](${base}/maceraci)\n2. Web hesabına giriş yap.\n3. Kodu bağlantı alanına gir.\n\nKod 10 dakika geçerlidir ve yalnızca bir kez kullanılabilir.`,
        flags: MessageFlags.Ephemeral
      });
    }
    return interaction.reply({ content: 'Web Maceracı Paneline gitmek için [buraya dokun](https://frierenbot.vercel.app/maceraci).', flags: MessageFlags.Ephemeral });
  }
};
