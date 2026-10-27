import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

const pages = [
  { title: '📖 I. İlk adımlar — Yolculuğa başla', description: 'Frieren’in dünyasında güçlenmek; karakterini seçmek, büyü öğrenmek, ekipman toplamak ve düzenli maceraya çıkmakla mümkün.', fields: [
    { name: '1 • Karakterini keşfet', value: '**/kimimben** ile karakter keşfet. **/karaktercek** günlük ücretsiz çekim içindir; **/koleksiyon** sahip olduklarını gösterir.' },
    { name: '2 • Sınıfını seç', value: '**/sinifrehberi** sınıfları ve pasiflerini açıklar. Ardından **/sinifsec** ile Büyücü, Muhafız, Şifacı veya Gezgin sınıfını seç. Sınıfın savaş tarzını etkiler.' },
    { name: '3 • Durumunu kontrol et', value: '**/profil** seviyeni, **/envanter** eşyalarını, **/bakiye** altınını gösterir. **/yardim** komut listesidir; bu komut adım adım oynanış rehberidir.' },
    { name: '🌱 Başlangıç rotası', value: '**/kimimben** → **/sinifrehberi** → **/sinifsec** → **/profil** → **/gunlukodul** → **/kesif**' }
  ]},
  { title: '✨ II. Büyü öğrenme ve ustalaşma', description: 'Büyü repertuvarını kur; büyü öğrenmenin yanında ustalığını da ilerlet.', fields: [
    { name: 'Büyü nasıl öğrenilir?', value: '**/buyuogren** komutunu açıp seçeneklerden büyüyü seç. Büyüler altın ister; bazı ileri büyüler ayrıca seviye ve boss zaferi gerektirir. Satın almadan önce gereksinimleri kontrol et.' },
    { name: 'Hangi komut ne işe yarar?', value: '**/buyular** öğrendiğin savaş büyülerini; **/buyukitabi** büyü arşivini; **/buyuustaligi** ustalık ilerlemeni gösterir. **/buyupratik** büyü pratiği içindir. **/buyu** ise büyü keşfi/eğlence komutudur.' },
    { name: 'Savaş öncesi hazırlık', value: 'Canın veya Manan azsa **/dinlen**. Altınını tek seferde harcama; ekipman için de bir miktar ayır. Öğrendiğin büyülerin etkilerini **/buyular** ve **/buyuustaligi** üzerinden incele.' },
    { name: '🪄 Önerilen sıra', value: '**/buyuogren** → **/buyular** → **/buyuustaligi** → **/dinlen** → **/iblisavasi**' }
  ]},
  { title: '⚔️ III. Boss savaşı — Hazırlan, meydan oku', description: 'Boss savaşları kaynak, deneyim ve ilerleme sağlar; hazırlıksız girmek yenilgiye yol açabilir.', fields: [
    { name: 'Savaştan önce', value: '1. **/dinlen** ile can ve mananı toparla.\n2. **/market** üzerinden ekipman al.\n3. **/ekipman** ile silah, zırh ve yüzüklerini kuşan.\n4. **/buyular** ile büyülerini kontrol et.' },
    { name: 'Boss ile nasıl savaşılır?', value: '**/bossrehberi** boss kademelerini, güçlerini ve ganimetlerini açıklar. Hazır olduğunda **/iblisavasi** kullan. Savaş ekranındaki seçenekleri oku; özel saldırı/evre uyarılarına göre savunma ve hasar tercihlerini yap.' },
    { name: 'Takım savaşları', value: '**/ortakboss** takım baskınıdır; tank, şifacı ve hasar rolleri birlikte çalışmalı. **/zindan** iki kişilik, **/katlizindan** çok katlı ortak keşiftir. Başlamadan önce arkadaşlarınla rol paylaş.' },
    { name: '🎁 Zaferden sonra', value: 'Ödül ve ganimet için **/profil**, **/envanter**, **/maceragecmisi** ve **/gunluk** komutlarını kontrol et. Boss zaferleri bazı ileri büyülerin gereksinimlerindendir.' }
  ]},
  { title: '📈 IV. Hızlı ve akıllı güçlenme', description: 'İyi ilerleme, günlük ödülleri kaçırmamak ve altın/XP harcamasını planlamakla gelir.', fields: [
    { name: 'Her gün yapılacaklar', value: '**/gunlukodul** ile günlük ödülünü al; **/gunlukgorev** görevlerini tamamla; sonra **/kesif** ile maceraya çık. Görevler ve keşifler kaynak/deneyim kazanmanın temel yollarıdır.' },
    { name: 'Kaynaklarını doğru harca', value: 'Altınını **/market** ekipmanları ve **/buyuogren** büyüleri arasında dengele. Ekipmanını **/ekipman** ile gerçekten kuşandığından emin ol. Fazla karakter kopyaları için **/takasteklif** veya **/parcala** seçeneklerini incele.' },
    { name: 'İlerlemeni takip et', value: '**/hedefler** gelişim hedeflerini, **/basarimlar** başarılarını, **/gunluk** koleksiyon ilerlemeni, **/maceragecmisi** macera istatistiklerini gösterir. **/siralama** ve **/liderlik** sıralamaları açar.' },
    { name: '⚡ Günlük döngü', value: '**/gunlukodul** → **/gunlukgorev** → **/kesif** → **/iblisavasi** → **/gunluk** → ekipman/büyü yükseltmesi' }
  ]},
  { title: '🗺️ V. Keşif, hikâye ve koleksiyon', description: 'Frieren’in yolculuğu yalnızca savaşlardan ibaret değil. Dünyayı keşfet, karakterleri tanı ve hikâyedeki izleri takip et.', fields: [
    { name: 'Dünyayı keşfet', value: '**/dunya** bölgeleri tanıtır; **/kesif** bölge keşfini başlatır. Farklı bölgelerde ilerleyerek karşılaşmalar ve keşif kayıtları bulabilirsin.' },
    { name: 'Hikâye ve yol arkadaşları', value: '**/hikaye** seçimlere dayalı anlatıyı; **/npc** yol arkadaşları ve yan görevleri; **/frieren** ve **/evren** Frieren dünyasına ilişkin içerikleri sunar.' },
    { name: 'Koleksiyon ve günlük', value: '**/koleksiyon** karakter koleksiyonunu, **/gunluk** keşif/boss/büyü/yadigâr koleksiyonlarını gösterir. Koleksiyon tamamlandığında günlükte ödül talebi çıkabilir; aynı koleksiyon ödülü bir kez alınır.' },
    { name: '🥐 Mola komutları', value: '**/pogaca**, **/mimic**, **/sans**, **/saril** ve **/animequiz** macera arasında eğlence içindir.' }
  ]},
  { title: '🧰 VI. Ekonomi, ekipman ve diğer komutlar', description: 'Kaynaklarını, eşyalarını ve sunucu araçlarını doğru kullan.', fields: [
    { name: 'Altın ve eşya', value: '**/bakiye** altınını; **/market** alışverişi; **/envanter** eşyaları; **/ekipman** kuşanma/çıkarma; **/esyakullan** kullanılabilir eşyaları yönetir.' },
    { name: 'İstatistikler', value: '**/istatistik** bot istatistiklerini, **/siralama** RPG sıralamalarını, **/liderlik** sunucu liderliğini gösterir.' },
    { name: 'Sunucu yönetimi', value: 'Yetkiliysen **/kurulum** ile karşılama/log ayarlarını düzenleyebilir; **/uyar**, **/timeout**, **/ban** ve **/temizle** moderasyon komutlarını kullanabilirsin.' },
    { name: '🔎 Daha fazla yardım', value: 'Discord’da / yazıp komut adını seçerek seçeneklerini ve açıklamasını gör. **/yardim** tüm komutları kategori kategori listeler. Bazı özellikler sunucu ayarlarına veya komut gereksinimlerine bağlı olabilir.' }
  ]}
];

function makeEmbed(page, index) {
  return new EmbedBuilder().setColor(0x9b8cff)
    .setAuthor({ name: 'POĞAÇA FRIEREN • MACERACI EL KİTABI' })
    .setTitle(page.title).setDescription(page.description).addFields(page.fields)
    .setFooter({ text: 'Frieren’in yolculuğu uzun; acele etme, hazırlığını yap. • Sayfa ' + (index + 1) + '/' + pages.length });
}
function makeButtons(index, ownerId, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('frieren_guide_prev:' + ownerId).setLabel('Önceki').setEmoji('⬅️').setStyle(ButtonStyle.Secondary).setDisabled(disabled || index === 0),
    new ButtonBuilder().setCustomId('frieren_guide_home:' + ownerId).setLabel('İlk sayfa').setEmoji('📖').setStyle(ButtonStyle.Primary).setDisabled(disabled || index === 0),
    new ButtonBuilder().setCustomId('frieren_guide_next:' + ownerId).setLabel('Sonraki').setEmoji('➡️').setStyle(ButtonStyle.Secondary).setDisabled(disabled || index === pages.length - 1)
  );
}
export default {
  data: new SlashCommandBuilder().setName('rehber').setDescription('Karakter, büyü, boss, gelişim ve tüm RPG sistemlerini öğren.'),
  async execute(interaction) {
    let index = 0;
    const ownerId = interaction.user.id;
    await interaction.reply({ embeds: [makeEmbed(pages[index], index)], components: [makeButtons(index, ownerId)], ephemeral: true });
    const reply = await interaction.fetchReply();
    const collector = reply.createMessageComponentCollector({ time: 10 * 60 * 1000 });
    collector.on('collect', async component => {
      if (component.user.id !== ownerId) {
        await component.reply({ content: 'Bu el kitabı başka bir gezginin. Kendi rehberini açmak için /rehber yaz.', ephemeral: true });
        return;
      }
      const action = component.customId.split(':')[0];
      if (action === 'frieren_guide_prev') index = Math.max(0, index - 1);
      if (action === 'frieren_guide_next') index = Math.min(pages.length - 1, index + 1);
      if (action === 'frieren_guide_home') index = 0;
      await component.update({ embeds: [makeEmbed(pages[index], index)], components: [makeButtons(index, ownerId)] });
    });
    collector.on('end', async () => interaction.editReply({ components: [makeButtons(index, ownerId, true)] }).catch(() => {}));
  }
};
