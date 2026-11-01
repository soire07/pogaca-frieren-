
import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';

const spells = [
  { name: 'Zoltraak', type: 'Saldırı büyüsü', description: 'Hedefe yoğun büyü enerjisi göndererek doğrudan hasar verir.', emoji: '⚡' },
  { name: 'Çiçek Bahçesi', type: 'Doğa büyüsü', description: 'Çevreyi rengârenk çiçeklerle kaplayan huzurlu bir büyü.', emoji: '🌸' },
  { name: 'Temizlik Büyüsü', type: 'Günlük yaşam büyüsü', description: 'Pelerinindeki tozları ve kirleri temizler.', emoji: '🧹' },
  { name: 'Poğaça Isıtma Büyüsü', type: 'Mutfak büyüsü', description: 'Poğaçanı tam kararında ısıtır.', emoji: '🥐' },
  { name: 'Mimic Tespit Büyüsü', type: 'Keşif büyüsü', description: 'Şüpheli sandıkları inceleyerek tehlikeyi fark etmene yardım eder.', emoji: '📦' },
  { name: 'Koruyucu Bariyer', type: 'Savunma büyüsü', description: 'Büyü enerjisiyle kısa süreli koruyucu bir bariyer oluşturur.', emoji: '🛡️' },
  { name: 'Şifa Işığı', type: 'İyileştirme büyüsü', description: 'Yaraları hafifletmeye ve gücünü toplamaya yardımcı olur.', emoji: '💚' },
  { name: 'Mana Algısı', type: 'Algı büyüsü', description: 'Yakındaki büyülü izleri ve mana yoğunluğunu hissetmeni sağlar.', emoji: '🔮' },
  { name: 'Sessiz Adım', type: 'Gizlilik büyüsü', description: 'Hareket ederken çıkardığın sesi azaltır.', emoji: '👣' },
  { name: 'Rüzgâr Bıçağı', type: 'Saldırı büyüsü', description: 'Keskin bir rüzgâr akımı gönderir.', emoji: '🌪️' },
  { name: 'Buz Mızrağı', type: 'Saldırı büyüsü', description: 'Yoğunlaşmış buzdan bir mızrak meydana getirir.', emoji: '🧊' },
  { name: 'Alev Küresi', type: 'Saldırı büyüsü', description: 'Hedefe doğru ilerleyen bir ateş küresi oluşturur.', emoji: '🔥' },
  { name: 'Yıldırım Zinciri', type: 'Saldırı büyüsü', description: 'Elektrik enerjisini kısa bir zincir hâlinde yönlendirir.', emoji: '⚡' },
  { name: 'Taş Duvar', type: 'Savunma büyüsü', description: 'Yerden yükselen taşlarla geçici bir siper kurar.', emoji: '🪨' },
  { name: 'Arındırma', type: 'Destek büyüsü', description: 'Zararlı büyü etkilerini temizlemeyi amaçlar.', emoji: '✨' },
  { name: 'Işık Küresi', type: 'Yardımcı büyü', description: 'Karanlık geçitleri aydınlatan küçük bir ışık oluşturur.', emoji: '💡' },
  { name: 'Su Yolu', type: 'Yardımcı büyü', description: 'Su akışını yönlendirerek yolculukta işine yarar.', emoji: '💧' },
  { name: 'Bitki Hızlandırma', type: 'Doğa büyüsü', description: 'Küçük bitkilerin daha hızlı büyümesini sağlar.', emoji: '🌱' },
  { name: 'Büyü Mührü', type: 'Mühürleme büyüsü', description: 'Bir kapıyı veya küçük bir nesneyi büyüyle mühürler.', emoji: '🔏' },
  { name: 'Mana İzini Gizleme', type: 'Gizlilik büyüsü', description: 'Büyü enerjinin izini bir süreliğine bastırır.', emoji: '🌑' },
  { name: 'Yankı Haritası', type: 'Keşif büyüsü', description: 'Yakındaki boşlukları ve geçitleri ses yankılarıyla anlamaya yardım eder.', emoji: '🗺️' },
  { name: 'Kum Kalkanı', type: 'Savunma büyüsü', description: 'Hareketli kumdan gelen saldırıları karşılayan bir kalkan örer.', emoji: '🏜️' },
  { name: 'Kilit Açma', type: 'Yardımcı büyü', description: 'Basit kilit mekanizmalarını büyüyle açmaya çalışır.', emoji: '🗝️' },
  { name: 'Kar Tanesi', type: 'Günlük yaşam büyüsü', description: 'Avucunda erimeden duran küçük bir kar tanesi yaratır.', emoji: '❄️' },
  { name: 'Mükemmel Çay', type: 'Günlük yaşam büyüsü', description: 'Çayı ideal sıcaklıkta ve demde hazırlamaya yardım eder.', emoji: '🍵' }

];

function createEmbed(index) {
  const spell = spells[index];

  return new EmbedBuilder()
    .setColor(0x9b8cff)
    .setTitle(`${spell.emoji} ${spell.name}`)
    .setDescription(spell.description)
    .addFields(
      { name: '📚 Büyü türü', value: spell.type, inline: true },
      {
        name: '📖 Büyük Büyü Kitabı',
        value: `Büyü ${index + 1} / ${spells.length}`,
        inline: true
      }
    )
    .setFooter({ text: 'Poğaça Frieren • Büyü Arşivi • 25 büyü' });
}

function createButtons(index) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('buyukitabi_prev')
      .setLabel('Önceki')
      .setEmoji('⬅️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(index === 0),

    new ButtonBuilder()
      .setCustomId('buyukitabi_random')
      .setLabel('Rastgele')
      .setEmoji('🎲')
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId('buyukitabi_next')
      .setLabel('Sonraki')
      .setEmoji('➡️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(index === spells.length - 1)
  );
}

export default {
  data: new SlashCommandBuilder()
    .setName('buyukitabi')
    .setDescription('Frieren evreninden büyüler keşfet.'),

  async execute(interaction) {
    let index = Math.floor(Math.random() * spells.length);

    await interaction.reply({
      embeds: [createEmbed(index)],
      components: [createButtons(index)]
    });

    const message = await interaction.fetchReply();

    const collector = message.createMessageComponentCollector({
      time: 120_000
    });

    collector.on('collect', async button => {
      if (button.user.id !== interaction.user.id) {
        await button.reply({
          content: 'Bu büyü kitabını yalnızca komutu kullanan kişi kontrol edebilir. 🪄',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      if (button.customId === 'buyukitabi_prev') {
        index = Math.max(0, index - 1);
      } else if (button.customId === 'buyukitabi_next') {
        index = Math.min(spells.length - 1, index + 1);
      } else if (button.customId === 'buyukitabi_random') {
        index = Math.floor(Math.random() * spells.length);
      }

      await button.update({
        embeds: [createEmbed(index)],
        components: [createButtons(index)]
      });
    });

    collector.on('end', async () => {
      try {
        await interaction.editReply({ components: [] });
      } catch {
        // Mesaj artık düzenlenemiyorsa sessizce sonlandır.
      }
    });
  }
};
