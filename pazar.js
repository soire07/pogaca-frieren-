import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { pool } from './database/db.js';
import {
  buyPlayerMarketListing,
  cancelPlayerMarketListing,
  createPlayerMarketListing,
  getPlayerMarketHistory,
  listPlayerMarketListings
} from './player-market.js';

const safeText = value => String(value || '').replace(/[\x00-\x1f\x7f]/g, '').replace(/[`*_~|]/g, '\\$&').slice(0, 120);

export default {
  data: new SlashCommandBuilder()
    .setName('pazar')
    .setDescription('Maceracılar arasında güvenli eşya pazarı.')
    .addSubcommand(command => command.setName('liste').setDescription('Sunucudaki aktif eşya ilanlarını göster.'))
    .addSubcommand(command => command.setName('sat').setDescription('Envanterindeki eşyayı pazara koy.')
      .addStringOption(option => option.setName('esya').setDescription('Envanterdeki eşyanın tam adı').setMaxLength(120).setRequired(true))
      .addIntegerOption(option => option.setName('adet').setDescription('Satılacak adet').setMinValue(1).setMaxValue(1000).setRequired(true))
      .addIntegerOption(option => option.setName('fiyat').setDescription('İlanın toplam altın fiyatı').setMinValue(1).setMaxValue(1000000).setRequired(true)))
    .addSubcommand(command => command.setName('al').setDescription('Bir ilanı satın al.')
      .addStringOption(option => option.setName('ilan').setDescription('İlan UUID').setMaxLength(36).setRequired(true)))
    .addSubcommand(command => command.setName('iptal').setDescription('Kendi ilanını iptal edip eşyayı geri al.')
      .addStringOption(option => option.setName('ilan').setDescription('İlan UUID').setMaxLength(36).setRequired(true)))
    .addSubcommand(command => command.setName('gecmis').setDescription('Pazar işlem geçmişini göster.')),
  async execute(interaction) {
    if (!interaction.guildId) {
      return interaction.reply({ content: 'Kuzey Pazarı yalnızca sunucularda kullanılabilir.', flags: MessageFlags.Ephemeral });
    }
    const action = interaction.options.getSubcommand();
    if (action === 'liste') {
      const listings = await listPlayerMarketListings(pool, interaction.guildId, 15);
      const lines = listings.map(item =>
        `• **${safeText(item.item_key)}** ×${item.quantity} — **${Number(item.price_coins).toLocaleString('tr-TR')} altın**\n  Satıcı: <@${item.seller_id}> · İlan: \`${item.listing_id}\``
      );
      return interaction.reply({
        content: `**🛒 Kuzey Pazarı**\n${lines.join('\n') || 'Şu anda aktif ilan yok.'}\n\nSatın almak için '/pazar al' komutunu kullan.`,
        allowedMentions: { parse: [] }
      });
    }
    if (action === 'sat') {
      const result = await createPlayerMarketListing(pool, {
        guildId: interaction.guildId,
        sellerId: interaction.user.id,
        itemKey: interaction.options.getString('esya'),
        quantity: interaction.options.getInteger('adet'),
        priceCoins: interaction.options.getInteger('fiyat')
      });
      const messages = {
        listed: `İlanın oluşturuldu: **${safeText(result.listing.item_key)}** ×${result.listing.quantity} · **${result.listing.price_coins} altın**\nİlan ID: \`${result.listing.listing_id}\``,
        seller_missing: 'Oyuncu kaydın bulunamadı.',
        listing_limit: 'Aynı anda en fazla 10 aktif ilan açabilirsin.',
        insufficient_items: 'Bu miktarda eşya envanterinde yok.',
        equipped_item: 'Üzerinde takılı olan eşyayı pazara koyamazsın. Önce ekipmanı çıkar.'
      };
      return interaction.reply({ content: messages[result.status] || 'İlan oluşturulamadı.', flags: MessageFlags.Ephemeral });
    }
    if (action === 'al') {
      const result = await buyPlayerMarketListing(pool, {
        guildId: interaction.guildId,
        buyerId: interaction.user.id,
        listingId: interaction.options.getString('ilan')
      });
      const messages = {
        purchased: `Satın alma tamamlandı: **${safeText(result.itemKey)}** ×${result.quantity}. Ödenen: **${result.priceCoins} altın** · Kalan: **${result.buyerBalance} altın**.`,
        unavailable: 'İlan artık aktif değil veya bulunamadı.',
        self_purchase: 'Kendi ilanını satın alamazsın.',
        insufficient_funds: 'Bu ilan için yeterli altının yok.'
      };
      return interaction.reply({ content: messages[result.status] || 'Satın alma tamamlanamadı.', flags: MessageFlags.Ephemeral });
    }
    if (action === 'iptal') {
      const result = await cancelPlayerMarketListing(pool, {
        guildId: interaction.guildId,
        sellerId: interaction.user.id,
        listingId: interaction.options.getString('ilan')
      });
      const messages = {
        cancelled: `İlan iptal edildi; **${safeText(result.itemKey)}** ×${result.quantity} envanterine geri döndü.`,
        not_owner: 'Yalnızca kendi ilanını iptal edebilirsin.',
        unavailable: 'İlan aktif değil veya bulunamadı.'
      };
      return interaction.reply({ content: messages[result.status] || 'İlan iptal edilemedi.', flags: MessageFlags.Ephemeral });
    }
    if (action === 'gecmis') {
      const history = await getPlayerMarketHistory(pool, interaction.guildId, interaction.user.id, 10);
      const lines = history.map(item =>
        `• **${safeText(item.item_key)}** ×${item.quantity} · ${item.price_coins} altın · ${item.status === 'sold' ? 'Satıldı' : item.status === 'cancelled' ? 'İptal' : 'Aktif'} · \`${item.listing_id}\``
      );
      return interaction.reply({ content: `**Pazar Geçmişin**\n${lines.join('\n') || 'Henüz işlem yok.'}`, flags: MessageFlags.Ephemeral });
    }
    return interaction.reply({ content: 'Bilinmeyen pazar işlemi.', flags: MessageFlags.Ephemeral });
  }
};
