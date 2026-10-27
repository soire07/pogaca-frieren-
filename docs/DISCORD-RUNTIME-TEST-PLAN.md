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


## Büyü ustalığı — /buyupratik

- **SP-01:** Öğrenilmiş Zoltraak için pratik yap; mana 8 ve altın 25 düşmeli, pratik sayısı bir artmalı.
- **SP-02:** Öğrenilmemiş bir büyü seç; işlem reddedilmeli, mana ve altın değişmemeli.
- **SP-03:** Manayı 7 veya altına indir; pratik reddedilmeli ve altın harcanmamalı.
- **SP-04:** Bakiyeyi mevcut ustalık seviyesinin pratik ücretinin altına indir; işlem reddedilmeli.
- **SP-05:** Aynı büyüde 9 kayıtlı kullanım/pratikten sonra bir pratik daha yap; ustalık 1/10 olmalı.
- **SP-06:** Ustalığı 10/10 olan büyüde tekrar pratik yap; işlem reddedilmeli.
- **SP-07:** İki eşzamanlı pratik isteği gönder; oyuncu satırı kilidi nedeniyle bakiye eksiye düşmemeli ve iki işlem de kaynakları doğru hesaplamalı.
- **SP-08:** Bir veritabanı hatası simüle edildiğinde işlem geri alınmalı; kısmi mana/altın düşüşü kalmamalı.

Beklenen sonuç: kaynak kontrolleri ve otomatik testler geçse bile bu senaryolar, güvenli bir test sunucusunda gerçek Discord etkileşimleri ve test veritabanıyla ayrıca doğrulanmalı. Canlı sunucuda test etmek için deploy yapılmayacak.


## Karakter sınıfları — /sinifsec ve /sinifrehberi

- **CL-01:** `/sinifrehberi` komutunu çalıştır; dört sınıf ve pasifleri görünmeli.
- **CL-02:** `/sinifsec sinif:Büyücü` seç; sınıf veritabanına kaydolmalı ve savaşta büyü hasarı artmalı.
- **CL-03:** Büyücü ile solo boss, katlı zindan ve ortak boss savaşında Zoltraak kullan; mana maliyeti indirimli görünmeli.
- **CL-04:** Muhafız seç; solo ve ortak savaş savunma değerleri sınıf bonusunu yansıtmalı.
- **CL-05:** Şifacı seç; Şifa Işığı ve takım iyileştirmeleri daha fazla HP kazandırmalı.
- **CL-06:** Gezgin seç; sınıfa özel çarpan olmadan temel değerler kullanılmalı.
- **CL-07:** İki takım üyesi farklı sınıflar seçsin; sonuç ekranı her birinin sınıfını ayrı göstermeli.

Bu senaryolar otomatik kod kontrollerinin yerine geçmez; gerçek Discord bileşenleri ve test veritabanında ayrıca doğrulanmalıdır. Deploy yapılmadı.


## Sınıfa özel günlük görevler — /gunlukgorev

- **CQ-01:** Büyücü seçip /buyupratik ile bir büyü çalış; “Mana araştırmacısı” görevi tamamlanmalı ve 140 altın ödülü bir kez alınmalı.
- **CQ-02:** Muhafız seçip /iblisavasi başlat; “Ön safta nöbet” görevi aynı gün tamamlanmalı ve 130 altın alınmalı.
- **CQ-03:** Şifacı seçip envanter eşyası kullan; “Hazırlıklı şifacı” görevi tamamlanmalı ve 120 altın alınmalı.
- **CQ-04:** Gezgin seçip /kesif ile keşif tamamla; “Yolun çağrısı” görevi tamamlanmalı ve 110 altın alınmalı.
- **CQ-05:** Yanlış sınıftayken başka sınıfın görev ödülünü talep et; reddedilmeli, bakiye değişmemeli.
- **CQ-06:** Aynı gün sınıf görev ödülünü aldıktan sonra sınıf değiştirip diğer sınıfın görevini talep et; ikinci sınıf görevi ödülü reddedilmeli.
- **CQ-07:** Görev koşulunu yerine getirmeden ödül talep et veya aynı ödülü iki kez almaya çalış; ödül verilmemeli.

Otomatik kontroller kaynak sözleşmelerini doğrular; gerçek Discord ve test veritabanı davranışı ayrıca test edilmelidir. Deploy yapılmayacak.


## Günlük zincirleme görevler — /gorevzinciri

- **GZ-01:** `/gorevzinciri` çalıştır; üç aşama ve o günkü ilerleme görünmeli.
- **GZ-02:** Günlük ödülünü almadan 1. aşamanın ödülünü talep et; reddedilmeli ve altın değişmemeli.
- **GZ-03:** Günlük ödülünü aldıktan sonra 1. aşamayı talep et; 50 altın verilmeli ve 2. aşama açılmalı.
- **GZ-04:** 1. aşama tamamlanmadan 2. veya 3. aşama ödülünü talep et; sıra atlatılmamalı.
- **GZ-05:** Günün keşfini tamamladıktan sonra 2. aşamayı talep et; 100 altın verilmeli ve 3. aşama açılmalı.
- **GZ-06:** Aynı gün iblis savaşı tamamlandıktan sonra 3. aşamayı talep et; 200 altın verilmeli ve zincir tamamlandı görünmeli.
- **GZ-07:** Aynı aşamanın ödülünü tekrar talep et veya iki eşzamanlı istek gönder; ödül ikinci kez verilmemeli.
- **GZ-08:** Ertesi gün komutu çalıştır; yeni günlük zincir 1. aşamadan başlamalı, önceki günün kaydı korunmalı.

Otomatik kontroller komut şemasını, kalıcı ilerleme tablosunu ve işlem korumalarını doğrular. Gerçek Discord ve test veritabanı davranışı ayrıca doğrulanmalıdır; merge veya deploy yapılmayacak.
