import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { pool } from './database/db.js';
import { createSiteLinkToken, getAdventurerDashboard } from './adventurer-platform.js';

export default {
  data: new SlashCommandBuilder()
    .setName('maceraci')
    .setDescription('Web Maceracı Panelini bağla ve RPG profilini görüntüle.')
    .addSubcommand(command => command.setName('bagla').setDescription('Discord karakterini web hesabına güvenli şekilde bağla.'))
    .addSubcommand(command => command.setName('bilgi').setDescription('Bağlı web profilinin özetini görüntüle.')),
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
    const data = await getAdventurerDashboard(pool, 'site_' + '00000000-0000-0000-0000-000000000000').catch(() => null);
    return interaction.reply({
      content: data?.profiles?.length ? 'Web Maceracı Panelindeki karakterlerini görüntüleyebilirsin.' : 'Web profilini bağlamak için **/maceraci bagla** komutunu kullan.',
      flags: MessageFlags.Ephemeral
    });
  }
};
