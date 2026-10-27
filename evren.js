import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

const entries = {
  dunya: {
    title: '🌍 Frieren Evreni — Dünya Rehberi',
    color: 0x8c9fd6,
    intro: 'Bu dünya, Kahraman Himmel’in İblis Kralı’nı yenmesinden yıllar sonra da yolculuklarla, unutulmuş büyülerle ve eski hatıralarla dolu. Güç kadar zamanın, dostluğun ve insanların kısa ömrünün anlamı da önemlidir.',
    fields: [
      ['Çağın ruhu', 'Hikâye, büyük zaferden sonra başlar: dünya kurtarılmış olsa da keşfedilecek yerler ve anlaşılacak insanlar bitmez.'],
      ['Yolculuk', 'Kuzeye uzanan yol; kasabalar, harabeler, dağ geçitleri, büyülü ormanlar ve tehlikeli bölgelerden geçer.'],
      ['Temel tema', 'Bir anının değerini, çoğu zaman ancak yıllar sonra anlarsın.']
    ]
  },
  karakterler: {
    title: '🧝 Karakterler ve Yol Arkadaşları',
    color: 0xb5a5f5,
    intro: 'Önemli kişiler ve bot içindeki rol fikirleri:',
    fields: [
      ['Frieren', 'Uzun ömürlü elf büyücü; eski büyüleri toplar, sakin görünür ve insanları zamanla daha iyi anlamayı öğrenir.'],
      ['Fern', 'Frieren’in disiplinli öğrencisi; dikkatli, güçlü ve büyü kontrolünde son derece beceriklidir.'],
      ['Stark', 'Eisen’in öğrencisi olan savaşçı; korkularına rağmen dostları için savaşır.'],
      ['Himmel', 'Efsanevi kahraman; iyiliği, umut vermesi ve ardında bıraktığı hatıralarla yolculuğu etkiler.'],
      ['Heiter', 'Eski kahraman grubunun rahibi; Fern’in hayatında önemli bir yere sahiptir.'],
      ['Eisen', 'Cüce savaşçı; dayanıklılığı ve Stark’a öğrettikleriyle tanınır.'],
      ['Sein', 'İyileştirme büyülerinde yetenekli rahip; rahat tavrının ardında güçlü bir sorumluluk duygusu vardır.'],
      ['Flamme', 'Frieren’in öğretmeni olan efsanevi insan büyücü; büyü tarihinin önemli isimlerinden biridir.'],
      ['Serie', 'Kadim elf büyücü ve Kıta Büyücüleri Birliği’nin büyük otoritesi.'],
      ['Aura', 'İnsanları kukla gibi kontrol eden güçlü iblislerden biri.'],
      ['Macht', 'Altınla ilişkilendirilen, iblislerin düşünce biçimini anlamayı zorlaştıran son derece tehlikeli bir iblis.'],
      ['Übel, Land, Denken, Methode, Wirbel', 'Büyücü sınavı ve kuzey yolculuğu çevresindeki önemli büyücüler; her birinin savaş ve büyü yaklaşımı farklıdır.']
    ]
  },
  bolgeler: {
    title: '🗺️ Bölgeler ve Keşif Alanları',
    color: 0x75b7a5,
    intro: 'Keşif sistemi için tematik bölge kataloğu. Tehlike seviyesi yükseldikçe karşılaşmalar ve ödüller de büyür.',
    fields: [
      ['Merkez Topraklar', 'Kasabalar, hanlar, küçük görevler ve yeni yol arkadaşlarıyla karşılaşma ihtimali yüksek başlangıç rotası.'],
      ['Kuzey Toprakları', 'Sert iklim, uzun yollar, tehlikeli yaratıklar ve daha güçlü iblisler.'],
      ['Kuzey Yaylaları', 'Zorlu geçitler, eski kalıntılar ve yüksek seviyeli keşifler için uygun alanlar.'],
      ['Büyülü Ormanlar', 'Nadir bitkiler, mana kalıntıları, yanıltıcı yaratıklar ve gizli büyü izleri.'],
      ['Kadim Harabeler', 'Eski uygarlıkların izleri, mühürlü odalar, tuzaklar ve unutulmuş büyü eşyaları.'],
      ['Äußerst Kalesi ve kuzey rotası', 'Büyücülerin kuzeye geçmeden önce hazırlandığı, yüksek riskli yolculukların önemli duraklarından biri.'],
      ['Ateşli ve buzlu geçitler', 'İleride eklenecek bölge türleri: çevresel etkiler, özel düşmanlar ve bölgeye özel ganimet.']
    ]
  },
  buyuler: {
    title: '✨ Büyü Sistemi ve Büyücülük',
    color: 0x78a7ff,
    intro: 'Büyüler yalnızca hasar vermek için değil; savunma, keşif, destek ve günlük yaşam için de kullanılır.',
    fields: [
      ['Zoltraak', 'Saldırı büyüsü; bot savaş sistemindeki temel saldırı büyülerinden biri.'],
      ['Savunma büyüsü', 'Gelen büyülü saldırılara karşı koruma sağlar; doğru zamanlama ve mana yönetimi önemlidir.'],
      ['İyileştirme büyüleri', 'Rahiplerin uzmanlık alanı; canı geri kazandırma ve hayatta kalma teması.'],
      ['Tespit ve analiz', 'Mana izlerini, büyülü nesneleri veya düşmanların gücünü anlamaya yönelik büyüler.'],
      ['Günlük yaşam büyüleri', 'Çamaşır temizlemek, çiçek yetiştirmek veya küçük işleri kolaylaştırmak gibi sıradan görünen ama değerli büyüler.'],
      ['Büyücü sınıfları', 'Öğrenilen büyüler, mana kapasitesi, büyü kontrolü ve uzmanlık oyuncunun gelişim yolunu şekillendirir.'],
      ['Mana ve aura', 'Büyü kullanımı kaynak yönetimi gerektirir; güçlü rakipleri değerlendirirken görünen güç tek ölçüt değildir.']
    ]
  },
  iblisler: {
    title: '👁️ İblisler ve Tehditler',
    color: 0xc96f76,
    intro: 'İblisler insanlara benzeyen sözler söyleyebilse de insan ahlakı ve duygularıyla aynı şekilde düşünmez. Karşılaşmalar dikkat ve hazırlık gerektirir.',
    fields: [
      ['İblisler', 'İnsan dilini kullanabilirler; bu, insanlarla aynı empatiye sahip oldukları anlamına gelmez.'],
      ['Üst düzey iblisler', 'Özel yetenekleri ve savaş mekanikleri olan, normal karşılaşmalardan daha tehlikeli düşmanlar.'],
      ['Aura ve kukla kontrolü', 'Bazı düşmanlar doğrudan hasar yerine kontrol ve stratejiyle tehdit oluşturur.'],
      ['Macht ve altın laneti', 'Özel mekaniklere sahip, yüksek seviye içerik için uygun bir tehdit örneği.'],
      ['Canavarlar', 'İblislerden ayrı olarak doğada yaşayan yaratıklar; bölgeye göre farklı saldırı ve dirençleri olabilir.'],
      ['Boss tasarımı', 'Aşamalar, dirençler, özel saldırılar ve seviye ölçekli ödüllerle sıradan düşmanlardan ayrılır.']
    ]
  },
  sinav: {
    title: '🎖️ Büyücü Sınavı ve Birlikler',
    color: 0xd9b66f,
    intro: 'Sınav ve birlik sistemi, oyuncuların yalnızca seviye değil karar, hazırlık ve beceri de geliştirmesini hedefler.',
    fields: [
      ['Kıta Büyücüleri Birliği', 'Büyücülerle ilgili önemli kurum; Serie bu yapının merkezindeki isimlerden biridir.'],
      ['Birinci Sınıf Büyücü Sınavı', 'Zorlu aşamalar, takım çalışması, hayatta kalma ve büyü becerileri üzerinden ilerleyen sınav.'],
      ['Sınav aşamaları', 'Gelecekte botta ayrı etaplar olarak uygulanabilir: takım görevi, zindan, güçlü rakip ve bireysel değerlendirme.'],
      ['Rütbe ilerlemesi', 'Oyuncu görev, keşif, büyü öğrenimi ve boss zaferleriyle yeni sınavlara erişebilir.']
    ]
  },
  esyalar: {
    title: '📦 Büyülü Eşyalar ve Koleksiyon',
    color: 0x70b7c9,
    intro: 'Her eşya savaş için değildir: bazıları koleksiyon, görev, keşif veya özel etkileşimlerde kullanılır.',
    fields: [
      ['Grimoire', 'Büyü bilgisi taşıyan kitaplar; yeni büyüler veya araştırma görevleriyle ilişkilendirilebilir.'],
      ['Mana kristali', 'Mana yenilemek için kullanılan sarf malzemesi.'],
      ['Mühürlü kalıntılar', 'Harabelerde bulunabilen, hikâye zincirleri ve özel ödüller açabilecek nesneler.'],
      ['Nadir büyü eşyaları', 'Belirli bölgeler, bosslar veya görev zincirleriyle elde edilecek koleksiyon parçaları.'],
      ['Hatıra eşyaları', 'Himmel’in yolculuğu gibi geçmiş olaylarla bağ kuran, koleksiyon albümünde saklanabilecek nesneler.'],
      ['Ganimet dengesi', 'Eşyaların düşme oranı, seviyesi ve satış değeri oyuncu seviyesiyle dengeli biçimde ölçeklenmeli.']
    ]
  }
};

export default {
  data: new SlashCommandBuilder()
    .setName('evren')
    .setDescription('Frieren dünyasının karakterlerini, bölgelerini, büyülerini ve tarihini keşfet.')
    .addStringOption(option =>
      option.setName('konu')
        .setDescription('Hangi Frieren rehberini görmek istiyorsun?')
        .setRequired(true)
        .addChoices(
          { name: 'Dünya ve hikâye', value: 'dunya' },
          { name: 'Karakterler', value: 'karakterler' },
          { name: 'Bölgeler ve keşif', value: 'bolgeler' },
          { name: 'Büyüler ve büyücülük', value: 'buyuler' },
          { name: 'İblisler ve canavarlar', value: 'iblisler' },
          { name: 'Büyücü sınavı ve birlikler', value: 'sinav' },
          { name: 'Büyülü eşyalar', value: 'esyalar' }
        )
    ),
  async execute(interaction) {
    const entry = entries[interaction.options.getString('konu')];
    const embed = new EmbedBuilder()
      .setColor(entry.color)
      .setTitle(entry.title)
      .setDescription(entry.intro)
      .setFooter({ text: 'Poğaça Frieren • Yolculuk, büyüler ve hatıralar' });
    for (const [name, value] of entry.fields) {
      embed.addFields({ name, value });
    }
    await interaction.reply({ embeds: [embed] });
  }
};
