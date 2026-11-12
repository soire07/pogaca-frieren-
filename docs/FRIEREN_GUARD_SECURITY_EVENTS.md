# Frieren Guard security event delivery

> **Entegrasyon durumu:** Bu depoda GitHub Actions üzerinde çalışan harici gönderici iş akışı bulunur. Bu iş akışı ayrı bir Render servisi veya bağımsız WAF değildir; günlük üretim bağımlılık taraması yapar ve OIDC ile doğrulanmış olayları Poğaça'ya gönderir. Bağlantı yalnızca ilk gerçek OIDC olayının delil zincirine kaydedilmesiyle doğrulanmış sayılır.

## Yerleşik harici gönderici (GitHub Actions)

`.github/workflows/frieren-guard-external.yml` her gün, ana dala ilgili kod birleştirildiğinde ve manuel tetiklemede üretim bağımlılıklarını tarar. Depoda kalıcı `package-lock.json` bulunmadığı için Actions çalışma alanında `--package-lock-only --ignore-scripts` ile geçici lock dosyası üretir; bu dosya repoya veya Render'a yazılmaz. Pull request kontrolü aynı çözümlemeyi çalıştırıp olay yükünü doğrular ancak OIDC izni almaz ve hiçbir olay göndermez. Ardından `npm audit --omit=dev` çalıştırılır. Bu tarama manifestteki sürüm aralıklarını yeniden çözer; daha önce dağıtılmış Render sürecindeki tam kurulu paket ağacının birebir envanteri olduğu iddia edilmez. Temiz tarama, güvenlik olayı/incident oluşturmayan bir `heartbeat` delili gönderir. Bulgu varsa gerçek bulgu sayıları ve sınırlı paket kanıtlarıyla `incident` gönderilir; yüksek ve kritik bulgular Guardian inceleme hattına girer.

Gönderici GitHub Actions'ın kısa ömürlü OIDC kimliğini kullanır; Render ve GitHub arasında kalıcı HMAC sırrı kopyalamak gerekmez. Alıcı; issuer, audience, repo, `main` dalı, tam workflow yolu ve imza anahtarını doğrular. Sadece bu sabitlenmiş iş akışı `frieren_guard` harici kaynak olarak kabul edilir. Tek başına workflow dosyasının varlığı veya çalışması bağlantı kanıtı değildir; Owner Panel yalnızca OIDC ile doğrulanmış ve veritabanına yazılmış gerçek olayı bağlantı kanıtı sayar.

Bu gönderici bağımlılık güvenlik taramasını kapsar. Harici WAF, ağ saldırısı algılama veya Render host telemetrisi sağladığı iddia edilmez. Bunlar için ayrı bir gerçek sağlayıcı/olay kaynağı gerekir.

## Endpoint

Send signed JSON events to:

`POST https://pogaca-frieren.onrender.com/internal/guardian/security-event`

The endpoint is private by signature, not by URL secrecy. It accepts only `source: "frieren_guard"`, bounded event fields, and a timestamped HMAC signature.

## Authentication

Configure the same secret on the Guard sender and the Poğaça Frieren Render service:

- Preferred: `FRIEREN_GUARD_EVENT_SECRET` (at least 32 random characters).
- Compatibility fallback on the receiver: `FRIEREN_AI_BRIDGE_SECRET` or `FRIEREN_BRIDGE_SECRET`.

Sign the exact UTF-8 request body. Do not reserialize JSON between signing and sending.

```js
import { createHmac } from 'node:crypto';

const body = JSON.stringify({
  eventId: 'guard-event-unique-0001',
  source: 'frieren_guard',
  code: 'WAF_BLOCK',
  severity: 'high',
  title: 'Suspicious request blocked',
  summary: 'Request rate exceeded the configured threshold.',
  observedAt: new Date().toISOString(),
  evidence: [{ message: 'Rule: auth-rate-limit' }],
});
const timestamp = String(Math.floor(Date.now() / 1000));
const signature = createHmac('sha256', process.env.FRIEREN_GUARD_EVENT_SECRET)
  .update(timestamp + '.' + body)
  .digest('hex');

await fetch('https://pogaca-frieren.onrender.com/internal/guardian/security-event', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-frieren-timestamp': timestamp,
    'x-frieren-signature': 'sha256=' + signature,
  },
  body,
});
```

The receiver allows a five-minute clock skew and a 32 KiB body maximum. Event IDs are idempotency keys; resend the same ID after a network timeout. A duplicate returns HTTP 200 and the original event hash. A new event returns HTTP 201 and a receipt.

## IP attribution

The receiver never treats `X-Forwarded-For` as trustworthy by itself. The direct socket peer is recorded as `socket_peer`. Forwarded client addresses are used only when the direct peer exactly matches an IP in `GUARDIAN_TRUSTED_PROXY_IPS` (comma-separated IPv4/IPv6 addresses). The resolver walks the chain from right to left and skips only explicitly trusted proxy hops. CIDR ranges and wildcards are intentionally not accepted.

Until the real proxy egress IPs are configured, the panel may show the Render network peer rather than the visitor's original IP. Do not label that value as the visitor IP. Never add a broad allowlist such as `*` or trust arbitrary browser-supplied headers.

## Evidence integrity and Owner Panel

Each accepted event is appended in one PostgreSQL transaction to `owner_guardian_evidence_chain`. Its SHA-256 hash includes the canonical payload and previous event hash. Duplicate IDs do not create a second row. Database triggers reject UPDATE, DELETE and TRUNCATE; the Owner Panel verifies the chain and reports the first invalid sequence.

The evidence chain contains three distinct provenance classes: signed external `frieren_guard` sender events, local `frieren_guard_monitor` observations generated by the Guardian monitor from persisted application error logs or Discord readiness changes, and separately tagged `frieren_site_auth` account-origin/rate-limit events. Local monitor and site-auth records are not accepted by the external Guard endpoint and never count as proof that the external Guard sender is connected. The Owner Panel labels each source independently; only an actual signed `frieren_guard` event verifies the external sender. Critical/high Guardian incidents are subsequently picked up by the existing Guardian review monitor and sent to Frieren AI. AI output remains a proposal; merge and deployment still require explicit owner approval.

This is tamper-evident application evidence, not proof by itself of legal admissibility, the identity of an attacker, or the truth of an upstream WAF claim. Preserve original provider exports and timestamps separately when an incident may require legal review.
