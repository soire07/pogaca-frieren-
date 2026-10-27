# Poğaça Frieren — test planı ve canlıya geçiş kontrol listesi

Bu kontrol listesi komut sayısından bağımsız olarak oyun sistemlerinin bütünlüğünü doğrulamak içindir. GitHub Actions testlerinin başarılı olması gerçek Discord sunucusunda bütün akışların çalıştığını kanıtlamaz.

## Mevcut doğrulanmış durum

- [x] Geliştirme dalındaki GitHub Actions doğrulaması başarılı.
- [x] Son doğrulamada test işi başarıyla tamamlandı.
- [x] Özellik envanterinde 323 benzersiz kayıt var; bildirilen sayı 323 ile eşleşiyor.
- [ ] Gerçek Discord test sunucusunda uçtan uca test.
- [ ] Render'da güvenli bir dağıtım sonrası sağlık kontrolü.
- [ ] Boss görsellerinin gerçek URL'lerle etkinleştirilmesi.
- [ ] Oyuncu verilerinin yedekten geri yükleme denemesi.

## 1. Test ortamını hazırla

1. Üretim sunucusu yerine ayrı bir Discord test sunucusu kullan.
2. Test botu için ayrı uygulama/token ve mümkünse ayrı PostgreSQL veritabanı kullan.
3. Token, veritabanı URL'si veya diğer sırları GitHub'a, ekran görüntülerine ya da sohbet mesajlarına koyma.
4. Test hesabı ve birkaç deneme oyuncusu oluştur; üretim oyuncularının verisini test için değiştirme.

## 2. İlerleme ve ekonomi

- Yeni oyuncu oluştur; profil, seviye, XP ve başlangıç değerlerini kontrol et.
- Seviye atlat; XP, seviye ve stat puanlarının bir kez verildiğini doğrula.
- Günlük görev zincirini adım adım tamamla; aşama ödüllerini, son aşama bonusunu ve malzeme düşüşlerini kontrol et.
- Aynı aşama ödülünü iki kez almaya çalış; ikinci işlem ödülü çoğaltmamalı.
- Keşif yap; bölge ustalığı, XP, para ve malzeme sayıları envanterde doğru görünmeli.
- Üretim tarifi uygula; gerekli malzemeler doğru düşmeli, üretilen eşya doğru eklenmeli.

## 3. Savaşlar ve zindan

- Solo boss'u başlat; can çubuğu, aşama geçişleri ve özel saldırı mesajlarını kontrol et.
- Donma etkisinin planlanan özel saldırıyı ve ona bağlı mana etkisini gerçekten iptal ettiğini doğrula.
- Ekipman seti bonusunu ve seviye 10 büyü ustalığı avantajlarını test et.
- Ortak boss savaşında her oyuncunun sırası, hasarı, ödülü ve bağlantı kesilmesi senaryolarını dene.
- Beş katlı zindanda her katı tamamla; kat ilerlemesi ve final ödülünü kontrol et.
- Kaybetme, kaçma, zaman aşımı ve etkileşim süresi dolması senaryolarını da dene.
- Savaş sırasında botu yeniden başlatmanın veya bir etkileşimin iki kez gönderilmesinin çift ödül üretmediğini doğrula.

## 4. Kalıcılık ve veri bütünlüğü

1. Test hesabının mevcut değerlerini not et.
2. XP, para, malzeme, ekipman, görev ve bölge ustalığında değişiklik oluştur.
3. Test botunu yeniden başlat.
4. Aynı hesabı tekrar görüntüle; kayıtlar korunmalı.
5. Veritabanı bağlantısı kesilmesi ve yeniden bağlanma senaryolarında hata günlüğünü incele.
6. Üretim veritabanında yıkıcı veya geri alınamayan test yapma.

## 5. Görsel ve Discord arayüzü

- Her görsel URL'sini gizli sekmede açarak herkese açık ve doğrudan görsel dosyası olduğunu doğrula.
- Discord embed'inde her boss için doğru görselin göründüğünü kontrol et.
- Görsel URL'si boş veya geçersiz olduğunda komut yine çalışmalı.
- Uzun adlar, Türkçe karakterler, mobil görünüm, buton devre dışı durumu ve eski etkileşim mesajlarını dene.

## 6. Dağıtım kapısı

- [ ] Tüm otomatik testler başarılı.
- [ ] Test sunucusundaki uçtan uca akışlar başarılı.
- [ ] Render ortam değişkenleri doğrulandı; sırlar ifşa edilmedi.
- [ ] Veritabanı yedeği ve geri yükleme yolu biliniyor.
- [ ] PR farkı gözden geçirildi.
- [ ] Kullanıcı onayı alındı.

Son kutu işaretlenmeden PR birleştirilmez ve üretime dağıtım başlatılmaz.
