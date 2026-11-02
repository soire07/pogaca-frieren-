# Frieren Eğlence Botları — Ayrıntılı Özellik Backlog'u

> Durum: Rakip araştırmasıyla oluşturulmuş aday backlog; uygulanmış özellik listesi değildir.
> Tarih: 2026-11-02
> Ürün sınırı: Poğaça Frieren, Frieren AI ve bunların Frieren temalı web platformu. GooseGuard kapsam dışıdır.
> Kısıtlar: Ücretsiz servis/API; mevcut RPG verileri ve komutları korunur; moderasyon/ceza botuna dönüşülmez.

## 1. Rakip botlardan alınacak oyun döngüleri

### Dank Memer — ekonomi, toplama, pet ve üretim
- Birden fazla gelir/iş komutu, günlük ödül ve harcama döngüsü.
- Balıkçılık: farklı bölgeler, türler, nadirlikler, koleksiyon defteri ve NPC görevleri.
- Çiftçilik: tohum, ekim, büyüme, hasat, üretim ve satış.
- Yoldaş/pet: sahiplenme, besleme, yıkama, oyun, eğitim, seviye, kozmetik ve oda dekorasyonu.
- Büyük eşya kataloğu, envanter, pazar ve oyuncu ticareti.
- Frieren uyarlaması: Kuzey Kıtası balıkçılığı, Büyülü Sera, Yoldaş Akademisi, NPC görev zincirleri ve Kuzey Pazarı.

### Pokétwo — canlı yakalama ve takım savaşı
- Sohbet sırasında rastgele spawn; ilk yakalayan kazanır.
- Koleksiyon indeksi, nadir/efsanevi varyantlar, filtreleme, shiny avı.
- Oyuncular arası takas ve global pazar.
- Üçlü takım kurma ve 3v3 stratejik savaş.
- Frieren uyarlaması: sohbetten çıkan büyülü yaratıklar, Frieren Yaratık Arşivi, nadir mana varyantları, yoldaş takımı ve büyücü/yaratık arenaları.

### Mudae — karakter kartı, wishlist ve profil
- Karakter/seri ruleti, süreli sahiplenme ve koleksiyon.
- Takas, hediye, favori, not, görsel ve alias özelleştirme.
- Wishlist, seri arama, eksik karakter takibi, kişisel/server sıralaması.
- Profil rozetleri, koleksiyon filtreleri ve günlük haklar.
- Frieren uyarlaması: anime karakter kartları, seri albümü, istek listesi, nadirlik, kart çerçeveleri, profil rozetleri ve karakter arenaları.

### OwO — avcılık, takım, lootbox ve görsel eğlence
- Yüzlerce hayvanı avlama/toplama ve nadirlik sıralaması.
- Takım kurma, silah/yetenek seçimi ve oyuncuya karşı savaş.
- XP/leaderboard ve lootbox.
- Meme/görsel üretimi ve sunucuya uygun emoji paylaşımı.
- Frieren uyarlaması: canavar avı, yoldaş takımı, element uyumlu savaş, ganimet sandıkları, maceracı XP ve Frieren temalı kartlar.

### Karuta — küresel kart koleksiyonu
- Büyük anime karakter kart kataloğu.
- Kart toplama, takas, yükseltme ve küresel ekonomi.
- Frieren uyarlaması: seri/karakter kart albümü, baskı ve nadirlik, kart geliştirme, takas ve koleksiyon tamamlama.

### Tatsu / UnbelievaBoat — sunucu ekonomisi
- Global ve sunucuya özel para, cüzdan/profil kartları.
- Mağaza, ödül, iş/gelir, transfer, eşya ve mini oyunlar.
- Frieren uyarlaması: altın + lonca puanı, kişisel cüzdan, lonca mağazası, meslekler ve güvenli oyuncu pazarı.

### Epic RPG / Gaius Play — metin tabanlı RPG
- Keşif, rastlantısal karşılaşma, görev, savaş, XP, ekonomi ve ilerleme.
- Frieren uyarlaması: kıta rotaları, NPC görevleri, yaşayan dünya, ortak baskın ve zindan döngüleri.

### Jockie Music / FredBoat — müzik
- Ses kanalı kuyruğu, playlist ve oynatma kontrolleri.
- Frieren uyarlaması: isteğe bağlı lonca dinlenme salonu ve telif/hosting koşulları doğrulanmış ambient listeler. Ücretli API veya telifli müzik kopyası kullanılmaz.

### Sesh / Apollo — etkinlik
- Etkinlik oluşturma, RSVP, zaman dilimi, hatırlatma ve tekrar.
- Frieren uyarlaması: boss baskınları, ortak zindan, lonca turnuvası, anime gecesi ve sezon etkinlik takvimi.

## 2. Bot özellik backlog'u

| ID | Frieren modülü | Aday işlev | Öncelik | Bağımlılık / risk |
|---|---|---|---|---|
| ENT-001 | Yoldaş Akademisi | Yoldaş sahiplenme ve sahiplik kaydı | P0 | DB şeması, idempotency |
| ENT-002 | Yoldaş Akademisi | Besleme, bakım ve mutluluk/enerji | P0 | Günlük reset, cooldown |
| ENT-003 | Yoldaş Akademisi | Yoldaş XP, seviye, eğitim ve evrim | P1 | Denge, tekrar ödül önleme |
| ENT-004 | Yoldaş Akademisi | Yoldaş görünümü, oda ve kozmetik | P1 | Görsel varlıklar |
| ENT-005 | Kuzey Denizi | Balıkçılık, olta ve yem | P1 | Cooldown, drop tablosu |
| ENT-006 | Kuzey Denizi | Bölgeye göre balık türü ve nadirlik | P1 | Katalog, keşif kilidi |
| ENT-007 | Kuzey Denizi | Balık defteri, eksik türler ve başarımlar | P1 | Koleksiyon sorguları |
| ENT-008 | Büyülü Sera | Tohum ekme, büyüme ve hasat | P1 | Zaman damgası, UTC |
| ENT-009 | Büyülü Sera | Mevsim, hava ve hasat bonusları | P2 | Simülasyon dengesi |
| ENT-010 | Yaratık Arşivi | Sohbet aktivitesinde rastgele yaratık spawn | P0 | Message intent, spam kontrolü |
| ENT-011 | Yaratık Arşivi | Süreli yakalama etkileşimi ve ilk yakalayan | P0 | Race condition, atomik sahiplik |
| ENT-012 | Yaratık Arşivi | Nadir/shiny/efsanevi varyant | P1 | RNG denetimi, pity |
| ENT-013 | Yaratık Arşivi | Katalog, filtre, arama ve koleksiyon tamamlama | P0 | Sayfalama, performans |
| ENT-014 | Yaratık Arşivi | Wishlist ve spawn bildirimi | P1 | Bildirim tercihi |
| ENT-015 | Büyücü Arenası | 1v1 ve 3v3 takım kurucu | P0 | Takım/slot doğrulama |
| ENT-016 | Büyücü Arenası | Sıra tabanlı yetenek ve element savaşları | P0 | Combat engine, regression |
| ENT-017 | Büyücü Arenası | Sezon, rütbe ve arena leaderboard | P1 | Sezon geçişi |
| ENT-018 | Karakter Kartları | Kart albümü, seri, nadirlik ve varyant | P1 | Lisanslı/güvenli görseller |
| ENT-019 | Karakter Kartları | Wishlist, favori, not ve profil rozeti | P1 | Gizlilik/erişim |
| ENT-020 | Karakter Kartları | Kart takası ve iki taraflı onay | P0 | Transaction, idempotency |
| ENT-021 | Kuzey Pazarı | Oyuncu pazarı, arama ve filtre | P0 | DB indeksleri |
| ENT-022 | Kuzey Pazarı | Teklif, kabul, iptal ve işlem geçmişi | P0 | Yarış koşulu, rollback |
| ENT-023 | Lonca Oyun Salonu | Trivia, kelime, hafıza ve tahmin | P0 | Soru havuzu |
| ENT-024 | Lonca Oyun Salonu | Takım mini oyunları ve günlük skor | P1 | Oturum/katılım yönetimi |
| ENT-025 | Lonca Takvimi | Etkinlik, RSVP ve hatırlatma | P0 | Zaman dilimi, tekrar işleme |
| ENT-026 | Lonca Takvimi | Boss/raid etkinliği ve takım katılımı | P0 | Mevcut co-op sistemine bağlama |
| ENT-027 | Maceracı Kimliği | Paylaşılabilir profil, rozet ve unvan | P1 | Profil gizliliği |
| ENT-028 | Maceracı Kimliği | Arkadaş/ekip ve ortak ilerleme | P2 | İzin ve veri sınırları |
| ENT-029 | Büyü Tasarım Atölyesi | Profil/duyuru/başarı kartı görsel editörü | P1 | XSS/escape, mobil önizleme |
| ENT-030 | Lonca Dinlenme Salonu | Ses kuyruğu ve playlist | P2 | Telif, hosting, servis maliyeti |

## 3. Web sitesi ve kullanıcı paneli backlog'u

| ID | Web modülü | İşlev |
|---|---|---|
| WEB-001 | Discord bağlantısı | Site hesabına Discord hesabı bağlama; OAuth state, CSRF ve güvenli token saklama |
| WEB-002 | Sunucu seçimi | Botun bulunduğu ve kullanıcının Manage Guild/Admin yetkisi olan sunucuları listeleme |
| WEB-003 | Lonca paneli | Sunucuya özel modül ayarları ve mevcut guild feature settings altyapısına bağlanma |
| WEB-004 | Komut arşivi | Aranabilir komut, kategori, örnek, seçenek ve yetki açıklamaları |
| WEB-005 | Maceracı profili | Web'den profil, XP, seviye, başarımlar ve sıralama görüntüleme |
| WEB-006 | Envanter | Eşya, ekipman, yoldaş, kart ve koleksiyon görüntüleme |
| WEB-007 | Kuzey Pazarı | Web mağazası/pazar arayüzü; satın alma ve takas Discord ile aynı atomik servisleri kullanmalı |
| WEB-008 | Lonca takvimi | Etkinlik listesi, RSVP, saat dilimi ve hatırlatma ayarları |
| WEB-009 | Analitik | Sunucu/oyuncu/RPG/ekonomi/etkinlik grafikleri ve tarih filtreleri |
| WEB-010 | Görsel editör | Embed, duyuru, karşılama ve profil kartı tasarımcısı; canlı önizleme |
| WEB-011 | Büyü otomasyonu | Güvenli özel komut/trigger oluşturucu; yalnızca izinli eylem listesi |
| WEB-012 | Haberci kuşlar | Anime, yayın, oyun ve topluluk kaynakları için opt-in feed |
| WEB-013 | Destek | Teknik talep, hata bildirimi, AI test raporu ve durum takibi |
| WEB-014 | Hesap/veri | Hesap bağını kesme, veriyi dışa aktarma ve silme talebi |
| WEB-015 | Mobil | Telefon öncelikli responsive dashboard, erişilebilir formlar ve boş/hata durumları |

## 4. Uygulama ilkeleri

1. Önce mevcut komut, test, DB tablosu ve web sayfası taranır; aynı özellik ikinci kez yazılmaz.
2. Her backlog maddesi mevcut, kısmi, eksik, test edilmemiş veya kapsam dışı olarak işaretlenir.
3. Her yeni ekonomi/collection/takas özelliğinde atomik transaction, sahiplik doğrulaması, idempotency ve işlem geçmişi şarttır.
4. Her spawn/yakalama/ödül yarış koşulu gerçek PostgreSQL entegrasyon testiyle kanıtlanır.
5. OAuth guild listesi sadece kullanıcının gerçekten yetkili olduğu sunucuları açar; botun bulunmadığı sunucuya ayar yazılamaz.
6. Ücretli API, premium rakip servisi veya ücretli hosting bağımlılığı eklenmez.
7. Moderasyon/ceza komutları Poğaça'ya eklenmez.
8. Kod testi, test Discord sunucusu ve canlı üretim doğrulaması ayrı raporlanır.
9. Bir özelliğin sadece planlanması veya arayüzde gösterilmesi, çalışıyor sayılması değildir.
