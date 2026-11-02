# Frieren Platform — Rakip Özellik ve Web Paneli Karşılaştırması

> Durum: İlk araştırma / denetim taslağı  
> Tarih: 2026-11-03  
> Amaç: Rakip botların ve web panellerinin faydalı yeteneklerini Frieren evrenine uyarlamak; mevcut özellikleri tekrar oluşturmadan eksikleri belirlemek.  
> Kısıtlar: Ücretsiz altyapı ve ücretsiz API tercih edilir. Ücretli rakip özellikleri yalnızca işlev referansı olarak incelenir; ücretli servise geçiş yapılmaz. Poğaça Frieren RPG/eğlence odağını korur. Moderasyon ve genel sunucu ceza araçları Poğaça'ya eklenmez.

## 1. Araştırma yöntemi

Her rakip için dört ayrı katman incelenir:

1. **Bot yeteneği:** Discord içinde kullanıcıya sunulan gerçek işlev.
2. **Web deneyimi:** Dashboard, sihirbaz, komut kataloğu, görsel düzenleyici, analiz ve yardım sayfaları.
3. **Frieren karşılığı:** Özelliğin Frieren evreninde alacağı isim, görsel dil ve oyun mekaniği.
4. **Kanıt durumu:** Resmî dokümanda görüldü, kodda mevcut, otomatik testte doğrulandı, gerçek Discord'da doğrulandı veya henüz incelenmedi.

Rakip sitelerinde bir özelliğin görünmemesi, o özelliğin kesinlikle bulunmadığı anlamına gelmez. “Rakipte yok” iddiası ancak resmî doküman/ürün incelemesiyle desteklenirse yazılır. Özgün özellikler bu doğrulama yapılmadan “rakiplerde yok” diye etiketlenmez.

## 2. Rakip araştırma kapsamı

| Rakip | Araştırılacak bot yetenekleri | Web/panel incelemesi | Frieren uyarlaması |
|---|---|---|---|
| Dyno | Özel komutlar, otomatik roller, duyurular, hatırlatıcılar, rütbeler ve modüler ayarlar | Modül bazlı dashboard, ayar akışları, dokümantasyon ve komut kataloğu | Büyü otomasyonları, lonca duyuruları, görev hatırlatıcıları, maceracı rütbeleri |
| MEE6 | XP/seviye, ödül rolleri, eklentiler, bildirimler ve topluluk etkileşimi | Eklenti kataloğu, sunucu seçimi, yapılandırma ve ücret/ücretsiz ayrımı | Mana/ustalık ilerlemesi, lonca ödülleri, anime ve macera bildirimleri |
| Carl-bot | Tepki rolleri, özel komutlar, öneriler, starboard, akışlar, hatırlatıcılar ve embed | Mobil uyumlu dashboard, embed oluşturucu, rol/komut ayarları | Sınıf ve büyü seçim menüleri, lonca panosu, büyü parşömeni oluşturucu |
| ProBot | Karşılama görselleri, embed, seçilebilir roller, seviye sistemi ve ticket | Görsel karşılama tasarım aracı, panel, modül dokümantasyonu | Lonca kabul kartı, maceracı profil görselleri, görev/yardım başvuru akışları |
| Tatsu | Küresel ve sunucu ekonomisi, mağaza, koleksiyon, evcil hayvan, ev ve takas | Profil/mağaza/koleksiyon sayfaları, web üzerinden eşya yönetimi | Frieren evreni para sistemi, yoldaşlar, büyü koleksiyonu, ev/oda ve eşya pazarı |
| YAGPDB | Akışlar, özel komutlar, rol menüleri, otomatik yanıtlar ve yapılandırılabilir kurallar | Gelişmiş komut yapılandırması, dokümantasyon ve örnekler | Büyü makroları, otomatik görev tetikleyicileri, kişisel büyü kitapları |
| Arcane | XP, seviye, rol ödülleri, özel komutlar, sayaçlar ve bildirimler | XP hesaplayıcı, seviye ayarları, modül ve yardım sayfaları | Maceracı gelişim hesaplayıcısı, lonca sıralamaları ve görev sayaçları |
| UnbelievaBoat | Ekonomi, gelir kaynakları, mağaza, eşyalar, hayvanlar, mini oyunlar ve hatırlatıcılar | Kapsamlı komut kataloğu, kategori filtreleri ve ekonomi ayarları | Frieren para birimi, zanaat pazarı, yaratık eğitimi, lonca oyunları |
| Statbot | Mesaj/üye/aktivite istatistikleri ve özel stat rolleri | Veri panosu, grafikler, filtreler ve stat rolü yönetimi | Lonca arşivi, oyuncu etkinliği, macera istatistikleri ve ilerleme grafikleri |
| Ticket Tool | Destek panelleri, formlar, özel kanallar, transcript ve başvuru yönetimi | Panel oluşturucu, form alanları, talep durumu ve yetki ayarları | Lonca başvuru masası, hata/yardım talepleri, AI destekli teknik talep |
| Sesh / Apollo | Etkinlik oluşturma, katılım, hatırlatma ve takvim | Takvim, etkinlik listesi, RSVP ve zaman dilimi deneyimi | Lonca etkinlik takvimi, ortak boss saatleri, zindan buluşmaları |

### Kaynaklar — ilk resmî/ürün belgeleri

- Dyno: https://dyno.gg/bot ve https://docs.dyno.gg/en/home
- MEE6: https://mee6.xyz/
- Carl-bot: https://carl.gg/about ve https://docs.carl.gg/
- ProBot: https://probot.io/tr ve https://docs.probot.io/
- Tatsu: https://tatsu.gg/ ve https://tatsu.gg/economy
- YAGPDB: https://yagpdb.xyz/
- Arcane: https://arcane.bot/ ve https://docs.arcane.bot/get-started
- UnbelievaBoat: https://unbelievaboat.com/ ve https://unbelievaboat.com/commands
- Statbot: https://statbot.net/ ve https://docs.statbot.net/docs/guide/dashboard/
- Ticket Tool: https://tickettool.xyz/
- Sesh: https://sesh.fyi/

Bu liste ilk araştırma kapsamıdır; her modülün güncel ücretsiz/ücretli durumu, limitleri ve kullanılabilirliği ayrı ayrı doğrulanmadan uygulama kararı verilmez.

## 3. Frieren ürün haritası

| Rakiplerde görülen işlev ailesi | Frieren ürün alanı | Kullanıcıya görünen Frieren deneyimi |
|---|---|---|
| XP, seviye, rütbe | Maceracı Loncası | Maceracı seviyesi, rütbe sınavı, lonca sıralaması |
| Ödül/ekonomi/mağaza | Kuzey Pazarı | Altın, büyü kristali, mağaza, takas ve günlük gelir |
| Özel komut/otomasyon | Büyü Atölyesi | Tetikleyici, koşul, eylem ve hazır büyü makroları |
| Rol menüsü | Sınıf ve Büyü Seçimi | Sınıf, element, uzmanlık ve kişisel rol menüleri |
| Karşılama/profil kartı | Lonca Kabul Salonu | Kişiye özel maceracı kartı ve Frieren temalı profil |
| Hatırlatıcı/etkinlik | Lonca Takvimi | Günlük görev, boss saati, ortak zindan ve etkinlik RSVP |
| Öneri/anket | Lonca Meclisi | Oylama, öneri, topluluk kararı ve ödüllü etkinlik |
| İstatistik/analiz | Lonca Arşivi | Oyuncu, sunucu, RPG, ekonomi ve etkinlik grafikleri |
| Ticket/form | Lonca Başvuru Masası | Yardım, teknik talep, başvuru ve takip durumu |
| Embed/görsel oluşturucu | Büyü Parşömeni Tasarımcısı | Görsel mesaj, profil kartı, duyuru ve görev kartı editörü |
| Feed/bildirim | Haberci Kuşlar | Anime, yayın, güncelleme ve etkinlik bildirimleri |
| AI asistanı | Frieren AI | Sohbet/hafıza ayrı; kod denetimi/test/onarım ayrı yetki sınırlarıyla |

## 4. Web sitesi ve panel için kontrol listesi

- [ ] Discord OAuth, güvenli oturum, sunucu seçimi ve sunucu izin kontrolü.
- [ ] Her modül için açık/kapalı anahtarı ve sunucuya özel ayarlar.
- [ ] Aranabilir komut kataloğu; seçenekler, örnekler, izinler ve kullanım açıklamaları.
- [ ] Görsel mesaj/embed/parşömen düzenleyicisi ve önizleme.
- [ ] Karşılama/profil kartı görsel tasarımcısı.
- [ ] Özel komut/büyü otomasyon görsel oluşturucusu.
- [ ] XP, görev, ekonomi, koleksiyon ve etkinlik analitiği.
- [ ] Oyuncu profili, envanter, ekipman ve ilerleme web sayfaları.
- [ ] Lonca etkinlik takvimi ve katılım yönetimi.
- [ ] Destek/teknik talep formu, durum takibi ve transcript.
- [ ] Bildirim/feed kaynaklarının yapılandırılması.
- [ ] Servis sağlık ekranı ve bot/AI durum ayrımı.
- [ ] Frieren AI test raporları, PR onayı ve dağıtım sonrası kanıt bağlantısı.
- [ ] Telefon ve masaüstü için erişilebilir, responsive tasarım.
- [ ] Kullanıcıya ait verilerin dışa aktarımı ve hesap/veri silme akışı.
- [ ] Hata, boş durum, yetki yok, bağlantı kesildi ve yükleniyor ekranları.
- [ ] Türkçe karakter, klavye erişilebilirliği, renk kontrastı ve güvenli metin kaçışları.

## 5. Rakiplerde daha az yaygın görünen, özgün Frieren adayları

Bunlar henüz “rakiplerde yok” diye doğrulanmış değildir; özgün ürün fikirleridir. Rakip incelemesi tamamlandıktan sonra benzerleri işaretlenir.

1. **Yaşayan Dünya Takvimi:** Sunucu etkinlikleri, mevsimler, görevler ve boss döngülerinin tek takvimde ilerlemesi.
2. **Büyü Araştırma Ağacı:** Oyuncu kullanım biçimine göre yeni büyü uzmanlık dalları açılması.
3. **Maceracı Hafıza Defteri:** Oyuncunun keşifleri, seçimleri, boss geçmişi ve NPC ilişkilerinden kişisel kronik üretimi.
4. **Dinamik Zindan Haritası:** Takım bileşimi, önceki seçimler ve zorluk seviyesine göre değişen rotalar.
5. **Lonca Ekonomisi Simülasyonu:** Oyuncu arz/talebi, zanaat ve görev ödüllerinin kontrollü biçimde birbirini etkilemesi.
6. **Yoldaş Bağ Sistemi:** Yoldaşın görev, savaş ve sohbet etkileşimleriyle gelişmesi.
7. **AI Kontrollü Test Laboratuvarı:** AI'ın önce mevcut testleri bulması, tekrarları atlaması, eksik davranış için test yazması, hatayı kanıtlaması ve PR taslağı hazırlaması.
8. **Kanıt Bağlı Özellik Haritası:** Her özellik için kod, test, canlı Discord ve dağıtım kanıtını ayrı gösteren panel.
9. **Sürüm ve Veri Uyumluluk Merkezi:** Bot güncellemelerinde veritabanı şeması, eski kayıtlar ve geri dönüş durumunu izleme.
10. **Kişisel Oyun Hikâyesi:** Oyuncunun önemli seçimlerinden ve başarımlarından paylaşılabilir Frieren temalı macera özeti üretimi.

## 6. Mevcut depo ile ilk karşılaştırma

İlk kaynak taramasında:

- `feature-inventory.json`: 317 kayıt, hedef 2.000, `auditComplete=false`; tüm kayıtlar `implemented_needs_runtime_test` durumunda. Bu etiket gerçek Discord'da doğrulama anlamına gelmez.
- Mevcut testlerde oyun kalıcılığı/set bonusu, ekonomi ve crafting işlem bütünlüğü, Discord senaryoları, komut etkileşim kapsamı, public site, Owner Panel ve Frieren AI modülleri için test dosyaları zaten var.
- Public site kodunda ana sayfa, Poğaça, komut kataloğu, Frieren AI ve owner panel yolları bulunuyor.
- `vercel.json` Vercel'i mevcut Render HTTP servisine ters proxy olarak yapılandırıyor; Vercel Discord Gateway botu çalıştırmıyor.
- `vercel.json` içinde Git dağıtımları kapalı. Bu denetim dalında Vercel deploy tetiklenmemeli.
- Son 24 saatte Vercel proje listesinde bir dağıtım görünüyor. Hobby sınırı 100 dağıtım/24 saat olduğundan değişiklikler gruplanmalı; doğrulama tamamlanmadan deploy yapılmamalı.
- Eski belgeler arasında özellik sayısı ve dağıtım mimarisi açısından tutarsızlık var. Bunlar kod değişikliklerinden önce uzlaştırılmalı.

## 7. Test tekrarını önleme kuralı

Yeni test yazmadan önce:

1. İlgili davranışın mevcut test dosyaları ve test adları aranır.
2. Aynı giriş/çıkış ve hata koşulunu zaten kapsayan test varsa yeniden yazılmaz.
3. Mevcut testin kapsamı eksikse yeni test, yalnızca eksik sınırı kapsar.
4. Hata için önce tekrarlanabilir başarısız test yazılır.
5. Test, düzeltmeden önce gerçekten başarısız olmalıdır.
6. Düzeltmeden sonra önce odaklı test, ardından değişiklikten etkilenen mevcut test grubu çalıştırılır.
7. Değişiklik tamamlandığında `npm run check` tek sefer çalıştırılır; arada kod değişmediyse aynı test tekrar edilmez.
8. Otomatik test, Discord test sunucusu, Render sağlık kontrolü ve Vercel dağıtım doğrulaması ayrı kanıt olarak raporlanır.

## 8. Uygulama sırası ve geçiş kapıları

1. **Envanter doğruluğu:** Eski belgelerdeki çelişkileri düzelt; mevcut komut, sayfa, panel, test ve veritabanı işlevlerini tekil kimlikle eşleştir.
2. **Rakip incelemesi:** Her rakip için bot modülleri, web panelleri, ücretsiz limitler ve mobil deneyimi ayrı kaydet.
3. **Fark analizi:** Her işlevi mevcut / eksik / kısmi / test edilmemiş / kapsam dışı olarak sınıflandır.
4. **Mimari ve güvenlik:** Modülleri Poğaça, Frieren AI veya web panelinden hangisinin sorumlu olacağına göre ayır; yetki ve veri sınırlarını koru.
5. **İlk uygulama grubu:** Önce eksik/bozuk mevcut özellikler; sonra yüksek değerli ve ücretsiz uygulanabilir rakip özellikleri.
6. **Test:** Var olan testleri tekrar etmeden hedefli regresyon testleri ve güvenli test sunucusu senaryoları.
7. **Toplu dağıtım:** Vercel dağıtımını yalnızca toplu değişiklik, CI ve canlı doğrulama planı hazır olduğunda oluştur.
8. **Canlı kanıt:** Üretim dağıtım SHA'sı, servis sağlığı, Discord komut durumu ve kritik kullanıcı akışları doğrulanmadan tamamlandı sayma.

### Tamamlanma ölçütü

Bir özellik yalnızca “kod eklendi” diye tamamlanmış sayılmaz. Kod karşılığı, test kanıtı, yetki/veri güvenliği, gerçek kullanıcı akışı ve gerekiyorsa canlı dağıtım doğrulaması birlikte değerlendirilir. Ücretli servise geçiş, üretim verisini silme, otomatik merge ve plansız deploy yapılmaz.


## 9. Eğlence, koleksiyon ve oyun botları — genişletilmiş karşılaştırma

Bu grup, Poğaça Frieren'in ana ürün yönünü belirler. Genel moderasyon/ceza özellikleri burada kapsam dışıdır; yalnızca oyun, topluluk, profil, koleksiyon ve web deneyimi değerlendirilir.

| Bot / ürün | Doğrulanmış oyun özellikleri | Frieren uyarlaması | Web tarafında incelenecek deneyim |
|---|---|---|---|
| Dank Memer | Para kazanma, 300+ koleksiyon eşyası, balıkçılık, 15 bölge, NPC, görev/başarımlar, çiftçilik, 40+ evcil hayvan türü, evcil hayvan odası ve oyuncu pazarı | Kuzey kıtası balıkçılığı, yaratık/ruh yoldaşları, büyülü sera, malzeme çiftliği, NPC görev zincirleri ve lonca pazarı | Wiki, eşya kataloğu, balık/yaratık rehberi, pet koleksiyonu ve pazar sayfaları |
| Pokétwo | Sohbette rastgele yaratık çıkması, yakalama, Pokédex, nadir/efsanevi varyantlar, takas, global pazar, 3v3 savaş, filtreler, hava/zaman ve shiny hunting | Sohbetten keşfedilen büyülü yaratıklar, Frieren yaratık arşivi, nadir varyantlar, 3 kişilik takım savaşları ve yaratık takası | Koleksiyon indeksi, yaratık detayları, arama/filtre, takım oluşturma ve pazar akışları |
| Mudae | Karakter ruleti, süreli sahiplenme, koleksiyon/harem, takas/hediye, wishlist, karakter/seri arama, kişisel profil, rozetler, görsel/alias/not özelleştirme, günlük haklar ve arena | Anime karakter kartları, istek listesi, seri arşivi, nadirlik, sahiplenme/takas, kart rozetleri ve karakter arenaları | Komut yardım kataloğu, karakter/seri arama, koleksiyon profili, rozet ve wishlist sayfaları |
| OwO Bot | Yüzlerce hayvan avlama/toplama, takım kurma, PvP savaş, seviye/XP, liderlik, lootbox ve meme/görsel üretimi | Canavar avı, yoldaş takımı, element uyumlu savaş, ganimet sandığı, maceracı XP ve Frieren temalı görsel kartları | Hayvan/yaratık kataloğu, takım ve liderlik sayfaları, rehber ve komut dizini |
| Karuta | 70.000+ anime karakter kartı, kart toplama, takas, yükseltme ve küresel ekonomi | Frieren evreniyle uyumlu kart albümü, baskı/nadirlik, kart yükseltme, takas ve koleksiyon serileri | Kart galerisi, koleksiyon arşivi, takas rehberi ve ekonomi açıklamaları |
| Tatsu | Küresel para ve sunucu puanı, mağaza ödülleri, kişisel cüzdan kartı, profil ve sıralama | Altın + sunucuya özel lonca puanı, kişisel cüzdan, lonca mağazası, rütbe ve profil kartları | Kullanıcı profili, cüzdan, mağaza, sunucu sıralaması ve kişiselleştirme |
| UnbelievaBoat | İş/gelir, günlük ödül, mağaza, eşya, para transferi ve mini oyunlar | Meslek/iş rotaları, günlük lonca maaşı, eşya pazarı, güvenli oyuncu takası ve lonca oyunları | Komut kataloğu, ekonomi rehberi, mağaza ve sunucu bazlı ayarların görsel sunumu |
| Epic RPG / Gaius Play | Macera, avlanma, savaş, görev, XP ve ekonomi/ilerleme sistemleri | Keşif rotaları, rastlantısal karşılaşmalar, görev serileri ve savaş ilerlemesi | Komut rehberi, oyun wiki'si, ilerleme/ödül açıklamaları |
| Jockie Music / FredBoat | Ses kanalı müzik oynatma, kuyruk, playlist ve oynatma kontrolleri | İsteğe bağlı lonca müzik odası, Frieren temalı ambient/royalty-free ses listeleri | Kuyruk/playlist yönetimi ve kullanım rehberi; yalnızca ücretsiz ve telif açısından uygun kaynaklar |
| Sesh / Apollo | Etkinlik oluşturma, katılım, hatırlatma ve takvim | Lonca etkinlik takvimi, ortak boss saatleri, zindan buluşmaları ve anime geceleri | Takvim görünümü, katılım listesi, zaman dilimi ve hatırlatma ayarları |

### 9.1. Eğlence botlarından alınacak özellik aileleri

| Aile | Aday özellikler | Frieren adı / deneyimi | Öncelik |
|---|---|---|---|
| Canlı koleksiyon | Rastgele yaratık/karakter keşfi, yakalama, nadirlik, varyant, koleksiyon tamamlama | Büyülü Yaratıklar Arşivi | P0 |
| Kart sistemi | Karakter kartı, baskı numarası, çerçeve/kozmetik, wishlist, kart yükseltme | Maceracı ve Karakter Kartları | P1 |
| Yoldaşlar | Evcil hayvan/yaratık sahiplenme, besleme, bakım, eğitim, evrim ve oda | Yoldaş Akademisi | P0 |
| Balıkçılık | Bölgeye göre balık, ekipman, nadir tür, koleksiyon defteri, görev | Kuzey Denizi Balıkçılığı | P1 |
| Çiftçilik | Tohum, büyü, hasat, üretim döngüsü, mevsim ve satış | Büyülü Sera | P1 |
| Avcılık/keşif | Bölge, nadir karşılaşma, yaratık izi, malzeme ve NPC | Kıta Keşifleri | P0 |
| Takım savaşları | 1v1/3v3, sıra tabanlı savaş, element/rol uyumu, durum etkileri | Büyücü Arenası | P0 |
| Ekonomi | Günlük ödül, iş/meslek, mağaza, oyuncu pazarı, teklif/takas, para transferi | Kuzey Pazarı | P0 |
| Mini oyunlar | Trivia, hafıza, kelime, tahmin, şans ve takım oyunu | Lonca Oyun Salonu | P0 |
| Sosyal | Profil, rozet, unvan, wishlist, arkadaş/ekip, paylaşılabilir başarı | Maceracı Kimliği | P1 |
| Etkinlik | Takvim, RSVP, boss/raid saati, hatırlatma, sezonluk yarışma | Lonca Takvimi | P0 |
| Medya | Meme, görsel kart, avatar/rozet üretimi, paylaşılabilir özet | Büyü Tasarım Atölyesi | P2 |
| Müzik | Kuyruk, playlist, ses kontrolü, etkinlik odası | Lonca Dinlenme Salonu | P2; kaynak/telif ve barındırma doğrulanacak |

### 9.2. Mevcut 317 kayıtla çakışma kontrolü

Mevcut envanterde RPG, seviye/ilerleme, keşif, savaş, büyü, envanter, ekonomi, ekipman, görev, koleksiyon, sosyal sıralama, mini oyun, co-op, zindan, boss, ganimet ve crafting kategorileri zaten bulunuyor. Bunları ikinci kez yeni komut olarak yazmayacağız.

İlk envanter karşılaştırmasında aşağıdaki rakip özellik aileleri ayrı eksik/kanıtsız aday olarak işaretlendi:
- Yoldaş/pet bakım döngüsü, evcil hayvan odası ve evrim.
- Balıkçılık, bölgeye bağlı balık indeksi ve nadir varyant.
- Çiftçilik, ekim/hasat ve mevsimsel üretim.
- Rastgele sohbet spawn'ı ve hızlı yakalama yarışı.
- Koleksiyon wishlist, baskı/seri/eksik kart kontrolü ve koleksiyon dışa aktarımı.
- Kart kozmetiği, çerçeve, profil rozeti ve paylaşılabilir kart albümü.
- 3v3 yaratık/karakter takım savaşı ve savaş öncesi takım kurucu.
- Oyuncu pazarı için arama, teklif, fiyat geçmişi ve güvenli takas onayı.
- Web üzerinde oyuncu profili, envanter, koleksiyon, cüzdan ve etkinlik takvimi.
- Web üzerinden görsel/mesaj şablonu ve canlı önizleme.

Bunlar henüz kodda yok hükmü değildir; ilgili modüller ve testler tek tek taranıp durumları mevcut, kısmi, eksik, test edilmemiş veya kapsam dışı olarak kesinleştirilecektir.

### 9.3. Eğlence özellikleri için kalite ve ekonomi kuralları

- Her ödül, drop, yakalama, takas ve üretim işlemi sunucu + oyuncu kimliği kapsamında kalıcı ve atomik olmalı.
- Aynı etkileşimin tekrar gönderilmesi çift ödül veya çift eşya üretmemeli (idempotency).
- Pazar/takas iki taraflı onay ve işlem kilidi kullanmalı; eşya ve para aynı transaction içinde hareket etmeli.
- Nadirlik oranları, pity/koruma sayaçları ve etkinlik bonusları denetlenebilir olmalı; gizli ücretli güç avantajı yaratılmamalı.
- Günlük/haftalık sayaçlar sunucunun saat dilimi ve UTC saklama standardıyla çakışmamalı.
- Her koleksiyon veya pet işlemi için sahiplik, kapasite, durum ve işlem geçmişi doğrulanmalı.
- Görsel üretimi için mevcut görsel varlıklar ve ücretsiz kaynaklar tercih edilmeli; telifli anime müziği/görseli izinsiz çoğaltılmamalı.
- Web paneli sadece kullanıcının Discord OAuth üzerinden doğrulanmış sunucu yetkisine sahip olduğu sunuculara erişmeli.
- Ücretli özellikler rakiplerden referans alınabilir, ancak Frieren'de ücretli API/servis gerektiren bağımlılık eklenmez.


## 10. Resmî kaynaklarla doğrulanan rakip yetenekleri — 2026-11-03

Aşağıdaki maddeler ürünlerin kendi resmî sayfa/dokümanlarında görülen yeteneklerdir. Bunlar Frieren'de varmış gibi kabul edilmez; yalnızca araştırma girdisidir.

| Ürün | Resmî kaynakta görülen yetenekler | Frieren için değerlendirme |
|---|---|---|
| Dank Memer | Balıkçılık ve farklı lokasyonlar, 100+ balık türü, NPC/challenge ilerlemesi, çiftçilik, 40+ pet türü, pet bakımı ve 300+ eşya/market döngüsü | Balıkçılık, sera, yoldaş bakımı ve koleksiyon kataloğu ayrı modüller olarak incelenecek |
| Pokétwo | Sohbette rastgele spawn, yakalama, Pokédex, nadir varyantlar, takas/satış, global pazar ve 3v3 savaş | Sohbet spawn'ı ve ilk yakalayan yarışı; yaratık koleksiyonu ve 3 kişilik takım savaşları |
| Mudae | Karakter/seri arama, süreli sahiplenme, koleksiyon, wishlist, profil, rozet, kişiselleştirme ve arena | Frieren karakter arşivi, wishlist, seri filtreleri, koleksiyon profili ve arena |
| Karuta | Büyük anime kart kataloğu, kart toplama, takas, yükseltme ve küresel ekonomi | Telif/görsel kullanım sınırları korunarak kart koleksiyonu ve yükseltme |
| Tatsu | Global ve sunucu puanları, mağaza, eşya alım-satımı, pet, profil kartları ve kişisel ev dekorasyonu | Lonca para birimi, profil kozmetiği, yoldaş ve kişisel yaşam alanı |
| Carl-bot | Modüler dashboard, reaction roles, custom commands, suggestions, embeds, starboard, feeds, reminders ve triggers | Moderasyon/rol yönetimi Poğaça kapsamı dışında; öneri/oylama, embed editörü, bildirim ve tetikleyici UX'i ayrı değerlendirilir |
| YAGPDB | Regex/contains/exact custom command tetikleyicileri, dinamik yanıtlar, feed ve rol menüsü | Güvenli, izin listeli Frieren büyü otomasyonları ve opt-in bildirimler |

Resmî kaynaklar:
- Dank Memer: https://dankmemer.lol/
- Pokétwo: https://poketwo.net/
- Mudae komut ve özellik rehberi: https://mudae.net/bot/help
- Karuta: https://karuta.com/studio/
- Tatsu: https://tatsu.gg/ ve https://tatsu.gg/economy
- Carl-bot: https://carl.gg/ ve https://docs.carl.gg/
- YAGPDB: https://yagpdb.havensedgemc.com/

Fiyatlandırma, ücretsiz plan limitleri, güncel kullanılabilirlik ve her özelliğin gerçek davranışı ayrıca doğrulanmadan hiçbir ücretli bağımlılık eklenmez. Bu tablo, “rakipte olmayan özellik” iddiası değildir.


## 11. Ek resmî dashboard ve ekonomi kaynakları — 2026-11-03

| Ürün | Kaynakta doğrulanan işlev | Frieren için güvenli uyarlama |
|---|---|---|
| Dyno | Dashboard üzerinden modül/komut açma-kapama; autorole, custom command, announcement, reminder, reaction role, ticket, form, tag ve sosyal feed modülleri | Moderasyon/rol yönetimi kapsam dışı. Güvenli özel komut, hatırlatıcı, öneri/başvuru ve içerik feed'i incelenecek |
| MEE6 | Plugin tabanlı dashboard; custom command, sohbet XP/level, economy game, welcome ve zamanlanmış mesajlar | Var olan RPG XP/ekonomi korunacak; eksik otomasyon, bildirim ve kullanıcıya özel panel UX'i değerlendirilecek |
| UnbelievaBoat | Sunucu ekonomisi, özel mağaza/eşyalar, birden fazla gelir akışı, liderlik, blackjack/roulette, hayvan yarışı ve oyuncular arası eşya teklifi | Ücretsiz limitler ayrıca gözetilecek; mevcut pazar/takas altyapısı tekrar yazılmayacak. Hayvan yarışı/yoldaş sistemleri ayrı aday |
| Apollo | Dashboard'dan etkinlik oluşturma, Discord içinde tek tık RSVP, kapasite, bekleme listesi, role göre katılım ve hatırlatıcı | Boss/raid buluşmaları, zindan partileri ve anime etkinlikleri için Lonca Takvimi |

Resmî kaynaklar:
- Dyno modülleri: https://docs.dyno.gg/en/modules
- Dyno dashboard: https://dyno.gg/bot
- MEE6 dashboard ve plugin rehberi: https://mee6bot.freshdesk.com/support/solutions/articles/101000385394-getting-started-with-mee6
- UnbelievaBoat: https://unbelievaboat.com/
- UnbelievaBoat mağaza dokümanı: https://faq.unbelievaboat.com/dashboard/store/
- UnbelievaBoat ücretsiz/Premium sınırları: https://unbelievaboat.com/premium
- Apollo: https://apollo.fyi/
- Apollo etkinlik başlangıç rehberi: https://docs.apollo.fyi/

Bu kaynaklar işlevleri doğrular; Frieren'e eklenecek her modül için ücretsiz kullanım, telif, veri güvenliği ve gerçek test kapsamı ayrıca incelenmelidir.
