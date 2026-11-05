# Frieren Platform — Hedef Mimari ve Sınırlar

> Karar tarihi: 2026-11-04 · PR #217 · `fix/solo-boss-reward-idempotency-mainline`
>
> Bu belge mevcut kod ile hedef mimariyi ayırır. Bir bileşenin hedefte tanımlanması, bugün bağımsız servis olarak çalıştığı anlamına gelmez.

## 1. Mimari karar

**Tek depo, mevcut iki Render servisi, ortak oyuncu ürünü; ayrı kimlik, veri ve yetki alanları.** Yeni mikroservis, ücretli servis veya Vercel dağıtımı eklenmeyecek. Owner Panel Poğaça'nın mevcut HTTP uygulamasında kalacak; Frieren AI ayrı Render servisi olacak.

| Bileşen | Sorumluluk | Bugünkü konum | Veri/yetki sınırı |
|---|---|---|---|
| **Poğaça Frieren** | Discord RPG, ekonomi, görev, savaş, koleksiyon, pazar, etkinlik | Render Poğaça servisi, depo kökü | Oyun verisi `guild_id + user_id` kapsamında |
| **Frieren Neural** | Oyuncuyla konuşan Frieren kişiliği, sohbet bağlamı ve oyuncu hafızası | Poğaça içindeki `frieren-chat.js` ve ilgili tablolar | Oyuncu sohbeti; teknik ajan hafızasından ayrı |
| **Frieren AI** | Kod inceleme, test, hata analizi, sınırlı onarım PR taslağı | Ayrı Render servisi, `ai-agent/` | Teknik ajan; üretim oyun DB'sine doğrudan yazmaz |
| **Neural Guardian** | Sağlık/olay izleme, hata tekilleştirme, öncelik, CI/PR kanıtı denetimi, acil durdurma | `guardian/` + GitHub Actions | Denetim/dispatch; otomatik merge/deploy yok |
| **Owner Panel** | Merkezi kontrol: servis, ayar, test/PR raporu, onay, audit | Poğaça HTTP uygulaması, `/owner` | Discord OAuth, owner allowlist, imzalı oturum, CSRF |

### Mevcut durum ile hedefin ayrımı

- Poğaça, oyuncu web sayfaları ve Owner Panel aynı Node.js/Render uygulamasındadır; panel için ikinci bir web servisi açılmayacak.
- Frieren AI ayrı Render servisidir. `ai-agent/render-supervisor.js`, AI için ayrı `FRIEREN_AI_DATABASE_URL` bağlantısını hazırlar.
- Frieren Neural oyuncu sohbeti `frieren-chat.js` tarafındadır; Frieren AI teknik ajandır. Hafıza ve kimlikleri birleştirilmeyecek.
- Neural Guardian bağımsız host edilen bir servis değildir; Guardian modülleri ve GitHub workflow'ları üzerinden çalışır.
- Owner Panel bazı servis kontrollerini ve raporları sunar. AI onarımının panelden başlatılması → PR → onay → dağıtım → canlı doğrulama zinciri henüz uçtan uca kanıtlanmış değildir.
- Şemalar bugün `database/db.js` ve modüllerdeki `CREATE TABLE IF NOT EXISTS` / `ensure*Schema` fonksiyonlarıyla hazırlanır. Sürümlü migration runner henüz tamamlanmış değildir.

## 2. Katmanlı uygulama modeli

```text
Discord komutları / butonlar / menüler       Web rotaları / formlar
                 |                                  |
                 +------ Transport adapters --------+
                                  |
                   Kimlik / yetki / guild kapsamı
                 linked character · CSRF · feature gate
                                  |
                      Application / use-case services
                 economy · quests · collection · social
                   market · cards · auctions · arena
                                  |
                         Domain rules
                rewards · combat · rarity · escrow · rank
                                  |
                    Persistence / transactions
                                  |
                         PostgreSQL
```

- Discord ve web adaptörleri aynı use-case servislerini çağırır; iş kuralları komut ve route içine kopyalanmaz.
- Domain servisleri Discord.js ve HTTP response nesnelerine bağımlı olmaz. Adaptör yalnızca doğrulanmış girdiyi aktarır, sonucu sunum biçimine çevirir.
- Para/eşya/takas/pazar işlemleri tek transaction içinde tamamlanır; tutarlı kilit sırası, unique constraint ve idempotency uygulanır.
- Legacy komutlar tek seferde kırıcı refaktöre zorlanmaz. Yeni özellikler bu sınırı izler; eski modüller davranış testleriyle kontrollü taşınır.

## 3. Özellik modülü sözleşmesi

Her özellik ailesi tek servis sahibi ve tek veri sahibiyle geliştirilir:

1. **Domain service:** İş kuralları ve kullanım senaryoları; ör. `card-collection.js`, `auction-platform.js`, `tournament-platform.js`.
2. **Discord adapter:** Slash komutları, butonlar, menüler; ör. `commands/collection/`.
3. **Web adapter:** Aynı servisleri çağıran sayfa/form. Guild, bağlı karakter, CSRF ve modül anahtarı kontrolleri zorunlu.
4. **Persistence:** Sahip olunan tablolar, indeksler, transaction ve gerekiyorsa ledger.
5. **Feature gate:** `guild-feature-settings.js` üzerinden lonca bazında aç/kapa.
6. **Kanıt:** Önce mevcut testler aranır; yalnızca eksik davranış test edilir. Envanter kaydı yalnızca CI'da gerçekten çalışan test dosyasına bağlanır.

Discord ve web için iki ayrı bakiye/ödül/iş kuralı oluşturulamaz.

## 4. Veri, kimlik ve güvenlik

### Oyuncu alanı
- Oyuncu kayıtları `(guild_id, user_id)` kapsamında tutulur; çapraz sunucu sorgusu varsayılan olarak yasaktır.
- Web hesabı Discord OAuth kimliği ve tek kullanımlık karakter bağlantısıyla eşleştirilir.
- Formdan gelen `guildId` yetki kanıtı değildir; oturum kullanıcısının o loncada bağlı karakteri DB'den doğrulanır.
- Transfer, pazar, açık artırma ve takaslar atomik transaction, idempotency/unique constraint ve denetim defteri kullanır.

### AI ve owner alanı
- Frieren Neural sohbet hafızası, Frieren AI teknik ajan hafızası ve Owner Panel denetim/ayar kayıtları ayrı kalır.
- AI testleri izole PostgreSQL şeması veya CI geçici DB'sinde çalışır; üretim oyuncu verisine yazmaz.
- Anahtarlar yalnızca sunucu ortam değişkenlerinde saklanır; tarayıcıya, Discord yanıtına veya loga yazılmaz.
- Owner işlemleri OAuth, allowlist, imzalı oturum, CSRF, işlem bazlı yetki ve audit kaydı gerektirir.
- Restart/suspend, bakım, merge ve deploy farklı işlemlerdir. Kritik dış etki açık owner onayı gerektirir.

## 5. Veritabanı ve migration kararı

**Mevcut:** `database/db.js` ve modül `ensure*Tables` fonksiyonları şemaları başlangıçta idempotent biçimde kurar. Bu mevcut veriyi korur; ancak sürüm geçmişi ve kontrollü geri alma için yeterli değildir.

**Hedef:** Yeni bağımlılık eklemeden, mevcut `pg` ile sürümlü SQL migration runner:

- `database/migrations/NNNN_description.sql` sıralı ve değişmez sürüm taşır.
- `schema_migrations` sürüm, checksum ve uygulanma zamanını tutar.
- PostgreSQL advisory lock aynı migration'ın iki instance'ta eşzamanlı çalışmasını engeller.
- Migration'lar ileri yönlü ve geriye uyumlu olur: yeni kolon/tablo → kod geçişi → gerekiyorsa eski alanın ayrı sürümde kaldırılması.
- Destructive otomatik rollback yoktur; geri dönüş forward-fix veya doğrulanmış yedekten restore ile yapılır.
- Poğaça/Owner ve AI hafızası kendi DB bağlantı/izin alanında kalır; migration kümeleri ayrıdır.
- Mevcut `CREATE TABLE IF NOT EXISTS` kurulumları bir hamlede silinmez. Önce mevcut şema karşılaştırılır ve baseline alınır; sonra modül bazında taşınır.
- PR #217 uygulama adımı: `database/migrations.js` sürüm sırası, SHA-256 checksum, PostgreSQL advisory lock ve migration başına transaction uygular. Mevcut `ensure*Schema` bootstrap'ı tamamlandıktan sonra legacy baseline `version=0` olarak kaydedilir; yeni SQL dosyaları `database/migrations/0001_*.sql` biçiminde eklenir.
- Runner Poğaça ana uygulamasının `DATABASE_URL` bağlantısında çalışır; Frieren AI'ın ayrı DB bağlantısına uygulanmaz. İlk migration runner commit'i CI'da doğrulanmadan ve owner onayı olmadan canlı ortama taşınmaz.
- `version=0` kaydı mevcut şemayı değiştirmeyen bir geçiş işaretidir; henüz mevcut tabloları taşıyan SQL migration eklenmedi. İlk veri/şema değiştiren migration'dan önce katalog karşılaştırması ve izole PostgreSQL prova kanıtı ayrıca zorunludur.
- Otomatik rollback yoktur. Başarısız SQL transaction'ı geri alınır; daha önce uygulanmış migration dosyasının checksum'u değişirse başlangıç durur ve sessizce devam etmez.

## 6. Servis ve dağıtım topolojisi

| Servis | İş yükü | Dağıtım / sağlık |
|---|---|---|
| Poğaça + Web + Owner Panel + Guardian runtime | Discord Gateway, HTTP, RPG, oyuncu sayfaları, owner ve Guardian | Mevcut Render servisi; tek kontrollü deploy |
| Frieren AI | Teknik Discord botu, health endpoint, test ve PR dispatch | Ayrı Render servisi; `/health` |
| GitHub Actions | CI, izole PostgreSQL denetimi, kontrollü onarım workflow'u | Gerekli PR/commit olayları; concurrency/path filters |
| Neon PostgreSQL | Oyun/panel ve ayrı AI hafıza bağlantıları | Mevcut uygun/free kaynak sınırları |

- Vercel deployment bu mimarinin parçası değildir; yeni deployment oluşturulmaz.
- Yeni Render servisi, ücretli API veya ücretli DB eklenmez.
- UptimeRobot yalnızca mevcut health URL'lerini izler; gereksiz sık ping/cron ile limit tüketilmez.
- Tüm değişiklikler tek PR'da birleştirilir; CI ve owner onayı olmadan merge/deploy yapılmaz.

## 7. Hata tespitinden güvenli yayına

```text
Guardian: health / CI / incident
             |
      deduplicate + prioritize
             |
   Frieren AI: inspect + reproduce
             |
       targeted failing test
             |
       bounded repair PR
             |
 CI + isolated PostgreSQL + Guardian review
             |
 Owner Panel: evidence + before/after + risk
             |
       explicit owner approval
             |
      merge + one deploy
             |
 health + Discord + web smoke verification
             |
        release record
```

- Aynı hata imzası için açık incident/PR varken yinelenen iş açılmaz.
- Öncelik: veri kaybı/güvenlik → üretim kesintisi → ekonomi/ödül bütünlüğü → temel akış → yeni özellik.
- Onarım raporu commit SHA, dosyalar, test komutları, PASS/FAIL, önce/sonra farkı ve riskleri içerir.
- Guardian kanıtı bağımsız değerlendirir; Frieren AI kendi onarımını onaylamaz.
- Frieren AI incelemesi tamamlandığında olay `awaiting_approval` durumuna geçer; bu aşamada GitHub onarım workflow'u tetiklenmez.
- Owner Panel onayı, tamamlanan AI önerisinin SHA-256 parmak izine ve Owner kimliğine bağlanır. Öneri değişirse eski onay geçersiz olur.
- Guardian'ın periyodik retry taraması yalnızca önceden Owner tarafından onaylanmış ve aynı parmak izini taşıyan önerileri yeniden deneyebilir; onaysız öneriler otomatik dispatch edilemez.
- Onaylı onarım workflow'u yalnızca `guardian-isolated-repair-test-v2` dalında çalışır ve PR'ı aynı izole dala açar. Ana dala otomatik taşıma, merge veya deploy yoktur.
- Owner Panel kanıtı tamamlanan PR'ı gösterir; PR'ın ana dala alınması ve üretim dağıtımı ayrı, açık Owner kararları olarak kalır.
- Deploy sonrası rollback, commit ve migration uyumluluğuna göre kararlaştırılır; DB migration otomatik geri çevrilmez.

## 8. Özellik gruplarının bağımlılık sırası

1. **Platform temeli:** migration baseline, modül sözleşmesi, feature gate ve kanıt envanteri.
2. **Koleksiyon/ekonomi:** kart albümü, seri/nadirlik, wishlist, pazar arama/filtre/teklif; mevcut envanter ve ledger servisleri.
3. **Rekabetçi oyun:** turnuva/lig, takım kurucu, eşleştirme, ödül tekilleştirme ve sıralama; mevcut arena/sezon altyapısı.
4. **Topluluk:** sosyal profil ve lonca etkinlikleri; Discord/web aynı servis.
5. **Web deneyimi:** komut kataloğu, profil/istatistik, modül ayarları ve responsive erişilebilirlik.
6. **AI/Guardian/Owner Panel:** tekil onarım talebi, test raporu, PR, owner onayı, deploy sonrası kanıt ve kaynak bütçesi.

Her grup için önce mevcut kod/test aranır; yinelenen işlev eklenmez. 1.675 planlı roadmap kaydı kod/test kanıtı olmadan uygulanmış sayılmaz.

## 9. Karar değişikliği koşulu

Yeni servis/host, ücretli API, Vercel deploy, ayrı mikroservis veya üretim DB taşıması ancak ölçülebilir kapasite/güvenlik ihtiyacı kanıtlanır ve ayrıca açık owner onayı alınırsa değerlendirilebilir. Aksi durumda bu mimari sabittir.

## 10. Doğrulama durumu

Kod incelemesi: `index.js`, `public-site.js`, `owner-dashboard.js`, `database/db.js`, `frieren-chat.js`, `ai-agent/index.js`, `ai-agent/render-supervisor.js`, `guardian/monitor.js`, `guardian/automation.js`, `guild-feature-settings.js`, `social-platform.js`, `player-market.js`.

Son doğrulanmış commit için 748/748 ana test, 31/31 komut senaryosu ve 89/89 izole PostgreSQL senaryosu başarılıydı. Bu mimari doküman commit'i için CI yeniden çalışmalıdır. Gerçek Discord, OAuth callback, mobil/masaüstü tarayıcı E2E ve Owner Panel'den uçtan uca onarım/onay/deploy henüz kanıtlanmadı. Bu belge için üretim DB, canlı Discord, Render ayarları veya dağıtım değiştirilmedi.
