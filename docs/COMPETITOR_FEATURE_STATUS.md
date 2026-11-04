# Rakip Özellik Backlog'u — Mevcut Kodla İlk Eşleştirme

> Denetim tarihi: 2026-11-04  
> İncelenen kod tabanı: `fix/solo-boss-reward-idempotency-mainline` @ `03fc78999efb50102c830fe8e5490fcf67cb3668`  
> Kaynak listeler: `docs/COMPETITOR_FEATURE_MATRIX.md`, `docs/ENTERTAINMENT_FEATURE_BACKLOG.md`  
> Bu belge ilk kaynak/test eşleştirmesidir; canlı Discord doğrulaması veya tamamlanma beyanı değildir.

## Durum tanımları

- **Mevcut:** İlgili işlevin kaynak kod karşılığı bulundu.
- **Kısmi:** Temel işlev var; backlog'daki alt davranışların bir bölümü eksik.
- **Bulunamadı:** İncelenen dalın kod ağacında bu işleve karşılık gelen modül/akış bulunamadı. Başka eski dallardaki kod, güncel üründe mevcut sayılmaz.
- **Doğrulama gerekli:** Kaynak kod var; ilgili test/gerçek Discord akışı ayrıca kanıtlanmalı.

## Bot backlog'u

| ID | Frieren modülü / işlev | İlk durum | Mevcut kanıt / eksik sınır |
|---|---|---|---|
| ENT-001 | Yoldaş sahiplenme | Bulunamadı | Yoldaş/pet sahiplik modülü bulunamadı. |
| ENT-002 | Yoldaş besleme ve bakım | Bulunamadı | Mutluluk/enerji/bakım döngüsü bulunamadı. |
| ENT-003 | Yoldaş XP, eğitim ve evrim | Bulunamadı | Yoldaş gelişim sistemi bulunamadı. |
| ENT-004 | Yoldaş odası ve kozmetik | Bulunamadı | Yoldaş oda/dekorasyon sistemi bulunamadı. |
| ENT-005 | Balıkçılık, olta ve yem | Bulunamadı | Balıkçılık komutu veya veri kataloğu bulunamadı. |
| ENT-006 | Bölgeye göre balık türü/nadirlik | Bulunamadı | Balık türü ve bölge tabloları bulunamadı. |
| ENT-007 | Balık koleksiyon defteri | Bulunamadı | Balık indeksi/başarım sistemi bulunamadı. |
| ENT-008 | Tohum ekme, büyüme ve hasat | Bulunamadı | Çiftçilik/üretim döngüsü bulunamadı. |
| ENT-009 | Mevsim ve hasat bonusları | Bulunamadı | Mevsimsel üretim mekaniği bulunamadı. |
| ENT-010 | Sohbetten rastgele yaratık spawn | Bulunamadı | Mesaj tabanlı yaratık spawn işleyicisi bulunamadı. |
| ENT-011 | Süreli yakalama ve ilk yakalayan | Bulunamadı | Yakalama yarışı/atomik sahiplik akışı bulunamadı. |
| ENT-012 | Nadir/shiny/efsanevi yaratık varyantı | Bulunamadı | Yaratık varyant kataloğu bulunamadı. |
| ENT-013 | Yaratık arşivi ve tamamlama | Bulunamadı | Karakter koleksiyonu var; yaratık kataloğu ayrı bir özellik olarak bulunamadı. |
| ENT-014 | Wishlist ve spawn bildirimi | Bulunamadı | Yaratık wishlist/bildirim tercihi bulunamadı. |
| ENT-015 | 1v1/3v3 takım kurucu | Kısmi | 3v3 eşleştirme kuyruğu ve iki takım oluşturma var: `arena.js`, `arena-engine.js`, `arena-queue.js`. Serbest takım kurucu ve 1v1 modu bulunamadı. |
| ENT-016 | Sıra tabanlı yetenek/element savaşı | Kısmi | Arena saldırı, savunma ve büyü hamlelerini destekliyor. Element uyumu/karşıtlığı mekaniği bulunamadı: `arena-engine.js`. |
| ENT-017 | Sezon, rütbe ve arena sıralaması | Mevcut / doğrulama gerekli | Sezon, MMR, derece ve sıralama altyapısı var: `adventurer-platform.js`, `arena.js`; sezon geçişi ve sonuçların tekilleştirilmesi için PostgreSQL testleri mevcut. |
| ENT-018 | Kart albümü, seri, nadirlik ve varyant | Kısmi | Anime karakter koleksiyonu ve nadirlik filtresi var: `kimimben.js`, `koleksiyon.js`. Kart baskı/seri/varyant kataloğu bulunamadı. |
| ENT-019 | Wishlist, favori, not ve profil rozeti | Bulunamadı | Koleksiyon için istek listesi/favori/not/rozet akışı bulunamadı. |
| ENT-020 | Karakter/kart takası ve iki taraflı onay | Mevcut / doğrulama gerekli | Karakter kopyası teklifi, alıcı kabul/red ve PostgreSQL transaction akışı var: `takasteklif.js`, `trade-transaction.js`. Kart kozmetiği takasıyla aynı kapsam değildir. |
| ENT-021 | Oyuncu pazarı, arama ve filtre | Bulunamadı | `market.js` sabit kataloglu NPC mağazasıdır; oyuncular arası listeleme/pazar değildir. |
| ENT-022 | Teklif, kabul, iptal ve işlem geçmişi | Kısmi | Karakter takas teklifi kabul/red ve süre sonu var. Gönderenin iptali ve kullanıcıya açık işlem geçmişi bu akışta bulunamadı. |
| ENT-023 | Trivia, kelime, hafıza ve tahmin oyunları | Kısmi | Anime quiz ve rastgele karakter keşfi var. Kelime/hafıza oyunları ve takım mini oyunları bulunamadı. |
| ENT-024 | Takım mini oyunları ve günlük skor | Bulunamadı | Takım mini oyun skoru/oturum sistemi bulunamadı. |
| ENT-025 | Etkinlik, RSVP ve hatırlatma | Kısmi | `/etkinlik liste/katil/ayril/olustur`, katılımcı kaydı ve kapasite kontrolü var: `etkinlik.js`, `adventurer-platform.js`. Otomatik hatırlatma akışı bulunamadı. |
| ENT-026 | Boss/raid etkinliği ve takım katılımı | Kısmi | Genel etkinlik ve ayrı boss/raid sistemleri var; etkinlik kaydını doğrudan boss/raid takımına bağlayan akış bulunamadı. |
| ENT-027 | Paylaşılabilir profil, rozet ve unvan | Kısmi | Maceracı profil sayfası ve RPG unvan/başarım mekanikleri var. Web'de paylaşılabilir rozet/kart vitrini bulunamadı. |
| ENT-028 | Arkadaş/ekip ve ortak ilerleme | Kısmi | Co-op zindan/raid mevcut. Kalıcı arkadaş listesi ve ortak ilerleme panosu bulunamadı. |
| ENT-029 | Profil/duyuru/başarı görsel editörü | Bulunamadı | Kullanıcıya açık görsel/Embed editörü ve canlı önizleme bulunamadı. |
| ENT-030 | Ses kuyruğu ve playlist | Bulunamadı | Müzik çalma/kuyruk modülü bulunamadı. |

## Web sitesi ve kullanıcı paneli backlog'u

| ID | İşlev | İlk durum | Mevcut kanıt / eksik sınır |
|---|---|---|---|
| WEB-001 | Discord hesabı bağlantısı | Kısmi | Site kullanıcı adı/şifre oturumu var; Discord RPG profili tek kullanımlık bağlantı koduyla bağlanıyor. Üye tarafında Discord OAuth ile giriş akışı bulunamadı: `site-auth.js`, `adventurer-platform.js`. |
| WEB-002 | Yetkili sunucu seçimi | Kısmi | Bağlı profiller sunuluyor; kullanıcının yetkili olduğu sunucuları seçtiği ve yapılandırdığı genel dashboard bulunamadı. |
| WEB-003 | Sunucuya özel modül ayarları | Kısmi | Owner Panel'de sunucu yapılandırması ve feature flag altyapısı var. Sunucu yöneticilerinin kendi yetkili oldukları sunucuyu yönetebildiği self-service panel kanıtlanmadı: `owner-dashboard.js`, `owner-platform.js`, `guild-feature-settings.js`. |
| WEB-004 | Aranabilir komut arşivi | Mevcut / doğrulama gerekli | `/komutlar` sayfası dinamik, aramalı ve kategorili; testleri mevcut: `public-site.js`, `scripts/test-public-site.js`. |
| WEB-005 | Maceracı profili | Mevcut / doğrulama gerekli | `/maceraci` bağlı karakterin seviye, XP, altın, HP/mana ve etkinliklerini gösteriyor. Daha geniş profil vitrini eksik olabilir: `public-site.js`. |
| WEB-006 | Envanter/kart/yoldaş web görünümü | Kısmi | Owner Panel oyuncu ayrıntısında envanter ve ekipmanı görebiliyor; oyuncunun kendi web panelinde envanter/koleksiyon/yoldaş ekranı bulunamadı: `owner-platform.js`, `public-site.js`. |
| WEB-007 | Web oyuncu pazarı | Bulunamadı | Web'de oyuncu listeleme/teklif/satın alma pazarı bulunamadı. |
| WEB-008 | Web etkinlik takvimi ve RSVP | Kısmi | Maceracı paneli yaklaşan etkinlikleri listeliyor; web üzerinden RSVP/ayrılma ve hatırlatma ayarları bulunamadı. |
| WEB-009 | Analitik ve grafikler | Kısmi | Owner Panel'de RPG ve servis metrikleri var; kullanıcı/sunucu yöneticisi self-service analitik paneli bulunamadı. |
| WEB-010 | Görsel mesaj/Embed editörü | Bulunamadı | Görsel editör ve canlı önizleme bulunamadı. |
| WEB-011 | Özel komut/büyü otomasyon oluşturucusu | Bulunamadı | Güvenli trigger/condition/action oluşturucu bulunamadı. |
| WEB-012 | Haberci kuşlar / opt-in feed | Bulunamadı | Kaynak yönetimi ve kullanıcı tercihli feed modülü bulunamadı. |
| WEB-013 | Destek ve teknik talep merkezi | Kısmi | Discord'da `/teknik-talep` ve Owner Panel onayları var; web kullanıcı destek formu ve talep takip ekranı bulunamadı. |
| WEB-014 | Veri dışa aktarma ve hesap/veri silme | Bulunamadı | Üye tarafı self-service export/delete akışı bulunamadı. |
| WEB-015 | Mobil uyumlu panel | Kısmi | Public site ve Owner Panel için mobil taşma/performans testleri var; tüm yeni dashboard akışları mobilde doğrulanmış değil: `scripts/test-public-site.js`, `scripts/test-owner-dashboard.js`. |

## Önemli mevcut özellikler — tekrar eklenmeyecek

- 3v3 arena ve sezon/MMR altyapısı.
- Karakter koleksiyonu ve nadirlik filtresi.
- Karakter takas teklifleri ve transaction tabanlı kabul/red.
- Sabit kataloglu NPC marketi ve güvenli satın alma.
- Etkinlik oluşturma, RSVP katılım/ayrılma ve kapasite kontrolü.
- Komut arşivi, maceracı profili ve Owner Panel oyuncu ayrıntısı.
- Co-op zindan ve boss/raid altyapısı.
- Anime quiz ve rastgele karakter keşfi.

## Denetim notları ve sonraki geçiş

1. Bu tablo yalnızca kaynak kod/test dosyası taramasına dayanır; canlı Discord ve canlı web oturumu doğrulaması değildir.
2. “Bulunamadı” kayıtları, incelenen güncel dalın kod ağacında karşılığı görülmeyen adaylardır; eski ve güncel olmayan dallardaki kodlar kanıt sayılmaz.
3. Her kısmi özellik için eksik alt davranışlar ayrı test senaryosuna dönüştürülmeden uygulama başlamamalı.
4. Yeni koddan önce mevcut test isimleri ve DB şeması tekrar taranmalı; mevcut testler yeniden yazılmamalı.
5. Öncelik sırası: P0 mevcut güvenlik/veri bütünlüğü eksikleri → P0 backlog özellikleri → P1 → P2.
6. Yeni özellikler Poğaça'nın RPG/eğlence sınırında kalmalı; moderasyon/ceza modülleri eklenmemeli.
7. Ücretli API/servis, plansız deploy, otomatik merge ve üretim verisine test yazımı yapılmamalı.
