# Poğaça Frieren — RPG Yol Haritası

Bu belge, botu önce kararlı ve güvenilir bir RPG altyapısına, ardından geniş bir Frieren evreni deneyimine dönüştürmek için geliştirme sırasını belirler.

## Tasarım ilkeleri
- **Önce güvenilirlik:** Her yeni sistem veri bütünlüğü, cooldown ve hata durumları düşünülerek eklenir.
- **Mevcut oyuncu verisini koru:** Veritabanı değişiklikleri geriye uyumlu ve tekrarlanabilir olmalı.
- **Modüler geliştirme:** Yeni slash komutları `commands/<kategori>/` altında yer alabilir; eski kök dizin komutları çalışmaya devam eder.
- **Etkileşim odaklı ölçek:** Hedef 2000 ayrı üst seviye slash komutu değil; alt komutlar, butonlar, menüler, görevler, eşyalar, düşmanlar, bölgeler ve oyun etkileşimleriyle 2000+ anlamlı özellik/eylem.
- **Frieren teması:** RPG, büyü, yolculuk, iblisler, karakter koleksiyonu ve keşif temel odak; moderasyon ikincil.

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

### 5. 2000+ özellik hedefi
Özellik sayısı; komutlardan ayrı olarak yeni içerik ve etkileşimler üzerinden ölçülür: büyüler, pasif yetenekler, düşman varyantları, görevler, eşyalar, bölgeler, başarımlar, etkinlikler ve panel eylemleri. Her ekleme test ve denge kontrolünden geçer; sırf sayıyı artırmak için kopya veya anlamsız özellik eklenmez.

## Şu anki kilometre taşı
Komut yükleyici ve doğrulayıcı iç içe `commands/` klasörlerini destekliyor. İlk yeni modüler komut olan `/dunya`, bölge rehberini bu yapıda sunar. Bu değişiklikler PR üzerinde test edilir; PR birleştirilmeden ve dağıtım doğrulanmadan canlı botta olduğu varsayılmaz.
