# Frieren Competitor Feature Audit

**Tarih:** 2026-11-04  
**Repository:** `soire07/pogaca-frieren-`  
**İzlenen çalışma:** PR #217 açık/taslak kalır; bu belge araştırma ve kapsam ayrıştırmasıdır. Üretim veritabanı, canlı Discord komut kaydı, Render veya Vercel dağıtımı bu çalışma kapsamında değiştirilmez.

## 1. Amaç ve kapsam

Amaç, Discord botları ve bot web panellerindeki oyuncu/topluluk özelliklerini inceleyip Frieren evrenine özgün biçimde uyarlamaktır. Kapsam hem Discord botlarını hem de ana siteyi ve Maceracı Loncası oyuncu panelini içerir.

**Dahil:** RPG, eğlence, koleksiyon, ekonomi, sosyal etkileşim, etkinlikler, kişisel profiller, kişiselleştirme, oyuncu panelleri, hatırlatmalar ve oyun odaklı topluluk araçları.

**Hariç:** Genel moderasyon, ban/kick/timeout, log ve genel sunucu güvenlik/yönetim botu özellikleri. Bunlar Frieren'in oyun/eğlence kapsamına taşınmayacaktır. Ücretli API veya ücretli servis gerektiren tasarımlar seçilmeyecektir.

## 2. Mevcut envanterin doğru okunması

PR #217 başlığındaki `feature-inventory.json` şu anda:
- 325 mevcut özellik kaydı,
- 1.675 `planned` yol haritası kaydı,
- toplam 2.000 kayıt,
- 25 kategori ve kategori başına 67 planlama kaydı içerir.

1.675 kayıt, 1.675 bağımsız oyun mekaniği değildir. İsimler normalize edildiğinde 225 temel yetenek grubu yedi işlem etiketiyle tekrar eder: `Preview`, `Unlock`, `Track`, `Compare`, `Customize`, `Earn milestones for`, `Review history for`. Buna ek olarak 100 tekil planlama kaydı bulunur. Böylece 1.675 satır, 325 temel planlama fikrini temsil eder. Bu tekrarlar silinmeyecek; tek bir temel yetenek ve ona bağlı gerçek kullanıcı işlemleri olarak yeniden modellenmeleri değerlendirilecektir.

Mevcut 325 kaydın kanıtları da aynı şey değildir: testEvidence alanları unit, source-contract, izole Discord etkileşimi ve gerçek PostgreSQL entegrasyonu gibi farklı kapsamları açıkça belirtir. Kaynak sözleşmesi testi canlı Discord uçtan uca testi olarak sunulmayacaktır. `auditComplete` false kalmalıdır; planlanan özellikler uygulanmış sayılmaz.

## 3. Rakiplerden alınacak özellik alanları

| Referans | Kaynakta görülen özellik alanları | Frieren'e uyarlanacak taraf |
|---|---|---|
| Dyno | Yapılandırılabilir panel, özel komutlar, otomatik mesaj/zamanlayıcı, hatırlatma ve duyuru modülleri | Oyun hatırlatmaları, kişisel zamanlayıcılar, Frieren temalı otomatik etkinlik duyuruları |
| MEE6 | XP/seviye, özel komutlar, zamanlanmış mesajlar, Twitch/YouTube/Reddit bildirimleri | Oyun dışı sohbet etkinliği için isteğe bağlı XP, içerik/etkinlik bildirimleri, oyuncu tarafından seçilen bildirimler |
| Carl-bot | Öneri, oylama, etkileşimli rol menüleri, özel komutlar | Lonca önerileri, hikâye/etkinlik oylamaları ve oyun içi seçim arayüzleri; genel rol yönetimi kapsam dışı |
| ProBot | Görsel embed tasarımı, sosyal komutlar ve web paneli | Frieren temalı kart/duyuru tasarımcısı ve kişisel profil görünümü; moderasyon ve sunucu koruması kapsam dışı |
| Tatsu | Profil/rütbe kartları, XP, sıralamalar, itibar, cüzdan, sunucu mağazası ve rozetler | Maceracı kimliği, kişisel kartlar, unvan/rozet vitrini, ekonomi ve oyuncu mağazası |
| YAGPDB | Tetikleyici tabanlı özel komutlar, dinamik yanıtlar ve içerik akışları | Frieren karakterleri/lore için bağlama duyarlı eğlence yanıtları ve seçilebilir içerik akışları |
| Arcane | Mesaj/ses/reaksiyon XP kaynakları, dönemsel sıralamalar, rütbe kartları | Haftalık/aylık lonca etkinliği sıralamaları ve özelleştirilebilir maceracı kartları; ses XP ayrı karar gerektirir |
| Dank Memer | Ekonomi, balıkçılık, balık koleksiyonu, NPC/challenge, çiftlik, evcil hayvan ve pazar | Kuzey Denizi, Büyülü Sera ve Yoldaş Akademisi |
| Pokétwo | Rastgele yaratık ortaya çıkışı, yakalama, nadir varyantlar, koleksiyon, takas ve savaş | Yaratık Arşivi, keşif karşılaşmaları, nadir/parlak varyantlar ve takım savaşları |
| Mudae | Karakter toplama, dilek listesi, profil rozetleri, koleksiyon özelleştirme | Karakter Kartları, wishlist, albüm ve profil rozeti sistemi |
| Karuta | Anime kartları, geliştirme, çerçeve/arka plan, envanter, pazar ve takas | Kart albümü, kozmetik çerçeveler, kart geliştirme ve güvenli takas |
| OwO | Yaratık avlama, takım savaşı, ganimet kutuları ve sıralamalar | Yaratık avı, yoldaş takımları, nadir ganimet ve koleksiyon sıralaması |
| Epic RPG | Sınıf, görev, keşif, zindan, parti ve boss ilerlemesi | Mevcut RPG'nin genişletilmesi; tekrar eden temel sistemlerin yeniden yazılmaması |
| UnbelievaBoat | Ekonomi, eşya mağazası, hayvanlar, hatırlatmalar ve mini oyunlar | Kuzey Pazarı, yoldaş bakım/yarışları ve Lonca Oyun Salonu |
| Jockie Music / FredBoat | Kuyruk, arama, oynatma listesi ve müzik geçmişi | Ana RPG kapsamı dışında; ayrı bir ürün kararı verilmeden müzik servisi eklenmeyecek |

## 4. Mevcut Frieren uygulamasıyla eşleştirme

### Botta zaten bulunan ve korunacak sistemler

Mevcut 325 özellik kaydı; RPG profili ve istatistikleri, XP/seviye, sınıflar ve build'ler, büyü ve ustalık, keşif ve keşif günlüğü, solo boss, ortak zindan/raid, ekipman ve set bonusları, envanter, ekonomi, market, zanaat ve eşya parçalama, günlük görevler, NPC yan görevleri, başarımlar, hikâye seçimleri, lore, karakter koleksiyonu/pity/yükseltme, takas, anime quiz, Mimic etkileşimi, arena sezonu/Elo, lonca etkinlikleri, liderlik tabloları ve macera geçmişi gibi sistemleri kapsar.

Bu sistemler yeniden yazılmayacak. Yeni modüller mümkün olduğunda mevcut kullanıcı kimliği, envanter, ekonomi, koleksiyon, etkinlik ve ödül işlemleriyle bütünleştirilecektir.

### Kısmen bulunan / genişletilecek alanlar

- **Karakter koleksiyonu:** Koleksiyon, nadirlik/pity, yükseltme ve takas var; wishlist, albüm, profil vitrini ve kozmetik kart özelleştirmesi ayrı geliştirme alanlarıdır.
- **Ekonomi:** Altın, eşya marketi, zanaat ve takas var; oyuncudan oyuncuya açık pazar, teklif/ihale, fiyat takibi ve güvenli pazar işlemleri ayrıca doğrulanmalıdır.
- **Arena:** Sezon ve Elo temeli var; 1v1/3v3 varyantları, draft, sınıf/büyü/ekipman kısıtlı modlar, turnuvalar ve maç tekrarları genişletme alanlarıdır.
- **Lonca etkinlikleri:** Etkinlik takvimi ve katılımcı kapasitesi altyapısı var; oyuncu panelinde RSVP, kişisel hatırlatma ve etkinlik geçmişi akışı tamamlanmalıdır.
- **Mini oyunlar:** Anime quiz ve Mimic var; hafıza, kelime, takım trivia ve lonca turnuvaları eklenebilir.
- **Sosyal katman:** Sıralama ve takas var; arkadaş/rakip/mentor ilişkileri, itibar, hediye ve herkese açık başarı vitrini ayrıca tasarlanmalıdır.

### Gerçekten yeni modüller

1. **Yoldaş Akademisi:** Yoldaş sahiplenme, bakım, besleme, eğitim, seviye, beceri ve evrim. Yoldaşların keşif, zanaat veya savaş desteği ayrı denge kurallarıyla açılır.
2. **Kuzey Denizi:** Balıkçılık, olta/yem, bölgeye göre balık türleri, nadir balıklar, koleksiyon defteri ve mevsimsel av görevleri.
3. **Büyülü Sera:** Tohum ekme, büyüme süresi, sulama/bakım, hasat, mevsim ve üretim malzemeleri. Çıktılar mevcut zanaat tarifleriyle kullanılabilir.
4. **Yaratık Arşivi:** Sunucu/kanal etkinliğine bağlı rastgele yaratık karşılaşmaları, yakalama, nadir varyantlar, parlak varyantlar, arşiv tamamlama ve isteğe bağlı takas.
5. **Büyücü Arenası:** Var olan Elo/season altyapısını kullanarak 1v1, 3v3, takım, sınıf kısıtlı, büyü odaklı ve dönemsel turnuva modları.
6. **Karakter Kartları:** Albüm, wishlist, kart nadirliği, rozet, çerçeve/arka plan, kart geliştirme ve güvenli takas.
7. **Kuzey Pazarı:** Oyuncu ilanı, teklif, açık artırma, fiyat geçmişi ve işlem kilidi/escrow benzeri atomik takas koruması.
8. **Lonca Oyun Salonu:** Trivia, hafıza, kelime, tahmin ve takım oyunları; günlük/haftalık skor ve turnuva.
9. **Lonca Takvimi:** Boss istilası, sezon etkinliği, lonca yarışı, RSVP, kapasite, katılımcı listesi, kişisel hatırlatma ve etkinlik geçmişi.
10. **Maceracı Kimliği:** Profil, sınıf/build, unvan, başarımlar, rozet, koleksiyon vitrini ve sıralama; bot ve web aynı veriyi kullanır.

## 5. Web sitesi ve Maceracı Loncası paneli

### Mevcut web yapısı

`public-site.js` ana sayfa, Poğaça Frieren tanıtımı, komut kataloğu, Frieren AI sayfası ve `/maceraci` oyuncu panelini sunar. Site oturumu/Discord OAuth ve tek kullanımlık Discord-karakter bağlantısı mevcuttur.

`/maceraci` paneli şu anda bağlı karakterin sunucu, sınıf, seviye, XP, altın, HP, mana, arena derecesi, galibiyet/mağlubiyet ve yaklaşan etkinliklerini gösterir. Etkinlik listesi görüntülenir; tam oyuncu self-service paneli değildir.

`owner-dashboard.js` ayrı bir Owner Panel içerir: sistem durumu, bot kontrol, Guardian, hafıza, kod onayları, duyurular, bakım, sunucular, partnerlik ve RPG yönetimi. Bu teknik Owner Panel, Maceracı Loncası oyuncu paneliyle karıştırılmamalıdır.

### Oyuncu paneli için önceki kararlar

- Discord OAuth ile giriş ve kullanıcının erişebildiği sunucular/karakterler.
- Sunucuya özel oyun özellikleri ve komut kataloğu; arama, kategori filtreleme ve uygun komutları açıp kapatma.
- Oyuncu profili, envanter, karakter kartları/koleksiyon, yoldaşlar, ekonomi ve pazar.
- Görevler, zanaat, büyüler, ekipman, zindan, boss ve arena görünümü.
- Etkinlik takvimi, RSVP, hatırlatmalar ve katılım geçmişi.
- İstatistikler, dönemsel sıralamalar, ilerleme grafikleri ve ayrıntılı etkinlik geçmişi.
- Profil kartı, rozet, çerçeve, arka plan ve görsel mesaj/duyuru tasarımcısı.
- Mobil uyumlu yönetim ve oyuncu ekranları.
- Profil alanları için gizlilik seçenekleri ve kişisel verileri dışa aktarma.

Sunucu ayarları yalnızca Frieren oyun/eğlence modüllerinin yapılandırmasıyla sınırlı tutulur; moderasyon veya genel güvenlik paneli eklenmez.

## 6. Uygulama sırası ve kalite kapıları

1. Bu rakip matrisi ile mevcut 325 özellik ve 1.675 planlama kaydını eşleştir; var olan kod/test bağlantılarını koru.
2. Her aday için `existing`, `partial`, `missing`, `out-of-scope` durumunu ve kaynak/test kanıtını belirt.
3. 225 tekrar grubunu silmeden temel yetenek + desteklenen işlemler biçiminde normalize et; yalnızca gerçek oyuncu davranışı ayrı özellik sayılır.
4. Bağımlılıkları belirle: ortak veri modeli, işlem/ödül bütünlüğü, komut, web API/oturum, mobil UI ve test.
5. Önce mevcut davranışın regresyon testleri; sonra yeni modülün birim, PostgreSQL entegrasyon ve sentetik Discord etkileşim testleri.
6. Test şeması/atılabilir CI veritabanı dışında üretim verisine dokunma. Canlı Discord komut kaydı, Render/Vercel dağıtımı ve PR birleştirmesi ayrı onay gerektirir.
7. Ücretli API, ücretli servis veya ücretli plan bağımlılığı ekleme.

## 7. İlk kaynaklar

Rakiplerin resmi ürün/dokümantasyon sayfaları:
- Dyno: https://dyno.gg/bot ve https://docs.dyno.gg/en/modules
- MEE6: https://mee6bot.freshdesk.com/support/solutions/articles/101000385394-getting-started-with-mee6
- Carl-bot: https://docs.carl.gg/
- ProBot: https://probot.io/en ve https://docs.probot.io/docs/getting-started/dashboard
- Tatsu: https://tatsu.gg/leveling ve https://tatsu.gg/economy
- YAGPDB: https://yagbot.meowstard.cat/
- Arcane: https://docs.arcane.bot/plugins/leveling/
- Dank Memer: https://dankmemer.lol/index
- Pokétwo: https://poketwo.net/
- Mudae: https://mudae.net/bot/help
- Karuta: https://karuta.com/
- OwO: https://owobot.com/
- UnbelievaBoat: https://unbelievaboat.com/wordpress/
- FredBoat: https://fredboat.com/
- Jockie Music: https://www.jockiemusic.com/faq

Bu belge ilk karşılaştırma temelidir; her modülün uygulanmış sayılması için ilgili üretim kodu ve davranış testleri ayrıca doğrulanmalıdır.
