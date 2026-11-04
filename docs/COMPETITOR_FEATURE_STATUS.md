# Rakip Özellik Backlog'u — Mevcut Kodla İlk Eşleştirme

> Denetim tarihi: 2026-11-04  
> İncelenen kod tabanı: `fix/solo-boss-reward-idempotency-mainline` @ `8f80c32352dd04f8a4be61d6d236e3c10c4feaab` (kod); güncel envanter 2.018 kayıt / 343 mevcut / 1.675 planlı  
> Kaynak listeler: `docs/COMPETITOR_FEATURE_MATRIX.md`, `docs/ENTERTAINMENT_FEATURE_BACKLOG.md`  
> Bu belge ilk kaynak/test eşleştirmesidir; canlı Discord doğrulaması veya tamamlanma beyanı değildir.

## Güncel entegrasyon durumu — 2026-11-04

İlk eşleştirmede PR #185 üzerinde bulunan modüller, güncel onarım dalına topluca merge edilmeden ayrı `feat/frieren-platform-expansion-batch` dalına seçilerek taşındı ve güncel kodla uyumlandırıldı. Bu dalın kod doğrulama commit'i: `d792ad979e3441b7ef2eb019f828134d40aeb7be`.

### Envanter sayacı

Bu dalda ilk entegrasyon paketine ek olarak sosyal özellik ailesi ve web sosyal portalı için kanıt bağlantılı kayıtlar eklendi: **2.018 toplam kayıt = 343 mevcut/kod karşılığı olan özellik + 1.675 planlanan aday**. `auditComplete=false` korunuyor; 1.675 roadmap kaydı planlı kalıyor.

### Bu dalda taşınan / bağlanan modüller

- **Yoldaş Akademisi:** `companions.js`, `yoldas.js`; sahiplenme, bakım ve kozmetik akışları. Kullanıcı satırı → yoldaş satırı kilit sırası standartlaştırıldı; eşzamanlı eğitim/kozmetik PostgreSQL testi eklendi.
- **Kuzey Denizi:** `fishing.js`, `balik.js`; balıkçılık ve koleksiyon komutları.
- **Büyülü Sera:** `farming.js`, `sera.js`; ekim/hasat ve zamanlı akış.
- **Yaratık Arşivi:** `creatures.js`, `yaratik.js`; spawn, süreli yakalama, ilk yakalayan ve wishlist bildirimi. Ana etkileşim dinleyicisine bağlandı.
- **Karakter İstek Listesi:** `character-wishlist.js`, `karakteristek.js`.
- **Anime Quiz:** `animequiz.js`; puan tablosu için `anime_quiz_scores` PostgreSQL şeması eklendi.
- **Maceracı Loncası:** `guild-dashboard.js`; OAuth, yetkili sunucu seçimi ve guild feature gate akışları public site yönlendiricisine bağlandı. `/lonca` bağlantısı site üst/alt navigasyonuna eklendi.
- **Lonca Takvimi:** etkinlik başlangıcından 30 dakika önce otomatik Discord hatırlatması; PostgreSQL claim/lease ve retry akışı `index.js` zamanlayıcısına bağlandı.
- **Komut/özellik anahtarları:** `guild-feature-settings.js` ve `index.js` içinde komut ve component etkileşimleri guild modül anahtarlarıyla denetleniyor.
- **Site komut kataloğu:** yeni RPG komutları arşiv listesine ve regresyon testlerine eklendi.

### Sosyal platform ve web entegrasyonu — PR #217

- `social-platform.js` ve `/sosyal`: guild kapsamlı arkadaşlık isteği/onay/red, arkadaş/rakip listeleri, rakiplik, atomik altın hediyesi ve haftalık itibar.
- `/maceraci/sosyal`: bağlı Discord karakteri üzerinden aynı servisleri kullanan web paneli; arkadaşlar, rakipler, gelen istekler, itibar, istek gönderme/kabul/red, hediye ve itibar formları.
- Web GET/POST işlemleri hesap-bağlı guild doğrulaması, CSRF ve `social` guild feature gate kontrollerine tabidir.
- Sosyal PostgreSQL entegrasyonu 6/6; web sosyal route testleri `scripts/test-public-site.js` içinde.

### Güncel CI kanıtı — 2026-11-04

- **795/795** ana bot/regresyon testi başarılı.
- **31/31** komut sözleşmesi/regresyon testi başarılı.
- İzole komut denetimi **77 senaryo** kapsadı: **67 PASS, 0 FAIL, 10 INCONCLUSIVE**. INCONCLUSIVE kayıtlar başarısızlık değildir; yeterli kanıt bulunmadığı için doğrulanmamıştır.
- **103/103** disposable PostgreSQL entegrasyon testi başarılı: market, arena, sezon/etkinlik, ev/kozmetik, yoldaş/balıkçılık/sera/yaratık/wishlist/pazar, sosyal ve lonca oyunları.
- Güncel PR HEAD üzerinde 6/6 GitHub Actions workflow başarılı.
- PostgreSQL sonuçları geçici `frieren_audit` veritabanına aittir; üretim veritabanına yazım veya canlı Discord E2E değildir.

### Henüz tamamlanmış sayılmayacaklar

- Bu modüllerin Discord'a slash komut olarak kaydedilmesi ve gerçek sunucuda kullanıcı etkileşimiyle doğrulanması.
- Render ortam değişkenlerinde gerçek `SITE_BASE_URL` ve `GUILD_DASHBOARD_REDIRECT_URI` değerlerinin Discord Developer Portal callback URI'siyle eşleştirilmesi.
- Lonca panelinin mobil tarayıcıda OAuth girişinden ayar kaydetmeye kadar uçtan uca doğrulanması.
- Her backlog maddesinin `feature-inventory.json` içindeki benzersiz kayda bağlanması. Yoldaşla ilgili 134 plan kaydı tek bir temel yoldaş modülü var diye uygulanmış sayılmayacak.
- PR incelemesi, merge ve dağıtım. Bu işlemler yapılmadı.

## Durum tanımları

- **Mevcut:** İlgili işlevin kaynak kod karşılığı bulundu.
- **Kısmi:** Temel işlev var; backlog'daki alt davranışların bir bölümü eksik.
- **Bulunamadı:** İncelenen dalın kod ağacında bu işleve karşılık gelen modül/akış bulunamadı. Başka eski dallardaki kod, güncel üründe mevcut sayılmaz.
- **Doğrulama gerekli:** Kaynak kod var; ilgili test/gerçek Discord akışı ayrıca kanıtlanmalı.

## Bot backlog'u

| ID | Frieren modülü / işlev | İlk durum | Mevcut kanıt / eksik sınır |
|---|---|---|---|
| ENT-001 | Yoldaş sahiplenme | Entegrasyon dalında mevcut; henüz ana dala alınmadı | `companions.js`, `yoldas.js`; izole PostgreSQL testi var. |
| ENT-002 | Yoldaş besleme ve bakım | Entegrasyon dalında mevcut; henüz ana dala alınmadı | Besleme/oyun/eğitim, mutluluk/enerji/açlık ve cooldown: `companions.js`, `yoldas.js`. |
| ENT-003 | Yoldaş XP, eğitim ve evrim | Kısmi; PR #217 CI doğruladı | Dört yoldaş türü için üç aşamalı evrim, 10/25/40 seviye eşikleri, altın maliyetleri ve evrim geçmişi var. Güncel PR #217 CI'ında birim ve izole PostgreSQL testleri başarılı; rol bazlı destek görevleri ve dokuz rolün tamamı hâlâ eksik. Canlı Discord akışı doğrulanmadı. |
| ENT-004 | Yoldaş odası ve kozmetik | Kısmi; entegrasyon dalında mevcut | Kozmetik görünüm satın alma/giydirme var; oda/dekorasyon yok. |
| ENT-005 | Balıkçılık, olta ve yem | PR #217 içinde mevcut / CI doğruladı | `fishing.js`, `balik.js`; 3 kademeli olta, mana/buz/nadirlik yem paketleri, bölgesel ağırlık bonusları ve başarılı uyumlu avda tek yem tüketimi var. Altın kesintisi, olta seviyesi ve yem stoğu aynı PostgreSQL transaction'ında. Güncel PR #217 birim ve izole PostgreSQL testleri başarılı; canlı Discord akışı doğrulanmadı. |
| ENT-006 | Bölgeye göre balık türü/nadirlik | Entegrasyon dalında mevcut; henüz ana dala alınmadı | Bölge kilidi, tür ve nadirlik kataloğu: `fishing.js`. |
| ENT-007 | Balık koleksiyon defteri | Entegrasyon dalında mevcut; henüz ana dala alınmadı | Koleksiyon sorgusu ve `/balik defter`: `fishing.js`, `balik.js`. |
| ENT-008 | Tohum ekme, büyüme ve hasat | Entegrasyon dalında mevcut; henüz ana dala alınmadı | `farming.js`, `sera.js`; zamanlı ekim/hasat ve PostgreSQL testi var. |
| ENT-009 | Mevsim ve hasat bonusları | Kısmi; entegrasyon dalında mevcut | Mevsim ve hasat verimi bonusu var; tüm hava/mevsim simülasyonu yok. |
| ENT-010 | Sohbetten rastgele yaratık spawn | Entegrasyon dalında mevcut; henüz ana dala alınmadı | `creatures.js`, `yaratik.js`; spawn motoru ve mesaj akışı var. |
| ENT-011 | Süreli yakalama ve ilk yakalayan | Entegrasyon dalında mevcut; henüz ana dala alınmadı | Süreli spawn, satır kilidi ve tek kazanan claim; izole PostgreSQL testi var. |
| ENT-012 | Nadir/shiny/efsanevi yaratık varyantı | Entegrasyon dalında mevcut; henüz ana dala alınmadı | Normal/shiny varyant ve RNG: `creatures.js`; nadirlik dengesi ayrıca gözden geçirilmeli. |
| ENT-013 | Yaratık arşivi ve tamamlama | Entegrasyon dalında mevcut; henüz ana dala alınmadı | Yaratık kataloğu, koleksiyon, arama ve filtre: `creatures.js`, `yaratik.js`. |
| ENT-014 | Wishlist ve spawn bildirimi | Entegrasyon dalında mevcut; henüz ana dala alınmadı | Yaratık wishlist ve eşleşen spawn için opt-in bildirim listesi var. |
| ENT-015 | 1v1/3v3 takım eşleştirme | Mevcut / CI doğruladı | `arena.js`, `arena-engine.js`, `arena-queue.js`; 1v1 için iki, 3v3 için altı oyunculu ayrı kuyruk ve maç oluşturma var. `scripts/test-arena-engine.js`, `scripts/test-arena-command.js` ve `scripts/test-arena-queue.integration.js` 1v1/3v3 sözleşmesini, kuyruk izolasyonunu, eşzamanlı katılımı ve PostgreSQL kalıcılığını doğruluyor. Serbest manuel takım kurucu henüz yok; canlı Discord etkileşimi doğrulanmadı. |
| ENT-016 | Sıra tabanlı yetenek/element savaşı | Mevcut / CI doğruladı | `arena-engine.js`; saldırı, savunma ve büyü hamleleri ile Ateş/Buz/Yıldırım döngüsü, Işık/Karanlık karşıtlığı ve Nötr element desteği var. Avantaj 1,25x; dezavantaj 0,8x hasar uygular. Birim testleri element etkisini ve kaynak state'in değişmeden kalmasını doğruluyor; canlı Discord savaşı doğrulanmadı. |
| ENT-017 | Sezon, rütbe ve arena sıralaması | Mevcut / doğrulama gerekli | Sezon, MMR, derece ve sıralama altyapısı var: `adventurer-platform.js`, `arena.js`; sezon geçişi ve sonuçların tekilleştirilmesi için PostgreSQL testleri mevcut. |
| ENT-018 | Kart albümü, seri, nadirlik ve varyant | Kısmi | Anime karakter koleksiyonu ve nadirlik filtresi var: `kimimben.js`, `koleksiyon.js`. Kart baskı/seri/varyant kataloğu bulunamadı. |
| ENT-019 | Wishlist, favori, not ve profil rozeti | Kısmi; entegrasyon dalında mevcut | Karakter wishlist var (`character-wishlist.js`, `karakteristek.js`); favori/not/rozet ayrı ayrı yok. |
| ENT-020 | Karakter/kart takası ve iki taraflı onay | Mevcut / doğrulama gerekli | Karakter kopyası teklifi, alıcı kabul/red ve PostgreSQL transaction akışı var: `takasteklif.js`, `trade-transaction.js`. Kart kozmetiği takasıyla aynı kapsam değildir. |
| ENT-021 | Oyuncu pazarı, arama ve filtre | Kısmi; PR #217 içinde genişletildi | Discord `/pazar` ve web `/pazar` aynı transaction servislerini kullanıyor. İlan, satın alma, iptal, geçmiş ve teklif akışı var; web'de parametreli eşya arama, min/max fiyat ve sıralama filtreleri mevcut. Kategori filtresi ve fiyat alarmı hâlâ eksik: `player-market.js`, `pazar.js`, `public-site.js`. |
| ENT-022 | Teklif, kabul, iptal ve işlem geçmişi | Kısmi; PR #217 içinde uygulandı | Alıcı ilan başına tek bekleyen, bağlayıcı olmayan teklif verebilir; satıcı kabul/reddedebilir, alıcı geri çekebilir. Kabul anında bakiye kontrol edilir; altın ve emanet eşya tek transaction ile aktarılır. Doğrudan satış/ilan iptali bekleyen teklifleri kapatır. Discord ve CSRF korumalı web akışı eklendi; 100 izole PostgreSQL senaryosu içinde offer akışı doğrulandı. Teklif önizleme ve fiyat alarmı eksik. |
| ENT-023 | Trivia, kelime, hafıza ve tahmin oyunları | Kısmi; PR #217 genişletildi | Yeni `/loncaoyun` komutu Frieren bilgi yarışı, büyülü kelime, hafıza mührü ve bilmece sandığı modlarını sunar. 60 saniyelik ortak turlar, oyuncu başına tek cevap, lonca puanı ve sıralama PostgreSQL'de tutulur. Serbest yazılı cevaplı takım turnuvası ve lig fikstürü hâlâ eksik. |
| ENT-024 | Takım mini oyunları ve günlük skor | Kısmi; PR #217 genişletildi | `/loncaoyun baslat takimli:true` ile Takım A/B modunda en fazla 5'er oyuncu katılabilir. Oyuncu tek takıma kilitlenir, cevap başına puan takım skoruna atomik eklenir ve `/loncaoyun takim-siralam` tur skorunu gösterir. Günlük fikstür, kaptan/rol seçimi ve sezonluk takım ligi hâlâ eksik. |
| ENT-025 | Etkinlik, RSVP ve hatırlatma | Mevcut / doğrulama gerekli | `/etkinlik liste/katil/ayril/olustur`, katılımcı kaydı ve kapasite kontrolü var. Başlangıca 30 dakika kala otomatik Discord hatırlatması; `FOR UPDATE SKIP LOCKED`, süreli claim, başarısız gönderimde claim bırakma ve tek seferlik finalize akışı eklendi: `adventurer-platform.js`, `index.js`. İzole PostgreSQL testinde eşzamanlı claim, retry ve idempotent finalize doğrulandı. Gerçek Discord kanalına gönderim henüz doğrulanmadı. |
| ENT-026 | Boss/raid etkinliği ve takım katılımı | Kısmi | Genel etkinlik ve ayrı boss/raid sistemleri var; etkinlik kaydını doğrudan boss/raid takımına bağlayan akış bulunamadı. |
| ENT-027 | Paylaşılabilir profil, rozet ve unvan | Kısmi | Maceracı profil sayfası ve RPG unvan/başarım mekanikleri var. Web'de paylaşılabilir rozet/kart vitrini bulunamadı. |
| ENT-028 | Arkadaş/ekip ve ortak ilerleme | Kısmi | Co-op zindan/raid mevcut. Kalıcı arkadaş listesi ve ortak ilerleme panosu bulunamadı. |
| ENT-029 | Profil/duyuru/başarı görsel editörü | Bulunamadı | Kullanıcıya açık görsel/Embed editörü ve canlı önizleme bulunamadı. |
| ENT-030 | Ses kuyruğu ve playlist | Bulunamadı | Müzik çalma/kuyruk modülü bulunamadı. |
| ENT-031 | Yoldaş sahiplenme, bakım, eğitim ve kozmetik | Mevcut / CI doğruladı | `companions.js`, `yoldas.js`; dört tür, bakım/eğitim, kozmetik ve üç aşamalı evrim. Evrim geçmişi `/yoldas gecmis` ile görüntülenebilir. Güncel PR #217 birim ve izole PostgreSQL concurrency testleri başarılı; dokuz rol ve destek görevleri kapsamı tamamlanmadı. Canlı Discord akışı doğrulanmadı. |
| ENT-032 | Bölgesel balıkçılık ve koleksiyon defteri | Mevcut / CI doğruladı | `fishing.js`, `balik.js`; bölge/seviye kilidi, nadirlik, cooldown, balık defteri ve üç kademeli olta/yem yükseltmeleri var. Güncel PR #217 birim ve izole PostgreSQL testleri başarılı; canlı Discord akışı doğrulanmadı. |
| ENT-033 | Büyülü Sera ekim ve mevsimsel hasat | Mevcut / doğrulama gerekli | `farming.js`, `sera.js`; tek aktif ekim, zamanlı hasat, mevsim verimi ve envanter kaydı. Unit + izole PostgreSQL testleri var; tam hava simülasyonu henüz yok. |
| ENT-034 | Yaratık spawn, süreli ilk yakalayan ve arşiv | Mevcut / doğrulama gerekli | `creatures.js`, `yaratik.js`; spawn cooldown, atomik ilk claim, koleksiyon ve wishlist eşleşmesi. Unit + izole PostgreSQL testleri var; canlı Message Content intent ve kanal gönderimi henüz doğrulanmadı. |
| ENT-035 | Anime karakter istek listesi | Mevcut / doğrulama gerekli | `character-wishlist.js`, `karakteristek.js`; arama, ekle/sil, tekrar engeli ve 10 kayıt sınırı. Unit + izole PostgreSQL testleri var; canlı autocomplete henüz doğrulanmadı. |
| ENT-036 | Anime Quiz kalıcı puan ve doğru cevap takibi | Mevcut / doğrulama gerekli | `animequiz.js`; `anime_quiz_scores` kalıcı tablosu ve eşzamanlı puan yazımı. Unit + izole PostgreSQL testleri var; canlı Message Content privileged intent henüz doğrulanmadı. |
| ENT-037 | Lonca etkinliği otomatik hatırlatması | Mevcut / doğrulama gerekli | `adventurer-platform.js`, `index.js`; 30 dakika öncesi zamanlayıcı, PostgreSQL claim/lease, retry ve idempotent finalize. İzole PostgreSQL testi var; gerçek Discord kanal teslimi henüz doğrulanmadı. |
| ENT-038 | Kuzey Pazarı oyuncular arası eşya pazarı | Mevcut / doğrulama gerekli | `player-market.js`, `pazar.js`, `public-site.js`; Discord ve web üzerinden escrow ilanı, atomik satın alma/para transferi, satıcı iptali ve geçmiş. Unit, route ve izole PostgreSQL testleri var; canlı Discord/web tarayıcı akışı henüz doğrulanmadı. |

## Web sitesi ve kullanıcı paneli backlog'u

| ID | İşlev | İlk durum | Mevcut kanıt / eksik sınır |
|---|---|---|---|
| WEB-001 | Discord hesabı bağlantısı | Entegrasyon dalında mevcut; henüz ana dala alınmadı | Ayrı Discord OAuth bağlantısı ve AES-256-GCM ile token saklama: `guild-dashboard.js`; testleri var. |
| WEB-002 | Yetkili sunucu seçimi | Entegrasyon dalında mevcut; henüz ana dala alınmadı | Botun kurulu olduğu ve kullanıcının Admin/Manage Guild yetkisi bulunan sunucular filtreleniyor: `guild-dashboard.js`. |
| WEB-003 | Sunucuya özel modül ayarları | Entegrasyon dalında mevcut; henüz ana dala alınmadı | Guild Dashboard feature gate ayarları ve yetki kontrolü var; testleri var: `guild-dashboard.js`, `guild-feature-settings.js`. |
| WEB-004 | Aranabilir komut arşivi | Mevcut / doğrulama gerekli | `/komutlar` sayfası dinamik, aramalı ve kategorili; testleri mevcut: `public-site.js`, `scripts/test-public-site.js`. |
| WEB-005 | Maceracı profili | Mevcut / doğrulama gerekli | `/maceraci` bağlı karakterin seviye, XP, altın, HP/mana ve etkinliklerini gösteriyor. Daha geniş profil vitrini eksik olabilir: `public-site.js`. |
| WEB-006 | Envanter/kart/yoldaş web görünümü | Kısmi; PR #217 içinde envanter mevcut | `/maceraci/envanter?guildId=...` bağlı karakterin envanter ve ekipmanını sunucu kapsamıyla gösteriyor. Kart albümü ve yoldaş web görünümü hâlâ eksik: `public-site.js`, `adventurer-platform.js`. |
| WEB-007 | Web oyuncu pazarı | Genişletildi / canlı doğrulama gerekli | `/pazar` sayfası ilan, arama/fiyat/sıralama filtreleri, teklif gönderme, gelen teklifi kabul/reddetme, teklif geri çekme ve işlem geçmişini sunar. Tüm mutasyonlar CSRF ve bağlı Discord karakteri/sunucu kapsamıyla korunur; canlı tarayıcı/OAuth E2E henüz doğrulanmadı. |
| WEB-008 | Web etkinlik takvimi ve RSVP | Kısmi; PR #217 içinde RSVP mevcut | `/maceraci` yaklaşan etkinlikleri listeler ve bağlı karakter için CSRF korumalı katıl/ayrıl formları sunar. Hatırlatma tercihleri ve tam takvim görünümü eksik; canlı Discord teslimi ayrıca doğrulanmalı. |
| WEB-009 | Analitik ve grafikler | Kısmi | Owner Panel'de RPG ve servis metrikleri var; kullanıcı/sunucu yöneticisi self-service analitik paneli bulunamadı. |
| WEB-010 | Görsel mesaj/Embed editörü | Bulunamadı | Görsel editör ve canlı önizleme bulunamadı. |
| WEB-011 | Özel komut/büyü otomasyon oluşturucusu | Bulunamadı | Güvenli trigger/condition/action oluşturucu bulunamadı. |
| WEB-012 | Haberci kuşlar / opt-in feed | Bulunamadı | Kaynak yönetimi ve kullanıcı tercihli feed modülü bulunamadı. |
| WEB-013 | Destek ve teknik talep merkezi | Kısmi | Discord'da `/teknik-talep` ve Owner Panel onayları var; web kullanıcı destek formu ve talep takip ekranı bulunamadı. |
| WEB-014 | Veri dışa aktarma ve hesap/veri silme | Bulunamadı | Üye tarafı self-service export/delete akışı bulunamadı. |
| WEB-015 | Mobil uyumlu panel | Kısmi | Public site ve Owner Panel için mobil taşma/performans testleri var; tüm yeni dashboard akışları mobilde doğrulanmış değil: `scripts/test-public-site.js`, `scripts/test-owner-dashboard.js`. |
| WEB-016 | Discord OAuth ve yetkili sunucu seçimi | Mevcut / doğrulama gerekli | `guild-dashboard.js`; OAuth state/CSRF, token şifreleme, Manage Guild/Admin filtreleme ve botun bulunduğu sunucuları seçme. Testler var; canlı OAuth/mobil akış henüz doğrulanmadı. |
| WEB-017 | Sunucuya özel Frieren modül anahtarları | Mevcut / doğrulama gerekli | `guild-feature-settings.js`, `guild-dashboard.js`; modül aç/kapat ve komut/component feature gate. Testler var; canlı sunucu ayarı henüz doğrulanmadı. |

## Kritik ek bulgu: PR #185 kaynak dalı ve yeni entegrasyon dalı

İlk eşleştirme yalnızca aktif onarım dalını esas alıyordu. Açık taslak PR #185 (`feat/frieren-guild-dashboard`, head `6e1ad43b40326312c966127d8dca88acecbb9cf2`) bu adayların bir bölümünü kodlamıştı. Bu modüller daha sonra güncel ana kodla uyumlandırılarak `feat/frieren-platform-expansion-batch` dalına taşındı:

- Yoldaş Akademisi, balıkçılık, Büyülü Sera, yaratık spawn/yakalama ve wishlist.
- Discord OAuth bağlantısı, yetkili sunucu seçimi ve sunucu bazlı feature gate paneli.
- Bu modüller ilk olarak PR #185 kaynak dalında geliştirildi; seçilen ve güncel ana kodla uyumlandırılan sürümleri PR #217 / `fix/solo-boss-reward-idempotency-mainline` içinde. Ara PR #219 kapatıldı ve merge edilmedi; ilgili kodlar #217'ye entegre edildi. #217 de henüz ana dala alınmadı.

### PR #185 doğrulama kanıtı

- Frieren Bot CI: **633/633 PASS**.
- Frieren AI CI: **633/633 PASS**.
- İzole PostgreSQL entegrasyonları: **26/26 PASS** (market/takas/boss/zindan 14; balıkçılık 2; sera 2; yaratık 2; karakter wishlist 1; yoldaş 4; anime quiz 1).
- Bu testler CI içindeki geçici `frieren_audit` veritabanını kullandı; canlı Discord veya üretim veritabanı doğrulaması değildir.
- PR #185 açık ve taslak; merge/deploy yapılmadı.

PR #185 dalı ile güncel ana kod tarihçesi ayrışmış durumda. PR #185 bütünüyle merge/cherry-pick edilmemeli. Gerekli modüller önceki entegrasyon dalından seçilerek PR #217'ye taşındı; komut kaydı, DB şeması, `index.js`, `package.json`, feature gate ve test workflow'ları güncel kodla uyumlandırıldı. PR #219 kapalı ve merge edilmemiştir. Aynı özellikler yeniden yazılmamalı.

### Envanterle eşleştirme — önemli sınır

Aktif 2.000 kayıtlı `feature-inventory.json` içinde:
- `ROADMAP-1274–1340`: 67 yoldaş yetenek/ilerleme kaydı hâlâ `planned`.
- `ROADMAP-1341–1407`: 67 pet bakım/ilerleme kaydı hâlâ `planned`.
- `ROADMAP-0938`: karakter wishlist kaydı hâlâ `planned`.
- Balıkçılık, sera/çiftçilik ve yaratık spawn/yakalama için bu aramada doğrudan eşleşen ayrı kayıt bulunamadı.

PR #217'deki temel ve evrimleşebilen yoldaş sistemi, bu 134 roadmap kaydının tamamını karşılamaz. Örneğin dokuz farklı yoldaş rolü, pet destek bonusları, bakım serileri, kilometre taşı kozmetikleri ve geçmiş/karşılaştırma işlevlerinin hepsi uygulanmış değildir. Bu kayıtları topluca `implemented` yapmayacağız. Önce her birini gerçek davranışla eşleştireceğiz; balıkçılık/sera/yaratık için benzersiz kayıtlar ENT-032–034 olarak eklendi; yeni kodun alt davranışları bunların ötesinde ayrıca eşleştirilmeli.

### PR #185 kod incelemesinde bulunan düzeltme adayları

1. **Yoldaş transaction kilit sırası — giderildi:** `careForCompanion()` ve kozmetik donatma işlemleri kullanıcı satırı → yoldaş satırı sırasını kullanıyor. Eşzamanlı eğitim/kozmetik PostgreSQL regresyon testi PR #217 dalında eklendi.
2. **Discord OAuth redirect varsayılanı — kod/test düzeltildi:** Lonca paneli Render servis origin'ini `SITE_BASE_URL`/`RENDER_EXTERNAL_URL` üzerinden kullanıyor; `.env.example` callback değişkenlerini belgeliyor ve varsayılan callback için regresyon testi var. Canlı OAuth için Render değişkeni ile Discord Developer Portal callback URI'sinin aynı olması hâlâ operasyonel olarak doğrulanmalı.
3. **Dal uyumsuzluğu:** PR #185 eski ve ayrışmış kaynak dalıdır. PR #217 bu özelliklerin güncel ana kodla uyarlanmış sürümünü içerir; PR #185 topluca merge edilmemeli.

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


## Güncel entegrasyon denetimi — 2026-11-04

- Güncel çalışma dalı: `fix/solo-boss-reward-idempotency-mainline`; açık taslak PR #217.
- Kod commit'i: `8cdc98d17aa47d3a3c9aa70626c32dbf1174dea6`.
- Ana bot CI: **748/748 PASS**; Discord komut senaryoları **31/31 PASS**.
- İzole PostgreSQL entegrasyonu: **89/89 PASS**; sosyal işlemler 6/6 gerçek PostgreSQL testiyle doğrulandı.
- Frieren AI CI, Owner Panel testleri, Owner Panel Performance Checks ve slash-command validation başarılı.
- Bu kanıtlar GitHub Actions içindeki geçici PostgreSQL test veritabanını kullanır; üretim PostgreSQL'i, canlı Discord komutlarını, gerçek OAuth callback'ini veya Render dağıtımını doğrulamaz.
- Önceki PR #185 ve `feat/frieren-platform-expansion-batch` geçmiş entegrasyon referanslarıdır; güncel çalışma PR #217 içindedir.
- Lonca paneli, ana site rotasına bağlandı; ana sayfa kartı ve site navigasyonu eklendi. Guild OAuth callback için Render origin varsayılanı ve same-origin kontrolü test edildi.
- Anime Quiz puanları için `anime_quiz_scores` şeması eklendi; Discord Developer Portal'da Message Content Intent etkinliği ayrıca gerekir.
- Yaratık yakalama butonu, spawn mesajı ve guild feature gate bağlantısı eklendi. Gerçek Discord sunucusunda spawn/claim akışı henüz manuel doğrulanmadı.
- Envanterdeki roadmap kayıtları, sadece bu modüller eklendi diye topluca tamamlandı işaretlenmeyecek. Her aday, gerçek alt davranışıyla ayrı eşleştirilecek.

### Bu entegrasyon dalında hâlâ tamamlanmamış rakip backlog alanları

- Dokuz yoldaş rolünün tümü, rol bazlı destek görevleri ve sınıf sinerjisi; oda/dekorasyon ve gelişmiş kozmetik.
- Olta/yem yükseltmesi ve balık görevleri.
- Tam mevsim/hava simülasyonu.
- Yaratık varyantları için pity/garanti sayaçları ve geniş nadirlik dengesi.
- Serbest 1v1 takım kurucu ve element uyumu/karşıtlığı.
- Kart baskı/seri/varyant, favori/not/rozet ve kart kozmetiği.
- Açık artırma/teklif sistemi ve lonca yarışları.
- Kelime/hafıza/takım mini oyunları.
- Etkinlik hatırlatıcıları ve boss/raid etkinliklerine doğrudan katılım.
- Paylaşılabilir profil vitrini ve ortak ilerleme. Arkadaş/rakip/istek/itibar altyapısı ile web sosyal paneli PR #217 içinde kodlandı; canlı tarayıcı ve Discord E2E doğrulaması bekliyor.
- Embed/görsel editörü, güvenli büyü otomasyon oluşturucusu, opt-in feed.
- Web oyuncu envanteri/koleksiyonu/pazarı, RSVP ve self-service analitik.
- Veri dışa aktarma/silme ve tüm dashboard akışlarının gerçek mobil tarayıcı doğrulaması.

Bu liste, sonraki uygulama grubunun tekrar yazılmaması gereken kontrol noktasıdır. Her madde için kaynak kod + test + yetki/veri güvenliği kanıtı bulunmadan “tamamlandı” denmeyecek.

## PR #217 bütünleşik takip — 2026-11-04

- PR #219 kapatıldı ve merge edilmedi; seçilen entegrasyon kodu PR #217 dalında tutuluyor.
- Yoldaş sistemine dört tür için üç aşamalı evrim, 10/25/40 seviye eşikleri, altın maliyetleri, transaction tabanlı ücret kesintisi, evrim geçmişi tablosu ve /yoldas evrim /yoldas gecmis komutları eklendi.
- Public home showcase GET rotası POST mutasyon bloğunun dışına taşındı. Önceki konumda GET isteği route handler tarafından karşılanmıyordu; vitrin ayrıca istasyon durumlarını kendi verisinden üretiyor.
- Özel ev vitrininin varsayılan olarak 404 dönmesini doğrulayan regresyon testi eklendi.
- Bu değişikliklerin CI ve izole PostgreSQL sonuçları tamamlanmadan doğrulanmış sayılmaz. Üretim DB, Discord, Render veya Vercel üzerinde değişiklik yapılmadı.
- Oyuncu pazarı teklif pazarlığı PR #217'de Discord ve web'e eklendi. Teklifler para bloke etmez; kabul sırasında alıcı bakiyesi kontrol edilir. Kabul, item transferi ve seller credit aynı transaction içindedir; satılan/iptal edilen ilanların bekleyen teklifleri kapatılır.
- Teklifler için aynı alıcı/ilan kombinasyonunda tek bekleyen kayıt, alıcı başına en fazla 20 bekleyen teklif ve CSRF/bağlı hesap/sunucu kontrolleri vardır.
- PR #217 son kod HEAD'i için 773/773 otomatik test, 31/31 Discord senaryosu ve 100/100 izole PostgreSQL entegrasyon senaryosu geçti. Altı GitHub Actions workflow'u başarılı; canlı Discord, tarayıcı OAuth ve Render deployment doğrulaması yapılmadı.
| ENT-039 | Lonca Oyun Salonu — bilgi, kelime, hafıza ve bilmece | PR #217 içinde eklendi / doğrulama gerekli | `guild-games.js`, `loncaoyun.js`; ortak 60 saniyelik tur, tek cevap, guild/channel izolasyonu, kalıcı skor ve sıralama. Unit + izole PostgreSQL testleri eklendi; canlı Discord slash komut kaydı ve gerçek kullanıcı akışı henüz doğrulanmadı. |

| ENT-040 | Olta geliştirme ve sarf yem ekonomisi | PR #217 içinde eklendi / doğrulama gerekli | `fishing.js`, `balik.js`; Ahşap → Buz Kristali → Mana Dokuma olta, 3 yem türü, bölgesel ağırlık bonusları, altın/yem transaction'ları ve avda stok tüketimi. `scripts/test-fishing.js` + `scripts/test-fishing.integration.js`; canlı Discord doğrulaması bekliyor. |

| ARENA-005 | 1v1/3v3 düello ve element tabanlı savaş | PR #217 içinde eklendi / doğrulama gerekli | `arena-engine.js`, `arena-queue.js`, `arena.js`; mod bazlı ayrı kuyruklar, element seçimi ve hasar çarpanları. Birim, komut sözleşmesi ve izole PostgreSQL testleri eklendi; canlı Discord doğrulaması bekliyor. |


## Son kaynak uzlaştırması — 2026-11-04

- Güncel PR #217 kod başlığı `99d25d0b72fb0052bd2aa2adc89c61db95a706be` ve `feature-inventory.json` doğrulaması: **2.018 kayıt = 343 `implemented_needs_runtime_test` + 1.675 `planned`**. Bu, 343 özelliğin canlı doğrulandığı anlamına gelmez.
- Bu dosyanın önceki paragraflarındaki 2.017/342 sayıları ve eski ENT-015/ENT-016 gibi durum cümleleri tarihsel ilk eşleştirmedir. Güncel kod davranışı için güncel envanter, `arena.js`, `arena-engine.js`, `arena-queue.js` ve bunların testleri esas alınmalıdır. 1v1/3v3 kuyruk ve element mekaniği artık kod/test kanıtına bağlanmıştır; canlı Discord/Render akışı yine doğrulanmamıştır.
- PR #217'nin en son commit'i için altı GitHub Actions workflow'u tamamlanmış ve başarılı görünmektedir. Bu, 99d25d0 commit'indeki tüm test sayılarının veya canlı etkileşimlerin bağımsız kanıtı değildir; ayrıntılı test sayıları yalnızca ilgili workflow log/artifact çıktısından alınmalıdır.
- Güncel envanterdeki 343 kayıt `implemented_needs_runtime_test` durumundadır; 1.675 roadmap kaydı planlıdır. Hiçbiri bu notla otomatik olarak `live_verified` sayılmaz.
