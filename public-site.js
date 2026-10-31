
import { readFile } from 'node:fs/promises';
import { readPublicSiteSession } from './owner-dashboard.js';

const SITE_COOKIE = 'frieren_site_session';
const OWNER_ID = '1553794496234262641';
const assets = new Map([
  ...['animequiz.gif','buyusavasi.gif','buyusavasi_kazandi.gif','buyusavasi_vurus.gif','eisen.gif','envanter.gif','fern.gif','frieren.gif','heiter.gif','himmel.gif','macera.gif','profil.gif','quizdogru.gif','quizyanlis.gif','stark.gif','yardim.gif','site-avatar.svg','site-banner.svg'].map(file => ['/assets/' + file, file])
]);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function cookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '').split(';').map(part => {
    const i = part.indexOf('=');
    if (i < 0) return ['', ''];
    try { return [part.slice(0, i).trim(), decodeURIComponent(part.slice(i + 1).trim())]; } catch { return ['', '']; }
  }).filter(([key]) => key));
}

const CSS = `
:root{color-scheme:dark;--muted:#c9c1dc;--line:#e8dafa33;--lav:#e4d0ff;--rose:#f3cde2}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;min-height:100vh;color:#faf6ff;font:15px/1.7 Inter,system-ui;background:radial-gradient(ellipse at 15% 0%,#8b70a855,transparent 36%),radial-gradient(ellipse at 92% 42%,#a58ab633,transparent 40%),linear-gradient(145deg,#111024,#241d39 55%,#14152a);overflow-x:hidden}
body:before{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;opacity:.35;background-image:radial-gradient(2px 2px at 12% 18%,#fff 99%,transparent),radial-gradient(1px 1px at 71% 32%,#f6e9ff 99%,transparent);background-size:380px 330px;animation:stars 8s ease-in-out infinite alternate}@keyframes stars{to{opacity:.7;transform:translateY(-8px)}}
a{color:inherit;text-decoration:none}.topbar{position:sticky;top:0;z-index:8;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:11px max(20px,calc((100vw - 1200px)/2));background:#17152ceF;backdrop-filter:blur(18px);border-bottom:1px solid var(--line)}
.brand{display:flex;align-items:center;gap:10px;font:20px Georgia,serif;letter-spacing:.18em}.brand-mark{display:grid;place-items:center;width:42px;height:42px;border:1px solid #ead9ff66;border-radius:50%;color:#f0dfff;font-size:25px}.brand small{display:block;font:9px system-ui;letter-spacing:.2em;color:#bdb4d9}
.topbar nav,footer nav{display:flex;gap:18px;color:#d8cfe8;font-size:13px}.user-chip{display:flex;align-items:center;gap:8px;padding:5px 10px;border:1px solid var(--line);border-radius:30px;background:#ffffff09;font-size:12px}.user-chip img{width:29px;height:29px;object-fit:cover;border-radius:50%;border:2px solid #e5d5ff88}
.wrap{width:min(1160px,calc(100% - 36px));margin:auto}.hero{display:grid;grid-template-columns:1.05fr .95fr;align-items:center;gap:30px;padding:50px 0 30px;min-height:500px}.eyebrow{color:#ead5ff;font-size:10px;font-weight:800;letter-spacing:.23em}.hero h1{font:clamp(42px,6vw,76px)/1.12 Georgia,serif;margin:16px 0}.hero h1 em,.hero-title em{font-style:normal;color:#e4cfff;text-shadow:0 0 32px #d8b9ff70}.hero-title{font:clamp(40px,6vw,68px)/1.12 Georgia,serif;margin:16px 0}.lead{max-width:630px;color:var(--muted);font-size:16px;line-height:1.9}.actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:24px}.btn{display:inline-flex;align-items:center;justify-content:center;padding:12px 18px;border:1px solid #ead9ff77;border-radius:14px;background:linear-gradient(120deg,#f3dff0,#d4c6ff);color:#2a203b;font-weight:800;box-shadow:0 10px 30px #d5b8ff24;transition:.2s}.btn:hover{transform:translateY(-3px);color:#21162e}.btn.ghost{background:#ffffff0b;color:#f2eaff;border-color:var(--line)}
.hero-art{position:relative;display:grid;place-items:center;min-height:400px}.hero-art:before{content:"";position:absolute;width:92%;aspect-ratio:1;border:1px solid #e4d4ff35;border-radius:50%;box-shadow:0 0 90px #d5c0ff24,inset 0 0 80px #e5cfff12}.hero-art img{position:relative;width:min(410px,100%);height:380px;object-fit:contain;filter:drop-shadow(0 22px 35px #080612aa);animation:float 7s ease-in-out infinite}@keyframes float{50%{transform:translateY(-10px)}}
.section{padding:44px 0 60px}.section-head{text-align:center;max-width:720px;margin:0 auto 30px}.section-head h2,.split h2{font:clamp(30px,4vw,46px)/1.2 Georgia,serif;margin:10px 0}.section-head p,.muted{color:var(--muted)}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.card{padding:22px;border:1px solid var(--line);border-radius:22px;background:linear-gradient(145deg,#ffffff10,#ffffff06);box-shadow:0 16px 45px #05040d40;transition:.22s}.card:hover{transform:translateY(-5px);border-color:#ead7ff75}.card h3{font:22px Georgia,serif;margin:10px 0 5px}.card p{margin:0 0 12px;color:var(--muted);font-size:13px}.icon{font-size:26px;color:#ead8ff}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.stat{padding:17px;border:1px solid var(--line);border-radius:16px;background:#ffffff0a;text-align:center}.stat b{display:block;font:24px Georgia,serif;color:#f1dcff}.stat span{font-size:11px;color:var(--muted)}
.profile{overflow:hidden;border:1px solid #eadbfa40;border-radius:25px;background:#ffffff0a;box-shadow:0 20px 55px #06040d55}.profile-banner{height:155px;background:linear-gradient(90deg,#17152b22,#17152b08),url('/assets/site-banner.svg') center/cover}.profile-info{display:flex;align-items:flex-end;gap:17px;padding:0 22px 18px}.profile-avatar{width:104px;height:104px;margin-top:-48px;object-fit:cover;border:5px solid #241d38;border-radius:50%}.profile-info h3{font:25px Georgia,serif;margin:0}.profile-info p{margin:2px 0 0;color:var(--muted);font-size:12px}.profile-body{padding:0 22px 22px;color:var(--muted);font-size:13px}
.gif-gallery{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:17px}.gif-item{text-align:center;color:#ded5ed;font-size:12px}.gif-item img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:50%;border:3px solid #e4d5ff88;box-shadow:0 9px 25px #05040d66;transition:.25s}.gif-item:hover img{transform:scale(1.06) rotate(3deg);box-shadow:0 12px 35px #d8bdff55}.gif-item span{display:block;margin-top:8px}
.split{display:grid;grid-template-columns:1fr 1fr;gap:25px;align-items:center}.visual{height:300px;overflow:hidden;border:1px solid var(--line);border-radius:25px}.visual img{width:100%;height:100%;object-fit:cover}.command{display:flex;gap:13px;align-items:flex-start;padding:12px 0;border-bottom:1px solid var(--line)}.command code{min-width:115px;padding:6px 9px;border:1px solid #e5d7ff55;border-radius:9px;background:#e3d3ff12;color:#f1dfff;font-size:12px}.command span{color:var(--muted);font-size:13px}
.cta{padding:34px;border:1px solid #ead8ff44;border-radius:25px;text-align:center;background:radial-gradient(ellipse at top,#d8c0ff22,transparent 70%),#ffffff08}.cta h2{font:34px Georgia,serif;margin:0}.cta p{color:var(--muted)}
footer{margin-top:28px;padding:26px max(20px,calc((100vw - 1160px)/2));border-top:1px solid var(--line);display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;color:#c2b8d7}footer strong{display:block;font:18px Georgia,serif;letter-spacing:.2em}footer small,footer span{font-size:11px;color:#a69dbb}

@media(max-width:850px){.topbar{flex-wrap:wrap;padding:10px 18px}.topbar nav{order:3;width:100%;overflow:auto;gap:17px}.topbar nav a{white-space:nowrap}.hero{grid-template-columns:1fr;text-align:center;padding-top:32px}.lead{margin:auto}.actions{justify-content:center}.hero-art{min-height:290px}.hero-art img{height:290px}.grid{grid-template-columns:1fr 1fr}.split{grid-template-columns:1fr}.gif-gallery{grid-template-columns:repeat(3,1fr)}.stats{grid-template-columns:1fr 1fr}}
@media(max-width:560px){.user-chip span{display:none}.hero{min-height:0}.hero-art{min-height:245px}.hero-art img{height:245px}.section{padding:34px 0 45px}.grid,.stats{grid-template-columns:1fr}.gif-gallery{grid-template-columns:repeat(2,1fr);gap:14px}.profile-info{align-items:center}.profile-avatar{width:82px;height:82px}footer{padding:24px 18px}}
@media(prefers-reduced-motion:reduce){*,*:before,*:after{animation:none!important;scroll-behavior:auto!important;transition:none!important}}

/* Responsive visual polish */
:focus-visible{outline:2px solid #e6d4ff;outline-offset:3px}
img{max-width:100%}
.wrap,.section,.grid,.split,.hero,.card,.profile{min-width:0}
.card{height:100%;display:flex;flex-direction:column}
.card .btn{align-self:flex-start;margin-top:auto}
.command span,.lead,.card p{overflow-wrap:anywhere}
.topbar nav{scrollbar-width:none}
.topbar nav::-webkit-scrollbar{display:none}
.btn:focus-visible,.user-chip a:focus-visible,.topbar nav a:focus-visible{border-radius:8px}
@media(max-width:850px){
  .topbar{gap:10px}
  .topbar nav{padding:5px 0 7px}
  .hero{gap:12px}
  .hero-art{width:min(100%,520px);margin:0 auto}
  .split{gap:18px}
}
@media(max-width:560px){
  .wrap{width:calc(100% - 28px)}
  .topbar{padding:9px 14px}
  .brand{font-size:17px;letter-spacing:.12em}
  .brand-mark{width:36px;height:36px;font-size:21px}
  .topbar nav{gap:15px;font-size:12px}
  .hero h1,.hero-title{font-size:clamp(34px,10vw,46px)}
  .lead{font-size:14px;line-height:1.75}
  .actions{gap:9px}
  .actions .btn{flex:1 1 100%;width:100%}
  .hero-art{min-height:220px}
  .hero-art img{height:220px}
  .section-head{padding:0 5px}
  .card{padding:18px;border-radius:17px}
  .gif-gallery{gap:12px}
  .gif-item img{border-width:2px}
  .visual{height:230px}
  .cta{padding:25px 18px}
  .cta h2{font-size:28px}
  footer{align-items:flex-start}
}
@media(max-width:360px){
  .user-chip{padding:4px 7px}
  .brand small{font-size:8px}
  .gif-gallery{gap:9px}
}

/* Circular Frieren journey GIF and refined profile card. */
.hero-art{position:relative;display:block;width:clamp(260px,32vw,390px);height:clamp(260px,32vw,390px);min-height:0;aspect-ratio:1;margin:0 auto;padding:9px;overflow:hidden;border:1px solid #eadbfa77;border-radius:50%;background:radial-gradient(circle at 30% 20%,#eadbfa22,#171326 72%);box-shadow:0 0 0 8px #d9c3ff0d,0 24px 70px #08051288,0 0 55px #d7bdff30}
.hero-art:before{content:"";position:absolute;inset:0;width:100%;height:100%;border:1px solid #e4d4ff35;border-radius:50%;box-shadow:inset 0 0 42px #d5c0ff24;pointer-events:none}
.hero-art img{position:relative;display:block;width:100%;height:100%;max-width:none;object-fit:cover;object-position:center;border-radius:50%;filter:brightness(.96) saturate(.94) drop-shadow(0 12px 22px #08061288);animation:none}
.profile{position:relative;isolation:isolate;border-radius:24px;border-color:#eadbfa66;background:linear-gradient(150deg,#ffffff12,#ffffff06 55%,#cdb5ff0a);box-shadow:0 24px 65px #06040d66,inset 0 1px #ffffff12}
.profile-banner{position:relative;height:205px;background:linear-gradient(180deg,#17152b08 45%,#17152b99 100%),url('/assets/site-banner.svg') center 46%/cover no-repeat}
.profile-info{position:relative;align-items:center;gap:18px;padding:0 24px 16px}
.profile-avatar{flex:0 0 112px;width:112px;height:112px;margin-top:-58px;border:4px solid #211b35;border-radius:50%;object-fit:cover;object-position:center;background:#211b35;box-shadow:0 0 0 2px #d9c3ff88,0 12px 28px #05030d99}
.profile-info h3{font-size:27px;letter-spacing:.01em}.profile-info p{font-size:12px;letter-spacing:.04em}.profile-body{padding:0 24px 24px;line-height:1.85}
@media(max-width:850px){.hero-art{width:clamp(250px,42vw,340px);height:clamp(250px,42vw,340px);margin:10px auto 0}}
@media(max-width:560px){.hero-art{width:250px;height:250px;padding:7px;border-radius:50%}.hero-art:before{border-radius:50%}.hero-art img{border-radius:50%}.profile-banner{height:155px;background-position:center 44%}.profile-info{gap:13px;padding:0 15px 14px}.profile-avatar{flex-basis:88px;width:88px;height:88px;margin-top:-45px;border-width:3px}.profile-info h3{font-size:21px}.profile-body{padding:0 16px 18px}}
@media(max-width:390px){.hero-art{width:220px;height:220px}.profile-info{align-items:flex-start}.profile-avatar{flex-basis:76px;width:76px;height:76px;margin-top:-38px}.profile-info h3{font-size:18px}}

`;

function page(title, content, user) {
  const avatar = user.avatarUrl || '/assets/site-avatar.svg';
  const ownerLink = user.id === OWNER_ID ? '<a href="/owner">Owner Panel</a>' : '';
  return '<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#17152c"><meta name="description" content="Frieren evreninde büyülü bir Discord RPG yolculuğu."><title>' + esc(title) + ' · Frieren</title><style>' + CSS + '</style></head><body><header class="topbar"><a class="brand" href="/"><span class="brand-mark">✧</span><span>FRIEREN<small>THE ARCANE JOURNEY</small></span></a><nav><a href="/">Ana Sayfa</a><a href="/pogaca">Poğaça Frieren</a><a href="/frieren-ai">Frieren AI</a>' + ownerLink + '</nav><div class="user-chip"><img src="' + esc(avatar) + '" alt=""><span>' + esc(user.username || 'Gezgin') + '</span><a href="/logout" title="Çıkış yap">↗</a></div></header>' + content + '<footer><div><strong>✧ FRIEREN</strong><span>Bir yolculuk, bin yıllık bir hikâye.</span></div><nav><a href="/pogaca">Poğaça Frieren</a><a href="/frieren-ai">Frieren AI</a>' + ownerLink + '</nav><small>© Frieren Platform · Developed by Soiree</small></footer></body></html>';
}
function home(client, user) {
  const ready = client?.isReady?.() === true;
  return page('Büyülü Ana Sayfa', '<main><section class="wrap hero"><div><div class="eyebrow">✧ FANTASTİK BİR YOLCULUK BAŞLIYOR ✧</div><h1>Bin yıllık bir<br><em>büyü yolculuğu.</em></h1><p class="lead">Frieren evreninden ilham alan, keşiflerle dolu bir Discord RPG dünyası. Büyüler öğren, dostlar edin, zindanlara in ve kendi hikâyeni yaz.</p><div class="actions"><a class="btn" href="/pogaca">Poğaça Frieren’i keşfet ✧</a><a class="btn ghost" href="/frieren-ai">Frieren AI’ı tanı</a></div><p class="muted">Poğaça Frieren · ' + (ready ? 'Discord bağlantısı aktif' : 'Discord bağlantısı bekleniyor') + '</p></div><div class="hero-art"><img src="/assets/frieren.gif" alt="Frieren büyü yolculuğunda"></div></section>' +
  '<section class="section"><div class="wrap"><div class="section-head"><div class="eyebrow">YOL ARKADAŞLARIN</div><h2>Bir evren, iki ayrı uzmanlık</h2><p>RPG macerası ve teknik zekâ aynı büyülü dünyada buluşuyor.</p></div><div class="grid"><article class="card"><div class="icon">✧</div><h3>Poğaça Frieren</h3><p>Karakter, büyü, zindan, boss, ekonomi, görevler ve anime eğlencesiyle dolu RPG botu.</p><a class="btn ghost" href="/pogaca">Macerayı keşfet →</a></article><article class="card"><div class="icon">⌘</div><h3>Frieren AI</h3><p>Hafıza, sohbet, kod denetimi, test senaryoları ve hata raporları için ayrı asistan.</p><a class="btn ghost" href="/frieren-ai">AI’ı tanı →</a></article><article class="card"><div class="icon">☾</div><h3>Kişisel alanın</h3><p>Discord hesabınla giriş yaptığın alan ve sayfada seninle gezen minik Frieren.</p><a class="btn ghost" href="#profil">Profiline göz at →</a></article></div></div></section>' +
  '<section class="section"><div class="wrap split"><div class="profile"><div class="profile-banner"></div><div class="profile-info"><img class="profile-avatar" src="/assets/site-avatar.svg" alt="Frieren platform profil fotoğrafı"><div><h3>Poğaça Frieren</h3><p>✧ RPG · Anime · Büyü · Macera</p></div></div><div class="profile-body">Kendi hikâyeni yazacağın, arkadaşlarınla zindanlara gireceğin ve her gün yeni şeyler keşfedeceğin büyülü bir Discord yol arkadaşı.</div></div><div id="profil"><div class="eyebrow">BİRLİKTE BİRİKTİRİLEN HATIRALAR</div><h2>Her karede başka bir hikâye.</h2><p class="lead">Frieren’in yolculuğundan küçük anlar, yuvarlak GIF galerisi ve sayfanın etrafında dolaşan minik bir büyücü.</p><p class="muted">Hoş geldin, ' + esc(user.username || 'gezgin') + '. Frieren evrenindeki yolculuğuna buradan devam edebilirsin.</p></div></div></section>' +
  '<section class="section"><div class="wrap"><div class="section-head"><div class="eyebrow">BÜYÜLÜ ALBÜM</div><h2>Yolculuktan küçük anlar</h2><p>Yuvarlak GIF’ler; her biri ayrı bir karakter, ayrı bir anı.</p></div><div class="gif-gallery"><div class="gif-item"><img src="/assets/frieren.gif" alt="Frieren GIF"><span>Frieren</span></div><div class="gif-item"><img src="/assets/fern.gif" alt="Fern GIF"><span>Fern</span></div><div class="gif-item"><img src="/assets/stark.gif" alt="Stark GIF"><span>Stark</span></div><div class="gif-item"><img src="/assets/eisen.gif" alt="Eisen GIF"><span>Eisen</span></div><div class="gif-item"><img src="/assets/himmel.gif" alt="Himmel GIF"><span>Himmel</span></div><div class="gif-item"><img src="/assets/heiter.gif" alt="Heiter GIF"><span>Heiter</span></div><div class="gif-item"><img src="/assets/macera.gif" alt="Macera GIF"><span>Macera</span></div><div class="gif-item"><img src="/assets/profil.gif" alt="Profil GIF"><span>Karakter profili</span></div><div class="gif-item"><img src="/assets/envanter.gif" alt="Envanter GIF"><span>Envanter</span></div><div class="gif-item"><img src="/assets/buyusavasi.gif" alt="Büyü savaşı GIF"><span>Büyü savaşı</span></div><div class="gif-item"><img src="/assets/buyusavasi_vurus.gif" alt="Büyü darbesi GIF"><span>Büyü darbesi</span></div><div class="gif-item"><img src="/assets/buyusavasi_kazandi.gif" alt="Zafer GIF"><span>Zafer</span></div><div class="gif-item"><img src="/assets/animequiz.gif" alt="Anime quiz GIF"><span>Anime zamanı</span></div><div class="gif-item"><img src="/assets/quizdogru.gif" alt="Doğru cevap GIF"><span>Doğru cevap</span></div><div class="gif-item"><img src="/assets/quizyanlis.gif" alt="Yanlış cevap GIF"><span>Yanlış cevap</span></div><div class="gif-item"><img src="/assets/yardim.gif" alt="Yardım GIF"><span>Yardım</span></div></div></div></section>' +
  '<section class="section"><div class="wrap stats"><div class="stat"><b>' + (client?.guilds?.cache?.size ?? '—') + '</b><span>Bağlı sunucu</span></div><div class="stat"><b>' + (client?.commands?.size ?? '—') + '</b><span>Yüklenmiş komut</span></div><div class="stat"><b>2</b><span>Bağımsız bot</span></div><div class="stat"><b>' + (ready ? 'Aktif' : 'Kontrol') + '</b><span>Poğaça bağlantısı</span></div></div></section>' +
  '<section class="section"><div class="wrap cta"><h2>Birlikte maceraya çıkalım mı?</h2><p>Poğaça Frieren’i sunucuna davet et ve yolculuğu başlat.</p><a class="btn" href="/pogaca">Botu ve komutları keşfet ✧</a></div></section></main>', user);
}

function pogaca(client, user) {
  const invite = process.env.CLIENT_ID ? 'https://discord.com/oauth2/authorize?client_id=' + encodeURIComponent(process.env.CLIENT_ID) + '&permissions=274878221376&scope=bot%20applications.commands' : null;
  const commands = [['/yardim','Botun temel yardımını ve komut kategorilerini gösterir.'],['/karakter','RPG karakterini ve gelişim bilgilerini açar.'],['/bakiye','Cüzdanındaki oyun parasını görüntüler.'],['/market','Oyun içi eşyaları ve ekipmanları keşfetmeni sağlar.'],['/zindan','Zindan macerasına katılmanı sağlar.'],['/animequiz','Anime bilginle eğlenceli quizlere katıl.']];
  return page('Poğaça Frieren', '<main><section class="wrap" style="padding:60px 0 38px;text-align:center"><div class="eyebrow">EĞLENCE · RPG · FANTASTİK MACERA</div><h1 class="hero-title">Poğaça <em>Frieren</em></h1><p class="lead" style="margin:auto">Karakter oluştur, büyüler öğren, zindanlara in, bosslarla savaş ve kendi macera hikâyeni yaz.</p><div class="actions" style="justify-content:center"><a class="btn" href="' + (invite || '#komutlar') + '"' + (invite ? ' target="_blank" rel="noopener"' : '') + '>' + (invite ? 'Discord sunucuna ekle ↗' : 'Davet bağlantısı yapılandırılıyor') + '</a><a class="btn ghost" href="#komutlar">Komutları incele</a></div></section><section class="wrap split"><div class="visual"><img src="/assets/macera.gif" alt="RPG macerası"></div><div><div class="eyebrow">KENDİ HİKÂYENİ YAZ</div><h2>Yaşayan bir RPG dünyası.</h2><p class="lead">Kalıcı karakter verileri, ekipmanlar, envanter, görevler ve ilerleme sistemiyle her macera kaldığın yerden devam eder.</p><p class="muted">' + (client?.commands?.size ?? '—') + ' komut yüklenmiş · ' + (client?.isReady?.() ? 'Discord bağlantısı aktif' : 'Bağlantı kontrol ediliyor') + '</p></div></section><section class="section"><div class="wrap"><div class="section-head"><div class="eyebrow">MACERA SİSTEMLERİ</div><h2>Her adımda yeni keşif</h2></div><div class="grid"><article class="card"><div class="icon">⚔</div><h3>Karakter & sınıflar</h3><p>Seviye, XP, stat puanları, ekipman ve karakter gelişimi.</p></article><article class="card"><div class="icon">✧</div><h3>Büyü & yetenekler</h3><p>Büyü öğrenme, yetenek ağacı, ustalık ve mana yönetimi.</p></article><article class="card"><div class="icon">♜</div><h3>Zindan & boss</h3><p>Karşılaşmalar, boss savaşları, ödüller ve ilerleme.</p></article><article class="card"><div class="icon">◈</div><h3>Ekonomi & envanter</h3><p>Market, eşya, ekipman, takas ve para sistemi.</p></article><article class="card"><div class="icon">✦</div><h3>Görev & keşif</h3><p>Günlük görevler, maceralar ve başarımlar.</p></article><article class="card"><div class="icon">♧</div><h3>Anime & topluluk</h3><p>Anime quizleri, karakterler, koleksiyon ve eğlence.</p></article></div></div></section><section class="section" id="komutlar"><div class="wrap split"><div><div class="eyebrow">İLK ADIMLAR</div><h2>Başlamak çok kolay.</h2><p class="lead">Botu sunucuna ekledikten sonra temel komutlarla başlayabilirsin.</p>' + commands.map(([name,desc]) => '<div class="command"><code>' + name + '</code><span>' + desc + '</span></div>').join('') + '</div><div class="visual"><img src="/assets/yardim.gif" alt="Yardım ve komutlar"></div></div></section><section class="section"><div class="wrap cta"><h2>Sunucunda yeni bir macera başlat.</h2><p>Poğaça Frieren’i davet et, arkadaşlarını topla ve ilk zindana gir.</p><a class="btn" href="' + (invite || '#komutlar') + '"' + (invite ? ' target="_blank" rel="noopener"' : '') + '>Poğaça Frieren’i davet et ↗</a></div></section></main>', user);
}

function aiPage(user) {
  const url = process.env.FRIEREN_AI_PUBLIC_URL || 'https://frieren-ai-agent.onrender.com';
  return page('Frieren AI', '<main><section class="wrap" style="padding:65px 0 42px;text-align:center"><div class="eyebrow">AKILLI ASİSTAN · TEST · TEKNİK ANALİZ</div><h1 class="hero-title">Frieren <em>AI</em></h1><p class="lead" style="margin:auto">Poğaça Frieren’in teknik yol arkadaşı. Sohbet ve hafızadan kod denetimine, test senaryolarından hata raporlarına uzanan ayrı bir AI servisi.</p><div class="actions" style="justify-content:center"><a class="btn" href="/owner">AI kontrol merkezine git ↗</a><a class="btn ghost" href="' + esc(url) + '/health" target="_blank" rel="noopener">Servis sağlık durumu</a></div></section><section class="section"><div class="wrap grid"><article class="card"><div class="icon">✧</div><h3>Frieren sohbeti</h3><p>Karakter odaklı sohbet akışı ve izinli kullanıcı hafızası.</p></article><article class="card"><div class="icon">⌘</div><h3>Teknik denetim</h3><p>Komut sözleşmeleri, kod incelemesi ve hata teşhisi.</p></article><article class="card"><div class="icon">✓</div><h3>Test sistemi</h3><p>Senaryo bazlı testler, PASS/FAIL raporları ve kanıt odaklı doğrulama.</p></article></div></section><section class="section"><div class="wrap cta"><h2>İki bot, tek büyülü platform.</h2><p>RPG macerası ve teknik asistan birbirinden bağımsız servislerde çalışır.</p><a class="btn" href="/pogaca">Poğaça Frieren’i keşfet</a></div></section></main>', user);
}

function authPage(mode, status = '') {
  const registering = mode === 'register';
  const title = registering ? 'Yolculuğa katıl' : 'Yolculuğuna dön';
  const action = registering ? 'Discord ile kayıt ol' : 'Discord ile giriş yap';
  const alternate = registering
    ? '<p>Zaten hesabın var mı? <a href="/login">Giriş yap</a></p>'
    : '<p>İlk kez mi geliyorsun? <a href="/register">Kayıt ol</a></p>';
  const notice = status === 'not_registered'
    ? '<p class="auth-notice">Bu Discord hesabı henüz kayıtlı değil. Önce kayıt oluştur.</p>'
    : status === 'already_registered'
      ? '<p class="auth-notice">Bu Discord hesabı zaten kayıtlı. Giriş yapabilirsin.</p>'
      : status === 'oauth_error'
        ? '<p class="auth-notice">Discord doğrulaması tamamlanamadı. Yeniden dene; sorun sürerse site yöneticisi OAuth ayarlarını kontrol etmelidir.</p>' : '';
  return '<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#17152c"><title>' + title + ' · Frieren</title><style>' + CSS + '.auth-wrap{min-height:100vh;display:grid;place-items:center;padding:28px 18px}.auth-card{width:min(100%,520px);padding:34px;border:1px solid #e8dafa55;border-radius:26px;background:linear-gradient(145deg,#34294cdd,#17152eee);box-shadow:0 24px 80px #05030d88;text-align:center}.auth-mark{width:90px;height:90px;border-radius:50%;object-fit:cover;border:2px solid #e8dafa88;box-shadow:0 0 45px #d8bdff55}.auth-card h1{font:38px Georgia,serif;margin:18px 0 8px}.auth-card p{color:var(--muted)}.auth-card .btn{margin:14px 0}.auth-notice{max-width:100%;margin:16px auto!important;padding:12px 14px;border:1px solid #f0c8a866;border-radius:12px;background:#a8793918;color:#ffe3b4!important;text-align:center}.auth-back{display:inline-flex;margin-top:12px;padding:9px 14px;border:1px solid #e8dafa55;border-radius:12px;color:#f0e6ff;background:#ffffff0b}.auth-back:hover{background:#ffffff18}</style></head><body><main class="auth-wrap"><section class="auth-card"><img class="auth-mark" src="/assets/site-avatar.svg" alt="Frieren site simgesi"><div class="eyebrow">✧ FRIEREN · THE ARCANE JOURNEY ✧</div><h1>' + title + '</h1><p>' + (registering ? 'Site hesabını Discord kimliğinle ücretsiz oluştur. Ayrı bir şifre belirlemen gerekmez.' : 'Kayıtlı Discord hesabınla güvenli şekilde devam et.') + '</p>' + notice + '<a class="btn" href="/owner/login?flow=' + (registering ? 'register' : 'login') + '">' + action + '</a>' + alternate + '<p class="muted">Kimlik doğrulaması Discord üzerinden yapılır. Şifreni bu siteyle paylaşmazsın.</p><a class="auth-back" href="/">← Ana sayfaya dön</a></section></main></body></html>';
}

export async function handlePublicSiteRequest(req, res, { client } = {}) {
  const url = new URL(req.url, 'http://localhost');
  if (req.method !== 'GET') return false;
  const cookie = cookies(req);
  if (url.pathname === '/logout') {
    res.writeHead(302, { Location: '/login', 'Cache-Control': 'no-store', 'Set-Cookie': SITE_COOKIE + '=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0' });
    res.end();
    return true;
  }
  if (url.pathname === '/owner' || url.pathname.startsWith('/owner/')) return false;
  if (assets.has(url.pathname) && ['site-avatar.svg', 'site-banner.svg'].includes(assets.get(url.pathname))) {
    try {
      const file = assets.get(url.pathname);
      const data = await readFile(new URL('./' + file, import.meta.url));
      res.writeHead(200, { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public,max-age=86400', 'X-Content-Type-Options': 'nosniff' });
      res.end(data);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Asset bulunamadı.');
    }
    return true;
  }
  if (url.pathname === '/login' || url.pathname === '/register') {
    const user = readPublicSiteSession(cookie[SITE_COOKIE], process.env.ADMIN_SESSION_SECRET);
    if (user) {
      res.writeHead(302, { Location: '/', 'Cache-Control': 'no-store' });
      res.end();
      return true;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Content-Security-Policy': "default-src 'self'; img-src 'self' data: https://cdn.discordapp.com; style-src 'unsafe-inline'; form-action 'self'; base-uri 'self'; frame-ancestors 'self'" });
    res.end(authPage(url.pathname === '/register' ? 'register' : 'login', url.searchParams.get('status') || ''));
    return true;
  }
  const publicPaths = new Set(['/', '/pogaca', '/frieren-ai']);
  if (!publicPaths.has(url.pathname) && !assets.has(url.pathname)) return false;
  const user = readPublicSiteSession(cookie[SITE_COOKIE], process.env.ADMIN_SESSION_SECRET);
  if (!user) {
    res.writeHead(302, { Location: '/login', 'Cache-Control': 'no-store' });
    res.end();
    return true;
  }
  if (assets.has(url.pathname)) {
    try {
      const file = assets.get(url.pathname);
      const data = await readFile(new URL('./' + file, import.meta.url));
      const contentType = file.endsWith('.svg') ? 'image/svg+xml; charset=utf-8' : 'image/gif';
      res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'private,max-age=86400', 'X-Content-Type-Options': 'nosniff' });
      res.end(data);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Asset bulunamadı.');
    }
    return true;
  }
  const routes = new Map([['/', () => home(client, user)], ['/pogaca', () => pogaca(client, user)], ['/frieren-ai', () => aiPage(user)]]);
  const render = routes.get(url.pathname);
  if (!render) return false;
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Content-Security-Policy': "default-src 'self'; img-src 'self' data: https://cdn.discordapp.com; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action 'self'; base-uri 'self'; frame-ancestors 'self'" });
  res.end(render());
  return true;
}
