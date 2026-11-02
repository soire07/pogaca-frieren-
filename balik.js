import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { pool } from './database/db.js';
import { FISHING_ZONES, fishAtZone, getFishCollection, initFishingSchema } from './fishing.js';
let schemaReady;
async function ensureSchema() {
  if (!schemaReady) schemaReady = initFishingSchema(pool).catch(error => { schemaReady = null; throw error; });
  await schemaReady;
}
export default {
  data: new SlashCommandBuilder().setName('balik').setDescription('Kuzey Kıtası’nda balık tut ve balık defterini tamamla.')
    .addSubcommand(sub => sub.setName('avlan').setDescription('Seçtiğin bölgede balık tut.')
      .addStringOption(option => option.setName('bolge').setDescription('Balık tutacağın bölge.').setRequired(true)
        .addChoices(...FISHING_ZONES.map(zone => ({ name: zone.name, value: zone.key }))))
    ).addSubcommand(sub => sub.setName('defter').setDescription('Yakaladığın balıkları ve koleksiyon ilerlemeni gör.')),
  async execute(interaction) {
    if (!interaction.guildId) return interaction.reply({ content: 'Balıkçılık yalnızca sunucularda kullanılabilir.', flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      await ensureSchema();
      if (interaction.options.getSubcommand() === 'defter') {
        const book = await getFishCollection(pool, interaction.guildId, interaction.user.id);
        const lines = book.entries.map(item => (item.fish?.emoji || '🐟') + ' **' + (item.fish?.name || item.fish_key) + '** × ' + item.quantity + ' · ' + (item.fish?.rarity || 'Bilinmiyor'));
        const embed = new EmbedBuilder().setColor(0x78c8df).setTitle('📖 Kuzey Balık Defteri')
          .setDescription(lines.join('\n') || 'Henüz balık yakalamadın. İlk avın için /balik avlan kullan.')
          .setFooter({ text: book.unique + '/' + book.totalSpecies + ' tür · toplam ' + book.caught + ' yakalama' });
        return interaction.editReply({ embeds: [embed] });
      }
      const result = await fishAtZone(pool, { guildId: interaction.guildId, userId: interaction.user.id, zoneKey: interaction.options.getString('bolge', true) });
      let embed;
      if (result.status === 'caught') embed = new EmbedBuilder().setColor(0x78c8df).setTitle('🎣 Kuzey Kıtası’nda av')
        .setDescription(result.fish.emoji + ' **' + result.fish.name + '** yakaladın!\nNadirlik: **' + result.fish.rarity + '**\nBölge: **' + result.zone.name + '**');
      else if (result.status === 'cooldown') embed = new EmbedBuilder().setColor(0xe0b45c).setTitle('⏳ Oltanı dinlendir').setDescription('Bir sonraki av için 30 dakika beklemelisin.');
      else if (result.status === 'locked_zone') embed = new EmbedBuilder().setColor(0xe0b45c).setTitle('🔒 Bölge henüz keşfedilmedi').setDescription('**' + result.zone.name + '** için en az **' + result.requiredLevel + '. seviye** gerekiyor. Mevcut seviyen: ' + result.level + '.');
      else embed = new EmbedBuilder().setColor(0xe07b72).setDescription('Bu balıkçılık işlemi gerçekleştirilemedi.');
      return interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('Balıkçılık komutu başarısız:', error?.message || error);
      return interaction.editReply({ content: 'Balıkçılık şu anda kullanılamıyor. Biraz sonra tekrar dene.' });
    }
  }
};
