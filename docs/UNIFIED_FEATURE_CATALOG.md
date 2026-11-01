# Frieren Platform — Rakip Özellik Matrisi ve Birleşik Genişleme Kataloğu

Tarih: 2026-11-01

## Kapsam ve karar ilkeleri

Bu çalışma, internetteki her Discord botunun bütün özelliklerini eksiksiz saydığını iddia etmez. Bunun yerine MEE6, Carl-bot, Tatsu, UnbelievaBoat ve Discord'un yerleşik uygulama/etkileşim yetenekleri gibi yaygın ve belgelenmiş örneklerden kapsamlı bir yetenek kataloğu çıkarır.

- Moderasyon, otomatik moderasyon ve log/denetim akışları bu ürün hedefinin dışında tutulur.
- Poğaça Frieren oyuncuya dönük anime/eğlence/RPG ürünüdür.
- Frieren AI kod denetimi, test, hafıza ve kontrollü teknik iş akışı ürünüdür.
- Owner Panel bu iki servisin yönetim ve özelleştirme yüzeyidir.
- Her aday, mevcut komut/kod/test/gerçek Discord kanıtı ile karşılaştırılmadan "eksik" ilan edilmez.
- Özellik sayısı komut alias'ları veya kozmetik metin farklılıklarıyla şişirilmez.
- Yeni özellikler Frieren evreninin diline, karakterlerine, büyü sistemine, bölgelerine ve görsel kimliğine uyarlanır.
- Ücretsiz altyapı korunur; ücretli API, ücretli bot planı veya yeni ücretli host gerektiren fikirler varsayılan olarak elenir.

## Rakiplerden doğrulanan yetenek aileleri

| Kaynak | Belgelenen yetenekler (moderasyon/log hariç) | Frieren için değerlendirme |
|---|---|---|
| MEE6 | Özel komutlar, seviye/XP, karşılama, zamanlayıcı mesajları, Twitch/YouTube/Reddit bildirimleri, müzik | XP mevcut envanterle karşılaştırılmalı; özel komut ve zamanlayıcılar isteğe bağlı sunucu deneyimi olarak değerlendirilmeli; bildirimler yalnızca ücretsiz ve güvenilir kaynaklarla |
| Carl-bot | Reaction roles, öneri ve oylama, özel komut/tag, embed oluşturucu, starboard, tekrar eden mesaj, hatırlatıcı, tetikleyiciler, sosyal bildirimler, komut izinleri | Rol/izin yönetimi genel sunucu yönetimine kaymamalı; bunun yerine büyü okulu seçimi, macera tercihi ve topluluk öneri panosu gibi tema uyarlamaları |
| Tatsu | Global ekonomi, mağaza, 2.000+ eşya kataloğu, eşya alım-satım/hediye, profil kartı, rozet, evcil hayvan, mobilya | Mage kimlik kartı, büyülü yoldaş, oda/dekor, koleksiyon ve oyuncular arası güvenli ticaret için güçlü referans |
| UnbelievaBoat | Özelleştirilebilir ekonomi, mağaza/eşyalar, çoklu gelir akışları, liderlik tabloları, blackjack/roulette gibi oyunlar, hayvan yarışı, hatırlatıcılar | Ekonominin iş/meslek döngüleri, risk/ödül mini oyunları ve yoldaş yarışı Frieren evrenine uyarlanabilir; kumar benzeri mekanikler yerine beceri/şans dengeli kurgu oyunları tercih edilmeli |
| Discord uygulama platformu | Slash komutları, App Launcher, kullanıcı/mesaj bağlam menüleri, Activities ve gerçek zamanlı ortak deneyimler | Komutların yanına bağlam menüleri, buton/select etkileşimleri ve ortak mini oyun akışları eklenebilir; Activities bölgesel/teknik uygunluk ayrıca doğrulanmalı |

## Birleşik özellik kataloğu

Aşağıdaki gruplar araştırma adaylarıdır; mevcut ürünün tamamında bulunmadıkları henüz kanıtlanmış değildir. Durumları kod ve test denetimiyle atanacaktır.

### A. Oyuncu kimliği ve sosyal alan
- Özelleştirilebilir büyücü kimlik kartı: unvan, sınıf, uzmanlık, rozet, favori büyü ve profil teması.
- Profil çerçevesi, arka plan, kart düzeni ve renk paleti.
- Başarımlara bağlı unvanlar ve nadir kozmetik koleksiyonları.
- Arkadaş listesi, takip edilen maceracılar ve ortak geçmiş.
- Teşekkür/itibar sistemi; spam ve istismar korumaları.
- Oyuncu vitrininde seçili karakter, ekipman, büyü ve yoldaş sergileme.
- Profil kartını PNG/SVG olarak üretme (harici ücretli servis olmadan).

### B. Yoldaşlar ve koleksiyon
- Büyülü yaratık/yoldaş edinme, nadirlik, bakım ve seviye ilerlemesi.
- Yoldaş kişilikleri, pasif bonuslar ve kozmetik varyantlar.
- Yoldaş keşif görevleri ve birlikte savaş.
- Karakter kartları, hatıralar, büyü kitapları ve koleksiyon albümleri.
- Yinelenen kartları takas, parçalama veya koleksiyon puanına dönüştürme.
- Koleksiyon setleri ve tamamlanma ödülleri.

### C. Yaşam simülasyonu ve üretim
- Büyülü bitki/şifalı ot yetiştirme, hasat ve mevsim döngüsü.
- İksir, büyü mürekkebi, tılsım ve ekipman üretimi.
- Tarif keşfi, nadir malzeme ve kalite seviyesi.
- Kişisel büyücü odası/atölye, mobilya ve dekor.
- Evcil/yoldaş bakım döngüsü.
- Toplama meslekleri: bitki toplama, maden çıkarma, balıkçılık yerine büyülü göl/ruhsal canlı keşfi.
- Üretim kuyrukları, zamanlayıcılar ve kaynak sınırları.

### D. Ekonomi ve oyuncular arası etkileşim
- Cüzdan/banka/emanet ayrımı (mevcut sistemle karşılaştırılacak).
- Görev, keşif, üretim, turnuva ve etkinlik gelirleri.
- Mağaza, oyuncu pazarı, açık artırma ve teklif sistemi.
- Güvenli takas: iki taraflı onay, eşya/para rezervasyonu, süre aşımı ve tekrar oynatma koruması.
- Eşya hediye etme ve ticaret geçmişi.
- Ekonomi enflasyon/ödül dengesi, günlük/haftalık limitler ve sink mekanikleri.
- Risk/ödül mini oyunları; gerçek para, bahis veya ücretli ödül yok.

### E. Keşif, hikâye ve PvE
- Bölge haritası, bölge kilitleri, keşif puanı ve seyahat süresi.
- Bölgeye özel düşman, NPC, malzeme ve gizli karşılaşmalar.
- Dallanmış hikâye, seçim sonuçları ve karaktere özgü diyaloglar.
- Günlük/haftalık görev panosu ve çok adımlı görev zincirleri.
- Gizli odalar, bulmacalar, hazine haritaları ve keşif başarımları.
- Katmanlı zindan, raid, dünya boss'u ve sezonluk boss zincirleri.
- Dinamik zorluk ve tekrar oynanabilir karşılaşmalar.

### F. PvP, parti ve topluluk oyunları
- İsteğe bağlı büyücü düelloları ve eşleştirme puanı.
- Sezonluk turnuva ve lig tablosu.
- Parti bulma, rol tercihi, davet ve kabul akışı.
- Lonca/akademi sistemi, ortak hedefler ve lonca araştırmaları.
- Asenkron takım mücadeleleri ve ortak ilerleme.
- Sıra tabanlı mini oyunlar, anime quizleri, hafıza/bulmaca ve kelime oyunları.
- Topluluk öneri panosu ve oylama (genel yönetim/moderasyon aracı değil, oyun/topluluk içeriği).

### G. Otomatik topluluk deneyimi
- Yeni oyuncuya Frieren evreni temalı başlangıç rehberi.
- Tekrarlayan etkinlik duyuruları ve zamanlanmış oyun etkinlikleri.
- Ücretsiz kaynaklardan Twitch/YouTube yayın veya video bildirimleri (kota/erişim ve kullanım şartları doğrulanır).
- Özel mesaj hatırlatıcıları ve kişisel görev hatırlatmaları.
- Starboard benzeri topluluk vitrini; yalnızca oyuncuların seçtiği macera/çizim/yaratıcı içerikler için.
- Sunucuya özel tema metinleri, karşılama kartı ve başlangıç macerası.

### H. Discord etkileşim biçimleri
- Slash komutlarında alt komut ve seçenek gruplarını anlaşılır kılma.
- Buton, select menu, modal ve pagination tabanlı paneller.
- Kullanıcı ve mesaj bağlam menüleri: profili incele, düelloya davet et, içeriği öneri panosuna gönder.
- Ortak oyun oturumları ve Discord Activities uygunluğu.
- Autocomplete, ephemeral yanıtlar, kullanıcıya özel panel sahipliği ve süre aşımı.
- Komut izinleri: yalnızca ürün içi owner/oyun yetkileri; genel moderasyon kapsamına genişletilmez.

### I. Frieren AI ve Owner Panel
- Her komut için kısa açıklama, ayrıntılı kullanım rehberi, örnek, parametre ve hata koşulları.
- Komut açıklaması/yardım metni için tek kaynaklı katalog; Discord'un ad/açıklama sınırlarına uygun kısa açıklama ve web panelinde uzun açıklama.
- Panelde komut arama, kategori filtreleme, parametre/örnek gösterimi ve özellik aç/kapatma.
- Komut açıklaması özelleştirmesinde değişiklik önizleme, karakter sınırı kontrolü, sürüm geçmişi ve Discord'a senkronizasyon durumu.
- Site teması için renk, görsel, banner, kart, profil, içerik sırası ve bileşen özelleştirmesi.
- Owner Panel'de sol navigasyon, hızlı işlemler ve sağ içerik alanı arasında dengeli bilgi mimarisi.
- Frieren AI test raporlarını ilgili commit/PR ile ilişkilendirme; otomatik merge/deploy yerine owner onayı.
- Mobil düzen, erişilebilirlik, yükleme/boş/hata durumları ve düşük bant genişliği optimizasyonu.

## Önceliklendirme

| Öncelik | Paket | Neden |
|---|---|---|
| P0 | Komut/özellik gerçek envanteri, test kanıtı ve komut kataloğu | Var olanı tekrar geliştirmemek; açıklama ve yardım metinlerini tek kaynağa bağlamak |
| P0 | Owner Panel bilgi mimarisi ve mobil yerleşim | Mevcut kontrol yüzeyinin anlaşılır ve kullanılabilir olması |
| P1 | Yoldaş, kişisel alan, profil kartı ve koleksiyon | Tatsu benzeri uzun vadeli oyuncu bağlılığı; Frieren temasına doğal uyum |
| P1 | Üretim, bitki yetiştirme, iksir ve atölye | RPG ekonomisine yeni ama tematik oyun döngüleri |
| P1 | Güvenli pazar, açık artırma ve ticaret korumaları | Ekonomi etkileşimini genişletirken veri bütünlüğünü korumak |
| P2 | Düello, turnuva, lonca ve ortak etkinlikler | Topluluk ve tekrar oynanabilirlik |
| P2 | Hatırlatıcı, zamanlayıcı ve otomatik içerik | Topluluk deneyimini kolaylaştırmak; gereksiz sunucu yönetimi kapsamına kaymamak |
| P3 | Discord Activities ve gelişmiş bağlam menüleri | Platform uygunluğu ve geliştirme maliyeti doğrulandıktan sonra |

## Kaynaklar

- MEE6 özellik dokümantasyonu: https://github.com/Mee6/Mee6-documentation
- MEE6 seviye eklentisi: https://github.com/Mee6/Mee6-documentation/blob/master/docs/levels.md
- Carl-bot özellik ve panel açıklaması: https://carl.gg/about
- Carl-bot resmi dokümantasyonu: https://docs.carl.gg/
- Tatsu resmi sitesi ve ekonomi/mağaza: https://tatsu.gg/
- UnbelievaBoat resmi özellik kataloğu: https://unbelievaboat.com/
- UnbelievaBoat komut kataloğu: https://unbelievaboat.com/commands
- Discord uygulama/Activities kullanım açıklaması: https://support-apps.discord.com/hc/en-us/articles/26593412574359-How-to-Use-Apps

## Kanıt durumları

Bir özellik yalnızca aşağıdaki ayrımlar korunarak raporlanır:
- source_present: kaynak kodda işlev karşılığı bulundu.
- automated_tested: ilgili otomatik test mevcut ve geçti.
- discord_runtime_verified: ayrı test sunucusunda gerçek Discord etkileşimi doğrulandı.
- production_verified: üretim davranışı salt okunur/zararsız kontrollerle doğrulandı.
- missing_candidate: kod ve test aramasında karşılığı bulunamadı; kesin yokluk için tam denetim gerekir.
- decision_pending: tema, maliyet, güvenlik veya oyun dengesi kararı bekliyor.

Hiçbir özellik yalnızca dosya/komut sayısı nedeniyle doğrulanmış sayılmaz.
