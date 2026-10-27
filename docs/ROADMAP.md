# Poğaça Frieren — RPG Yol Haritası

Bu belge, botu önce kararlı ve güvenilir bir RPG altyapısına, ardından geniş bir Frieren evreni deneyimine dönüştürmek için geliştirme sırasını belirler.

## Tasarım ilkeleri
- **Önce güvenilirlik:** Her yeni sistem veri bütünlüğü, cooldown ve hata durumları düşünülerek eklenir.
- **Mevcut oyuncu verisini koru:** Veritabanı değişiklikleri geriye uyumlu ve tekrarlanabilir olmalı.
- **Modüler geliştirme:** Yeni slash komutları `commands/<kategori>/` altında yer alabilir; eski kök dizin komutları çalışmaya devam eder.
- **Etkileşim odaklı ölçek:** Hedef 2000 ayrı üst seviye slash komutu değil; alt komutlar, butonlar, menüler, görevler, eşyalar, düşmanlar, bölgeler ve oyun etkileşimleriyle 2000+ anlamlı özellik/eylem.
- **Frieren teması:** Botun metinleri, ödülleri, görsel dili, bölgeleri, büyüleri, NPC'leri, düşmanları ve etkinlikleri Frieren dünyasına uygun olmalı; genel anime/RPG ifadeleri yalnızca gerektiğinde kullanılmalı.
- **Evren tutarlılığı:** Karakterlerin kişilikleri ve güçleri korunmalı; kanondaki bilgilerle bot için özgün oyun görevleri birbirinden ayırt edilmeli. İçerik, karakter/konum/büyü/iblis/eşya katalogları halinde modüler büyütülmeli.

## Aşamalar

### 1. Sağlam temel
- [x] Kök dizindeki eski komutları çalışır tutarken `commands/` altındaki komutları iç içe klasörlerden yükleme
- [x] Başlangıçta ve komut denetiminde yinelenen komut adlarını yakalama
- [x] CI ile JavaScript sözdizimi ve komut şeması kontrolü
- [ ] Veritabanı şemasını sürümlü migration sistemine geçirmek
- [ ] Ekonomi ve ödül işlemlerinde atomiklik, yarış durumu ve sınır kontrolleri
- [ ] Hata kaydı, sağlık kontrolü ve temel performans ölçümü

### 2. Oyuncu ve ilerleme
- [ ] Oyuncu istatistikleri: can, mana, saldırı, savunma, hız ve kritik
- [ ] Deneyim, seviye, sınıf ve uzmanlık ilerlemesi
- [ ] Günlük/haftalık görevler ve başarımlar arasında tutarlı ödül sistemi
- [ ] Envanter, ekipman yuvaları, geliştirme ve eşya nadirliği
- [ ] Oyuncu profili ve kişisel istatistik panosu

### 3. Savaş ve keşif
- [ ] Sıra tabanlı savaş motoru ve ortak hasar/etki hesaplayıcıları
- [ ] Büyü maliyetleri, bekleme süreleri, durum etkileri ve dirençler
- [ ] Bölgelere göre düşman havuzları, keşif karşılaşmaları ve zindanlar
- [ ] Boss aşamaları, takım savaşları ve tekrar oynanabilir mücadeleler
- [ ] Görev zincirleri, seçimler ve keşif ödülleri

### 4. Uzun vadeli sistemler
- [ ] Parti ve lonca sistemi
- [ ] Dengeli oyuncular arası düello ve güvenli takas
- [ ] Sezonlar, etkinlikler, koleksiyon albümleri ve sınırlı içerikler
- [ ] Liderlik tabloları, görev serileri ve prestij sistemi
- [ ] Butonlar ve seçim menüleriyle etkileşimli paneller

### 5. Frieren evreni ve tema bütünlüğü
- [x] `/evren` rehberi: dünya, karakterler, bölgeler, büyüler, iblisler, sınavlar ve büyülü eşyalar
- [ ] Mevcut komutların metinlerini Frieren evrenine göre tutarlılaştırma
- [ ] Keşif bölgelerini kanonik konumlar ve bölgeye özel düşman/ganimet tablolarıyla bağlama
- [ ] NPC konuşmalarını karakter kişiliklerine uygun dallandırma
- [ ] Büyüleri saldırı, savunma, tespit, destek ve günlük yaşam kategorilerine ayırma
- [ ] Birinci Sınıf Büyücü Sınavı, zindanlar, iblis generalleri ve özel boss zincirleri
- [ ] Karakter koleksiyonu, grimoire, büyülü eşyalar ve hatıra albümü
- [ ] Görsel dil: embed renkleri, karaktere uygun GIF/görseller ve Frieren temalı durum metinleri

### 6. 2000+ özellik hedefi
Özellik sayısı; komutlardan ayrı olarak yeni içerik ve etkileşimler üzerinden ölçülür: büyüler, pasif yetenekler, düşman varyantları, görevler, eşyalar, bölgeler, başarımlar, etkinlikler ve panel eylemleri. Her ekleme test ve denge kontrolünden geçer; sırf sayıyı artırmak için kopya veya anlamsız özellik eklenmez.

## Şu anki kilometre taşı
Komut yükleyici ve doğrulayıcı iç içe `commands/` klasörlerini destekliyor. İlk yeni modüler komut olan `/dunya`, bölge rehberini bu yapıda sunar. Bu değişiklikler PR üzerinde test edilir; PR birleştirilmeden ve dağıtım doğrulanmadan canlı botta olduğu varsayılmaz.
