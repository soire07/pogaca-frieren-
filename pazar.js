import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { pool } from './database/db.js';
import {
  buyPlayerMarketListing,
  cancelPlayerMarketListing,
  createPlayerMarketListing,
  getPlayerMarketHistory,
  listPlayerMarketListings,
  createPlayerMarketOffer,
  listPlayerMarketOffers,
  resolvePlayerMarketOffer,
  cancelPlayerMarketOffer,
  createPlayerMarketPriceAlert,
  listPlayerMarketPriceAlerts,
  cancelPlayerMarketPriceAlert
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
    .addSubcommand(command => command.setName('gecmis').setDescription('Pazar işlem geçmişini göster.'))
    .addSubcommand(command => command.setName('teklif-ver').setDescription('Bir ilana pazarlık teklifi gönder.')
      .addStringOption(option => option.setName('ilan').setDescription('İlan UUID').setMaxLength(36).setRequired(true))
      .addIntegerOption(option => option.setName('fiyat').setDescription('Teklifin (altın)').setMinValue(1).setMaxValue(1000000).setRequired(true)))
    .addSubcommand(command => command.setName('teklifler').setDescription('Bir ilan için gelen veya gönderdiğin teklifleri göster.')
      .addStringOption(option => option.setName('ilan').setDescription('İlan UUID').setMaxLength(36).setRequired(true)))
    .addSubcommand(command => command.setName('teklif-kabul').setDescription('Bir alıcı teklifini kabul et.')
      .addStringOption(option => option.setName('teklif').setDescription('Teklif UUID').setMaxLength(36).setRequired(true)))
    .addSubcommand(command => command.setName('teklif-reddet').setDescription('Bir alıcı teklifini reddet.')
      .addStringOption(option => option.setName('teklif').setDescription('Teklif UUID').setMaxLength(36).setRequired(true)))
    .addSubcommand(command => command.setName('teklif-iptal').setDescription('Gönderdiğin bekleyen teklifi geri çek.')
      .addStringOption(option => option.setName('teklif').setDescription('Teklif UUID').setMaxLength(36).setRequired(true)))
    .addSubcommand(command => command.setName('alarm-kur').setDescription('Bir eşya hedef fiyatına indiğinde tek seferlik bildirim al.')
      .addStringOption(option => option.setName('esya').setDescription('Eşyanın tam adı').setMaxLength(120).setRequired(true))
      .addIntegerOption(option => option.setName('fiyat').setDescription('En fazla ödeyeceğin altın').setMinValue(1).setMaxValue(1000000).setRequired(true)))
    .addSubcommand(command => command.setName('alarmlar').setDescription('Aktif fiyat alarmlarını görüntüle.'))
    .addSubcommand(command => command.setName('alarm-sil').setDescription('Fiyat alarmını iptal et.')
      .addStringOption(option => option.setName('id').setDescription('Alarm UUID').setMaxLength(36).setRequired(true))),
  async execute(interaction) {
    if (!interaction.guildId) {
      return interaction.reply({ content: 'Kuzey Pazarı yalnızca sunucularda kullanılabilir.', flags: MessageFlags.Ephemeral });
    }
    const action = interaction.options.getSubcommand();
    if (action === 'alarm-kur') {
      const result = await createPlayerMarketPriceAlert(pool, {
        guildId: interaction.guildId, userId: interaction.user.id,
        itemKey: interaction.options.getString('esya'),
        targetPrice: interaction.options.getInteger('fiyat')
      });
      const alert = result.alert;
      return interaction.reply({
        content: result.status === 'created'
          ? `Fiyat alarmın etkin. **${safeText(alert.item_key)}** ${Number(alert.target_price).toLocaleString('tr-TR')} altın veya altına indiğinde sana DM göndereceğim. Alarm: \`${alert.alert_id}\``
          : result.status === 'alert_limit' ? 'En fazla 10 aktif fiyat alarmı kurabilirsin.'
          : 'Oyuncu kaydın bulunamadı.',
        flags: MessageFlags.Ephemeral
      });
    }
    if (action === 'alarmlar') {
      const alerts = await listPlayerMarketPriceAlerts(pool, interaction.guildId, interaction.user.id, 10);
      const lines = alerts.map(alert => `• **${safeText(alert.item_key)}** ≤ ${Number(alert.target_price).toLocaleString('tr-TR')} altın · ${alert.status === 'active' ? 'Aktif' : 'Bildirildi'} · \`${alert.alert_id}\``);
      return interaction.reply({ content: '**Kuzey Pazarı fiyat alarmların**\\n' + (lines.join('\\n') || 'Henüz fiyat alarmın yok.'), flags: MessageFlags.Ephemeral });
    }
    if (action === 'alarm-sil') {
      const result = await cancelPlayerMarketPriceAlert(pool, {
        guildId: interaction.guildId, userId: interaction.user.id,
        alertId: interaction.options.getString('id')
      });
      return interaction.reply({ content: result.status === 'cancelled' ? 'Fiyat alarmı iptal edildi.' : 'Bu alarm bulunamadı veya zaten iptal edilmiş.', flags: MessageFlags.Ephemeral });
    }
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
    if (action === 'teklif-ver') {
      const result = await createPlayerMarketOffer(pool, {
        guildId: interaction.guildId,
        buyerId: interaction.user.id,
        listingId: interaction.options.getString('ilan'),
        offerCoins: interaction.options.getInteger('fiyat')
      });
      const messages = {
        offer_created: 'Teklifin satıcıya iletildi. Altın, satıcı kabul ederse tahsil edilir. Teklif ID: `' + result.offer.offer_id + '`',
        already_offered: 'Bu ilan için zaten bekleyen bir teklifin var: `' + result.offerId + '`',
        offer_limit: 'Aynı anda en fazla 20 bekleyen teklif verebilirsin.',
        self_offer: 'Kendi ilanına teklif veremezsin.',
        unavailable: 'İlan artık aktif değil veya bulunamadı.',
        buyer_missing: 'Oyuncu kaydın bulunamadı.'
      };
      return interaction.reply({ content: messages[result.status] || 'Teklif oluşturulamadı.', flags: MessageFlags.Ephemeral });
    }
    if (action === 'teklifler') {
      const result = await listPlayerMarketOffers(pool, {
        guildId: interaction.guildId,
        actorId: interaction.user.id,
        listingId: interaction.options.getString('ilan')
      });
      if (result.status !== 'listed') return interaction.reply({ content: result.status === 'forbidden' ? 'Bu ilanın tekliflerini görüntüleme yetkin yok.' : 'İlan bulunamadı.', flags: MessageFlags.Ephemeral });
      const lines = result.offers.map(offer => '• <@' + offer.buyer_id + '> — **' + Number(offer.offer_coins).toLocaleString('tr-TR') + ' altın** · ' + offer.status + ' · `' + offer.offer_id + '`');
      return interaction.reply({ content: '**İlan Teklifleri**\n' + (lines.join('\n') || 'Henüz teklif yok.'), flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    }
    if (action === 'teklif-kabul' || action === 'teklif-reddet') {
      const result = await resolvePlayerMarketOffer(pool, {
        guildId: interaction.guildId,
        sellerId: interaction.user.id,
        offerId: interaction.options.getString('teklif'),
        decision: action === 'teklif-kabul' ? 'accept' : 'reject'
      });
      const messages = {
        accepted: 'Teklif kabul edildi. **' + safeText(result.itemKey) + '** ×' + result.quantity + ' alıcıya aktarıldı; **' + result.offerCoins + ' altın** hesabına eklendi.',
        rejected: 'Teklif reddedildi.',
        not_owner: 'Teklifi yalnızca ilanın sahibi kabul veya reddedebilir.',
        insufficient_funds: 'Alıcının kabul anında yeterli altını bulunmuyor; teklif beklemede kaldı.',
        unavailable: 'Teklif artık beklemede değil veya ilan aktif değil.'
      };
      return interaction.reply({ content: messages[result.status] || 'Teklif işlenemedi.', flags: MessageFlags.Ephemeral });
    }
    if (action === 'teklif-iptal') {
      const result = await cancelPlayerMarketOffer(pool, {
        guildId: interaction.guildId,
        buyerId: interaction.user.id,
        offerId: interaction.options.getString('teklif')
      });
      const messages = { cancelled: 'Teklif geri çekildi.', not_owner: 'Yalnızca kendi teklifini geri çekebilirsin.', unavailable: 'Teklif beklemede değil veya bulunamadı.' };
      return interaction.reply({ content: messages[result.status] || 'Teklif geri çekilemedi.', flags: MessageFlags.Ephemeral });
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
