
import { readFile } from 'node:fs/promises';
import { readPublicSiteSession, createPublicSiteSession } from './owner-dashboard.js';
import { handleSiteAuthRequest, createSiteCsrfToken, verifySiteCsrfToken } from './site-auth.js';
import {
  redeemSiteLinkToken, getAdventurerDashboard, getLinkedAdventurer, getAdventurerInventory,
  joinGuildEvent, leaveGuildEvent
} from './adventurer-platform.js';
import { handleGuildDashboardRequest } from './guild-dashboard.js';
import {
  createPlayerMarketListing, listPlayerMarketListings, buyPlayerMarketListing,
  cancelPlayerMarketListing, getPlayerMarketHistory
} from './player-market.js';

const SITE_COOKIE = 'frieren_site_session';
const OWNER_ID = '1553794496234262641';
const assets = new Map([
  ...['animequiz.gif','buyusavasi.gif','buyusavasi_kazandi.gif','buyusavasi_vurus.gif','eisen.gif','envanter.gif','fern.gif','frieren.gif','heiter.gif','himmel.gif','macera.gif','profil.gif','quizdogru.gif','quizyanlis.gif','stark.gif','yardim.gif','site-avatar.svg','site-avatar.webp','site-shortcut.svg','site-banner.svg','site-banner.webp','site.css','owner.css'].map(file => ['/assets/' + file, file])
]);
assets.set('/site.webmanifest', 'site.webmanifest');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function cookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '').split(';').map(part => {
    const i = part.indexOf('=');
    if (i < 0) return ['', ''];
    try { return [part.slice(0, i).trim(), decodeURIComponent(part.slice(i + 1).trim())]; } catch { return ['', '']; }
  }).filter(([key]) => key));
}


function page(title, content, user) {
  const avatar = user.avatarUrl || '/assets/site-avatar.webp';
  const ownerLink = user.id === OWNER_ID ? '<a href="/owner">Owner Panel</a>' : '';
  const guildLink = '<a href="/lonca">Maceracı Loncası</a>';
  return '<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#17152c"><meta name="description" content="Frieren evreninde büyülü bir Discord RPG yolculuğu."><link rel="icon" type="image/svg+xml" href="/assets/site-avatar.svg"><link rel="alternate icon" href="/assets/site-avatar.webp" type="image/webp"><link rel="manifest" href="/site.webmanifest"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-capable" content="yes"><title>' + esc(title) + ' · Frieren</title><link rel="stylesheet" href="/assets/site.css"></head><body><header class="topbar"><a class="brand" href="/"><span class="brand-mark">✧</span><span>FRIEREN<small>THE ARCANE JOURNEY</small></span></a><nav><a href="/">Ana Sayfa</a><a href="/pogaca">Poğaça Frieren</a><a href="/komutlar">Komutlar</a><a href="/frieren-ai">Frieren AI</a><a href="/maceraci">Maceracı Paneli</a><a href="/pazar">Kuzey Pazarı</a>' + guildLink + ownerLink + '</nav><div class="user-chip"><img src="' + esc(avatar) + '" alt=""><span>' + esc(user.username || 'Gezgin') + '</span><a href="/logout" title="Çıkış yap">↗</a></div></header>' + content + '<footer><div><strong>✧ FRIEREN</strong><span>Bir yolculuk, bin yıllık bir hikâye.</span></div><nav><a href="/pogaca">Poğaça Frieren</a><a href="/komutlar">Komutlar</a><a href="/frieren-ai">Frieren AI</a><a href="/pazar">Kuzey Pazarı</a>' + guildLink + ownerLink + '</nav><small>© Frieren Platform · Developed by Soiree</small></footer></body></html>';
}
function home(client, user) {
  const ready = client?.isReady?.() === true;
  return page('Büyülü Ana Sayfa', '<main><section class="wrap home-banner" aria-label="Frieren site banner"><img src="/assets/site-banner.webp" alt="Poğaça Frieren — Sonsuz bir macera, unutulmaz bir yolculuk" fetchpriority="high" decoding="async" width="1000" height="353"></section><section class="wrap hero"><div><div class="eyebrow">✧ FANTASTİK BİR YOLCULUK BAŞLIYOR ✧</div><h1>Bin yıllık bir<br><em>büyü yolculuğu.</em></h1><p class="lead">Frieren evreninden ilham alan, keşiflerle dolu bir Discord RPG dünyası. Büyüler öğren, dostlar edin, zindanlara in ve kendi hikâyeni yaz.</p><div class="actions"><a class="btn" href="/pogaca">Poğaça Frieren’i keşfet ✧</a><a class="btn ghost" href="/frieren-ai">Frieren AI’ı tanı</a></div><p class="muted">Poğaça Frieren · ' + (ready ? 'Discord bağlantısı aktif' : 'Discord bağlantısı bekleniyor') + '</p></div><div class="hero-art"><img src="/assets/frieren.gif" alt="Frieren büyü yolculuğunda" fetchpriority="high" decoding="async" width="390" height="390"></div></section>' +
  '<section class="section"><div class="wrap"><div class="section-head"><div class="eyebrow">YOL ARKADAŞLARIN</div><h2>Bir evren, iki ayrı uzmanlık</h2><p>RPG macerası ve teknik zekâ aynı büyülü dünyada buluşuyor.</p></div><div class="grid"><article class="card"><div class="icon">✧</div><h3>Poğaça Frieren</h3><p>Karakter, büyü, zindan, boss, ekonomi, görevler ve anime eğlencesiyle dolu RPG botu.</p><a class="btn ghost" href="/pogaca">Macerayı keşfet →</a></article><article class="card"><div class="icon">⌘</div><h3>Frieren AI</h3><p>Hafıza, sohbet, kod denetimi, test senaryoları ve hata raporları için ayrı asistan.</p><a class="btn ghost" href="/frieren-ai">AI’ı tanı →</a></article><article class="card"><div class="icon">☾</div><h3>Kişisel alanın</h3><p>Frieren hesabınla giriş yaptığın kişisel alan ve sayfada seninle gezen minik Frieren.</p><a class="btn ghost" href="#profil">Profiline göz at →</a></article><article class="card"><div class="icon">♜</div><h3>Maceracı Loncası</h3><p>Discord hesabını bağla, yönetebildiğin sunucuları seç ve Frieren modüllerini düzenle.</p><a class="btn ghost" href="/lonca">Sunucu panelini aç →</a></article></div></div></section>' +
  '<section class="section"><div class="wrap split"><div class="profile"><div class="profile-banner"><img src="/assets/site-banner.webp" alt="Poğaça Frieren tanıtım bannerı" loading="lazy" decoding="async"></div><div class="profile-info"><img class="profile-avatar" src="/assets/site-avatar.webp" loading="lazy" decoding="async" alt="Frieren platform profil fotoğrafı"><div><h3>Poğaça Frieren</h3><p>✧ RPG · Anime · Büyü · Macera</p></div></div><div class="profile-body">Kendi hikâyeni yazacağın, arkadaşlarınla zindanlara gireceğin ve her gün yeni şeyler keşfedeceğin büyülü bir Discord yol arkadaşı.</div></div><div id="profil"><div class="eyebrow">BİRLİKTE BİRİKTİRİLEN HATIRALAR</div><h2>Her karede başka bir hikâye.</h2><p class="lead">Frieren’in yolculuğundan küçük anlar, yuvarlak GIF galerisi ve sayfanın etrafında dolaşan minik bir büyücü.</p><p class="muted">Hoş geldin, ' + esc(user.username || 'gezgin') + '. Frieren evrenindeki yolculuğuna buradan devam edebilirsin.</p></div></div></section>' +
  '<section class="section"><div class="wrap"><div class="section-head"><div class="eyebrow">BÜYÜLÜ ALBÜM</div><h2>Yolculuktan küçük anlar</h2><p>Yuvarlak GIF’ler; her biri ayrı bir karakter, ayrı bir anı.</p></div><div class="gif-gallery"><div class="gif-item"><img loading="lazy" decoding="async" src="/assets/frieren.gif" alt="Frieren GIF"><span>Frieren</span></div><div class="gif-item"><img loading="lazy" decoding="async" src="/assets/fern.gif" alt="Fern GIF"><span>Fern</span></div><div class="gif-item"><img loading="lazy" decoding="async" src="/assets/stark.gif" alt="Stark GIF"><span>Stark</span></div><div class="gif-item"><img loading="lazy" decoding="async" src="/assets/eisen.gif" alt="Eisen GIF"><span>Eisen</span></div><div class="gif-item"><img loading="lazy" decoding="async" src="/assets/himmel.gif" alt="Himmel GIF"><span>Himmel</span></div><div class="gif-item"><img loading="lazy" decoding="async" src="/assets/heiter.gif" alt="Heiter GIF"><span>Heiter</span></div><div class="gif-item"><img loading="lazy" decoding="async" src="/assets/macera.gif" alt="Macera GIF"><span>Macera</span></div><div class="gif-item"><img loading="lazy" decoding="async" src="/assets/profil.gif" alt="Profil GIF"><span>Karakter profili</span></div><div class="gif-item"><img loading="lazy" decoding="async" src="/assets/envanter.gif" alt="Envanter GIF"><span>Envanter</span></div><div class="gif-item"><img loading="lazy" decoding="async" src="/assets/buyusavasi.gif" alt="Büyü savaşı GIF"><span>Büyü savaşı</span></div><div class="gif-item"><img loading="lazy" decoding="async" src="/assets/buyusavasi_vurus.gif" alt="Büyü darbesi GIF"><span>Büyü darbesi</span></div><div class="gif-item"><img loading="lazy" decoding="async" src="/assets/buyusavasi_kazandi.gif" alt="Zafer GIF"><span>Zafer</span></div><div class="gif-item"><img loading="lazy" decoding="async" src="/assets/animequiz.gif" alt="Anime quiz GIF"><span>Anime zamanı</span></div><div class="gif-item"><img loading="lazy" decoding="async" src="/assets/quizdogru.gif" alt="Doğru cevap GIF"><span>Doğru cevap</span></div><div class="gif-item"><img loading="lazy" decoding="async" src="/assets/quizyanlis.gif" alt="Yanlış cevap GIF"><span>Yanlış cevap</span></div><div class="gif-item"><img loading="lazy" decoding="async" src="/assets/yardim.gif" alt="Yardım GIF"><span>Yardım</span></div></div></div></section>' +
  '<section class="section"><div class="wrap stats"><div class="stat"><b>' + (client?.guilds?.cache?.size ?? '—') + '</b><span>Bağlı sunucu</span></div><div class="stat"><b>' + (client?.commands?.size ?? '—') + '</b><span>Yüklenmiş komut</span></div><div class="stat"><b>2</b><span>Bağımsız bot</span></div><div class="stat"><b>' + (ready ? 'Aktif' : 'Kontrol') + '</b><span>Poğaça bağlantısı</span></div></div></section>' +
  '<section class="section"><div class="wrap cta"><h2>Birlikte maceraya çıkalım mı?</h2><p>Poğaça Frieren’i sunucuna davet et ve yolculuğu başlat.</p><a class="btn" href="/pogaca">Botu ve komutları keşfet ✧</a></div></section></main>', user);
}

function pogaca(client, user) {
  const invite = process.env.CLIENT_ID ? 'https://discord.com/oauth2/authorize?client_id=' + encodeURIComponent(process.env.CLIENT_ID) + '&permissions=274878221376&scope=bot%20applications.commands' : null;
  const commands = [['/yardim','Botun temel yardımını ve komut kategorilerini gösterir.'],['/karakter','RPG karakterini ve gelişim bilgilerini açar.'],['/bakiye','Cüzdanındaki oyun parasını görüntüler.'],['/market','Oyun içi eşyaları ve ekipmanları keşfetmeni sağlar.'],['/zindan','Zindan macerasına katılmanı sağlar.'],['/animequiz','Anime bilginle eğlenceli quizlere katıl.'],['/yoldas','Yoldaşını sahiplen, besle ve geliştir.'],['/balik','Kuzey Kıtası’nda balık tut ve koleksiyonunu tamamla.'],['/sera','Büyülü Sera’da tohum ek ve hasat yap.'],['/yaratik','Vahşi yaratıkları yakala ve arşivini genişlet.'],['/karakteristek','Hedeflediğin anime karakterlerini istek listene ekle.']];
  return page('Poğaça Frieren', '<main><section class="wrap" style="padding:60px 0 38px;text-align:center"><div class="eyebrow">EĞLENCE · RPG · FANTASTİK MACERA</div><h1 class="hero-title">Poğaça <em>Frieren</em></h1><p class="lead" style="margin:auto">Karakter oluştur, büyüler öğren, zindanlara in, bosslarla savaş ve kendi macera hikâyeni yaz.</p><div class="actions" style="justify-content:center"><a class="btn" href="' + (invite || '#komutlar') + '"' + (invite ? ' target="_blank" rel="noopener"' : '') + '>' + (invite ? 'Discord sunucuna ekle ↗' : 'Davet bağlantısı yapılandırılıyor') + '</a><a class="btn ghost" href="#komutlar">Komutları incele</a></div></section><section class="wrap split"><div class="visual"><img src="/assets/macera.gif" alt="RPG macerası"></div><div><div class="eyebrow">KENDİ HİKÂYENİ YAZ</div><h2>Yaşayan bir RPG dünyası.</h2><p class="lead">Kalıcı karakter verileri, ekipmanlar, envanter, görevler ve ilerleme sistemiyle her macera kaldığın yerden devam eder.</p><p class="muted">' + (client?.commands?.size ?? '—') + ' komut yüklenmiş · ' + (client?.isReady?.() ? 'Discord bağlantısı aktif' : 'Bağlantı kontrol ediliyor') + '</p></div></section><section class="section"><div class="wrap"><div class="section-head"><div class="eyebrow">MACERA SİSTEMLERİ</div><h2>Her adımda yeni keşif</h2></div><div class="grid"><article class="card"><div class="icon">⚔</div><h3>Karakter & sınıflar</h3><p>Seviye, XP, stat puanları, ekipman ve karakter gelişimi.</p></article><article class="card"><div class="icon">✧</div><h3>Büyü & yetenekler</h3><p>Büyü öğrenme, yetenek ağacı, ustalık ve mana yönetimi.</p></article><article class="card"><div class="icon">♜</div><h3>Zindan & boss</h3><p>Karşılaşmalar, boss savaşları, ödüller ve ilerleme.</p></article><article class="card"><div class="icon">◈</div><h3>Ekonomi & envanter</h3><p>Market, eşya, ekipman, takas ve para sistemi.</p></article><article class="card"><div class="icon">✦</div><h3>Görev & keşif</h3><p>Günlük görevler, maceralar ve başarımlar.</p></article><article class="card"><div class="icon">♧</div><h3>Anime & topluluk</h3><p>Anime quizleri, karakterler, koleksiyon ve eğlence.</p></article></div></div></section><section class="section" id="komutlar"><div class="wrap split"><div><div class="eyebrow">İLK ADIMLAR</div><h2>Başlamak çok kolay.</h2><p class="lead">Botu sunucuna ekledikten sonra temel komutlarla başlayabilirsin.</p>' + commands.map(([name,desc]) => '<div class="command"><code>' + name + '</code><span>' + desc + '</span></div>').join('') + '</div><div class="visual"><img src="/assets/yardim.gif" alt="Yardım ve komutlar"></div></div></section><section class="section"><div class="wrap cta"><h2>Sunucunda yeni bir macera başlat.</h2><p>Poğaça Frieren’i davet et, arkadaşlarını topla ve ilk zindana gir.</p><a class="btn" href="' + (invite || '#komutlar') + '"' + (invite ? ' target="_blank" rel="noopener"' : '') + '>Poğaça Frieren’i davet et ↗</a></div></section></main>', user);
}


function getPublicCommandCategory(name, description) {
  const value = (String(name || '') + ' ' + String(description || '')).normalize('NFKC').toLocaleLowerCase('tr');
  if (/anime|quiz|mimic|kimimben|hikaye|hikâye|sans|eğlence|eglence/.test(value)) return 'Anime & Eğlence';
  if (/bakiye|market|envanter|ekipman|takas|zanaat|hazine|koleksiyon|parçala|parcala/.test(value)) return 'Ekonomi & Koleksiyon';
  if (/büyü|buyu|yetenek|savaş|savas|iblis|mana|spell/.test(value)) return 'Büyü & Savaş';
  if (/karakter|macera|zindan|boss|görev|gorev|keşif|kesif|parti|ekip|başarım|basarim|seviye|liderlik|profil|yoldas|yoldaş|pet|companion|balik|balık|sera|farming|yaratik|yaratık|creature|wishlist/.test(value)) return 'RPG & Macera';
  return 'Diğer';
}

function commandCatalog(client, user) {
  const commands = [...(client?.commands?.values?.() || [])]
    .map(command => {
      const data = typeof command?.data?.toJSON === 'function' ? command.data.toJSON() : command?.data;
      if (!data?.name) return null;
      const description = String(data.description || 'Komut açıklaması henüz eklenmemiş.');
      return { name: String(data.name), description, category: getPublicCommandCategory(data.name, description) };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  const categories = [...new Set(commands.map(command => command.category))].sort((a, b) => a.localeCompare(b, 'tr'));
  const categoryOptions = ['<option value="all">Tüm kategoriler</option>', ...categories.map(category => '<option value="' + esc(category) + '">' + esc(category) + '</option>')].join('');
  const cards = commands.map(command => '<article class="command-card" data-name="' + esc((command.name + ' ' + command.description).toLocaleLowerCase('tr')) + '" data-category="' + esc(command.category) + '"><div class="command-card-top"><code>/' + esc(command.name) + '</code><span>' + esc(command.category) + '</span></div><p>' + esc(command.description) + '</p></article>').join('');
  const content = '<main><section class="wrap catalog-hero"><div class="eyebrow">✧ KOMUT ARŞİVİ · FRIEREN YOLCULUĞU ✧</div><h1 class="hero-title">Bütün <em>komutlar.</em></h1><p class="lead">Poğaça Frieren sunucunda kullanabileceğin komutları tek yerde keşfet. Arama yap, kategoriye göre filtrele ve yeni macerana hazırlan.</p><div class="catalog-count"><strong>' + commands.length + '</strong><span>yüklenmiş komut</span></div></section><section class="section"><div class="wrap"><div class="catalog-tools"><label class="sr-only" for="command-search">Komutlarda ara</label><input id="command-search" type="search" placeholder="Komut adı veya açıklamada ara…" autocomplete="off"><label class="sr-only" for="command-category">Kategori seç</label><select id="command-category">' + categoryOptions + '</select><span id="command-result-count" aria-live="polite">' + commands.length + '/' + commands.length + ' komut gösteriliyor</span></div><div class="command-catalog" id="command-catalog">' + (cards || '<p class="muted">Komut kataloğu şu anda yüklenemiyor.</p>') + '</div><p class="catalog-empty" id="command-empty" hidden>Bu aramayla eşleşen komut bulunamadı.</p></div></section><section class="section"><div class="wrap cta"><h2>Maceraya hazır mısın?</h2><p>Komutları Discord sunucunda kullanarak kendi hikâyeni oluştur.</p><a class="btn" href="/pogaca">Poğaça Frieren sayfasına dön</a></div></section></main><script>(()=>{const search=document.getElementById("command-search");const category=document.getElementById("command-category");const cards=[...document.querySelectorAll(".command-card")];const count=document.getElementById("command-result-count");const empty=document.getElementById("command-empty");const filter=()=>{const query=search.value.trim().toLocaleLowerCase("tr");let visible=0;for(const card of cards){const matchesText=card.dataset.name.includes(query);const matchesCategory=category.value==="all"||card.dataset.category===category.value;const show=matchesText&&matchesCategory;card.hidden=!show;if(show)visible++;}count.textContent=visible+" / "+cards.length+" komut gösteriliyor";empty.hidden=visible!==0;};search.addEventListener("input",filter);category.addEventListener("change",filter);})();</script>';
  return page('Komut Arşivi', content, user);
}

function adventurerPanel(user, data, status) {
  const notice = status === 'linked' ? '<p class="notice">Discord karakterin web hesabına bağlandı.</p>' :
    status === 'invalid' ? '<p class="notice">Bağlantı kodu geçersiz, süresi dolmuş veya daha önce kullanılmış.</p>' :
    status === 'joined' ? '<p class="notice">Etkinliğe katılımın kaydedildi.</p>' :
    status === 'left' ? '<p class="notice">Etkinlikten ayrıldın.</p>' :
    status === 'full' ? '<p class="notice">Etkinliğin katılımcı kapasitesi dolu.</p>' :
    status === 'already_joined' ? '<p class="notice">Bu etkinliğe zaten kayıtlısın.</p>' : '';
  const profiles = data.profiles.map(profile => {
    const hp = Math.max(0, Math.min(100, Number(profile.hp) / Math.max(1, Number(profile.max_hp)) * 100));
    const mana = Math.max(0, Math.min(100, Number(profile.mana) / Math.max(1, Number(profile.max_mana)) * 100));
    const guild = encodeURIComponent(profile.guild_id);
    return '<article class="card"><div class="eyebrow">SUNUCU · ' + esc(profile.guild_id) + '</div><h2>' + esc(profile.character_name || 'Maceracı') + '</h2><p>' + esc(profile.class_name) + ' · Seviye ' + Number(profile.level) + '</p><div class="stats"><span><b>' + Number(profile.xp) + '</b> XP</span><span><b>' + Number(profile.coins) + '</b> Altın</span><span><b>' + Number(profile.rating) + '</b> MMR</span></div><p>HP ' + Number(profile.hp) + '/' + Number(profile.max_hp) + '</p><div class="progress"><i style="width:' + hp.toFixed(1) + '%"></i></div><p>Mana ' + Number(profile.mana) + '/' + Number(profile.max_mana) + '</p><div class="progress"><i style="width:' + mana.toFixed(1) + '%"></i></div><p>' + esc(profile.season_name || 'Sezon başlamadı') + ' · ' + Number(profile.wins) + ' galibiyet / ' + Number(profile.losses) + ' mağlubiyet</p><div class="actions"><a class="btn ghost" href="/maceraci/envanter?guildId=' + guild + '">Envanterim</a><a class="btn ghost" href="/pazar?guildId=' + guild + '">Kuzey Pazarı</a></div></article>';
  }).join('');
  const events = data.events.map(event => {
    const action = event.joined ? 'leave' : 'join';
    const label = event.joined ? 'Katılımdan ayrıl' : 'Etkinliğe katıl';
    return '<article class="card"><div class="eyebrow">' + esc(event.event_type) + '</div><h3>' + esc(event.title) + '</h3><p>' + esc(event.description || 'Açıklama yok.') + '</p><p><b>' + esc(new Date(event.starts_at).toLocaleString('tr-TR', { dateStyle:'medium', timeStyle:'short', timeZone:'Europe/Istanbul' })) + '</b></p><p>' + Number(event.participants) + (event.max_participants ? '/' + Number(event.max_participants) : '') + ' katılımcı</p><form method="post" action="/maceraci/event"><input type="hidden" name="csrf" value="' + esc(createSiteCsrfToken(process.env.ADMIN_SESSION_SECRET)) + '"><input type="hidden" name="guildId" value="' + esc(event.guild_id) + '"><input type="hidden" name="eventId" value="' + esc(event.event_id) + '"><input type="hidden" name="action" value="' + action + '"><button class="btn ghost" type="submit">' + label + '</button></form></article>';
  }).join('');
  const empty = '<article class="card"><h2>Henüz bağlı karakter yok</h2><p>Discord sunucunda <b>/maceraci bagla</b> komutunu çalıştır. Sana özel, 10 dakika geçerli bağlantı kodunu buraya gir.</p></article>';
  const content = '<main class="wrap" style="padding:54px 0 80px"><div class="eyebrow">✧ FRIEREN ADVENTURER PORTAL ✧</div><h1 class="hero-title">Maceracı <em>Paneli</em></h1><p class="lead">Discord karakterlerinin ilerlemesi, arena sezonları ve yaklaşan topluluk etkinlikleri.</p>' + notice +
    '<section class="section"><div class="section-head"><h2>Karakterlerim</h2><p>Yalnızca tek kullanımlık Discord bağlantı koduyla bağlanan profiller gösterilir.</p></div><div class="grid">' + (profiles || empty) + '</div></section>' +
    '<section class="section"><div class="card"><h2>Discord karakterini bağla</h2><form method="post" action="/maceraci/link"><input type="hidden" name="csrf" value="' + esc(createSiteCsrfToken(process.env.ADMIN_SESSION_SECRET)) + '"><label for="link-token">Tek kullanımlık bağlantı kodu</label><input id="link-token" name="token" minlength="24" maxlength="80" autocomplete="one-time-code" required><button class="btn" type="submit">Karakteri bağla</button></form></div></section>' +
    '<section class="section"><div class="section-head"><h2>Etkinlik Takvimi</h2><p>Bağlı olduğun Discord sunucularındaki yaklaşan maceralar.</p></div><div class="grid">' + (events || '<article class="card"><p>Bağlı sunucularında yaklaşan etkinlik bulunmuyor.</p></article>') + '</div></section></main>' +
    '<style>.notice{padding:14px 18px;border:1px solid #7664a9;border-radius:14px;margin:18px 0}.progress{height:8px;border-radius:20px;background:#29263d;overflow:hidden}.progress i{display:block;height:100%;background:#9b83d7}.card form{display:grid;gap:12px}.card input,.card select{width:100%;padding:13px;border-radius:10px;border:1px solid #62577d;background:#17152c;color:#fff}.card label{font-weight:600}.portal-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}.market-price{font-size:1.2rem;font-weight:700;color:#d9c8ff}.market-meta{color:#b9b2d1;font-size:.92rem}.portal-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}</style>';
  return page('Maceracı Paneli', content, user);
}

function portalGuildPicker(user, profiles, route, title) {
  if (!profiles.length) return page(title, '<main class="wrap" style="padding:54px 0 80px"><h1 class="hero-title">Maceracı <em>bağlantısı gerekli</em></h1><article class="card"><p>Önce Discord sunucunda <b>/maceraci bagla</b> komutuyla karakterini web hesabına bağla.</p><a class="btn" href="/maceraci">Maceracı paneline dön</a></article></main>', user);
  const cards = profiles.map(profile => '<article class="card"><div class="eyebrow">' + esc(profile.guild_id) + '</div><h2>' + esc(profile.character_name || 'Maceracı') + '</h2><p>' + esc(profile.class_name) + ' · Seviye ' + Number(profile.level) + '</p><a class="btn" href="' + route + '?guildId=' + encodeURIComponent(profile.guild_id) + '">Bu sunucuyu seç</a></article>').join('');
  return page(title, '<main class="wrap" style="padding:54px 0 80px"><div class="eyebrow">✧ MACERACI LONCASI</div><h1 class="hero-title">Sunucunu <em>seç.</em></h1><p class="lead">İşlemler yalnızca Discord hesabına bağladığın karakterin bulunduğu sunucuda yapılır.</p><div class="portal-grid">' + cards + '</div></main>', user);
}

function adventurerInventoryPage(user, data) {
  const items = data.items.map(item => '<article class="card"><h3>' + esc(item.item_key) + '</h3><p>Adet: <b>' + Number(item.quantity) + '</b></p><p class="market-meta">' + (item.slot ? 'Takılı: ' + esc(({weapon:'Silah',armor:'Zırh',ring1:'Yüzük I',ring2:'Yüzük II'})[item.slot] || item.slot) : 'Envanter') + '</p></article>').join('');
  const guild = encodeURIComponent(data.profile.guild_id);
  const content = '<main class="wrap" style="padding:54px 0 80px"><div class="eyebrow">✧ MACERACI ÇANTASI</div><h1 class="hero-title">Envanter <em>' + esc(data.profile.character_name || 'Maceracı') + '</em></h1><p class="lead">Yalnızca bağladığın Discord karakterinin bu sunucudaki eşyaları görüntülenir.</p><div class="portal-actions"><a class="btn" href="/pazar?guildId=' + guild + '">Kuzey Pazarı</a><a class="btn ghost" href="/maceraci">Maceracı paneli</a></div><section class="section"><div class="portal-grid">' + (items || '<article class="card"><p>Envanterinde henüz eşya yok.</p></article>') + '</div></section></main>';
  return page('Maceracı Envanteri', content, user);
}

function playerMarketPage(user, data, listings, history, status) {
  const notices = {listed:'İlanın oluşturuldu; eşya emanet kasasına alındı.',purchased:'Satın alma tamamlandı; altın ve eşya aynı işlemde aktarıldı.',cancelled:'İlan iptal edildi; eşyan envanterine geri döndü.',unavailable:'İlan artık kullanılamıyor.',insufficient_funds:'Bu ilan için yeterli altının yok.',insufficient_items:'Satış için yeterli eşyan yok.',equipped_item:'Takılı ekipman pazara konulamaz.',listing_limit:'En fazla 10 aktif ilan açabilirsin.',self_purchase:'Kendi ilanını satın alamazsın.',not_owner:'Yalnızca kendi ilanını iptal edebilirsin.',invalid:'Gönderilen bilgiler geçersiz.'};
  const guild = encodeURIComponent(data.profile.guild_id);
  const csrf = esc(createSiteCsrfToken(process.env.ADMIN_SESSION_SECRET));
  const ownItems = data.items.filter(item => Number(item.quantity) > 0);
  const options = ownItems.map(item => '<option value="' + esc(item.item_key) + '">' + esc(item.item_key) + ' · ' + Number(item.quantity) + ' adet</option>').join('');
  const active = listings.map(item => {
    const own = String(item.seller_id) === String(data.profile.user_id);
    const action = own
      ? '<form method="post" action="/pazar/iptal"><input type="hidden" name="csrf" value="' + csrf + '"><input type="hidden" name="guildId" value="' + guild + '"><input type="hidden" name="listingId" value="' + esc(item.listing_id) + '"><button class="btn ghost" type="submit">İlanı iptal et</button></form>'
      : '<form method="post" action="/pazar/al"><input type="hidden" name="csrf" value="' + csrf + '"><input type="hidden" name="guildId" value="' + guild + '"><input type="hidden" name="listingId" value="' + esc(item.listing_id) + '"><button class="btn" type="submit">Satın al</button></form>';
    return '<article class="card"><div class="eyebrow">' + (own ? 'SENİN İLANIN' : 'KUZEY PAZARI') + '</div><h3>' + esc(item.item_key) + ' ×' + Number(item.quantity) + '</h3><p class="market-price">' + Number(item.price_coins).toLocaleString('tr-TR') + ' altın</p><p class="market-meta">' + esc(new Date(item.created_at).toLocaleString('tr-TR',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Istanbul'})) + '</p>' + action + '</article>';
  }).join('');
  const historyCards = history.map(item => '<article class="card"><h3>' + esc(item.item_key) + ' ×' + Number(item.quantity) + '</h3><p>' + Number(item.price_coins).toLocaleString('tr-TR') + ' altın · ' + (item.status === 'sold' ? 'Satıldı' : item.status === 'cancelled' ? 'İptal edildi' : 'Aktif') + '</p></article>').join('');
  const sellForm = '<article class="card"><h2>Eşyanı satışa çıkar</h2><form method="post" action="/pazar/sat"><input type="hidden" name="csrf" value="' + csrf + '"><input type="hidden" name="guildId" value="' + guild + '"><label for="market-item">Eşya</label><select id="market-item" name="itemKey" required>' + (options || '<option value="">Satılabilir eşya yok</option>') + '</select><label for="market-quantity">Adet</label><input id="market-quantity" type="number" name="quantity" min="1" max="1000" value="1" required><label for="market-price">Toplam fiyat (altın)</label><input id="market-price" type="number" name="priceCoins" min="1" max="1000000" required><button class="btn" type="submit"' + (options ? '' : ' disabled') + '>Emanet kasasına koy ve ilan aç</button></form><p class="market-meta">İlan açıldığında eşya emanet kasasına taşınır. Satış veya iptal tamamlanana kadar envanterinde harcanamaz.</p></article>';
  const content = '<main class="wrap" style="padding:54px 0 80px"><div class="eyebrow">✧ KUZEY PAZARI</div><h1 class="hero-title">Maceracı <em>pazarı.</em></h1><p class="lead">' + esc(data.profile.character_name || 'Maceracı') + ' · ' + Number(data.profile.coins) + ' altın · Bu pazar yalnızca seçili Discord sunucusuna aittir.</p>' + (notices[status] ? '<p class="notice" role="status">' + notices[status] + '</p>' : '') + '<div class="portal-actions"><a class="btn ghost" href="/maceraci/envanter?guildId=' + guild + '">Envanterim</a><a class="btn ghost" href="/maceraci">Maceracı paneli</a></div><section class="section"><div class="portal-grid">' + sellForm + '</div></section><section class="section"><div class="section-head"><h2>Aktif ilanlar</h2><p>Fiyatı düşük olan ilanlar önce gösterilir. Satın alma atomik olarak tamamlanır.</p></div><div class="portal-grid">' + (active || '<article class="card"><p>Şu anda aktif ilan yok.</p></article>') + '</div></section><section class="section"><div class="section-head"><h2>İşlem geçmişim</h2></div><div class="portal-grid">' + (historyCards || '<article class="card"><p>Henüz pazar işlemin yok.</p></article>') + '</div></section></main>';
  return page('Kuzey Pazarı', content, user);
}

function aiPage(user) {
  const healthLink = user.id === OWNER_ID ? '<a class="btn ghost" href="/owner/frieren-ai/health">Servis sağlık durumu</a>' : '';
  return page('Frieren AI', '<main><section class="wrap" style="padding:65px 0 42px;text-align:center"><div class="eyebrow">AKILLI ASİSTAN · TEST · TEKNİK ANALİZ</div><h1 class="hero-title">Frieren <em>AI</em></h1><p class="lead" style="margin:auto">Poğaça Frieren’in teknik yol arkadaşı. Sohbet ve hafızadan kod denetimine, test senaryolarından hata raporlarına uzanan ayrı bir AI servisi.</p><div class="actions" style="justify-content:center"><a class="btn" href="/owner">AI kontrol merkezine git ↗</a>' + healthLink + '</div></section><section class="section"><div class="wrap grid"><article class="card"><div class="icon">✧</div><h3>Frieren sohbeti</h3><p>Karakter odaklı sohbet akışı ve izinli kullanıcı hafızası.</p></article><article class="card"><div class="icon">⌘</div><h3>Teknik denetim</h3><p>Komut sözleşmeleri, kod incelemesi ve hata teşhisi.</p></article><article class="card"><div class="icon">✓</div><h3>Test sistemi</h3><p>Senaryo bazlı testler, PASS/FAIL raporları ve kanıt odaklı doğrulama.</p></article></div></section><section class="section"><div class="wrap cta"><h2>İki bot, tek büyülü platform.</h2><p>RPG macerası ve teknik asistan birbirinden bağımsız servislerde çalışır.</p><a class="btn" href="/pogaca">Poğaça Frieren’i keşfet</a></div></section></main>', user);
}

export async function handlePublicSiteRequest(req, res, { client, db } = {}) {
  if (await handleGuildDashboardRequest(req, res, { client, db })) return true;
  const authHandled = await handleSiteAuthRequest(req, res, { db, sessionSecret: process.env.ADMIN_SESSION_SECRET, createSession: createPublicSiteSession });
  if (authHandled) return true;
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'POST' && url.pathname === '/maceraci/link') {
    const session = readPublicSiteSession(cookies(req)[SITE_COOKIE], process.env.ADMIN_SESSION_SECRET);
    if (!session?.id?.startsWith('site_')) {
      res.writeHead(302, { Location: '/login', 'Cache-Control': 'no-store' }); res.end(); return true;
    }
    if (!db) { res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }); res.end('Panel veritabanı kullanılamıyor.'); return true; }
    if (!String(req.headers['content-type'] || '').toLowerCase().includes('application/x-www-form-urlencoded')) { res.writeHead(415, { 'Cache-Control': 'no-store' }); res.end('Form biçimi geçersiz.'); return true; }
    let size = 0; const chunks = [];
    for await (const chunk of req) { size += chunk.length; if (size > 4096) { res.writeHead(413); res.end('Form çok büyük.'); return true; } chunks.push(chunk); }
    const form = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
    if (!verifySiteCsrfToken(form.get('csrf'), process.env.ADMIN_SESSION_SECRET)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }); res.end('Güvenlik doğrulaması başarısız. Sayfayı yenile.'); return true;
    }
    const result = await redeemSiteLinkToken(db, session.id, form.get('token'));
    res.writeHead(303, { Location: '/maceraci?status=' + (result.status === 'linked' ? 'linked' : 'invalid'), 'Cache-Control': 'no-store' }); res.end(); return true;
  }
  const mutationPaths = new Set(['/maceraci/event','/pazar/sat','/pazar/al','/pazar/iptal']);
  if (req.method === 'POST' && mutationPaths.has(url.pathname)) {
    const session=readPublicSiteSession(cookies(req)[SITE_COOKIE],process.env.ADMIN_SESSION_SECRET);
    if(!session?.id?.startsWith('site_')) { res.writeHead(302,{Location:'/login','Cache-Control':'no-store'});res.end();return true; }
    if(!db) { res.writeHead(503,{'Cache-Control':'no-store'});res.end('Panel veritabanı kullanılamıyor.');return true; }
    if(!String(req.headers['content-type']||'').toLowerCase().includes('application/x-www-form-urlencoded')) { res.writeHead(415,{'Cache-Control':'no-store'});res.end('Form biçimi geçersiz.');return true; }
    let size=0;const chunks=[];
    for await(const chunk of req){size+=chunk.length;if(size>4096){res.writeHead(413,{'Cache-Control':'no-store'});res.end('Form çok büyük.');return true;}chunks.push(chunk);}
    const form=new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
    if(!verifySiteCsrfToken(form.get('csrf'),process.env.ADMIN_SESSION_SECRET)){res.writeHead(403,{'Cache-Control':'no-store'});res.end('Güvenlik doğrulaması başarısız. Sayfayı yenile.');return true;}
    const guildId=String(form.get('guildId')||'');
    if(!/^\d{17,20}$/.test(guildId)){res.writeHead(400,{'Cache-Control':'no-store'});res.end('Sunucu seçimi geçersiz.');return true;}
    const profile=await getLinkedAdventurer(db,session.id,guildId);
    if(!profile){res.writeHead(403,{'Cache-Control':'no-store'});res.end('Bu sunucudaki karakter web hesabına bağlı değil.');return true;}
    let status='invalid';
    if(url.pathname==='/maceraci/event'){
      const eventId=String(form.get('eventId')||'');const action=String(form.get('action')||'');
      if(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(eventId)){
        if(action==='join') status=(await joinGuildEvent(db,{guildId,eventId,userId:profile.user_id})).status;
        else if(action==='leave') status=(await leaveGuildEvent(db,{guildId,eventId,userId:profile.user_id})).removed?'left':'unavailable';
      }
      res.writeHead(303,{Location:'/maceraci?'+new URLSearchParams({status}).toString(),'Cache-Control':'no-store'});res.end();return true;
    }
    try{
      if(url.pathname==='/pazar/sat') status=(await createPlayerMarketListing(db,{guildId,sellerId:profile.user_id,itemKey:form.get('itemKey'),quantity:Number(form.get('quantity')),priceCoins:Number(form.get('priceCoins'))})).status;
      else if(url.pathname==='/pazar/al') status=(await buyPlayerMarketListing(db,{guildId,buyerId:profile.user_id,listingId:form.get('listingId')})).status;
      else if(url.pathname==='/pazar/iptal') status=(await cancelPlayerMarketListing(db,{guildId,sellerId:profile.user_id,listingId:form.get('listingId')})).status;
    }catch(error){if(String(error?.message||'').endsWith('_INVALID'))status='invalid';else throw error;}
    res.writeHead(303,{Location:'/pazar?'+new URLSearchParams({guildId,status}).toString(),'Cache-Control':'no-store'});res.end();return true;
  }
  if (req.method !== 'GET') return false;
  const cookie = cookies(req);
  if (url.pathname === '/owner' || url.pathname.startsWith('/owner/')) return false;
  if (assets.has(url.pathname) && ['site-avatar.svg', 'site-avatar.webp', 'site-shortcut.svg', 'site.webmanifest', 'site-banner.svg', 'site-banner.webp', 'site.css', 'owner.css'].includes(assets.get(url.pathname))) {
    try {
      const file = assets.get(url.pathname);
      const data = await readFile(new URL('./' + file, import.meta.url));
      res.writeHead(200, { 'Content-Type': file.endsWith('.webmanifest') ? 'application/manifest+json; charset=utf-8' : file.endsWith('.css') ? 'text/css; charset=utf-8' : file.endsWith('.webp') ? 'image/webp' : 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public,max-age=86400', 'X-Content-Type-Options': 'nosniff' });
      res.end(data);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Asset bulunamadı.');
    }
    return true;
  }
  const publicPaths = new Set(['/', '/pogaca', '/komutlar', '/frieren-ai', '/maceraci', '/maceraci/envanter', '/pazar']);
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
      const contentType = file.endsWith('.svg') ? 'image/svg+xml; charset=utf-8' : file.endsWith('.css') ? 'text/css; charset=utf-8' : file.endsWith('.webp') ? 'image/webp' : 'image/gif';
      res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'private,max-age=86400', 'X-Content-Type-Options': 'nosniff' });
      res.end(data);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Asset bulunamadı.');
    }
    return true;
  }
  if (url.pathname === '/maceraci') {
    if (!db) { res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }); res.end('Panel veritabanı kullanılamıyor.'); return true; }
    const data = await getAdventurerDashboard(db, user.id);
    const html = adventurerPanel(user, data, url.searchParams.get('status'));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Content-Security-Policy': "default-src 'self'; img-src 'self' data: https://cdn.discordapp.com; style-src 'self' 'unsafe-inline'; script-src 'unsafe-inline'; form-action 'self'; base-uri 'self'; frame-ancestors 'self'" });
    res.end(html); return true;
  }
  if (url.pathname === '/maceraci/envanter' || url.pathname === '/pazar') {
    if (!db) { res.writeHead(503, { 'Content-Type':'text/plain; charset=utf-8', 'Cache-Control':'no-store' }); res.end('Panel veritabanı kullanılamıyor.'); return true; }
    const guildId=String(url.searchParams.get('guildId')||'');
    if(!guildId){
      const dashboard=await getAdventurerDashboard(db,user.id);
      const html=portalGuildPicker(user,dashboard.profiles,url.pathname,'Sunucu seçimi');
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Content-Security-Policy':"default-src 'self'; img-src 'self' data: https://cdn.discordapp.com; style-src 'self' 'unsafe-inline'; form-action 'self'; base-uri 'self'; frame-ancestors 'self'"});
      res.end(html);return true;
    }
    if(!/^\d{17,20}$/.test(guildId)){res.writeHead(400,{'Cache-Control':'no-store'});res.end('Sunucu seçimi geçersiz.');return true;}
    const data=await getAdventurerInventory(db,user.id,guildId);
    if(!data){res.writeHead(403,{'Cache-Control':'no-store'});res.end('Bu sunucudaki karakter web hesabına bağlı değil.');return true;}
    const html=url.pathname==='/pazar'
      ?playerMarketPage(user,data,await listPlayerMarketListings(db,guildId,20),await getPlayerMarketHistory(db,guildId,data.profile.user_id,15),url.searchParams.get('status'))
      :adventurerInventoryPage(user,data);
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Content-Security-Policy':"default-src 'self'; img-src 'self' data: https://cdn.discordapp.com; style-src 'self' 'unsafe-inline'; form-action 'self'; base-uri 'self'; frame-ancestors 'self'"});
    res.end(html);return true;
  }
  const routes = new Map([['/', () => home(client, user)], ['/pogaca', () => pogaca(client, user)], ['/komutlar', () => commandCatalog(client, user)], ['/frieren-ai', () => aiPage(user)]]);
  const render = routes.get(url.pathname);
  if (!render) return false;
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Content-Security-Policy': "default-src 'self'; img-src 'self' data: https://cdn.discordapp.com; style-src 'self' 'unsafe-inline'; script-src 'unsafe-inline'; form-action 'self'; base-uri 'self'; frame-ancestors 'self'" });
  res.end(render());
  return true;
}
