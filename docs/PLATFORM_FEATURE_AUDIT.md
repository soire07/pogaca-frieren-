# Frieren Platform — Birleşik Özellik Envanteri

## Güncel ek denetim — 2026-11-04

Bu bölüm, 2026-11-01 tarihli başlangıç notunu entegrasyon dalı `feat/frieren-platform-expansion-batch` için günceller; bu dal ana dala merge edilmiş değildir.

- Özellik envanteri: **2.010 kayıt**; **335 mevcut/kod karşılığı olan kayıt** ve **1.675 planlı roadmap adayı**.
- `auditComplete=false` korunuyor. Kod/test kanıtı canlı Discord veya canlı web doğrulaması yerine geçmez.
- Yeni kanıt bağlantılı kayıtlar: ENT-031–ENT-037 ve WEB-016–WEB-017.
- Rakip karşılaştırması Dyno, MEE6, Carl-bot, Tatsu ve UnbelievaBoat resmî sayfalarıyla güncellendi; kaynaklar ve ücretsiz/premium sınır notları `docs/COMPETITOR_FEATURE_MATRIX.md` içinde.
- Poğaça modülleri: yoldaş, balıkçılık, sera, yaratık arşivi, karakter wishlist, Anime Quiz kalıcı puan ve Lonca etkinlik hatırlatmaları.
- Web modülleri: Discord OAuth bağlantısı, yetkili sunucu seçimi, sunucu bazlı Frieren modül anahtarları, bağlı karakterin envanter/ekipman görünümü (`/maceraci/envanter`), escrow tabanlı oyuncu pazarı (`/pazar`) ve etkinlik RSVP/ayrılma formları (`/maceraci`).
- Son tam bot kontrolü **725/725** test ve **31/31** komut senaryosu ile başarılı; slash command doğrulaması ve Owner Panel testleri başarılı. İzole PostgreSQL denetiminin önceki tamamlanmış sonucu **82/82** idi; yeni web envanteri/RSVP entegrasyon testi genişletilmiş denetim paketine eklendi. Bu testler canlı Discord/web tarayıcı doğrulaması değildir.
- PR #219, PR #217 üzerine yığılmış taslak PR'dır. Merge, Render deploy, Discord komut kaydı ve üretim DB değişikliği yapılmadı.

Son denetim: 2026-11-01  
Kapsam: Poğaça Frieren, Frieren AI ve Frieren Owner Panel / web sitesi.  
Kapsam dışı: log görüntüleme/analizi ve bu üç sistem dışında kalan botlar veya projeler.

Bu belge bir başlangıç envanteridir; tamamlanma beyanı değildir. Özellik, yalnızca kaynak kodda karşılığı bulunduğunda "mevcut" sayılır. Otomatik test, gerçek Discord etkileşimi ve canlı servis doğrulaması ayrı kanıt türleridir.

## Mevcut mimari

- Tek kaynak depo: `soire07/pogaca-frieren-`.
- Poğaça Frieren: Render Web Service, `https://pogaca-frieren.onrender.com`, kök dizin.
- Frieren AI: ayrı Render Web Service, depo içindeki `ai-agent/` kök dizini.
- Web sitesi ve Owner Panel: Poğaça servisinin Node.js HTTP uygulaması içinde sunuluyor; Owner Panel `/owner` altında. Vercel dağıtımı bu çalışma için kullanılmıyor ve 100 dağıtım sınırı korunacak.
- Kalıcı RPG ve panel verileri Neon PostgreSQL'de. AI sohbet/hafıza için ayrı servis yapılandırması bulunuyor.
- Owner erişimi Discord OAuth ve sunucu tarafında imzalanan oturumla sınırlandırılmış.

## 1. Poğaça Frieren

### Kodda bulunan yetenek alanları
- Oyuncu profili, seviye, XP, stat puanları, sınıflar ve yetenek ağacı.
- Büyüler, büyü ustalığı ve savaş etkileşimleri.
- Keşif, bölge karşılaşmaları, görevler, görev zincirleri ve başarımlar.
- Envanter, eşya kullanımı, ekipman, set bonusları ve zanaat.
- Market, para, günlük ödüller ve oyuncular arası takas.
- Solo boss, ortak boss/raid, çok katlı ve ortak zindanlar.
- Karakter koleksiyonu, NPC, hikâye, Frieren evreni rehberi ve anime mini oyunları.
- Liderlik tabloları, oyuncu geçmişi ve RPG istatistikleri.

### Kanıt ve sınır
- Rakip bot/web karşılaştırmasından gelen 10 ek kayıt (`ENT-031–038`, `WEB-016–017`) eklendi. Bunlar kodda mevcut işlevleri temsil eder; canlı Discord/web akışlarının tamamı doğrulanmış değildir.
- Depodaki `feature-inventory.json` 335 mevcut özellik kaydı içeriyor; toplam 2.010 kayıt (335 mevcut + 1.675 planlanan); başlangıç hedefi 2.000. Planlanan 1.675 satır, normalize edildiğinde 325 temel yetenek grubuna ayrılıyor: 225 grup yedi işlem fiiliyle (1.575 satır), 50 tek işlemli ve 50 fiilsiz tekil kayıt. Ayrıntı: `docs/ROADMAP_CAPABILITY_INDEX.md`.
- Envanterin `auditComplete` alanı `false`. Bu nedenle 335 sayısı tüm bot özelliklerinin eksiksiz envanteri değildir.
- 335 kaydın tamamı `implemented_needs_runtime_test` durumunda. Bu, kaynakta uygulama bulunduğunu belirtir; her özelliğin canlı Discord'da gerçek kullanıcıyla uçtan uca doğrulandığını göstermez.
- Önceki CI kanıtları: 715/715 ana bot testi, 31/31 komut senaryosu ve 82/82 izole PostgreSQL entegrasyon testi başarılıydı. 2026-11-04 tarihli güncel HEAD `bef213d891080aac4414ca418b8b46029f115be7` için ana bot CI, komut doğrulaması ve Owner Panel testleri başarılı; genişletilmiş PostgreSQL denetimi yeni pazar escrow testiyle tekrar çalışıyor ve henüz tamamlanmadı. Bunlar sentetik Discord etkileşimleri ve izole test veritabanı kullanır; gerçek kullanıcı hesabıyla manuel Discord testi değildir.
- Moderasyon ve genel sunucu yönetimi Poğaça'nın hedef kapsamı değildir.

## 2. Frieren AI

### Kodda bulunan yetenek alanları
- Ayrı Discord botu ve Groq ücretsiz sağlayıcı entegrasyonu.
- `/frieren-ai` ile seçilmiş kaynak kod bağlamı üzerinden teknik soru-cevap.
- `/frieren-test` ile izin listesine alınmış test komutlarını çalıştırma ve hedefli test raporu.
- `/frieren-komut-denetle` ile Poğaça'nın izole komut denetim köprüsünü çağırma.
- Kullanıcıya özel kalıcı hafıza; kaydetme, listeleme, silme ve temizleme.
- Konuşma bağlamı, hafıza gizliliği kontrolleri, test tanılaması ve sağlık uç noktaları.
- GitHub Actions içinde isteğe bağlı, sınırlı onarım PR'ı taslağı oluşturan ayrı workflow.

### Eksikler / doğrulanması gerekenler
- Discord içindeki AI komutu kendi başına kaynak kodu değiştirmiyor veya dağıtım yapmıyor; mevcut onarım akışı ayrı GitHub Actions workflow'u üzerinden PR taslağı oluşturuyor.
- AI'ın PR oluşturma akışının Owner Panel'den güvenli biçimde başlatılması ve durumunun izlenmesi mevcut kanıtla doğrulanmadı.
- Gerçek bir hata senaryosunda baştan sona: tespit → test → onarım PR'ı → inceleme/onay → dağıtım → canlı doğrulama zinciri henüz uçtan uca kanıtlanmış değil.
- Ücretsiz Groq kota/erişilebilirlik sınırları var; ücretli sağlayıcıya otomatik geçiş yapılmamalı.

## 3. Owner Panel ve web sitesi

### Kodda bulunan yetenek alanları
- Discord OAuth ile site/owner oturumları ve owner kimliği kontrolü.
- Genel bakış ve sistem durumu.
- Poğaça ve Frieren AI için servis durumu/sağlık görünümü.
- İzinli Render servis işlemleri; Poğaça için yeniden başlatma, Frieren AI için yeniden başlatma/askıya alma/devam ettirme.
- RPG metrikleri, oyuncu arama ve oyuncu ayrıntıları; kaynak/envanter/ekipman yönetimi.
- Sunucu yapılandırmaları ve özellik anahtarları.
- Günlük görev ve RPG içerik kataloğu yönetimi.
- Frieren sohbet ayarları.
- AI hafıza arama/düzenleme/silme ve teknik talepler/onaylar.
- Duyuru, bakım ve partnerlik işlemleri.
- Veritabanı çalışma alanı ve salt okunur tablo önizlemeleri.
- Denetim/test geçmişi ve sınırlı sistem ölçümleri.

### Eksikler / doğrulanması gerekenler
- Kodda bulunan her panel formu ve butonun canlı ortamda başarılı çalıştığı henüz tek tek kanıtlanmadı.
- Mobil ve masaüstü ekranlarında tüm panel bölümlerinin kullanılabilirliği gerçek tarayıcı oturumunda doğrulanmalı.
- Poğaça ve Frieren AI servis kontrol işlemlerinin izin, onay, hata ve geri dönüş davranışları gerçek servislerle uçtan uca doğrulanmalı.
- Web sitesi sayfalarının gösterdiği komut sayısı/içeriği ile Discord'a gerçekten kaydedilmiş komutlar arasında tutarlılık doğrulanmalı.
- Paneldeki AI test ve onarım taleplerinin sonucu, ilgili commit/PR ve dağıtım ile ilişkilendirilmiş tek bir güvenli iş akışına dönüştürülmeli.

## 4. Birleştirme kuralları

- Poğaça oyunculara dönük RPG/eğlence ürünüdür.
- Frieren AI teknik denetim, test, hafıza ve kontrollü onarım asistanıdır.
- Owner Panel bu iki servisin merkezi kontrol yüzeyidir.
- Oyuncu verisi, AI hafızası ve owner verileri yetki sınırlarıyla ayrı tutulur.
- Üretim Neon tabloları üzerinde test verisi oluşturulmaz; entegrasyon testleri geçici PostgreSQL kullanır.
- Vercel dağıtımı oluşturulmaz; 100 dağıtım sınırı korunur.
- Ücretli API veya ücretli host planına geçilmez.
- Log ekranları ve log özellikleri bu envanterin kapsamına alınmaz.
- Yeni özellik eklemeden önce mevcut eşdeğer işlev aranır; yinelenen özellik oluşturulmaz.
- Her yeni davranış için önce başarısız test, sonra uygulama ve test doğrulaması gerekir.

## 5. Uygulama sırası

1. Üç sistemdeki gerçek kullanıcıya dönük işlevlerin tam envanterini çıkar; kod, test ve canlı kanıtı ayrı işaretle.
2. Site ve Owner Panel'in tüm rotalarını, formlarını, butonlarını ve mobil düzenini doğrula.
3. AI'ın güvenli teknik iş akışını tamamla: test hedefi, kanıtlı sonuç, PR taslağı, owner onayı ve dağıtım sonrası doğrulama. Otomatik merge/deploy varsayılan olmayacak.
4. Poğaça özellik kataloğundaki eksik ve tekrarlı RPG işlevlerini denetle; veri bütünlüğü ve oyun dengesi korunarak ilerle.
5. Üç sistemi birleştiren merkezi durum/iş akışı panelini tamamla ve kritik akışları uçtan uca doğrula.

## Başlangıç durumu

Bu denetimde yeni özellik kodu PR #219 taslağına eklendi; üretim verisi değiştirilmedi ve canlı dağıtım yapılmadı. CI kanıtı: önceki doğrulanmış dal noktasında 715/715 ana bot testi, 31/31 komut senaryosu ve 82/82 izole PostgreSQL entegrasyon testi. Güncel HEAD için yeni PostgreSQL genişletilmiş denetimi henüz çalışıyor. Canlı Discord ve Render doğrulaması merge/deploy sonrasına bırakılmıştır.
