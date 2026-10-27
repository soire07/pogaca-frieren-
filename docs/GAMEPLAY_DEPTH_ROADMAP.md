# Poğaça Frieren — oyun derinliği yol haritası

Bu belge, yeni slash komutları eklemek yerine mevcut oyun sistemlerini daha derin ve birbirine bağlı hâle getirmek için hazırlanmıştır. Planlanan özellikler uygulanmış sayılmaz; yalnızca kodu ve veri modeli tamamlanıp oyuncuya sunulduğunda envantere eklenmelidir.

## Öncelik A — mevcut sistemlerin bütünlüğü

- Boss ödüllerinin tariflerde kullanılan malzemelerle tutarlı olması.
- Keşif malzemelerinin bölge kimliğine göre anlamlı farklılaşması.
- Günlük görev zincirinin gerçek başarıya bağlı kalması ve tekrar ödül vermemesi.
- Ekipman setleri, büyü ustalığı ve karakter yapılarının farklı oyun tarzları sunması.
- Zindan katları arasında iyileşme, kaynak harcama ve risk/ödül kararlarının belirginleşmesi.

## Öncelik B — komutsuz oyun derinliği

### 1. Bölgesel tehdit ve dünya durumu
Her bölgenin kendine ait tehdit seviyesi, tehlikeli olay havuzu ve nadir keşifleri olmalı. Oyuncu seviyesi tek belirleyici olmamalı; bölge ustalığı ve önceki başarılar da keşif seçeneklerini etkileyebilir.

### 2. Boss davranış profilleri
Her boss yalnızca farklı isim ve HP değerinden ibaret olmamalı. Bir boss mana tüketimiyle, diğeri savunma kırmayla, bir başkası minyon veya alan saldırısıyla oyuncuyu farklı kararlar almaya zorlamalı. Aşama geçişleri önceden okunabilir ipuçları vermeli.

### 3. Karakter yapısı ve rol sinerjisi
Avcı, Muhafız, Büyücü ve Dengeli yapıların farklı avantajları korunmalı. Takım savaşlarında roller birbirini tamamlamalı; tek bir yapı tüm içeriklerde en iyi seçim olmamalı.

### 4. Üretim zincirleri
Malzemelerin kaynağı açıkça belirtilmeli. Yaygın malzemeler temel ekipmanlara, bölgesel nadir malzemeler özel ekipmanlara, boss yadigârları ise üst seviye tariflere bağlanmalı. Tarifler yalnızca sayısal güç artışı değil, yeni oyun seçenekleri de sunmalı.

### 5. Koleksiyon ve keşif günlüğü
Oyuncunun keşfettiği yerler, yendiği bosslar, öğrendiği büyüler ve topladığı yadigârlar kalıcı bir macera günlüğünde anlamlı ilerleme sağlamalı. Tamamlama ödülleri ekonomiyle dengeli olmalı.

### 6. Sezonluk ve uzun vadeli hedefler
Dönemsel başarılar, bölge hedefleri ve kişisel kilometre taşları eklenebilir. Sezonluk ödüller temel güç dengesini bozmak yerine kozmetik, unvan, koleksiyon veya yan seçenekler sunmalı.

## Öncelik C — ekonomi ve istismar dayanıklılığı

- Ödüllerin seviye ve içerik zorluğuyla uyumlu olması.
- Aynı etkileşimin tekrar gönderilmesinin çift ödül üretmemesi.
- Takas, üretim ve ödül kaynaklarının para enflasyonuna yol açmaması.
- Oyuncu ilerlemesinin kalıcı ve izlenebilir olması.
- İlerleme kaybı veya geri alma gerektiren işlemlerin açık biçimde ele alınması.

## Geliştirme kuralı

1. Önce mevcut veri modelini ve ilgili akışları incele.
2. Birbirinden bağımsız küçük değişiklikler yap.
3. Oyuncuya görünen davranışı tamamlamadan envantere “uygulandı” diye ekleme.
4. Otomatik testlerin yanında gerçek Discord testi ayrıca gerekir; canlı test ve dağıtım kullanıcı tarafından yapılacaktır.
5. Kullanıcı onayı olmadan PR birleştirme veya üretim dağıtımı yapılmaz.
