import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { pool } from './database/db.js';
import { createGuildEvent, listGuildEvents, joinGuildEvent, leaveGuildEvent } from './adventurer-platform.js';
import { checkInGuildEvent } from './player-experience.js';

const OWNER_ID = '1553794496234262641';
const dateText = value => new Date(value).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Istanbul' });
const eventTypeLabel = type => ({ boss_raid: 'Boss / Raid', tournament: 'Takım Turnuvası', anime_night: 'Anime Gecesi' })[type] || 'Topluluk';

export default {
  data: new SlashCommandBuilder()
    .setName('etkinlik')
    .setDescription('Sunucu macera etkinliklerinin takvimini yönet.')
    .addSubcommand(command => command.setName('liste').setDescription('Yaklaşan etkinlikleri göster.'))
    .addSubcommand(command => command.setName('katil').setDescription('Bir etkinliğe katıl.').addStringOption(option => option.setName('id').setDescription('Etkinlik kimliği').setRequired(true)))
    .addSubcommand(command => command.setName('ayril').setDescription('Bir etkinlikten ayrıl.').addStringOption(option => option.setName('id').setDescription('Etkinlik kimliği').setRequired(true)))
    .addSubcommand(command => command.setName('yoklama').setDescription('Başlamış etkinlikte katılımını doğrula.').addStringOption(option => option.setName('id').setDescription('Etkinlik kimliği').setRequired(true)))
    .addSubcommand(command => command.setName('olustur').setDescription('Yeni topluluk etkinliği oluştur (yalnızca bot sahibi).')
      .addStringOption(option => option.setName('baslik').setDescription('Etkinlik başlığı').setMaxLength(100).setRequired(true))
      .addStringOption(option => option.setName('baslangic').setDescription('ISO tarih/saat, ör. 2026-11-10T20:00:00+03:00').setRequired(true))
      .addStringOption(option => option.setName('bitis').setDescription('ISO tarih/saat ve saat dilimi').setRequired(true))
      .addStringOption(option => option.setName('aciklama').setDescription('Etkinlik açıklaması').setMaxLength(1000))
      .addStringOption(option => option.setName('tur').setDescription('Etkinlik türü').addChoices({ name: 'Topluluk', value: 'community' }, { name: 'Boss / Raid', value: 'boss_raid' }, { name: 'Takım Turnuvası', value: 'tournament' }, { name: 'Anime Gecesi', value: 'anime_night' }))
      .addIntegerOption(option => option.setName('kapasite').setDescription('En fazla katılımcı (boş: sınırsız)').setMinValue(1).setMaxValue(500))),
  async execute(interaction) {
    if (!interaction.guildId) return interaction.reply({ content: 'Etkinlikler yalnızca sunucularda kullanılabilir.', flags: MessageFlags.Ephemeral });
    const action = interaction.options.getSubcommand();
    if (action === 'liste') {
      const events = await listGuildEvents(pool, interaction.guildId, 15);
      const lines = events.map(event => `• **${event.title}** — ${dateText(event.starts_at)} · ${event.participants}${event.max_participants ? '/'+event.max_participants : ''} kişi\n  ${eventTypeLabel(event.event_type)} · ID: \`${event.event_id}\`\n  ${event.description || 'Açıklama yok.'}`);
      return interaction.reply({ content: `**Yaklaşan Macera Etkinlikleri**\n${lines.join('\n') || 'Henüz planlanmış etkinlik yok.'}`, flags: MessageFlags.Ephemeral });
    }
    const eventId = interaction.options.getString('id');
    if (action === 'katil') {
      const result = await joinGuildEvent(pool, { guildId: interaction.guildId, eventId, userId: interaction.user.id });
      const messages = { joined: 'Etkinliğe kaydın oluşturuldu.', already_joined: 'Bu etkinliğe zaten kayıtlısın.', full: 'Etkinlik kapasitesi doldu.', unavailable: 'Etkinlik bulunamadı veya kayıt süresi kapandı.' };
      return interaction.reply({ content: messages[result.status] || 'Kayıt tamamlanamadı.', flags: MessageFlags.Ephemeral });
    }
    if (action === 'yoklama') {
      const result = await checkInGuildEvent(pool, { guildId: interaction.guildId, eventId, userId: interaction.user.id });
      const messages = { checked_in: 'Etkinlik katılımın doğrulandı. Etkinlik bitince /yasam etkinlik-odul ile ödülünü alabilirsin.', already_checked_in: 'Bu etkinlikte yoklaman zaten alındı.', not_eligible: 'Yoklama yalnızca kayıtlı katılımcılara, etkinlik başladıktan sonra açıktır.', invalid_event: 'Etkinlik kimliği geçersiz.' };
      return interaction.reply({ content: messages[result.status] || 'Yoklama alınamadı.', flags: MessageFlags.Ephemeral });
    }
    if (action === 'ayril') {
      const result = await leaveGuildEvent(pool, { guildId: interaction.guildId, eventId, userId: interaction.user.id });
      return interaction.reply({ content: result.removed ? 'Etkinlik kaydın silindi.' : 'Aktif bir etkinlik kaydın bulunamadı.', flags: MessageFlags.Ephemeral });
    }
    if (action === 'olustur') {
      if (interaction.user.id !== OWNER_ID) return interaction.reply({ content: 'Bu işlem yalnızca bot sahibine açıktır.', flags: MessageFlags.Ephemeral });
      try {
        const result = await createGuildEvent(pool, {
          guildId: interaction.guildId,
          createdBy: interaction.user.id,
          title: interaction.options.getString('baslik'),
          startsAt: interaction.options.getString('baslangic'),
          endsAt: interaction.options.getString('bitis'),
          description: interaction.options.getString('aciklama') || '',
          eventType: interaction.options.getString('tur') || 'community',
          maxParticipants: interaction.options.getInteger('kapasite'),
          channelId: interaction.channelId
        });
        return interaction.reply({ content: `Etkinlik oluşturuldu. Başlangıçtan 30 dakika önce bu kanalda hatırlatma gönderilecek. Kimlik: \`${result.eventId}\`\nKayıtlar **/etkinlik katil** ile açıldı.`, flags: MessageFlags.Ephemeral });
      } catch (error) {
        if (error.message === 'EVENT_INPUT_INVALID') return interaction.reply({ content: 'Başlık ve tarihleri kontrol et. Başlangıç gelecekte olmalı; bitiş başlangıçtan sonra gelmeli ve ISO 8601 saat dilimi içermeli.', flags: MessageFlags.Ephemeral });
        if (error.message === 'EVENT_TYPE_INVALID') return interaction.reply({ content: 'Etkinlik türü geçersiz.', flags: MessageFlags.Ephemeral });
        throw error;
      }
    }
    return interaction.reply({ content: 'Bilinmeyen etkinlik işlemi.', flags: MessageFlags.Ephemeral });
  }
};
