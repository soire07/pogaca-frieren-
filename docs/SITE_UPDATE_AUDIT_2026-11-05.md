# Frieren Web Platform — Birleşik Güncelleme Denetimi

Tarih: 2026-11-05
Baz: main @ 7d8c4e6dcf2b28182c10340bb8cd410c76998c8b
Durum: Denetim tamamlandı; uygulama paketi hazırlanacak. Bu belge hiçbir özelliği canlıda doğrulanmış saymaz.

## Korunacak mevcut davranışlar

- `/` mevcut hesap-girişli oyuncu alanıdır; `/tanitim` anonim ve Google tarafından taranabilir tanıtım sayfasıdır. Bu iki rol birleştirilip mevcut giriş akışı bozulmamalıdır.
- `/owner` Discord OAuth ile yalnızca site sahibine açık Owner Panel'dir. Önceki OAuth/CSRF düzeltmeleri korunmalıdır.
- Poğaça Frieren RPG/eğlence odağı korunur; moderasyon/ceza ve genel sunucu yönetimi kapsam dışıdır.
- Mevcut site hesabı, Discord karakter bağlantısı, guild kapsamı, CSRF ve işlem servisleri korunur.
- Ücretli API/hosting bağımlılığı eklenmez; Render hesapları (Frieren AI Agent ve Poğaça web servisi) ayrı tutulur.

## Mevcut kodda bulunan site alanları

| Alan | Kod kanıtı | Denetim durumu |
|---|---|---|
| Ana oyuncu paneli ve Frieren tanıtım bölümleri | `public-site.js: home()` | Mevcut; tasarım/telefon deneyimi tekrar gözden geçirilecek |
| Public SEO landing, robots, sitemap | `/tanitim`, `/robots.txt`, `/sitemap.xml` | Kodda mevcut; Search Console sahiplik/sitemap gönderimi ve indeks sonucu dış adım |
| Google doğrulama endpoint'i | `/google1941de4c3bd5e8ea.html` | PR #237 main'e alındı; production deploy ve Google doğrulaması ayrıca teyit edilmeli |
| Poğaça tanıtım ve komut kataloğu | `/pogaca`, `/komutlar` | Mevcut; komut seçenekleri/örnekleri ve mobil kullanım regresyon testine girecek |
| Frieren AI tanıtım | `/frieren-ai` | Mevcut; AI servis durumu/gerçek model bilgisiyle tutarlılık denetlenecek |
| Maceracı profil ve sunucuya bağlı karakter | `/maceraci`, `/maceraci/link` | Mevcut; hesap/guild izolasyonu ve boş durumları denetlenecek |
| Web envanteri ve koleksiyon | `/maceraci/envanter`, `/maceraci/koleksiyon` | Mevcut; kart/yoldaş görünümü ve sayfalama/boş durumları eksik olabilir |
| Sosyal alan | `/maceraci/sosyal` | Mevcut; arkadaş/rakip/istek/itibar akışları uçtan uca denetlenecek |
| Yaşam alanı, ev ve kozmetik | `/maceraci/yasam`, `/maceraci/ev` | Mevcut; oda yerleşimi, kupa ve paylaşım izinleri görsel/işlevsel denetlenecek |
| Haberci kuş/bildirim tercihleri | `/maceraci/bildirimler` | Mevcut; opt-in, kanal ve bildirim teslim davranışı ayrıca test edilmeli |
| Büyü/Embed Atölyesi | `/maceraci/atolye` | Mevcut; şablon, özel komut ve otomasyon akışları/önizleme eksikleri incelenecek |
| Kuzey Pazarı | `/pazar` ve POST işlemleri | Mevcut; arama, kategori filtresi, fiyat alarmı, teklif önizlemesi ve işlem geçmişi eksikleri backlog'da |
| Etkinlik katılımı | `/maceraci/event` | Mevcut; RSVP/ayrılma, takım ve hatırlatma davranışı denetlenecek |
| Destek ve hesap merkezi | `/destek`, `/hesap/veri`, `/hesap/sil` | Mevcut; talep takibi, veri dışa aktarma/silme ve hata/iptal akışları denetlenecek |
| Lonca sunucu paneli | `guild-dashboard.js`, `/lonca`, `/api/lonca/features` | Ana dalda zaten mevcut; eski PR #185/#184 tekrar birleştirilmemeli, yalnızca eksik test/UX düzeltmeleri alınmalı |
| Owner Panel | `owner-dashboard.js`, `owner.css` | Mevcut; performans, mobil navigasyon ve yönetim kartları denetlenecek |

## Önceki çalışmalardan kalan / doğrulama bekleyen site işleri

1. **Ana sayfa ve görsel kimlik:** Profil görseli kabul edilebilir bulunmuş, banner beğenilmemiş ve ertelenmişti. Banner/hero uyumu, mobil kırpılma, GIF performansı ve ana sayfa hiyerarşisi tek tasarım turunda ele alınacak.
2. **Hesap deneyimi:** Giriş/kayıt ve OAuth akışları düzeltildi; normal giriş ve kayıt formları Android Chrome/iOS Safari/Desktop üzerinde gerçek tarayıcı testinden geçirilecek. Owner OAuth ayrı akış olarak kalacak.
3. **Lonca paneli:** Discord OAuth state, token şifreleme, Manage Guild/Administrator ve botun sunucuda bulunması kontrolleri mevcut. Sunucu seçimi, modül anahtarları, kaydetme/yenileme, hata ve boş durumlar mobilde doğrulanacak.
4. **Komut rehberi:** Komut arama, kategori, seçenekler, alt komutlar, örnekler, izin ve parametre açıklamalarının güncel slash şemasıyla birebirliği denetlenecek.
5. **Maceracı paneli:** Profil, envanter, ekipman, koleksiyon, sosyal, yaşam alanı, etkinlik, bildirim ve atölye sayfaları ortak gezinme ve seçili sunucu bağlamıyla tutarlı hâle getirilecek.
6. **Web pazarı:** Mevcut escrow/transaction servisleri korunacak. Kategori filtresi, fiyat alarmı ve teklif önizlemesi backlog'da eksik olarak işaretlenmiş; mevcut main'deki durum yeniden teyit edilecek.
7. **Analitik:** Sunucu/oyuncu/RPG/ekonomi/etkinlik grafikleri ve tarih aralıkları kapsamlı biçimde tamamlanmış görünmüyor. Yalnızca gerekli ve düşük sorgu maliyetli özetler eklenecek; Neon'u sürekli uyandıran polling olmayacak.
8. **Görsel editör:** Embed/duyuru/profil kartı için mevcut şablon ve önizleme yetenekleri incelenecek; eksik canlı önizleme ve mobil düzenleme tamamlanacak.
9. **Destek ve hesap:** Destek talebi, yanıt, durum geçmişi, dışa aktarma ve silme akışları erişim/CSRF/hesap kapsamı açısından doğrulanacak. Hesap bağlantısını kesme UX'i ayrıca incelenecek.
10. **SEO:** Google doğrulama dosyası main'e alındı. Üretim deployment, Search Console sahiplik doğrulaması, sitemap gönderimi, canonical/robots ve arama sonucu kimliği birbirinden ayrı kanıtlanacak.
11. **Mobil ve erişilebilirlik:** 412px Android, 390px iOS ve masaüstü düzenlerinde yatay taşma, 44px dokunma hedefleri, klavye odağı, reduced-motion, görsel yükleme ve hata/boş durumları test edilecek.
12. **Owner Panel:** Mobil navigasyon, ilk yükleme maliyeti, lazy/eager veri çağrıları, Guardian/Neural raporlarının anlaşılır gösterimi ve sadece sahibin görebildiği kontrol kartları denetlenecek.

## İlgili açık PR'lar — doğrudan merge edilmeyecek

- #185 Guild Dashboard: 114 commit ahead / 113 behind ve geniş bot/RPG değişiklikleri içeriyor. Ana dalda `guild-dashboard.js` ve test dosyası zaten mevcut; PR'ın tamamını merge etmek yinelenen/eski değişiklik riski taşır.
- #172 Owner Panel/komut rehberi: 84 ahead / 193 behind; yalnızca ana dalda bulunmayan gerçek UI iyileştirmeleri seçilerek yeniden uygulanmalı.
- #184 rakip özellik envanteri: 35 ahead / 124 behind; araştırma dokümanları korunabilir ama eski kod değişiklikleri doğrudan alınmamalı.
- #233 SEO ve #237 Google doğrulama PR'ları main'e birleşti. Dış Search Console işlemleri ve canlı doğrulama ayrıca yapılmalı.
- #229 same-site auth origin doğrulaması main'e birleşti; #235 proxy header düzeltmesi de korunmalı.

## Tek seferlik uygulama ve doğrulama sırası

1. Ana dalın gerçek route/test/asset envanterini çıkar; yukarıdaki mevcut özellikleri tekrar yazma.
2. Her sayfanın masaüstü + mobil ekran akışını ve erişim sınırlarını test et.
3. Eksik UI/UX, analitik, pazar filtreleri, editör önizlemesi ve hesap akışlarını ortak servisleri kullanarak tek değişiklik setinde uygula.
4. Kaynak/route testleri, CSRF/XSS, hesap ve guild izolasyonu, transaction ve performans regresyonlarını çalıştır.
5. Android Chrome/iOS Safari/Desktop browser smoke testlerini yalnızca izole yerel CI sunucusunda çalıştır; production'a smoke-test POST gönderme.
6. Tek bir bütünleşik PR aç; CI yeşil olmadan merge etme.
7. Merge sonrası Vercel/Render deploy'u ayrı onaya bırak; ardından gerçek site ve Search Console doğrulamasını ayrı raporla.

## Bu denetimde yapılmayanlar

- Üretim veritabanına yazılmadı.
- Canlı Discord komutları/ayarları değiştirilmedi.
- Vercel/Render deployment tetiklenmedi.
- Google Search Console'a kullanıcı adına giriş veya sitemap gönderimi yapılmadı.
