# Poğaça Frieren — Discord oyun akışı test planı

> **Güvenlik sınırı:** Deploy yapılmayacak; merge, slash komutlarını Discord'a yeniden kaydetme veya canlı veritabanını değiştirme de yapılmayacak. Otomatik kontroller kodun ve oyun akışının belirli sözleşmelerini doğrular. Gerçek Discord bileşen etkileşimleri ancak botun mevcut test sunucusunda çalıştırılarak doğrulanabilir.

## 1. Hazırlık

- [ ] Yalnızca mevcut test Discord sunucusunu kullan; üretim sunucusunda deneme yapma.
- [ ] Teste katılacak 2–4 gerçek kullanıcı belirle. Bot hesabını takım arkadaşı olarak seçme.
- [ ] Oyuncuların /profil ile kayıtlarının oluştuğunu doğrula; gerekirse /dinlen ile HP ve manayı toparla.
- [ ] Test öncesi oyuncuların HP, mana, XP, altın, envanter ve boss/zindan istatistiklerini /profil, /envanter ve /maceragecmisi ile not et.
- [ ] Her oyuncu aynı sunucuda ve komutların kullanılabildiği bir kanalda olsun.

## 2. /katlizindan — davet ve rol seçimi

| ID | Senaryo | Beklenen sonuç |
|---|---|---|
| D-01 | 2 oyuncuyla /katlizindan başlat; davet edilen kullanıcı kabul etsin. | Davet kabul edilir ve rol seçimi açılır. |
| D-02 | Davet düğmesine davet edilmeyen üçüncü kullanıcı bassın. | Davet akışına katılamaz; takım değişmez. |
| D-03 | Davet edilen kişi reddetsin. | Zindan başlamaz, davet düğmeleri kapanır. |
| D-04 | Davetli 60 saniyede cevap vermesin. | Zindan başlamaz; süre doldu mesajı görünür. |
| D-05 | Aynı kullanıcıyı iki takım yuvasına koymayı dene. | Takım yinelenen oyuncu nedeniyle reddedilir. |
| D-06 | Üçüncü oyuncuyu seçip ikinci oyuncuyu boş bırak. | Komut, ikinci oyuncu da seçilmeden başlamaz. |
| D-07 | Her oyuncu bir rol seçsin; ikinci bir oyuncu Muhafız veya Şifacı rolünü seçmeyi denesin. | Takımda en fazla bir Muhafız ve bir Şifacı bulunur; çakışan seçim reddedilir. |
| D-08 | Bir oyuncu rol seçmeden 60 saniye bekle. | Zindan başlamaz ve yeniden davet önerilir. |

## 3. /katlizindan — savaş, yol ve ödüller

| ID | Senaryo | Beklenen sonuç |
|---|---|---|
| D-09 | Kolay, normal ve kâbus zorluklarında ayrı denemeler yap. | Zorluk seçimi kabul edilir; kâbus düşmanları daha güçlü, kolay düşmanları daha zayıf olur. |
| D-10 | Turda saldırı, Zoltraak, Heilen, Mana Kalkanı ve savun seçeneklerini ayrı ayrı kullan. | Eylem günlüğü doğru eylemi gösterir; yeterli mana varsa doğru maliyet düşer. |
| D-11 | Mana 12'nin, 18'in veya 10'un altındayken ilgili büyüyü seç. | Komut çökmemeli; mana yetersizse Zoltraak normal saldırıya döner, Heilen uygulanmaz, kalkan normal savunmaya döner. |
| D-12 | Aynı oyuncu aynı turda iki düğmeye bassın. | İlk seçim geçerli kalır; ikinci seçim zaten seçimini yaptın yanıtını alır. |
| D-13 | Takım dışı kullanıcı veya önceki turun düğmesiyle işlem yapmayı dene. | Eylem savaş durumunu değiştirmez. |
| D-14 | Bir turda oyuncu seçim yapmadan beklesin. | Süre sonunda seçim yapmayan yaşayan oyuncu savunur. |
| D-15 | Kat temizlenince üç yol seçeneğinden birini seç. | Gizli geçit daha fazla altın ve yaralanma riski; mana mabedi yaşayan oyuncuların HP'sini ve manasını yeniler; güvenli yol daha dengeli ödül verir. |
| D-16 | Yol seçmeden 15 saniye bekle. | Güvenli yol varsayılan olarak uygulanır. |
| D-17 | Birden fazla kat boyunca ilerle. | HP katlar arasında korunur; sandık veya tuzak olayı oluşabilir; nihai sonuç 5 kat ilerlemesini doğru gösterir. |
| D-18 | Bir oyuncunun bekleme süresi dolmamışken zindan başlat. | Zindan başlamaz; bekleme mesajı görünür ve işlem veritabanına ödül yazmaz. |
| D-19 | Zafer veya mağlubiyet sonrası /profil, /envanter, /maceragecmisi, /siralama kontrol et. | XP/altın, HP/mana, zindan denemesi ve zafer sayısı, ganimet ve sıralama tutarlı olur; kaydedilen HP karakterin kalıcı azami HP değerini aşmaz. |

## 4. /ortakboss — takım baskını

| ID | Senaryo | Beklenen sonuç |
|---|---|---|
| B-01 | 2–4 oyuncuyla baskın başlat; tüm davetliler kabul etsin. | Baskın rol seçimine ilerler. |
| B-02 | Daveti reddet veya zaman aşımına uğrat. | Baskın başlamaz. |
| B-03 | Takımda bot veya yinelenen oyuncu seçmeyi dene. | Takım reddedilir. |
| B-04 | Herkes rol seçsin; Muhafız/Şifacı rolünü iki kişiye vermeyi dene. | Benzersiz rol sınırı uygulanır. |
| B-05 | Her beş savaş eylemini ve düşük mana durumlarını dene. | Hasar, iyileştirme, kalkan ve mana maliyetleri beklenen şekilde uygulanır. |
| B-06 | Aynı turda iki seçim yap veya yaşayan takım dışı kullanıcıyla düğmeye bas. | Geçersiz/ikinci seçim savaşı değiştirmez. |
| B-07 | 20 saniye seçim yapmadan bekle. | Seçim yapmayan yaşayan oyuncu savunur. |
| B-08 | Farklı denemelerde üç boss türünü gözlemle. | Boss adı, zayıflık ve ganimet türü tutarlı görünür; Kuzey Generali 3. turda mana yıldız patlaması, Cam Pullar Ejderhası çift turlarda kristal yağmuru, Düşmüş Büyücü Aura 3. turda mana laneti kullanır. |
| B-09 | Boss canı yarıdan azken ve 2./3. turlarda savaşı gözlemle. | Öfke evresi ve boss türüne ait özel saldırı/mana laneti uygun zamanda görünür. |
| B-10 | Boss'u yen veya 12 tur sınırına ulaş. | Sonuç ekranı, XP/altın, HP/mana, boss zafer sayısı ve varsa ortak ganimet doğru olur. |
| B-11 | Bekleme süresi dolmamış oyuncuyla baskın başlat. | Baskın başlamaz; veritabanı değişiklikleri geri alınır. |
| B-12 | Sonuç sonrası /profil, /envanter, /maceragecmisi, /siralama kontrol et. | Ödüller ve istatistikler sonuç ekranıyla eşleşir. |

## 5. Otomatik kontroller

GitHub Actions veya yerel terminalde çalıştırılacak komut:

~~~
npm install
npm run check
~~~

Bu kontrol JavaScript sözdizimini, slash komut şemalarını, özellik envanterini, oyun akışı kod sözleşmelerini ve Node testlerini çalıştırır. Discord API'sine bağlanmaz, komut kaydetmez, veritabanında oyun başlatmaz ve deploy yapmaz.

## 6. Test raporu şablonu

Her manuel test için Geçti / Kaldı / Çalıştırılmadı kaydet. Kaldıysa komut, takım büyüklüğü, seçilen rol/eylem, görülen mesaj ve varsa zaman bilgisini ekle. Kullanıcı tokenı, bot tokenı veya veritabanı bağlantı dizesi paylaşma.

- Test tarihi:
- Test sunucusu (özel kimlikleri paylaşmadan):
- Katılımcı sayısı:
- D-01…D-19:
- B-01…B-12:
- Bulunan hata / yeniden üretim adımları:
