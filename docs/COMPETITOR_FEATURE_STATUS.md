# Rakip Özellik Backlog'u — Mevcut Kodla İlk Eşleştirme

> Denetim tarihi: 2026-11-04  
> İncelenen kod tabanı: `feat/frieren-platform-expansion-batch` @ `bef213d891080aac4414ca418b8b46029f115be7` (kod); güncel envanter 2.010 kayıt / 335 mevcut / 1.675 planlı  
> Kaynak listeler: `docs/COMPETITOR_FEATURE_MATRIX.md`, `docs/ENTERTAINMENT_FEATURE_BACKLOG.md`  
> Bu belge ilk kaynak/test eşleştirmesidir; canlı Discord doğrulaması veya tamamlanma beyanı değildir.

## Güncel entegrasyon durumu — 2026-11-04

İlk eşleştirmede PR #185 üzerinde bulunan modüller, güncel onarım dalına topluca merge edilmeden ayrı `feat/frieren-platform-expansion-batch` dalına seçilerek taşındı ve güncel kodla uyumlandırıldı. Bu dalın kod doğrulama commit'i: `d792ad979e3441b7ef2eb019f828134d40aeb7be`.

### Envanter sayacı

Bu dalda 10 yeni, kanıt bağlantılı özellik kaydı eklendi: **2.010 toplam kayıt = 335 mevcut özellik + 1.675 planlanan aday**. `auditComplete=false` korunuyor; 1.675 roadmap kaydı planlı kalıyor.

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

### Güncel CI kanıtı

- Son commit için **Frieren Bot CI: başarılı**.
- Son commit için **Validate bot code and slash commands: başarılı**.
- Son tamamlanmış doğrulama noktası `ee01df57a1e76a58a102b3907e4ef8ed3dcba140`: **715/715 ana bot testi**, **31/31 komut senaryosu**, **82/82 izole PostgreSQL senaryosu** başarılı.
- Güncel HEAD `bef213d891080aac4414ca418b8b46029f115be7`: Frieren Bot CI, slash command doğrulaması ve Owner Panel testleri başarılı. İzole PostgreSQL workflow'u yeni escrow testleriyle tekrar çalışıyor; pazar ve oyuncu pazarı escrow adımları geçti, arena adımı sürüyor. Bu güncel tur henüz 82/82 diye raporlanamaz.
- Sonuçlar CI'ın geçici PostgreSQL veritabanına aittir; üretim veritabanı veya canlı Discord testi değildir.

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
| ENT-003 | Yoldaş XP, eğitim ve evrim | Kısmi; entegrasyon dalında mevcut | XP/seviye/eğitim var; evrim sistemi kanıtlanmadı. |
| ENT-004 | Yoldaş odası ve kozmetik | Kısmi; entegrasyon dalında mevcut | Kozmetik görünüm satın alma/giydirme var; oda/dekorasyon yok. |
| ENT-005 | Balıkçılık, olta ve yem | Entegrasyon dalında mevcut; henüz ana dala alınmadı | `fishing.js`, `balik.js`; bölge, katalog ve cooldown var. Olta/yem yükseltmesi ayrıca doğrulanmalı. |
| ENT-006 | Bölgeye göre balık türü/nadirlik | Entegrasyon dalında mevcut; henüz ana dala alınmadı | Bölge kilidi, tür ve nadirlik kataloğu: `fishing.js`. |
| ENT-007 | Balık koleksiyon defteri | Entegrasyon dalında mevcut; henüz ana dala alınmadı | Koleksiyon sorgusu ve `/balik defter`: `fishing.js`, `balik.js`. |
| ENT-008 | Tohum ekme, büyüme ve hasat | Entegrasyon dalında mevcut; henüz ana dala alınmadı | `farming.js`, `sera.js`; zamanlı ekim/hasat ve PostgreSQL testi var. |
| ENT-009 | Mevsim ve hasat bonusları | Kısmi; entegrasyon dalında mevcut | Mevsim ve hasat verimi bonusu var; tüm hava/mevsim simülasyonu yok. |
| ENT-010 | Sohbetten rastgele yaratık spawn | Entegrasyon dalında mevcut; henüz ana dala alınmadı | `creatures.js`, `yaratik.js`; spawn motoru ve mesaj akışı var. |
| ENT-011 | Süreli yakalama ve ilk yakalayan | Entegrasyon dalında mevcut; henüz ana dala alınmadı | Süreli spawn, satır kilidi ve tek kazanan claim; izole PostgreSQL testi var. |
| ENT-012 | Nadir/shiny/efsanevi yaratık varyantı | Entegrasyon dalında mevcut; henüz ana dala alınmadı | Normal/shiny varyant ve RNG: `creatures.js`; nadirlik dengesi ayrıca gözden geçirilmeli. |
| ENT-013 | Yaratık arşivi ve tamamlama | Entegrasyon dalında mevcut; henüz ana dala alınmadı | Yaratık kataloğu, koleksiyon, arama ve filtre: `creatures.js`, `yaratik.js`. |
| ENT-014 | Wishlist ve spawn bildirimi | Entegrasyon dalında mevcut; henüz ana dala alınmadı | Yaratık wishlist ve eşleşen spawn için opt-in bildirim listesi var. |
| ENT-015 | 1v1/3v3 takım kurucu | Kısmi | 3v3 eşleştirme kuyruğu ve iki takım oluşturma var: `arena.js`, `arena-engine.js`, `arena-queue.js`. Serbest takım kurucu ve 1v1 modu bulunamadı. |
| ENT-016 | Sıra tabanlı yetenek/element savaşı | Kısmi | Arena saldırı, savunma ve büyü hamlelerini destekliyor. Element uyumu/karşıtlığı mekaniği bulunamadı: `arena-engine.js`. |
| ENT-017 | Sezon, rütbe ve arena sıralaması | Mevcut / doğrulama gerekli | Sezon, MMR, derece ve sıralama altyapısı var: `adventurer-platform.js`, `arena.js`; sezon geçişi ve sonuçların tekilleştirilmesi için PostgreSQL testleri mevcut. |
| ENT-018 | Kart albümü, seri, nadirlik ve varyant | Kısmi | Anime karakter koleksiyonu ve nadirlik filtresi var: `kimimben.js`, `koleksiyon.js`. Kart baskı/seri/varyant kataloğu bulunamadı. |
| ENT-019 | Wishlist, favori, not ve profil rozeti | Kısmi; entegrasyon dalında mevcut | Karakter wishlist var (`character-wishlist.js`, `karakteristek.js`); favori/not/rozet ayrı ayrı yok. |
| ENT-020 | Karakter/kart takası ve iki taraflı onay | Mevcut / doğrulama gerekli | Karakter kopyası teklifi, alıcı kabul/red ve PostgreSQL transaction akışı var: `takasteklif.js`, `trade-transaction.js`. Kart kozmetiği takasıyla aynı kapsam değildir. |
| ENT-021 | Oyuncu pazarı, arama ve filtre | Kısmi; PR #219 dalında mevcut | `/pazar liste/sat/al/iptal/gecmis`; escrow, fiyat sıralı ilanlar ve atomik alım var. Arama/kategori filtreleri ve web pazarı henüz yok: `player-market.js`, `pazar.js`. |
| ENT-022 | Teklif, kabul, iptal ve işlem geçmişi | Kısmi | `/pazar` doğrudan satın alma, satıcı iptali ve işlem geçmişi sağlıyor; pazarlık/teklif kabul akışı yok. Karakter takasındaki iki taraflı onay ayrı kalıyor. |
| ENT-023 | Trivia, kelime, hafıza ve tahmin oyunları | Kısmi | Anime quiz ve rastgele karakter keşfi var. Kelime/hafıza oyunları ve takım mini oyunları bulunamadı. |
| ENT-024 | Takım mini oyunları ve günlük skor | Bulunamadı | Takım mini oyun skoru/oturum sistemi bulunamadı. |
| ENT-025 | Etkinlik, RSVP ve hatırlatma | Mevcut / doğrulama gerekli | `/etkinlik liste/katil/ayril/olustur`, katılımcı kaydı ve kapasite kontrolü var. Başlangıca 30 dakika kala otomatik Discord hatırlatması; `FOR UPDATE SKIP LOCKED`, süreli claim, başarısız gönderimde claim bırakma ve tek seferlik finalize akışı eklendi: `adventurer-platform.js`, `index.js`. İzole PostgreSQL testinde eşzamanlı claim, retry ve idempotent finalize doğrulandı. Gerçek Discord kanalına gönderim henüz doğrulanmadı. |
| ENT-026 | Boss/raid etkinliği ve takım katılımı | Kısmi | Genel etkinlik ve ayrı boss/raid sistemleri var; etkinlik kaydını doğrudan boss/raid takımına bağlayan akış bulunamadı. |
| ENT-027 | Paylaşılabilir profil, rozet ve unvan | Kısmi | Maceracı profil sayfası ve RPG unvan/başarım mekanikleri var. Web'de paylaşılabilir rozet/kart vitrini bulunamadı. |
| ENT-028 | Arkadaş/ekip ve ortak ilerleme | Kısmi | Co-op zindan/raid mevcut. Kalıcı arkadaş listesi ve ortak ilerleme panosu bulunamadı. |
| ENT-029 | Profil/duyuru/başarı görsel editörü | Bulunamadı | Kullanıcıya açık görsel/Embed editörü ve canlı önizleme bulunamadı. |
| ENT-030 | Ses kuyruğu ve playlist | Bulunamadı | Müzik çalma/kuyruk modülü bulunamadı. |
| ENT-031 | Yoldaş sahiplenme, bakım, eğitim ve kozmetik | Mevcut / doğrulama gerekli | `companions.js`, `yoldas.js`; sahiplenme, besleme, oyun, eğitim, kozmetik ve tutarlı transaction kilit sırası. Unit + izole PostgreSQL testleri var; tüm yoldaş arketipleri/evrim henüz yok. |
| ENT-032 | Bölgesel balıkçılık ve koleksiyon defteri | Mevcut / doğrulama gerekli | `fishing.js`, `balik.js`; bölge/seviye kilidi, nadirlik, cooldown ve balık defteri. Unit + izole PostgreSQL testleri var; olta/yem yükseltmesi henüz yok. |
| ENT-033 | Büyülü Sera ekim ve mevsimsel hasat | Mevcut / doğrulama gerekli | `farming.js`, `sera.js`; tek aktif ekim, zamanlı hasat, mevsim verimi ve envanter kaydı. Unit + izole PostgreSQL testleri var; tam hava simülasyonu henüz yok. |
| ENT-034 | Yaratık spawn, süreli ilk yakalayan ve arşiv | Mevcut / doğrulama gerekli | `creatures.js`, `yaratik.js`; spawn cooldown, atomik ilk claim, koleksiyon ve wishlist eşleşmesi. Unit + izole PostgreSQL testleri var; canlı Message Content intent ve kanal gönderimi henüz doğrulanmadı. |
| ENT-035 | Anime karakter istek listesi | Mevcut / doğrulama gerekli | `character-wishlist.js`, `karakteristek.js`; arama, ekle/sil, tekrar engeli ve 10 kayıt sınırı. Unit + izole PostgreSQL testleri var; canlı autocomplete henüz doğrulanmadı. |
| ENT-036 | Anime Quiz kalıcı puan ve doğru cevap takibi | Mevcut / doğrulama gerekli | `animequiz.js`; `anime_quiz_scores` kalıcı tablosu ve eşzamanlı puan yazımı. Unit + izole PostgreSQL testleri var; canlı Message Content privileged intent henüz doğrulanmadı. |
| ENT-037 | Lonca etkinliği otomatik hatırlatması | Mevcut / doğrulama gerekli | `adventurer-platform.js`, `index.js`; 30 dakika öncesi zamanlayıcı, PostgreSQL claim/lease, retry ve idempotent finalize. İzole PostgreSQL testi var; gerçek Discord kanal teslimi henüz doğrulanmadı. |
| ENT-038 | Kuzey Pazarı oyuncular arası eşya pazarı | Mevcut / doğrulama gerekli | `player-market.js`, `pazar.js`; escrow ile ilan açma, atomik satın alma/para transferi, satıcı iptali, geçmiş, eşzamanlı tek satış ve takılı ekipman koruması. Unit + izole PostgreSQL testleri var; canlı Discord ve web pazar ekranı doğrulanmadı. |

## Web sitesi ve kullanıcı paneli backlog'u

| ID | İşlev | İlk durum | Mevcut kanıt / eksik sınır |
|---|---|---|---|
| WEB-001 | Discord hesabı bağlantısı | Entegrasyon dalında mevcut; henüz ana dala alınmadı | Ayrı Discord OAuth bağlantısı ve AES-256-GCM ile token saklama: `guild-dashboard.js`; testleri var. |
| WEB-002 | Yetkili sunucu seçimi | Entegrasyon dalında mevcut; henüz ana dala alınmadı | Botun kurulu olduğu ve kullanıcının Admin/Manage Guild yetkisi bulunan sunucular filtreleniyor: `guild-dashboard.js`. |
| WEB-003 | Sunucuya özel modül ayarları | Entegrasyon dalında mevcut; henüz ana dala alınmadı | Guild Dashboard feature gate ayarları ve yetki kontrolü var; testleri var: `guild-dashboard.js`, `guild-feature-settings.js`. |
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
| WEB-016 | Discord OAuth ve yetkili sunucu seçimi | Mevcut / doğrulama gerekli | `guild-dashboard.js`; OAuth state/CSRF, token şifreleme, Manage Guild/Admin filtreleme ve botun bulunduğu sunucuları seçme. Testler var; canlı OAuth/mobil akış henüz doğrulanmadı. |
| WEB-017 | Sunucuya özel Frieren modül anahtarları | Mevcut / doğrulama gerekli | `guild-feature-settings.js`, `guild-dashboard.js`; modül aç/kapat ve komut/component feature gate. Testler var; canlı sunucu ayarı henüz doğrulanmadı. |

## Kritik ek bulgu: PR #185 kaynak dalı ve yeni entegrasyon dalı

İlk eşleştirme yalnızca aktif onarım dalını esas alıyordu. Açık taslak PR #185 (`feat/frieren-guild-dashboard`, head `6e1ad43b40326312c966127d8dca88acecbb9cf2`) bu adayların bir bölümünü kodlamıştı. Bu modüller daha sonra güncel ana kodla uyumlandırılarak `feat/frieren-platform-expansion-batch` dalına taşındı:

- Yoldaş Akademisi, balıkçılık, Büyülü Sera, yaratık spawn/yakalama ve wishlist.
- Discord OAuth bağlantısı, yetkili sunucu seçimi ve sunucu bazlı feature gate paneli.
- Bu modüller PR #185 kaynak dalında geliştirildi; güncel ana kodla uyumlandırılmış sürümleri artık PR #219 / `feat/frieren-platform-expansion-batch` içinde. Ana dala henüz alınmadı.

### PR #185 doğrulama kanıtı

- Frieren Bot CI: **633/633 PASS**.
- Frieren AI CI: **633/633 PASS**.
- İzole PostgreSQL entegrasyonları: **26/26 PASS** (market/takas/boss/zindan 14; balıkçılık 2; sera 2; yaratık 2; karakter wishlist 1; yoldaş 4; anime quiz 1).
- Bu testler CI içindeki geçici `frieren_audit` veritabanını kullandı; canlı Discord veya üretim veritabanı doğrulaması değildir.
- PR #185 açık ve taslak; merge/deploy yapılmadı.

PR #185 dalı ile güncel ana kod tarihçesi ayrışmış durumda. PR #185 bütünüyle merge/cherry-pick edilmemeli. Gerekli modüller PR #219'da seçilerek taşındı; komut kaydı, DB şeması, `index.js`, `package.json`, feature gate ve test workflow'ları güncel kodla uyumlandırıldı. Aynı özellikler yeniden yazılmamalı.

### Envanterle eşleştirme — önemli sınır

Aktif 2.000 kayıtlı `feature-inventory.json` içinde:
- `ROADMAP-1274–1340`: 67 yoldaş yetenek/ilerleme kaydı hâlâ `planned`.
- `ROADMAP-1341–1407`: 67 pet bakım/ilerleme kaydı hâlâ `planned`.
- `ROADMAP-0938`: karakter wishlist kaydı hâlâ `planned`.
- Balıkçılık, sera/çiftçilik ve yaratık spawn/yakalama için bu aramada doğrudan eşleşen ayrı kayıt bulunamadı.

PR #219'daki temel yoldaş sistemi, bu 134 roadmap kaydının tamamını karşılamaz. Örneğin dokuz farklı yoldaş rolü, pet destek bonusları, bakım serileri, kilometre taşı kozmetikleri ve geçmiş/karşılaştırma işlevlerinin hepsi uygulanmış değildir. Bu kayıtları topluca `implemented` yapmayacağız. Önce her birini gerçek davranışla eşleştireceğiz; balıkçılık/sera/yaratık için benzersiz kayıtlar ENT-032–034 olarak eklendi; yeni kodun alt davranışları bunların ötesinde ayrıca eşleştirilmeli.

### PR #185 kod incelemesinde bulunan düzeltme adayları

1. **Yoldaş transaction kilit sırası — giderildi:** `careForCompanion()` ve kozmetik donatma işlemleri kullanıcı satırı → yoldaş satırı sırasını kullanıyor. Eşzamanlı eğitim/kozmetik PostgreSQL regresyon testi PR #219 dalında eklendi.
2. **Discord OAuth redirect varsayılanı — kod/test düzeltildi:** Lonca paneli Render servis origin'ini `SITE_BASE_URL`/`RENDER_EXTERNAL_URL` üzerinden kullanıyor; `.env.example` callback değişkenlerini belgeliyor ve varsayılan callback için regresyon testi var. Canlı OAuth için Render değişkeni ile Discord Developer Portal callback URI'sinin aynı olması hâlâ operasyonel olarak doğrulanmalı.
3. **Dal uyumsuzluğu:** PR #185 eski ve ayrışmış kaynak dalıdır. PR #219 bu özelliklerin güncel ana kodla uyarlanmış sürümünü içerir; PR #185 topluca merge edilmemeli.

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

- Entegrasyon dalı: `feat/frieren-platform-expansion-batch`
- Kod commit'i: `d792ad979e3441b7ef2eb019f828134d40aeb7be`; son CI kanıtı: `f698b7a34fde9daa978c2605c14b374efae87fa5`
- Ana bot CI: **714/714 PASS**.
- Slash komut / sözdizimi doğrulaması: **PASS**.
- İzole PostgreSQL komut denetimi: **77/77 PASS** (56 temel oyun/ekonomi senaryosu + 5 oyuncu pazarı senaryosu + arena, etkinlik/hatırlatma, balıkçılık, sera, yaratık, karakter wishlist, yoldaş ve anime quiz entegrasyonları).
- Bu kanıtlar GitHub Actions içindeki geçici test veritabanını kullanır; üretim PostgreSQL'i, canlı Discord komutlarını veya Render dağıtımını doğrulamaz.
- PR #185 hâlâ açık taslak ve birleştirilmemiştir. Yeni entegrasyon dalı eski PR'ı topluca birleştirmek yerine ilgili modülleri güncel ana kodla uyumlandırır.
- Lonca paneli, ana site rotasına bağlandı; ana sayfa kartı ve site navigasyonu eklendi. Guild OAuth callback için Render origin varsayılanı ve same-origin kontrolü test edildi.
- Anime Quiz puanları için `anime_quiz_scores` şeması eklendi; Discord Developer Portal'da Message Content Intent etkinliği ayrıca gerekir.
- Yaratık yakalama butonu, spawn mesajı ve guild feature gate bağlantısı eklendi. Gerçek Discord sunucusunda spawn/claim akışı henüz manuel doğrulanmadı.
- Envanterdeki roadmap kayıtları, sadece bu modüller eklendi diye topluca tamamlandı işaretlenmeyecek. Her aday, gerçek alt davranışıyla ayrı eşleştirilecek.

### Bu entegrasyon dalında hâlâ tamamlanmamış rakip backlog alanları

- Yoldaş evrimi, oda/dekorasyon ve gelişmiş kozmetik.
- Olta/yem yükseltmesi ve balık görevleri.
- Tam mevsim/hava simülasyonu.
- Yaratık varyantları için pity/garanti sayaçları ve geniş nadirlik dengesi.
- Serbest 1v1 takım kurucu ve element uyumu/karşıtlığı.
- Kart baskı/seri/varyant, favori/not/rozet ve kart kozmetiği.
- Oyuncu pazarı, teklif iptali ve kullanıcıya açık işlem geçmişi.
- Kelime/hafıza/takım mini oyunları.
- Etkinlik hatırlatıcıları ve boss/raid etkinliklerine doğrudan katılım.
- Paylaşılabilir profil vitrini, arkadaş listesi ve ortak ilerleme.
- Embed/görsel editörü, güvenli büyü otomasyon oluşturucusu, opt-in feed.
- Web oyuncu envanteri/koleksiyonu/pazarı, RSVP ve self-service analitik.
- Veri dışa aktarma/silme ve tüm dashboard akışlarının gerçek mobil tarayıcı doğrulaması.

Bu liste, sonraki uygulama grubunun tekrar yazılmaması gereken kontrol noktasıdır. Her madde için kaynak kod + test + yetki/veri güvenliği kanıtı bulunmadan “tamamlandı” denmeyecek.
