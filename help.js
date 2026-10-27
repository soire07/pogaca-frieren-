import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

const sections = [
  { name: '🪄 Frieren evreni ve büyü', value: '**/rehber** • Adım adım başlangıç ve tüm RPG sistemleri\n**/frieren** • Frieren günlüğü · **/evren** • Evren rehberi\n**/buyu** • Büyü keşfi · **/buyukitabi** • Büyü arşivi\n**/buyuogren** • Savaş büyüsü öğren · **/buyular** • Öğrendiklerin\n**/buyuustaligi** • Ustalık · **/karakter** • Karakter rehberi · **/mimic** • Mimic şakası' },
  { name: '🎴 Karakter koleksiyonu', value: '**/kimimben** • Karakter keşfet · **/karaktercek** • Günlük çekim\n**/koleksiyon** • Koleksiyon · **/karaktergelistir** • Geliştir\n**/takasteklif** • Kopya takası · **/parcala** • Fazla kopyayı dönüştür' },
  { name: '⚔️ Macera ve savaş', value: '**/profil** · **/maceragecmisi** · **/hedefler** · **/gunluk**\n**/kesif** · **/dunya** · **/hikaye** · **/npc** · **/buyusavasi**\n**/iblisavasi** · **/bossrehberi** · **/zindan** · **/katlizindan** · **/ortakboss**\n**/gunlukodul** · **/gunlukgorev** · **/basarimlar** · **/siralama** · **/liderlik**' },
  { name: '🧙 Karakter ve gelişim', value: '**/sinifrehberi** • Sınıfları karşılaştır · **/sinifsec** • Sınıf seç\n**/buyuustaligi** • Büyü ustalığı · **/dinlen** • Hazırlan\n**/market** · **/envanter** · **/ekipman** · **/esyakullan** · **/bakiye**' },
  { name: '🥐 Eğlence ve topluluk', value: '**/animequiz** · **/pogaca** · **/sans** · **/saril** · **/istatistik**' },
  { name: '🛡️ Sunucu yönetimi', value: '**/kurulum** · **/uyar** · **/timeout** · **/ban** · **/temizle**' }
];
export default {
  data: new SlashCommandBuilder().setName('yardim').setDescription('Poğaça Frieren komutlarını temalı kategorilerle göster.'),
  async execute(interaction) {
    const embed = new EmbedBuilder().setColor(0x9b8cff)
      .setAuthor({ name: 'POĞAÇA FRIEREN • BÜYÜ ARŞİVİ' })
      .setTitle('🥐 Gezginin Komut Rehberi')
      .setDescription('Frieren’in yolculuğuna hoş geldin. İlk kez oynuyorsan **/rehber** komutunu aç; karakterini kurmaktan büyü öğrenmeye, boss savaşlarından hızlı gelişime kadar her adım orada anlatılıyor.\n\n**Önerilen başlangıç:** **/kimimben** → **/sinifrehberi** → **/sinifsec** → **/profil**')
      .addFields(sections)
      .setFooter({ text: 'Poğaça Frieren • Her büyünün bir hikâyesi, her yolculuğun bir izi vardır.' });
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
