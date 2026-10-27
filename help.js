import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

const sections = [
  {
    name: '🧭 Yolculuğa nereden başlamalı?',
    value: '**/rehber** — Sayfalı, adım adım oynanış kılavuzu\n**/profil** — Seviyeni, savaş değerlerini ve seçili yapını kontrol et\n**/sinifrehberi** — Sınıfların pasiflerini karşılaştır · **/sinifsec** — Sınıfını belirle\n**Önerilen sıra:** /rehber → /kimimben → /sinifrehberi → /sinifsec → /profil'
  },
  {
    name: '🪄 Frieren evreni ve büyüler',
    value: '**/frieren** — Frieren günlüğü · **/evren** — Evren bilgileri · **/karakter** — Karakter bilgileri\n**/buyu** — Büyü keşfi · **/buyukitabi** — Büyü arşivi · **/buyuogren** — Yeni savaş büyüsü öğren\n**/buyular** — Öğrendiğin büyüler · **/buyuustaligi** — Ustalık seviyeleri · **/buyupratik** — Öğrendiğin büyülerde pratik yap'
  },
  {
    name: '🎴 Karakter koleksiyonu',
    value: '**/kimimben** — Karakter keşfet · **/karaktercek** — Günlük karakter çekimi\n**/koleksiyon** — Sahip olduğun karakterler ve filtreler · **/karaktergelistir** — Karakterini geliştir\n**/takasteklif** — Başka oyuncuyla kopya takası · **/parcala** — Fazla kopyaları dönüştür'
  },
  {
    name: '⚔️ Keşif, hikâye ve görevler',
    value: '**/kesif** — Bölge keşfi ve karşılaşmalar · **/dunya** — Bölgeleri tanı · **/hikaye** — Hikâye seçimleri\n**/npc** — Yol arkadaşları ve yan içerikler · **/hedefler** — İlerleme hedefleri · **/maceragecmisi** — Macera kayıtları\n**/gunlukodul** — Günlük ödül · **/gunlukgorev** — Günlük görevler · **/basarimlar** — Tamamlanan başarılar · **/gunluk** — Koleksiyon kayıtları'
  },
  {
    name: '👹 Savaş ve zindanlar',
    value: '**/bossrehberi** — Boss kademeleri, saldırıları ve ganimetleri\n**/iblisavasi** — Tek başına boss savaşı · **/ortakboss** — Takım baskını\n**/zindan** — Ortak zindan · **/katlizindan** — Beş katlı takım seferi · **/buyusavasi** — Oyuncular arası büyü düellosu\n**İpucu:** Savaştan önce /dinlen, /ekipman ve /buyular ile hazırlığını kontrol et.'
  },
  {
    name: '🧙 Gelişim, ekipman ve ekonomi',
    value: '**/market** — Eşya satın al · **/cantam** — Eşyalarını gör · **/ekipman** — Ekipman kuşan/çıkar\n**/esyakullan** — Kullanılabilir eşya kullan · **/bakiye** — Altınını kontrol et · **/dinlen** — Can ve Mana toparla\n**/gelisim** — Gelişim puanlarını harca · **/karakteryapisi** — Savaş yapını seç\n**/yetenekagaci** — Yetenek geliştirmelerini incele · **/siralama** ve **/liderlik** — Sıralamaları görüntüle'
  },
  {
    name: '🥐 Eğlence ve topluluk',
    value: '**/animequiz** — Anime bilgi yarışması · **/pogaca** — Poğaça molası · **/sans** — Şansını dene\n**/saril** — Bir oyuncuya sarıl · **/mimic** — Mimic şakası · **/istatistik** — Bot istatistikleri'
  },
  {
    name: '🛡️ Sunucu yönetimi',
    value: '**/kurulum** — Sunucu karşılama ve log ayarları · **/uyar** — Uyarı ver\n**/timeout** — Geçici iletişim kısıtlaması · **/ban** — Sunucudan uzaklaştır · **/temizle** — Mesajları temizle\nBu komutlar için uygun sunucu izinleri gerekebilir.'
  }
];

export default {
  data: new SlashCommandBuilder()
    .setName('yardim')
    .setDescription('Komutları kategorilere ayırır ve doğru başlangıç yolunu gösterir.'),
  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x9b8cff)
      .setAuthor({ name: 'POĞAÇA FRIEREN • MACERACI EL KİTABI' })
      .setTitle('🥐 Gezginin Komut Rehberi')
      .setDescription(
        'Frieren’in dünyasında her yolculuk küçük bir adımla başlar. Bu sayfa komutları bulmana yardım eder; ayrıntılı oynanış, gelişim ve savaş açıklamaları için **/rehber** komutunu aç.\n\n' +
        '**Yeni oyuncu rotası**\n' +
        '1. **/rehber** — temel sistemleri öğren.\n' +
        '2. **/kimimben** — karakter keşfet ve **/koleksiyon** ile kontrol et.\n' +
        '3. **/sinifrehberi** → **/sinifsec** — oyun tarzını belirle.\n' +
        '4. **/profil** → **/gunlukodul** → **/kesif** — ilerlemeye başla.\n\n' +
        'Komutun adını yazmaya başladığında Discord’un açtığı seçenekleri ve zorunlu alanları da kontrol et.'
      )
      .addFields(sections)
      .setFooter({ text: 'Poğaça Frieren • Acele etme, hazırlan, keşfet ve yolculuğuna kendi izini bırak.' });

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
