# Maceracı Kullanıcı Merkezi ve Profil Vitrini — Tasarım

## Amaç
Üç nokta menüsünde kullanıcı adının hemen altında tek bir Kullanıcı Merkezi sunmak; oyuncunun gerçek RPG ilerlemesini, başarılarını, unvanlarını, savaş verilerini ve sıralamalarını tek yerde görünür kılmak. VIP hesaplar için animasyonlu çok renkli XP çubuğu korunur.

## Mevcut durum ve dayanak
- `/` ve `/maceraci` hesap kapsamlı oyuncu panelidir; profiller `site_discord_links` üzerinden bağlı Discord karakterlerine bağlanır.
- `/maceraci/yasam` mevcut ev, kozmetik, kupa sergileme ve etkinlik ilerlemesi ekranıdır.
- `utils.js` gerçek seviye formülünü sağlar: `levelForXp(xp) = floor(sqrt(max(0,xp)/100))+1`; sonraki seviye toplam XP eşiği `level²*100`.
- `achievement_claims`, `user_titles`, `adventure_history`, `arena_ratings`, `anime_character_collection` mevcut veri kaynaklarıdır.
- `player_home_trophies` zaten 0–5 arası altı vitrin yuvasını destekler.
- Mevcut kozmetik slotları profil çerçevesi, isim plakası, unvan efekti, banner ve sezon teması gibi görünümleri kapsar.
- Depoda VIP üyelik/ödeme/rol kaynağı yoktur; VIP görünümü yalnızca sunucu tarafı allowlist üzerinden açılır.

## Kapsam
- Profil ekranı: gerçek XP/seviye ilerlemesi, karakter kimliği, kayıt tarihi, savaş ve arena istatistikleri.
- Başarım vitrini: kazanılmış başarımlar, kazanılma tarihleri ve en yüksek ödüllü üç başarım; mevcut kupa yerleştirme sistemi korunur.
- İlerleme merkezi: etkinlik/ev/kozmetik verileri mevcut yaşam alanından alınır; yeni paralel ilerleme sistemi oluşturulmaz.
- Unvanlar: yalnızca `user_titles` içinde gerçekten açılmış unvanlar listelenir; aktif unvan seçimi yalnızca kazanılmış unvanlardan yapılır.
- Sıralamalar: seçilen Discord sunucusu kapsamında XP, boss, zindan, arena ve son 24 saat macera XP sıralamaları. Son 24 saat panosu yalnızca `adventure_history` ile kaydedilmiş macera XP'si olarak etiketlenir; tüm oyun XP'si olduğu iddia edilmez.
- Aktivite akışı: mevcut macera, başarım ve kozmetik kayıtlarından son olaylar.
- Profil gizliliği: herkese açık ev vitrini mevcut `is_public` onayına bağlı kalır; istatistik, başarım, koleksiyon ve aktivite bölümleri ayrı ayrı kapatılabilir. Varsayılanlar mevcut paylaşım davranışını gereksiz yere genişletmez.
- VIP XP barı: seviye formülü `utils.js` ile ortaklaştırılır; renkli animasyon, hareket azaltma tercihi ve sunucu tarafı VIP doğrulaması korunur.

## Yaklaşımlar
1. **Yeni, bağımsız profil/başarım veritabanı kurmak:** reddedildi; aynı veriyi çoğaltır, tutarsızlık ve bakım maliyeti üretir.
2. **Mevcut RPG tabloları ve sayfaları üzerinde tek profil katmanı:** seçilen yaklaşım; veri kaynağı tek kalır, guild ve linked-account sınırları korunur.
3. **Yalnızca görsel menü bağlantıları eklemek:** yetersiz; kullanıcıyı ayrı ve eksik sayfalara yönlendirir, profil verisini bir araya getirmez.

## Güvenlik ve sınırlar
- Tüm sorgular bağlı `guild_id` + `user_id` ile kapsamlandırılır; URL'deki sunucu kimliği tek başına yetki sağlamaz.
- Profil ayarları CSRF korumalı POST ile değiştirilir.
- Başka kullanıcıya ait veriler yalnızca mevcut herkese açık vitrin açıkken ve seçilen görünürlük alanları izin veriyorsa gösterilir.
- VIP kimliği istemci girdisinden alınmaz.
- Canlı DB, Discord, Render ayarları, merge ve üretim deploy bu PR kapsamı dışındadır.
- Sıralamalar platform geneli değil, veri modelinin doğru kapsamı olan seçili Discord sunucusu içidir.
- Başarım nadirliği için kaynakta bir rarity modeli bulunmadığından uydurma nadirlik etiketi kullanılmaz; en yüksek ödüllü başarımlar gösterilir.

## Başarı ölçütleri
- Menüdeki her bağlantı doğru sayfaya/ankora gider.
- XP yüzdesi gerçek seviye formülüyle hesaplanır; negatif, bozuk veya sınır XP değerleri güvenli ele alınır.
- Profil, sıralama, etkinlik, koleksiyon ve aktivite sorguları seçili guild + bağlı oyuncu kapsamını aşmaz.
- Gizlilik ayarları herkese açık vitrin çıktısında doğrulanır.
- Birim ve site regresyon testleri ile CI geçer.
