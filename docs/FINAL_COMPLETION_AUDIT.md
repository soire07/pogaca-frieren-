# Frieren Platform — Bütünleşik Tamamlama Denetimi

> Denetim başlangıcı: 2026-11-04  
> İncelenen PR: #217  
> İncelenen kod başlığı: `99d25d0b72fb0052bd2aa2adc89c61db95a706be`  
> Bu belge bir başlangıç denetim kaydıdır; eksik özelliklerin uygulandığı veya canlı sistemin doğrulandığı anlamına gelmez.

## 1. Tek kaynak envanterinin gerçek sayıları

`feature-inventory.json` doğrudan incelendiğinde:

- Toplam kayıt: **2.018**
- Kod karşılığı bulunan fakat canlı çalışma zamanı doğrulaması gereken: **343**
- Planlanan: **1.675**
- `auditComplete`: **false**
- `docs/ROADMAP_CAPABILITY_INDEX.md` içindeki sözcüksel normalizasyon: **325 planlı yetenek grubu**

Önemli yorum: 1.675 kayıt, 1.675 bağımsız oyun mekaniği değildir. 325 gruba indirgeme yalnızca kategori ve isim/işlem fiili normalizasyonudur; anlamsal tekrarları veya uygulama durumunu kanıtlamaz. Kayıtlar silinmeyecek ve yalnızca benzer isim nedeniyle mevcut işlev sayılmayacaktır.

## 2. Kaynaklar arası tutarsızlık

PR #217 açıklaması hâlâ 2.015 kayıt / 340 kod karşılığı bildirirken, PR head'indeki güncel JSON 2.018 / 343 değerini bildiriyor. Bu nedenle PR açıklaması ve eski denetim belgeleri güncel envanterle uzlaştırılmalıdır.

`docs/COMPETITOR_FEATURE_MATRIX.md` içinde önceki envanter sayısına ve ilk araştırma durumuna dayanan ifadeler bulunuyor. `docs/COMPETITOR_FEATURE_STATUS.md` bazı yeni PR kapsamlarını ve son arena/balıkçılık doğrulamasını yansıtmıyor olabilir. Kod, test ve belge eşlemesi yeniden yapılmadan bu durum tabloları nihai kabul edilmemelidir.

## 3. PR ve doğrulama sınırı

- PR #217 açık, taslak ve birleştirilmemiştir.
- İncelenen head için GitHub Actions'ta 6/6 iş akışı tamamlanmış ve başarılı görünmektedir: Poğaça checks, slash-command validation, Frieren AI CI, Owner Panel performance, Owner Panel tests ve isolated command audit.
- Bu CI sonucu yalnızca belirtilen commit için geçerlidir. Yeni commit'ler eklenirse yeniden doğrulama gerekir.
- Otomatik test ve izole PostgreSQL testleri canlı Discord etkileşimi, gerçek OAuth tarayıcı akışı, Render runtime veya üretim veritabanı doğrulaması değildir.
- Bu denetim sırasında merge, Discord komut kaydı, Render/Vercel dağıtımı veya üretim veritabanı yazımı yapılmamıştır.

## 4. Rakip araştırmasının kapsamı

Resmî kaynak kanıtları şu ürün ailelerini kapsıyor: Dyno, MEE6, Carl-bot, Tatsu, UnbelievaBoat, Pokétwo, Mudae ve Karuta. Geniş karşılaştırma belgesinde ayrıca ProBot, YAGPDB, Arcane, Statbot, Ticket Tool, Sesh/Apollo, Dank Memer, OwO, Karuta, Jockie/FredBoat ve diğer oyun/etkinlik ürünleri aday olarak listeleniyor.

Araştırma henüz her ürünün her modülünü, mobil panelini, ücretsiz plan limitini ve güncel premium ayrımını eksiksiz doğrulamış değildir. Ürün sayfasında görünmeyen bir özellik rakipte kesinlikle yok sayılmayacaktır. Ücretli API/abonelik Frieren bağımlılığı yapılmayacaktır. Poğaça'nın RPG/eğlence odağı korunacak; genel moderasyon ve ceza araçları kapsam dışıdır.

## 5. Birleşik fark analizi — ilk doğrulanması gereken aileler

Aşağıdaki liste, mevcut belgelerde kısmi/eksik/kanıt bekleyen olarak işaretlenmiş alanların başlangıç kümesidir. Her madde kod, komut, web route, DB şeması, mevcut test ve canlı kanıt üzerinden yeniden sınıflandırılacaktır.

### Oyun ve topluluk
- Anime karakter kart albümü: seri/baskı, nadirlik, varyant, favori/not, profil rozeti, kozmetik ve tamamlama ödülleri.
- Koleksiyon dışa aktarımı ve eksik kart/seri ilerlemesi.
- Yoldaşların tüm rol/evrim/destek görevleri, oda/dekorasyon ve profil vitrini.
- Balıkçılık ve sera için bölge/mevsim/hava derinliği, katalog ve ekonomi dengesi.
- Yaratık yakalama varyantları, filtreler, koleksiyon tamamlama ve güvenli bildirim tercihleri.
- Arena: 1v1/3v3, takım kurucu, sıra/element/rol dengesi, eşzamanlı kuyruk, sezon/turnuva/lig ve ödül tekilleştirmesi. Son test raporuyla eski backlog ifadeleri karşılaştırılacak.
- Boss/raid/zindan: dinamik harita, takım katılımı, durum etkileri, ödül idempotency ve savaş görselleri.
- Ekonomi: meslek/gelir döngüsü, açık artırma, kategori filtreleri, fiyat alarmı/geçmişi ve oyuncu pazarı.
- Sosyal: arkadaş/ekip, ortak ilerleme, paylaşılabilir profil, rozet ve başarı kroniği.
- Etkinlik: tam takvim, sezonluk yarışma, RSVP, hatırlatma tercihi ve geçmiş.

### Web sitesi ve panel
- Discord OAuth, yetkili sunucu seçimi, callback eşleşmesi ve mobil uçtan uca doğrulama.
- Sunucu bazlı modül/komut ayarları ve her mutasyonda guild/account/CSRF kapsamı.
- Komut kataloğunda seçenek, izin, örnek ve kullanım rehberi tamlığı.
- Görsel embed/parşömen/profil kartı editörü ve güvenli canlı önizleme.
- Güvenli özel komut/büyü otomasyon oluşturucusu (izinli tetikleyici/koşul/eylem modeli).
- Oyuncu profili, envanter, ekipman, kart, yoldaş, cüzdan ve etkinlik sayfalarının tutarlılığı.
- Analitik, grafik, destek talebi ve talep takip ekranı.
- Veri dışa aktarma, hesap/veri silme ve saklama politikası.
- Erişilebilirlik, Türkçe karakter, boş/hata/yükleniyor durumları ve responsive mobil/masaüstü.

### AI ve operasyon
- Oyuncu sohbet kişiliği/hafızası (Frieren Neural) ile teknik test ajanı (Frieren AI) kesin ayrı tutulmalı.
- AI/Guardian/Owner yetkileri, prompt injection sınırları, secret redaction ve onaylı PR iş akışı doğrulanmalı.
- Test ajanı testleri kanıta göre seçmeli; mevcut testleri tekrar etmemeli; gerçek komut davranışı ve canlı E2E'yi olduğundan fazla raporlamamalı.
- Kota korumaları: Discord komut kayıtları idempotent, GitHub Actions concurrency/path filters, Render/Vercel deploy yalnızca tek kontrollü yayın.
- Migration runner ve mevcut şema bootstrap'ı için catalog parity, izole PostgreSQL prova ve geri dönüş planı tamamlanmalı.
- Güvenlik: OAuth state/CSRF, oturum cookie, owner allowlist, guild/character izolasyonu, rate limit, input validation, XSS/SQL injection, SSRF, secret/log sızıntısı ve DDoS/kapasite kontrolleri.

## 6. Uygulama ve kanıt kuralları

Her yetenek için aşağıdaki durumlar ayrı tutulur:

1. `planned`: ürün kararı verilmiş, kod yok.
2. `in_progress`: geliştirme sürüyor.
3. `implemented_needs_runtime_test`: kod/test adayı var; canlı akış kanıtı eksik.
4. `automated_verified`: ilgili davranış testi CI'da gerçekten çalıştı.
5. `live_verified`: gerçek Discord/web/Render akışı kontrollü biçimde doğrulandı.
6. `out_of_scope`: ürün hedefiyle uyuşmadığı için bilinçli olarak dışarıda.

Her envanter kaydı benzersiz bir davranışa bağlanmalı; yalnızca komut alias'ı, dosya veya UI satırı yeni özellik sayılmaz. Her test eşlemesi gerçekten çalışan test adına ve ilgili davranış assertion'ına dayanmalı. Önce mevcut testler aranmalı; yinelenen test yazılmamalı.

## 7. Tamamlama kapıları

- [ ] Güncel 2.018 kayıt tek kaynak olarak doğrulandı; PR açıklaması ve belgeler uzlaştırıldı.
- [ ] 343 kod karşılığı bulunan kayıt, benzersiz davranış + kod + test kanıtı üzerinden denetlendi.
- [ ] 325 normalize grup anlamsal tekrar ve gerçek ürün değeri açısından gözden geçirildi.
- [ ] Rakip ürünlerin bot, web, mobil ve ücretsiz/premium ayrımı resmî kanıtla güncellendi.
- [ ] Ürün kapsamına giren P0/P1 eksikler uygulandı; ücretli servis eklenmedi.
- [ ] Discord ve web aynı use-case servislerini, aynı guild/player scope ile kullanıyor.
- [ ] Birleşik CI ve izole PostgreSQL testleri yeni head'de başarılı.
- [ ] Discord test sunucusunda kritik komut/interaction akışları doğrulandı.
- [ ] OAuth ve web panelleri mobil + masaüstü tarayıcıda uçtan uca doğrulandı.
- [ ] Üretim DB migration/şema uyumluluğu ve yedek/geri dönüş kontrolü yapıldı.
- [ ] Tek onaylı merge/deploy sonrasında Render sağlık, gerçek Discord komutları ve kritik web akışları doğrulandı.

## 8. Korunan sınırlar

- Üretim veritabanına test verisi yazılmaz.
- Kullanıcı verisi veya mevcut oyun dengesi izinsiz silinmez/değiştirilmez.
- Ücretli API, ücretli model, yeni ücretli servis veya gereksiz mikroservis eklenmez.
- Genel moderasyon/ceza botu özellikleri eklenmez.
- Otomatik merge, canlı komut kaydı ve üretim deploy'u açık yayın onayı olmadan yapılmaz.
- Başarılı CI, canlı sistemin doğrulandığı şeklinde raporlanmaz.

Bu belge, bütünleşik tamamlama çalışmasının denetim tabanıdır. Her tamamlanma iddiası commit, test çıktısı ve gerekiyorsa canlı kanıtla güncellenmelidir.
