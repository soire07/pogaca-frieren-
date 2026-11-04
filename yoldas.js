import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { pool, ensureUser } from './database/db.js';
import { adoptCompanion, careForCompanion, equipCompanionCosmetic, evolveCompanion, getCompanion, initCompanionSchema, COMPANION_CATALOG, COMPANION_COSMETICS } from './companions.js';

let schemaReady;
function ensureSchema() {
  if (!schemaReady) schemaReady = initCompanionSchema(pool).catch(error => { schemaReady = null; throw error; });
  return schemaReady;
}

export default {
  data: new SlashCommandBuilder()
    .setName('yoldas')
    .setDescription('Yoldaş Akademisi’nde yoldaşını sahiplen ve geliştir.')
    .addSubcommand(sub => sub.setName('durum').setDescription('Yoldaşının durumunu görüntüle.'))
    .addSubcommand(sub => sub.setName('sahiplen').setDescription('Bir yoldaş sahiplen.').addStringOption(option => option.setName('tur').setDescription('Yoldaş türü').setRequired(true).addChoices(...COMPANION_CATALOG.map(item => ({ name: item.name + ' · ' + item.cost + ' altın', value: item.key })))))
    .addSubcommand(sub => sub.setName('besle').setDescription('Yoldaşını besle.'))
    .addSubcommand(sub => sub.setName('oyna').setDescription('Yoldaşınla oyun oyna.'))
    .addSubcommand(sub => sub.setName('egit').setDescription('Yoldaşını eğit (100 altın).'))
    .addSubcommand(sub => sub.setName('evrim').setDescription('Seviyen ve altının uygunsa yoldaşını bir üst forma evrimleştir.'))
    .addSubcommand(sub => sub.setName('kozmetik').setDescription('Yoldaşına kozmetik giydir veya görünümünü sıfırla.')
      .addStringOption(option => option.setName('gorunum').setDescription('Seçtiğin görünüm (ilk kullanımda altınla açılır).').setRequired(true)
        .addChoices({ name: 'Varsayılan görünüm · Ücretsiz', value: 'default' }, ...COMPANION_COSMETICS.map(item => ({ name: item.emoji + ' ' + item.name + ' · ' + item.cost + ' altın', value: item.key }))))),
  async execute(interaction) {
    if (!interaction.guildId) return interaction.reply({ content: 'Bu komut yalnızca sunucularda kullanılabilir.', flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      await ensureUser(interaction.guildId, interaction.user.id);
      await ensureSchema();
      const action = interaction.options.getSubcommand();
      if (action === 'sahiplen') {
        const result = await adoptCompanion(pool, { guildId: interaction.guildId, userId: interaction.user.id, companionKey: interaction.options.getString('tur') });
        if (result.status === 'adopted') return interaction.editReply(result.companion.emoji + ' **' + result.companion.name + '** artık yoldaşın! Kalan altın: **' + result.balance + '**.');
        if (result.status === 'insufficient_funds') return interaction.editReply('Bu yoldaş için **' + result.cost + '** altın gerekiyor.');
        if (result.status === 'already_has_companion') return interaction.editReply('Zaten bir yoldaşın var. Önce mevcut yoldaşının bakımını yap.');
        return interaction.editReply('Geçersiz yoldaş seçimi.');
      }
      if (action === 'evrim') {
        const result = await evolveCompanion(pool, { guildId: interaction.guildId, userId: interaction.user.id });
        if (result.status === 'no_companion') return interaction.editReply('Önce /yoldas sahiplen ile bir yoldaş edinmelisin.');
        if (result.status === 'level_locked') return interaction.editReply('Bir sonraki evrim için yoldaşının **' + result.requiredLevel + '. seviyeye** ulaşması gerekiyor. Mevcut seviye: **' + result.currentLevel + '**.');
        if (result.status === 'insufficient_funds') return interaction.editReply('Evrim için **' + result.cost + ' altın** gerekiyor.');
        if (result.status === 'max_evolution') return interaction.editReply('Yoldaşın son evrim formuna ulaştı.');
        if (result.status !== 'evolved') return interaction.editReply('Yoldaşın şu anda evrimleştirilemedi.');
        return interaction.editReply(result.evolution.emoji + ' **' + result.evolution.name + '** formuna evrim tamamlandı! Kalan altın: **' + result.balance + '**.');
      }
      if (action === 'kozmetik') {
        const result = await equipCompanionCosmetic(pool, { guildId: interaction.guildId, userId: interaction.user.id, cosmeticKey: interaction.options.getString('gorunum', true) });
        if (result.status === 'no_companion') return interaction.editReply('Önce /yoldas sahiplen ile bir yoldaş edinmelisin.');
        if (result.status === 'insufficient_funds') return interaction.editReply('Bu görünüm için **' + result.cost + '** altın gerekiyor.');
        if (result.status !== 'equipped') return interaction.editReply('Bu kozmetik şu anda kullanılamıyor.');
        return interaction.editReply(result.cosmetic ? result.cosmetic.emoji + ' **' + result.cosmetic.name + '** görünümü yoldaşına uygulandı.' : 'Yoldaşının görünümü varsayılana döndürüldü.');
      }
      if (['besle', 'oyna', 'egit'].includes(action)) {
        const result = await careForCompanion(pool, { guildId: interaction.guildId, userId: interaction.user.id, action: action === 'besle' ? 'feed' : action === 'oyna' ? 'play' : 'train' });
        if (result.status === 'no_companion') return interaction.editReply('Henüz yoldaşın yok. Önce /yoldas sahiplen komutunu kullan.');
        if (result.status === 'cooldown') return interaction.editReply('Yoldaşın biraz dinlenmeli. Bu işlem için bekleme süresi dolmadı.');
        if (result.status === 'insufficient_funds') return interaction.editReply('Eğitim için 100 altın gerekiyor.');
        const pet = result.companion;
        return interaction.editReply('Yoldaşınla ilgilendin! **Seviye ' + pet.level + '** · XP ' + pet.xp + ' · Mutluluk ' + pet.happiness + '/100 · Enerji ' + pet.energy + '/100 · Açlık ' + pet.hunger + '/100.');
      }
      const pet = await getCompanion(pool, interaction.guildId, interaction.user.id);
      if (!pet) {
        const choices = COMPANION_CATALOG.map(item => item.emoji + ' **' + item.name + '** — ' + item.cost + ' altın').join('\n');
        return interaction.editReply('Yoldaş Akademisi’ne hoş geldin!\n' + choices + '\n\nBir yoldaş seçmek için `/yoldas sahiplen` kullan.');
      }
      const embed = new EmbedBuilder().setColor(0xb58cff).setTitle((pet.cosmetic?.emoji || pet.displayEmoji || pet.catalog?.emoji || '🐾') + ' ' + (pet.displayName || pet.catalog?.name || 'Yoldaşın') + ' · Yoldaşın').setDescription((pet.evolution?.description || pet.catalog?.description || 'Yoldaşın') + (pet.evolution ? '\nEvrim aşaması: **' + pet.evolution_stage + '/3**' : '\nEvrim aşaması: **0/3**') + (pet.cosmetic ? '\nGörünüm: **' + pet.cosmetic.name + '**' : ''))
        .addFields({ name: 'Seviye', value: String(pet.level), inline: true }, { name: 'Deneyim', value: String(pet.xp) + ' XP', inline: true }, { name: 'Mutluluk', value: pet.happiness + '/100', inline: true }, { name: 'Enerji', value: pet.energy + '/100', inline: true }, { name: 'Açlık', value: pet.hunger + '/100', inline: true })
        .setFooter({ text: 'Besleme: 30 dk · Oyun: 20 dk · Eğitim: 60 dk bekleme süresi' });
      return interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('/yoldas hatası:', error);
      return interaction.editReply('Yoldaş sistemi şu anda kullanılamıyor. Daha sonra tekrar dene.');
    }
  }
};