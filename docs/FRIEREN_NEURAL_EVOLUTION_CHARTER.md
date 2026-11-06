# Frieren Neural — Sürekli Evrim İlkeleri

**Durum:** Ürün/mimari hedefi  
**Kapsam:** Frieren Neural, Frieren Guard ve gelecekteki öz-gelişim altyapısı  
**Temel karar:** Frieren Neural sabit bir yetenek listesiyle veya belirli bir sürümle sınırlandırılmayacak; güvenli ve ölçülebilir biçimde sürekli gelişebilecek şekilde tasarlanacak.

## Vizyon

Frieren Neural, önceden eğitilmiş model ağırlıkları kullanmadan sıfırdan geliştirilen; önceliği Türkçe iletişim ve ileri düzey akıl yürütme olan, zaman içinde yeni beceriler kazanabilen, kendi performansını değerlendirebilen ve kontrollü biçimde kendini iyileştirebilen bir yapay zekâ platformudur.

“Bir sınırı olmasın” hedefi, mimaride keyfî bir yetenek tavanı, sabit beceri kataloğu veya zorunlu son sürüm bulunmaması anlamına gelir. Bu ifade sınırsız donanım, veri, enerji ya da matematiksel olarak sonsuz zekâ garantisi değildir. Gelişim; mevcut kaynaklar, ölçülebilir sonuçlar ve güvenlik sınırları içinde sürdürülebilir olmalıdır.

## Değişmez ilkeler

1. **Sıfırdan öğrenme:** Temel model ağırlıkları rastgele başlatılır; önceden eğitilmiş ağırlıklar kullanılmaz. Veri kaynaklarının lisans ve köken bilgileri ayrıca kaydedilir.
2. **Sürekli gelişim:** Eğitim, değerlendirme ve yeni beceri kazanımı tek seferlik bir süreç değil, tekrarlanabilir bir yaşam döngüsüdür.
3. **Türkçe önceliği:** Türkçe anlama, doğal diyalog, dilbilgisi, bağlamı koruma ve tutarlı yanıt üretimi temel kalite ölçütleridir.
4. **İleri akıl yürütme:** Matematik, mantık, çok adımlı planlama, hata analizi, kodlama ve kanıta dayalı karar verme aşamalı olarak geliştirilir.
5. **Kalıcı ve kontrollü hafıza:** Yeni bilgiler edinilirken eski beceriler korunur; unutma ve gerileme ölçülür. Kullanıcı verileri izin, gizlilik ve saklama kurallarına tabidir.
6. **Beceri genişletilebilirliği:** Yeni yetenekler modüler biçimde eklenebilir; mevcut yetenek listesi nihai veya kapalı kabul edilmez.
7. **Öz değerlendirme:** Neural her değişikliği bağımsız test kümeleri, önceki sürüm karşılaştırmaları ve regresyon testleriyle değerlendirir. Kendi ürettiği başarı iddiası tek başına kanıt sayılmaz.
8. **Geri alınabilir gelişim:** Model, veri, tokenizer, eğitim ayarları ve kod sürümlenir; başarısız güncellemeler önceki doğrulanmış sürüme döndürülebilir.
9. **Kaynak farkındalığı:** CPU/GPU, bellek, süre ve maliyet sınırları ölçülür; ücretsiz altyapı öncelenir. Kaynak yetersizliği kalite başarısı gibi gösterilmez.

## Frieren Guard'ın geçiş rolü

### Başlangıç
Guard, Neural'ın kodunu, eğitimini, veri kökenini, model artefaktlarını, güvenliğini ve kalite sonuçlarını denetleyen koordinatördür. Tek bir yetkili komutla kapsamlı denetim ve güvenli onarım iş akışını başlatabilmesi hedeflenir.

### Olgunlaşma
Neural kendi tanılamasını, testlerini, eğitim/iyileştirme deneylerini ve geri alma hazırlığını giderek daha fazla üstlenir. Guard bağımsız doğrulayıcı ve güvenlik gözetmeni olarak kalır.

### İleri aşama
Neural rutin bakım için Guard'a sürekli ihtiyaç duymayacak özerkliğe ulaşabilir. Guard'ın sürekli çalışması zorunlu olmayabilir; ancak bağımsız denetim, erişim kontrolü ve acil durdurma/geri alma gibi dış güvenlik mekanizmaları korunur. Guard'ın kaldırılması zorunlu bir hedef değildir.

## Öz-gelişim döngüsü

1. Sorunu veya gelişim fırsatını tespit et.
2. Kök neden ve kanıtları topla.
3. İzole ortamda düzeltme ya da eğitim deneyi tasarla.
4. Testleri ve sabit held-out değerlendirmeleri çalıştır.
5. Önceki doğrulanmış sürümle karşılaştır; beceri gerilemesini ölç.
6. Sonuçları, veri/model kökenini ve değişiklikleri kaydet.
7. Başarısızsa geri al; başarılıysa aday sürüm olarak sakla.
8. Üretim modeli, kullanıcı verileri, PR birleştirme ve canlı dağıtım gibi yüksek etkili işlemleri ayrı yetkilendirme kapılarından geçir.

## Güvenlik ve doğrulama sınırları

- Model kendi değişikliğini tek başına onaylayamaz; bağımsız testler ve güvenilir kanıt zorunludur.
- Üretim modeline geçiş, canlı dağıtım, veri silme veya dış sistemlerde etkili işlemler açık yetki gerektirir.
- Eğitim verisi lisans, gizlilik, kalite ve zehirlenme kontrollerinden geçmelidir.
- Prompt injection, veri sızıntısı, yetki aşımı ve model bozulması düzenli test edilir.
- Bir eğitim adımının tamamlanması, modelin kaliteli veya üretime hazır olduğu anlamına gelmez.
- Güvenlik kontrolleri Neural'ın gelişimini engellemek için değil, gelişimin güvenilir ve geri alınabilir olmasını sağlamak için vardır.

## Başarı ölçütleri

Gelişim yalnızca parametre sayısı, eğitim adımı veya düşük eğitim kaybıyla ölçülmez. En azından şu ölçümler sürüm bazında tutulur:

- Türkçe diyalog kalitesi ve insan değerlendirmesi
- Held-out kayıp/perplexity ve veri sızıntısı kontrolleri
- Akıl yürütme, matematik ve çok adımlı görev başarı oranları
- Talimat takibi ve bağlamı koruma
- Önceki becerilerde gerileme / catastrophic forgetting
- Güvenlik testleri ve yetki sınırı ihlalleri
- Çıkarım gecikmesi, bellek ve kaynak tüketimi
- Tekrarlanabilirlik, model/checkpoint hash'i ve veri kökeni

## Yol haritası

- **Aşama 1 — Guard destekli temel Neural:** Sıfırdan model, Türkçe veri/kürikulum, kalite değerlendirmesi, güvenli onarım ve kanıt raporlaması.
- **Aşama 2 — Kontrollü öz-gelişim:** Neural'ın kendi tanılamasını, deney planlamasını, izole kod/eğitim değişikliklerini ve regresyon testlerini yürütmesi.
- **Aşama 3 — Artan özerklik:** Sürekli öğrenme, genişletilebilir beceriler, uzun süreli hafıza ve çok adımlı öz-iyileştirme. Bağımsız güvenlik doğrulaması ve geri alma kalıcı kalır.

Bu belge uzun vadeli yönü tanımlar; mevcut modelin bu yeteneklere zaten sahip olduğunu veya herhangi bir kalite eşiğini geçtiğini iddia etmez. Her aşama kod, test, ölçüm ve doğrulanmış artefaktlarla ayrı ayrı kanıtlanmalıdır.
