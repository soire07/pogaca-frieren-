# Frieren Platform — Birleşik Özellik Envanteri

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
- Depodaki `feature-inventory.json` 317 ayrı oyuncu özelliği kaydı içeriyor; hedef 2.000.
- Envanterin `auditComplete` alanı `false`. Bu nedenle 317 sayısı tüm bot özelliklerinin eksiksiz envanteri değildir.
- 317 kaydın tamamı `implemented_needs_runtime_test` durumunda. Bu, kaynakta uygulama bulunduğunu belirtir; her özelliğin canlı Discord'da gerçek kullanıcıyla uçtan uca doğrulandığını göstermez.
- Önceki CI kanıtları: 62 oyuncu komut denetimi, 14 PostgreSQL entegrasyon testi ve genel bot testleri başarılıydı. Bunlar sentetik Discord etkileşimleri ve izole test veritabanı kullanır; gerçek kullanıcı hesabıyla manuel Discord testi değildir.
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

Bu ilk kayıt, mevcut kod ve belgelerden çıkarılmıştır. Henüz yeni özellik veya üretim verisi değiştirilmedi. Sonraki değişiklikler ayrı PR, CI ve canlı dağıtım kanıtlarıyla kaydedilecektir.
