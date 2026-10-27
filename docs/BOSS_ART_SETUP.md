# Boss ve zindan görsellerini etkinleştirme

Boss görselleri kodda hazırdır; görsellerin Discord panellerinde görünmesi için Render ortam değişkenlerine herkese açık HTTPS resim adresleri girilmelidir. Bu ayarlar boşsa bot normal şekilde çalışır ve resimsiz panel gösterir.

## Render'da yapılacaklar

1. Render Dashboard → Poğaça Frieren servisi → **Environment** bölümünü aç.
2. Aşağıdaki anahtarları tek tek ekle.
3. Her değere, giriş yapmadan açılabilen doğrudan PNG, JPG/JPEG, WebP veya GIF görsel bağlantısı koy.
4. Kaydet. Render yeniden başlatma isterse kontrollü şekilde yeniden başlat; bu özellik PR birleştirilmeden canlı servise gelmez.

| Render değişkeni | Görsel |
| --- | --- |
| `POGACA_BOSS_ART_SCHATTENWOLF_URL` | Kara Kurt / Schattenwolf |
| `POGACA_BOSS_ART_RUIN_GUARDIAN_URL` | Harabe Muhafızı |
| `POGACA_BOSS_ART_NORTH_DEMON_URL` | Kuzey İblisi |
| `POGACA_BOSS_ART_DEMON_COMMANDER_URL` | İblis Komutanı |
| `POGACA_BOSS_ART_AUSSERST_LORD_URL` | Äußerst Lord |
| `POGACA_RAID_ART_NORTH_GENERAL_URL` | Kuzey Generali (ortak boss) |
| `POGACA_RAID_ART_GLASS_WYRM_URL` | Cam Ejderha (ortak boss) |
| `POGACA_RAID_ART_FALLEN_MAGE_URL` | Düşmüş Büyücü (ortak boss) |
| `POGACA_DUNGEON_FINAL_BOSS_ART_URL` | Beş katlı zindanın son patronu |

## Görsel bağlantısı kontrol listesi

- Bağlantı `https://` ile başlamalı.
- Görsel tarayıcıda oturum açmadan açılmalı; Discord'un uzaktan alabilmesi gerekir.
- Bir HTML sayfasının bağlantısı değil, görsel dosyasının doğrudan adresi olmalı.
- Önerilen oran portre kartları için 4:5 veya 1:1; Discord embed görseli için geniş 16:9.
- Görselin kullanım izni olduğundan emin ol. SVG yerine PNG/JPG/WebP/GIF kullan.

## Durum ve güvenlik

- Bu değişkenlere bot tokeni veya veritabanı şifresi koyma; yalnızca görsel URL'si olmalı.
- Yanlış, boş veya HTTP adresi kod tarafından devre dışı bırakılır; savaş komutları çalışmaya devam eder.
- Bu belge yalnızca kurulum rehberidir. Görsellerin canlıda etkinleştiği anlamına gelmez.
- Özellik dalı test edildikten ve PR onaylanıp birleştirildikten sonra yeni kod canlıya alınabilir.
