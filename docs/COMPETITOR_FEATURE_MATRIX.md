# Frieren Platform — Rakip Özellik ve Web Paneli Karşılaştırması

> Durum: İlk araştırma / denetim taslağı  
> Tarih: 2026-11-02  
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
