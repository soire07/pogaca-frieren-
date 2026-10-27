# Poğaça Frieren — Gerçek Discord Test Planı

Bu plan, `fix-character-images` dalındaki ortak boss ve katlı zindan akışlarını **deploy yapmadan önce** gerçek bir Discord test sunucusunda elle doğrulamak içindir. Bu belge testlerin yapıldığını değil, nasıl yürütüleceğini belirtir.

## Test ortamı ve güvenlik

- [ ] Botu test sunucusuna ekle; gerçek/topluluk sunucusunda test etme.
- [ ] Test botu için ayrı Discord uygulama token'ı ve ayrı test PostgreSQL veritabanı kullan. Gerçek token veya veritabanını bu test için kopyalama.
- [ ] Gerekli slash komutlarını yalnızca test guild'ine kaydet; global komutları değiştirme.
- [ ] En az 3 test kullanıcı hesabı hazırla. Discord kurallarına uygun gerçek hesaplar kullan; self-bot kullanma.
- [ ] Botun test guild'inde komut kullanma, mesaj gönderme ve ilgili kanalları görme izinlerini doğrula.
- [ ] Test başlamadan önce test veritabanının yedeğini al; test verisini üretim verisinden ayır.
- [ ] `DISCORD_TOKEN` ve `DATABASE_URL` değerlerini loglara, ekran görüntülerine veya sohbete koyma.

## A. `/ortakboss` — davet, roller ve savaş

1. [ ] Bir oyuncu bir veya daha fazla oyuncuyu davet eder. Davetliler doğru etiketlenir ve 60 saniyelik süre görünür.
2. [ ] Davetli olmayan kullanıcı katıl düğmesine basar. Katılım kaydedilmemeli ve savaş başlamamalı.
3. [ ] Bir davetli kabul eder; diğer davetli reddeder veya süreyi geçirir. Akış güvenli biçimde kapanmalı, ödül yazılmamalı.
4. [ ] Kabul eden her oyuncu tank/şifacı/hasar rolünü seçer. Takım dışı kullanıcının rol seçimi kabul edilmemeli.
5. [ ] Her oyuncu saldırı, Zoltraak, Heilen, Mana Kalkanı ve savunma seçeneklerini dener. Mana yetmiyorsa büyü/kalkan/iyileştirme ücretsiz uygulanmamalı.
6. [ ] Bir turda her oyuncu yalnızca bir seçim yapar; tur düğmeleri eski turlarda tekrar kullanılamamalı.
7. [ ] Boss HP'si sıfırlanınca savaş sonlanmalı; takım HP/XP/altın/zafer/soğuma süresi bir kez kaydedilmeli.
8. [ ] Boss yenilmeden takımın tamamı düşerse başarısızlık ödülü dışında zafer/ganimet kaydı verilmemeli.
9. [ ] Hemen tekrar başlatmayı dene. Bekleme süresi engeli göstermeli; ikinci ödül verilmemeli.
10. [ ] Üç boss türünün isim/ganimet/zayıflık bilgilerini gözle kontrol et; özel saldırıların mesajları ve hasarları tutarlı mı doğrula.

## B. `/katlizindan` — davet, beş kat ve rota kararları

1. [ ] İki veya daha fazla oyuncuyla davet/kabul akışını tamamla; reddetme ve zaman aşımını ayrıca dene.
2. [ ] Her oyuncu kendi rolünü seçsin. Takım dışı kullanıcı düğmeleri etkisiz kalmalı.
3. [ ] Kolay, normal ve kâbus zorluklarını ayrı ayrı başlat. Düşman HP/hasar artışı beklenen yönde olmalı.
4. [ ] Saldırı, Zoltraak, Heilen, Mana Kalkanı ve savunmayı dene; mana ve HP sınırlarını kontrol et.
5. [ ] Her kat sonrası gizli geçit, mana mabedi ve güvenli yol seçeneklerini ayrı ayrı dene. Yalnızca takım liderinin seçimi geçerli olmalı.
6. [ ] Rota seçilmeden süre dolsun. Güvenli yol varsayılanı uygulanmalı.
7. [ ] Sandık ve tuzak olayları oluştuğunda ödül/hasar mesajlarının gerçek sonuçlarla eşleştiğini kontrol et.
8. [ ] Son boss yenilgisi ve yenilgi durumlarını dene; HP, XP, altın, ganimet ve zindan sayacı DB'de doğru olmalı.
9. [ ] Aynı oyuncuyla soğuma süresi içinde tekrar dene. Yeni koşu ve ödül oluşmamalı.

## C. Kalıcılık ve dayanıklılık

- [ ] Savaş bitiminden sonra botu test ortamında yeniden başlat; XP, altın, HP, mana ve soğuma süreleri DB'den tutarlı okunmalı.
- [ ] Bir test sırasında DB hatası simüle edildiğinde transaction rollback olmalı; kısmi ödül yazılmamalı.
- [ ] Çok uzun oyuncu adları, karakter isimleri ve özel karakterler embed/button sınırlarını aşmamalı.
- [ ] Bir kullanıcı birden fazla düğmeye art arda basınca aynı ödül/aksiyon iki kez uygulanmamalı.
- [ ] Test bittikten sonra test sunucusu, test uygulaması ve test veritabanını ayrı ayrı temizle.

## Sonuç kaydı

Her maddeyi **Geçti / Kaldı / Uygulanamadı** olarak işaretle; başarısız adımda komut, tur, kullanıcı rolü ve hata mesajını kaydet. Ekran görüntülerinde token, bağlantı dizesi veya kişisel bilgi bulunmamalı.

**Canlı Discord testi, CI testlerinden farklıdır.** Bu planın varlığı tek başına gerçek Discord akışının test edildiği anlamına gelmez.


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
