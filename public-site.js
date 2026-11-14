
import { readFile } from 'node:fs/promises';
import { termsPage, privacyPage } from './legal-pages.js';
import { PermissionFlagsBits } from 'discord.js';
import { getCompanion } from './companions.js';
import { getFishCollection } from './fishing.js';
import { getFarmPlot } from './farming.js';
import { getCreatureCollection, getCreatureWishlist } from './creatures.js';
import { getCharacterWishlist } from './character-wishlist.js';
import { characters as ANIME_CHARACTERS } from './character-data.js';
import { spellDetails as RPG_SPELL_DETAILS } from './rpg-spell-catalog.js';
import { readPublicSiteSession, createPublicSiteSession } from './owner-dashboard.js';
import { saveProfileMedia, getProfileMedia, deleteProfileMedia, ensureProfileMediaSchema } from './profile-media.js';
import { handleSiteAuthRequest, createSiteCsrfToken, verifySiteCsrfToken, ensureSiteAccountSchema } from './site-auth.js';
import {
  redeemSiteLinkToken, getAdventurerDashboard, getLinkedAdventurer, getAdventurerInventory,
  joinGuildEvent, leaveGuildEvent
} from './adventurer-platform.js';
import { handleGuildDashboardRequest } from './guild-dashboard.js';
import {
  createPlayerMarketListing, listPlayerMarketListings, buyPlayerMarketListing,
  cancelPlayerMarketListing, getPlayerMarketHistory, createPlayerMarketOffer,
  resolvePlayerMarketOffer, cancelPlayerMarketOffer, getPlayerMarketOffers,
  createPlayerMarketPriceAlert, listPlayerMarketPriceAlerts, cancelPlayerMarketPriceAlert
} from './player-market.js';
import { ensureSocialPlatformTables, createFriendRequest, respondFriendRequest, setPlayerRival, removeSocialRelationship, listSocialRelationships, listPendingFriendRequests, sendCoinGift, commendPlayer, getSocialReputation, blockSocialPlayer, unblockSocialPlayer } from './social-platform.js';
import { getGuildFeatureEnabled } from './guild-feature-settings.js';
import { createSupportTicket, listSupportTickets, listSupportTicketMessages, replySupportTicket, exportSiteAccountData, deleteSiteAccount } from './account-center.js';
import { getNotificationPreferences, setNotificationPreference } from './news-birds.js';
import { levelForXp, xpForNextLevel } from './utils.js';
import { listPublicChatMessages, sendPublicChatMessage, togglePublicChatReaction, blockPublicChatUser, unblockPublicChatUser, listPublicChatBlocks, deletePublicChatMessage, deleteOwnPublicChatMessage, updatePublicChatMessage, togglePublicChatPin, touchPublicChatPresence, getPublicChatPresence, setPublicChatTyping, markPublicChatMessagesRead, reportPublicChatMessage, listPublicChatReports, resolvePublicChatReport, getPublicChatControl, setPublicChatPaused } from './public-chat.js';
import { getAccountProfile, updateAccountProfile, followAccount, unfollowAccount, recordAccountProfileVisit, listAccountProfileActivity, sendAccountFriendRequest, respondAccountFriendRequest, listAccountFriends, getAccountIdByProfileSlug, listAccountNotifications, markAccountNotificationsRead } from './account-profile.js';
import { sendSiteDirectMessage, listSiteDirectMessages, markSiteDirectMessagesRead, createSiteDmGroup, listSiteDmGroups, sendSiteDmGroupMessage, listSiteDmGroupMessages, markSiteDmGroupMessagesRead, leaveSiteDmGroup, canSiteDmAccountsMessage, isSiteDmGroupMember } from './site-direct-messages.js';
import { subscribeChatEvents, publishChatEvent } from './chat-realtime.js';
import { uploadChatMedia, discardChatMedia } from './chat-media.js';
import { ensurePersonalCenterSchema, getPersonalProfile, updatePersonalProfile, listDirectMessages, listMessageThreads, markDirectMessagesRead, sendDirectMessage, listGuestbookEntries, addGuestbookEntry, deleteGuestbookEntry, reportPlayer, createPlannerEntry, listPlannerEntries, updatePlannerEntry, deletePlannerEntry, getPersonalProgressReport, discoverPlayers, recommendPlayers, setCloseFriend, removeCloseFriend, listCloseFriends, recordProfileVisit, listProfileVisits } from './personal-center.js';
import { achievements as RPG_ACHIEVEMENTS } from './basarimlar.js';
import { JOURNAL_COLLECTIONS, getJournalCollectionProgress } from './gameplay-depth.js';
import { getJournalEntries, getClaimedJournalCollections } from './gameplay-journal.js';
import { buildExplorationMapContent } from './exploration-map-content.js';
import { renderExplorationAtlas } from './exploration-atlas.js';
import { DEFAULT_DUNGEON_TIERS, DEFAULT_SOLO_BOSSES, DEFAULT_RAID_BOSSES } from './rpg-content-catalog.js';
import { getGuildRpgContent } from './owner-rpg-content.js';
import { DEFAULT_DAILY_QUESTS, getDailyQuestObjectiveSql } from './owner-rpg-quests.js';
import { listCardVariants } from './card-variants.js';
import { listGuildEmbedTemplates, listGuildCustomCommands, listGuildSpellAutomations, saveGuildEmbedTemplate, saveGuildCustomCommand, saveGuildSpellAutomation } from './guild-workshop.js';
import { HOME_ROOMS, HOME_DECORATIONS, HOME_STATIONS, ALCHEMY_RECIPES, PLAYER_COSMETICS, getPlayerHome, unlockHomeRoom, saveHomeLayout, purchaseCosmetic, equipCosmetic, saveCosmeticPreset, applyCosmeticPreset, checkInGuildEvent, getCosmeticAcquisitionHistory, getHomeTrophies, placeHomeTrophy, setHomeVisibility, getPublicPlayerHome, brewHomePotion, claimEventMilestone, getPlayerProfileSettings, setPlayerProfileSettings } from './player-experience.js';

const SITE_COOKIE = 'frieren_site_session';
const siteSocialSchemaReady=new WeakMap();
async function ensureSiteSocialSchema(db){let pending=siteSocialSchemaReady.get(db);if(!pending){pending=ensureSocialPlatformTables(db);siteSocialSchemaReady.set(db,pending);}try{await pending;}catch(error){siteSocialSchemaReady.delete(db);throw error;}}
const SITE_ACCOUNT_ID = /^site_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OWNER_ID = '1553794496234262641';
const assets = new Map([
  ...['animequiz.gif','buyusavasi.gif','buyusavasi_kazandi.gif','buyusavasi_vurus.gif','eisen.gif','envanter.gif','fern.gif','frieren.gif','heiter.gif','himmel.gif','macera.gif','profil.gif','quizdogru.gif','quizyanlis.gif','stark.gif','yardim.gif','site-avatar.svg','site-avatar.webp','site-shortcut.svg','site-banner.svg','site-banner.webp','site-profile-banner.svg','site.css','owner.css'].map(file => ['/assets/' + file, file])
]);
assets.set('/assets/frieren-world-map.svg', 'public-assets/frieren-world-map.svg');
assets.set('/assets/embed-preview.js', 'public-assets/embed-preview.js');
assets.set('/assets/market-preview.js', 'public-assets/market-preview.js');
assets.set('/assets/site-navigation.js', 'public-assets/site-navigation.js');
assets.set('/assets/site-actions.js', 'public-assets/site-actions.js');
assets.set('/assets/profile-interactions.js', 'public-assets/profile-interactions.js');
assets.set('/assets/character-encyclopedia.js', 'public-assets/character-encyclopedia.js');
assets.set('/assets/theme-gallery.js', 'public-assets/theme-gallery.js');
assets.set('/assets/accessibility-controls.js', 'public-assets/accessibility-controls.js');
assets.set('/assets/spellbook-controls.js', 'public-assets/spellbook-controls.js');
assets.set('/assets/exploration-atlas.js', 'public-assets/exploration-atlas.js');
assets.set('/assets/profile-media.js', 'public-assets/profile-media.js');
assets.set('/assets/user-center.js', 'public-assets/user-center.js');
assets.set('/assets/public-chat.js', 'public-assets/public-chat.js');
assets.set('/site.webmanifest', 'site.webmanifest');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function cookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '').split(';').map(part => {
    const i = part.indexOf('=');
    if (i < 0) return ['', ''];
    try { return [part.slice(0, i).trim(), decodeURIComponent(part.slice(i + 1).trim())]; } catch { return ['', '']; }
  }).filter(([key]) => key));
}

async function enrichSiteUser(db,client,user) {
  if(!user||!SITE_ACCOUNT_ID.test(String(user.id||''))||!db)return user;
  const enriched={...user};
  try {
    const linked=await db.query('SELECT user_id FROM site_discord_links WHERE account_id=$1 LIMIT 1',[user.id.slice(5)]);
    const discordId=String(linked.rows?.[0]?.user_id||'');
    enriched.isOwner=discordId===OWNER_ID||isOwnerSiteAccount(user);
    enriched.isOwnerDiscordLinked=discordId===OWNER_ID;
    if(/^\d{17,20}$/.test(discordId)&&client?.users?.fetch){
      try { const discordUser=client.users.cache?.get(discordId)||await client.users.fetch(discordId); const avatar=discordUser?.displayAvatarURL?.({extension:'webp',size:256}); if(avatar){enriched.discordAvatarUrl=avatar;enriched.avatarUrl=avatar;} } catch {}
    }
  } catch {}
  try {
    const custom=await db.query("SELECT 1 FROM frieren_profile_media WHERE account_id=$1 AND media_kind='avatar' LIMIT 1",[user.id.slice(5)]);
    if(custom.rowCount)enriched.avatarUrl='/profil/media?kind=avatar';
  } catch {}
  return enriched;
}

function requireSiteAccount(res, accountId) {
  if (SITE_ACCOUNT_ID.test(String(accountId || ''))) return true;
  res.writeHead(302, { Location: '/login?status=site_account_required', 'Cache-Control': 'no-store' });
  res.end();
  return false;
}


function isVipSiteAccount(user) {
  const accountId = String(user?.id || '');
  if (!SITE_ACCOUNT_ID.test(accountId)) return false;
  const normalized = accountId.replace(/^site_/i, '').toLowerCase();
  const allowed = new Set(String(process.env.FRIEREN_VIP_ACCOUNT_IDS || '').split(',').map(value => value.trim().replace(/^site_/i, '').toLowerCase()).filter(value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)));
  return allowed.has(normalized);
}

function isOwnerSiteAccount(user) {
  if(user?.isOwner===true)return true;
  const accountId = String(user?.id || '');
  if (!SITE_ACCOUNT_ID.test(accountId)) return false;
  const normalized = accountId.replace(/^site_/i, '').toLowerCase();
  const allowed = new Set(String(process.env.FRIEREN_OWNER_ACCOUNT_IDS || '').split(',').map(value => value.trim().replace(/^site_/i, '').toLowerCase()).filter(value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)));
  return allowed.has(normalized);
}

async function isLinkedOwnerSiteAccount(db,user){if(isOwnerSiteAccount(user))return true;const id=String(user?.id||'');if(!SITE_ACCOUNT_ID.test(id)||!db)return false;const r=await db.query('SELECT 1 FROM site_discord_links WHERE account_id=$1 AND user_id=$2 LIMIT 1',[id.slice(5),OWNER_ID]);return Boolean(r.rowCount);}

function playerXpProgress(profile, isVip = false, isOwner = false) {
  const xp = Math.max(0, Number.isFinite(Number(profile?.xp)) ? Math.floor(Number(profile.xp)) : 0);
  const level = levelForXp(xp);
  const currentLevelXp = xpForNextLevel(level - 1);
  const nextLevelXp = xpForNextLevel(level);
  const progress = Math.max(0, Math.min(100, ((xp - currentLevelXp) / Math.max(1, nextLevelXp - currentLevelXp)) * 100));
  const safeXp = xp.toLocaleString('tr-TR');
  const safeCurrent = Math.max(0, xp - currentLevelXp).toLocaleString('tr-TR');
  const safeRequired = Math.max(1, nextLevelXp - currentLevelXp).toLocaleString('tr-TR');
  return '<div class="xp-progress' + (isOwner ? ' is-owner' : isVip ? ' is-vip' : '') + '" role="group" aria-label="Seviye ' + level + ' XP ilerlemesi">' +
    '<div class="xp-progress-label"><span>Seviye ' + level + ' · ' + safeXp + ' toplam XP</span><span>' + Math.round(progress) + '%</span></div>' +
    '<div class="xp-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(progress) + '"><i style="width:' + progress.toFixed(2) + '%"></i></div>' +
    '<small>' + safeCurrent + ' / ' + safeRequired + ' XP · sonraki seviye</small></div>';
}

function page(title, content, user, seo = {}) {
  const description = seo.description || 'Frieren evreninde büyülü bir Discord RPG yolculuğu.';
  const robots = seo.indexable ? 'index,follow' : 'noindex,nofollow';
  const shareImage = seo.image || 'https://frierenbot.vercel.app/assets/site-banner.webp';
  const seoTags = seo.canonical
    ? '<link rel="canonical" href="' + esc(seo.canonical) + '"><meta property="og:type" content="website"><meta property="og:site_name" content="Poğaça Frieren"><meta property="og:locale" content="tr_TR"><meta property="og:title" content="' + esc(title) + '"><meta property="og:description" content="' + esc(description) + '"><meta property="og:url" content="' + esc(seo.canonical) + '"><meta property="og:image" content="' + esc(shareImage) + '"><meta property="og:image:secure_url" content="' + esc(shareImage) + '"><meta property="og:image:alt" content="Poğaça Frieren — Frieren temalı fantastik Discord RPG"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="' + esc(title) + '"><meta name="twitter:description" content="' + esc(description) + '"><meta name="twitter:image" content="' + esc(shareImage) + '">'
    : '';
  const structuredData = seo.structuredData
    ? '<script type="application/ld+json">' + JSON.stringify(seo.structuredData).replace(/</g, '\\u003c') + '</script>'
    : '';
  const avatar = user.avatarUrl || '/assets/site-avatar.webp';
  const owner = isOwnerSiteAccount(user);
  const vip = !owner && isVipSiteAccount(user);
  const accountProfile = Array.isArray(user.playerProfiles) ? user.playerProfiles[0] : null;
  const accountCard = '<section class="site-account-card' + (owner ? ' is-owner' : vip ? ' is-vip' : '') + '" aria-label="Kullanıcı hesabı">' +
    '<img src="' + esc(avatar) + '" alt="">' +
    '<div class="site-account-copy"><strong>' + esc(user.username || 'Gezgin') + (owner ? ' <span class="site-owner-badge">OWNER</span>' : vip ? ' <span class="site-vip-badge">VIP</span>' : '') + '</strong>' +
    '<small>' + (owner ? 'Owner hesabı' : accountProfile ? esc(accountProfile.character_name || 'Maceracı') + ' · Seviye ' + levelForXp(accountProfile.xp) : 'Frieren hesabı') + '</small>' +
    (accountProfile ? playerXpProgress(accountProfile, vip, owner) : '') + '</div></section>';
  const mainContent = String(content).replace('<main', '<main id="main-content"');
  const accessibilityPanel = '<details class="accessibility-panel" data-accessibility-panel><summary>Görünüm ve erişilebilirlik</summary><div class="accessibility-panel-content"><fieldset><legend>Yazı boyutu</legend><div class="accessibility-options"><button type="button" data-accessibility-font="normal" aria-pressed="true">Normal</button><button type="button" data-accessibility-font="large" aria-pressed="false">Büyük</button><button type="button" data-accessibility-font="x-large" aria-pressed="false">Çok büyük</button></div></fieldset><fieldset><legend>Kontrast</legend><button type="button" data-accessibility-contrast="high" aria-pressed="false">Yüksek kontrastı aç</button></fieldset><fieldset><legend>Hareket</legend><button type="button" data-accessibility-motion="reduce" aria-pressed="false">Animasyonları azalt</button></fieldset><p class="accessibility-panel-status" data-accessibility-status role="status" aria-live="polite">Görünüm tercihleri bu tarayıcıda saklanır.</p></div></details>';
  const ownerLink = user.isOwnerDiscordLinked === true || user.id === OWNER_ID ? '<a href="/owner">Owner Panel</a>' : '';
  const guildLink = '<a href="/lonca">Maceracı Loncası</a>';
  const navLink = (path, icon, label, hint) => '<a class="site-nav-link" data-nav-path="' + path + '" href="' + path + '"><span class="site-nav-icon" aria-hidden="true">' + icon + '</span><span class="site-nav-copy"><strong>' + esc(label) + '</strong><small>' + esc(hint) + '</small></span><span class="site-nav-arrow" aria-hidden="true">↗</span></a>';
  const navGroup = (id, title, links) => '<section class="site-nav-group" data-nav-group="' + id + '"><h2>' + title + '</h2>' + links.join('') + '</section>';
  const sidebar = '<button class="site-menu-toggle" id="site-menu-toggle" type="button" aria-controls="site-sidebar" aria-expanded="false" aria-label="Menüyü aç"><svg class="site-menu-dots" viewBox="0 0 24 24" focusable="false" aria-hidden="true"><circle cx="5" cy="12" r="1.7"></circle><circle cx="12" cy="12" r="1.7"></circle><circle cx="19" cy="12" r="1.7"></circle></svg></button>' +
    '<aside class="site-sidebar" id="site-sidebar" aria-label="Frieren ana menüsü" hidden>' +
      '<div class="site-sidebar-head"><a class="site-sidebar-brand" href="/"><span class="brand-mark">✧</span><span>FRIEREN<small>THE ARCANE JOURNEY</small></span></a><button class="site-menu-close" id="site-menu-close" type="button" aria-label="Menüyü kapat">×</button></div>' +
      accountCard +
      '<div class="site-sidebar-intro"><span>✧ YOLCULUK REHBERİ</span><p>Keşfet, karakterini geliştir ve macerana kaldığın yerden devam et.</p></div>' +
      '<nav class="site-sidebar-nav" aria-label="Frieren ana menüsü">' +
        navGroup('kullanici', 'KULLANICI MERKEZİ', [
          navLink('/profil', '◉', 'Hesap Profilim', 'Sunucudan bağımsız hesap kimliğin ve profil görsellerin'),
          navLink('/hesap-merkezi', '✧', 'Hesap ve Destek Merkezi', 'Hesap işlemlerin ve destek taleplerin'),
          navLink('/destek#account-settings', '⚙', 'Hesap Ayarları', 'Hesap verilerin ve hesap işlemlerin'),
          navLink('/kesfet#topluluk-sohbeti', '☾', 'Topluluk Sohbeti', 'Herkese açık Frieren sohbeti')
        ]) +
        navGroup('maceraci', 'MACERACI PANELİ', [
          navLink('/maceraci', '⌂', 'Maceracı Panelim', 'Sunucu ve karakter seçimi burada yapılır'),
          navLink('/maceraci/profil', '✧', 'Karakter Profilim', 'Seçili sunucudaki RPG karakterin'),
          navLink('/maceraci/profil#achievements', '♛', 'Başarım Vitrini', 'Karakter başarımların'),
          navLink('/maceraci/profil#progress', '↗', 'Karakter İlerlemem', 'XP, etkinlik ve koleksiyon ilerlemen'),
          navLink('/maceraci/profil#badges', '✿', 'Karakter Rozetlerim', 'RPG rozetlerin ve başarı ödüllerin'),
          navLink('/maceraci/profil#battle-stats', '⚔', 'Savaş İstatistiklerim', 'Boss, zindan ve arena sonuçların'),
          navLink('/maceraci/profil#leaderboards', '♜', 'Sunucu Sıralamaları', 'Sunucu içi ve son 24 saat tabloları'),
          navLink('/maceraci/envanter', '▣', 'Envanterim', 'Seçili karakterin eşyaları ve ekipmanları'),
          navLink('/maceraci/koleksiyon', '◈', 'Koleksiyonum', 'Karaktere bağlı yoldaşlar, balıklar ve keşifler'),
          navLink('/maceraci/sosyal', '♧', 'RPG Sosyal Alanı', 'Sunucuya özel arkadaşlıklar ve rakipler'),
          navLink('/maceraci/merkez', '✧', 'Maceracı Kişisel Merkezi', 'Karaktere bağlı mesajlar, ajanda ve oyuncu profili'),
          navLink('/maceraci/yasam', '⌂', 'Kişisel Yaşam Alanım', 'Karakterin odası, kozmetikleri ve etkinlikleri'),
          navLink('/maceraci/profil#privacy', '◈', 'RPG Profil Gizliliği', 'Sunucuya özel karakter vitrini'),
          navLink('/maceraci/bildirimler', '☾', 'Lonca Bildirimleri', 'Sunucuya özel haberci kuş tercihlerin'),
          navLink('/maceraci/atolye', '✦', 'Lonca Büyü Atölyesi', 'Sunucu yönetimine özel araçlar')
        ]) +
        navGroup('oyuncu', 'BAŞLANGIÇ', [
          navLink('/', '✧', 'Bot Tanıtımı', 'Poğaça Frieren botunu tanı ve sunucuna ekle'),
          navLink('/kesfet', '✧', 'Keşfet', 'Frieren dünyasını tanı')
        ]) +
        navGroup('dunya', 'FRIEREN DÜNYASI', [
          navLink('/pogaca', '⚔', 'Poğaça Frieren', 'RPG botunu keşfet'),
          navLink('/komutlar', '⌘', 'Komut Rehberi', 'Komutlar ve seçenekler'),
          navLink('/ansiklopedi', '✧', 'Karakter Ansiklopedisi', 'Karakterleri keşfet ve spoiler ayrıntılarını aç'),
          navLink('/ara', '⌕', 'Site Araması', 'Sayfa, komut, karakter ve büyü ara'),
          navLink('/frieren-ai', '✧', 'Frieren AI', 'Yapay zekâ asistanı'),
          navLink('/pazar', '◈', 'Kuzey Pazarı', 'Oyuncu pazarı ve takas'),
          navLink('/lonca', '♜', 'Maceracı Loncası', 'Discord sunucu modülleri')
        ]) +
        navGroup('hesap', 'HESAP', [
          navLink('/destek', '✉', 'Destek Merkezi', 'Yardım ve hesap işlemleri')
        ]) +
        navGroup('diger', 'DİĞER BÖLÜMLER', [
          navLink('/destek#account-settings', '⚙', 'Hesap Ayarları', 'Hesap verilerin ve hesap işlemlerin'),
          navLink('/logout', '↪', 'Çıkış Yap', 'Frieren hesabından güvenli çıkış')
        ]) +
        (ownerLink ? navGroup('yonetim', 'SAHİP ALANI', [navLink('/owner', '♛', 'Owner Panel', 'Platform yönetimi')]) : '') +
      '</nav><div class="site-sidebar-foot"><span>✧ Bir yolculuk, bin yıllık bir hikâye.</span></div></aside>';
  return '<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#17152c"><meta name="description" content="' + esc(description) + '"><meta name="robots" content="' + robots + '">' + '<meta name="google-site-verification" content="zQvll4lo6fEkpcbHjwSdQeMbJggVxdAviEDKvLC0Ebc">' + seoTags + structuredData + '<link rel="icon" type="image/svg+xml" href="/assets/site-avatar.svg"><link rel="alternate icon" href="/assets/site-avatar.webp" type="image/webp"><link rel="manifest" href="/site.webmanifest"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-capable" content="yes"><title>' + esc(title) + ' · Frieren</title><link rel="stylesheet" href="/assets/site.css?v=cosmetics-386-1"></head><body><a class="skip-link" href="#main-content">Ana içeriğe geç</a>' + sidebar + '<header class="topbar"><a class="brand" href="/"><span class="brand-mark">✧</span><span>FRIEREN<small>THE ARCANE JOURNEY</small></span></a><div class="user-chip"><img src="' + esc(avatar) + '" alt=""><span>' + esc(user.username || 'Gezgin') + '</span>' + (user.id ? '<a href="/logout" title="Çıkış yap">↗</a>' : '<a href="/login" title="Giriş yap">↗</a>') + '</div></header>' + accessibilityPanel + mainContent + '<footer><div><strong>✧ FRIEREN</strong><span>Bir yolculuk, bin yıllık bir hikâye.</span></div><nav aria-label="Alt gezinme"><a href="/pogaca">Poğaça Frieren</a><a href="/komutlar">Komutlar</a><a href="/hizmet-kosullari">Hizmet Koşulları</a><a href="/gizlilik-politikasi">Gizlilik Politikası</a><a href="/frieren-ai">Frieren AI</a><a href="/pazar">Kuzey Pazarı</a>' + guildLink + ownerLink + '</nav><small>© Frieren Platform · Developed by Soiree</small></footer><script src="/assets/site-navigation.js?v=menu-241-2" defer></script><script src="/assets/site-actions.js?v=actions-261-1" defer></script><script src="/assets/profile-interactions.js?v=profile-261-1" defer></script><script src="/assets/accessibility-controls.js?v=a11y-1" defer></script></body></html>';
}
function publicPlayerProfilePage(user,showcase,personal,guestbook,csrf,canSign){
 const profile=showcase.profile;
 const entries=guestbook.map(x=>'<article class="personal-center-item"><strong>'+esc(x.author_id)+'</strong><p>'+esc(x.message)+'</p><small>'+new Date(x.created_at).toLocaleString('tr-TR')+'</small></article>').join('')||'<p class="empty-state">Henüz ziyaretçi defteri mesajı yok.</p>';
 const sign=personal.guestbook_enabled?(canSign?'<form method="post" action="/maceraci/oyuncu/ziyaretci-defteri"><input type="hidden" name="csrf" value="'+esc(csrf)+'"><input type="hidden" name="guildId" value="'+esc(showcase.guildId)+'"><input type="hidden" name="ownerId" value="'+esc(profile.user_id)+'"><label>Mesajın<textarea name="message" maxlength="500" required></textarea></label><button class="btn" type="submit">Ziyaretçi defterine yaz</button></form>':(SITE_ACCOUNT_ID.test(String(user?.id||''))?'<p class="muted">Mesaj bırakmak için önce Discord karakterini hesabına bağla.</p><a class="btn" href="/maceraci">Karakterimi bağla</a>':'<p><a class="btn" href="/login">Giriş yapıp mesaj bırak</a></p>')):'<p class="muted">Bu oyuncu ziyaretçi defterini kapatmış.</p>';
 const stats=showcase.settings?.show_stats?'<div class="user-center-metrics"><article><span>Seviye</span><strong>'+esc(profile.level??'—')+'</strong></article><article><span>XP</span><strong>'+esc(profile.xp??0)+'</strong></article><article><span>Boss zaferi</span><strong>'+esc(profile.boss_defeats??0)+'</strong></article><article><span>Zindan</span><strong>'+esc(profile.dungeon_wins??0)+'</strong></article></div>':'<p class="muted">Bu oyuncu savaş ve ilerleme istatistiklerini gizli tutuyor.</p>';
 const content='<main class="wrap user-center-page personal-center-page"><section class="user-center-hero"><div class="eyebrow">✧ AÇIK OYUNCU PROFİLİ</div><h1>'+esc(profile.character_name||'Maceracı')+'</h1><p class="lead">'+esc(personal.status_text||'Yolculuk devam ediyor')+'</p><p>'+esc(personal.bio||'Bu oyuncu henüz bir biyografi eklememiş.')+'</p>'+stats+'</section><section class="section"><div class="section-head"><h2>Ziyaretçi Defteri</h2><p>Bu oyuncuya kısa bir mesaj bırak.</p></div><div class="card">'+sign+entries+'</div></section></main>';
 return page('Oyuncu Profili',content,user);
}

function siteAccountProfilePage(user,data={}) {
 const p=data.profile||{},csrf=esc(createSiteCsrfToken(process.env.ADMIN_SESSION_SECRET)),avatar=esc(user.avatarUrl||'/assets/site-avatar.webp'),banner=esc(data.bannerUrl||'/assets/site-profile-banner.svg');
 const field=(label,name,value,max)=>'<label>'+label+'<input name="'+name+'" maxlength="'+max+'" value="'+esc(value||'')+'"></label>';
 const links=p.social_links||{},social=Object.entries(links).filter(([k,v])=>typeof v==='string'&&v.startsWith('https://')).map(([k,v])=>'<a href="'+esc(v)+'" target="_blank" rel="noopener noreferrer">'+esc(k)+'</a>').join(' · ');
 const activity=(data.activity||[]).map(x=>'<li>'+esc(x.label)+' <small>'+new Date(x.created_at).toLocaleString('tr-TR')+'</small></li>').join('')||'<li>Henüz etkinlik yok.</li>';
 const themeChoices=[['midnight','Gece','Derin mor ve gece mavisi'],['violet','Menekşe','Canlı mor ve lavanta'],['starlight','Yıldız Işığı','Gece göğü ve yıldız parıltısı'],['forest','Elf Ormanı','Orman yeşili ve doğal tonlar']];
 const themeGallery='<fieldset class="theme-gallery" data-theme-gallery><legend>Profil tema galerisi</legend><p>Bir görünüm seç. Seçimin profilini kaydettiğinde hesabına uygulanır.</p><div class="theme-gallery-grid">'+themeChoices.map(([key,label,description])=>'<button type="button" class="theme-choice" data-theme-choice="'+key+'" aria-pressed="'+((p.theme||'midnight')===key?'true':'false')+'"><span class="theme-swatch" data-theme-preview="'+key+'" aria-hidden="true"><i></i><i></i><i></i></span><strong>'+label+'</strong><small>'+description+'</small></button>').join('')+'</div></fieldset>';
 const content='<main class="wrap profile-page user-center-page account-center-page"><header class="user-center-hero account-profile-intro"><div class="eyebrow">✧ FRIEREN HESAP MERKEZİ</div><h1>Hesap Profilin</h1><p class="lead">Genel hesap kimliğin. Sunucu veya RPG karakteri seçmen gerekmez.</p></header><section class="account-profile-showcase" data-theme="'+esc(p.theme||'midnight')+'" style="--account-accent:'+esc(p.accent_color||'#a78bfa')+'"><img class="account-profile-cover" src="'+banner+'" alt="Hesap bannerı" style="object-position:center '+esc(p.banner_position||'center')+'"><div class="account-profile-identity"><img class="account-profile-avatar" src="'+avatar+'" alt="Profil fotoğrafı"><div class="account-profile-name"><h2>'+esc(p.display_name||user.username||'Gezgin')+'</h2><div class="account-profile-badges">'+(data.badges||[]).map(x=>'<span class="badge">'+esc(x)+'</span>').join('')+'</div><p>'+esc(p.status_text||'Bir büyü yolculuğunda')+'</p></div><button class="btn" type="button" data-profile-editor-open>Görselleri düzenle</button></div></section><section class="card profile-media-editor" hidden data-profile-media-editor data-csrf="'+csrf+'" data-discord-avatar="'+esc(user.discordAvatarUrl||user.avatarUrl||'/assets/site-avatar.webp')+'"><h2>Profil görselleri</h2><div class="profile-media-grid"><label>Avatar<img data-media-preview="avatar" src="'+avatar+'" alt=""><input type="file" accept="image/png,image/jpeg,image/webp" data-media-input="avatar"></label><label>Banner<img data-media-preview="banner" src="'+banner+'" alt=""><input type="file" accept="image/png,image/jpeg,image/webp" data-media-input="banner"></label></div><button class="btn ghost" type="button" data-media-reset="avatar">Discord avatarına dön</button><button class="btn ghost" type="button" data-media-reset="banner">Varsayılan banner</button><button class="btn ghost" type="button" data-profile-editor-close>Kapat</button><p data-media-status role="status"></p></section><section class="card account-profile-editor"><h2>Kişisel bilgiler</h2><h3>GİZLİLİK VE GÜVENLİK</h3><form method="post" action="/api/account-profile"><input type="hidden" name="csrf" value="'+csrf+'">'+field('Görünen ad','displayName',p.display_name||user.username,32)+field('Özel profil adresi','profileSlug',p.profile_slug,32)+'<label>Banner konumu<select name="bannerPosition">'+['top','center','bottom'].map(x=>'<option value="'+x+'"'+((p.banner_position||'center')===x?' selected':'')+'>'+x+'</option>').join('')+'</select></label><label>Biyografi<textarea name="bio" maxlength="280">'+esc(p.bio||'')+'</textarea></label>'+field('Durum mesajı','statusText',p.status_text,80)+field('İlgi alanları (virgülle ayır)','interests',(p.interests||[]).join(', '),400)+field('Etiketler (virgülle ayır)','tags',(p.tags||[]).join(', '),240)+'<label>Tema<select name="theme">'+['midnight','violet','starlight','forest'].map(x=>'<option value="'+x+'"'+((p.theme||'midnight')===x?' selected':'')+'>'+x+'</option>').join('')+'</select></label>'+themeGallery+field('Vurgu rengi','accentColor',p.accent_color||'#a78bfa',7)+'<h3>Sosyal bağlantılar</h3>'+['website','youtube','twitch','instagram','x','github','tiktok'].map(k=>field(k,'social_'+k,links[k],300)).join('')+'<label>Görünürlük<select name="visibility"><option value="public"'+(p.visibility==='public'?' selected':'')+'>Herkese açık</option><option value="followers"'+(p.visibility==='followers'?' selected':'')+'>Takipçiler</option><option value="private"'+(p.visibility==='private'?' selected':'')+'>Gizli</option></select></label><label><input type="checkbox" name="showActivity" value="true"'+(p.show_activity!==false?' checked':'')+'> Etkinliğimi göster</label><label><input type="checkbox" name="allowVisitors" value="true"'+(p.allow_visitors!==false?' checked':'')+'> Ziyaret ve takip izni</label><button class="btn" type="submit">Profili kaydet</button></form></section><section class="account-profile-grid"><article class="card account-profile-card"><h2>Hızlı erişim</h2><p>Genel topluluk sohbetine katıl veya hesap ayarlarını yönet.</p><a class="btn ghost" href="/kesfet#topluluk-sohbeti">Topluluk sohbeti</a> <a class="btn ghost" href="/hesap-merkezi">Hesap merkezi</a> <a class="btn ghost" href="/bildirimler">Bildirimler ('+Number(data.notifications?.filter(n=>!n.read_at).length||0)+')</a></article><article class="card account-profile-card"><h2>Hakkımda</h2><p>'+esc(p.bio||'Henüz biyografi eklenmemiş.')+'</p><p>'+esc((p.interests||[]).join(' · '))+'</p><p>'+esc((p.tags||[]).map(x=>'#'+x).join(' '))+'</p></article><article class="card account-profile-card"><h2>Sosyal bağlantılar</h2><p>'+(social||'Henüz bağlantı eklenmemiş.')+'</p></article><article class="card account-profile-card"><h2>Son etkinlik</h2><ul>'+(p.show_activity===false?'<li>Etkinlik geçmişi gizli.</li>':activity)+'</ul></article><article class="card account-profile-card"><h2>Maceracı Paneli</h2><p>RPG karakterin, sunucu ilerlemen, envanterin ve savaş istatistiklerin burada gösterilmez.</p><a class="btn ghost" href="/maceraci">Maceracı Panelini aç</a></article></section></main>';
 const friendData=data.friends||{friends:[],incoming:[]};
 const friendCards=friendData.friends.map(x=>'<li><a href="/u/'+encodeURIComponent(x.account_id)+'">'+esc(x.username||'Gezgin')+'</a></li>').join('')||'<li>Henüz arkadaşın yok.</li>';
 const incoming=friendData.incoming.map(x=>'<li><a href="/u/'+encodeURIComponent(x.requester_account_id)+'">'+esc(x.requester_username||'Gezgin')+'</a> <form method="post" action="/api/account-profile/friends/respond"><input type="hidden" name="csrf" value="'+csrf+'"><input type="hidden" name="requestId" value="'+esc(x.request_id)+'"><button class="btn" type="submit" name="action" value="accept">Kabul et</button><button class="btn ghost" type="submit" name="action" value="decline">Reddet</button></form></li>').join('')||'<li>Bekleyen arkadaşlık isteği yok.</li>';
 const withFriends=content.replace('</main>','<section class="card account-profile-editor"><h2>Profil önizlemesi</h2><p>Herkese açık profilini ziyaretçi görünümünde kontrol et.</p><a class="btn ghost" href="/u/'+encodeURIComponent(p.profile_slug||user.id)+'" target="_blank" rel="noopener noreferrer">Profilimi önizle</a><p>Profil ziyaretleri: '+Number(data.visitors||0)+'</p><h2>Arkadaşların</h2><ul>'+friendCards+'</ul><h3>Gelen arkadaşlık istekleri</h3><ul>'+incoming+'</ul></section></main>');
 return page('Hesap Profilim',withFriends,user)+'<script src="/assets/profile-media.js?v=account-profile-268" defer></script><script src="/assets/user-center.js?v=account-profile-267" defer></script><script src="/assets/theme-gallery.js?v=theme-gallery-2" defer></script>';
}
function personalCenterPage(user,profile,data,csrf,status){
 const field=(label,name,value,max=500)=>'<label>'+label+'<input name="'+name+'" maxlength="'+max+'" value="'+esc(value||'')+'"></label>';
 const form=(action,body)=>'<form method="post" action="/maceraci/merkez"><input type="hidden" name="csrf" value="'+esc(csrf)+'"><input type="hidden" name="guildId" value="'+esc(profile.guild_id)+'"><input type="hidden" name="action" value="'+action+'">'+body+'</form>';
 const options=[...new Map([...data.discover,...data.recommended,...data.friends].map(x=>[x.user_id,x])).values()];
 const optionHtml=options.map(x=>'<option value="'+esc(x.user_id)+'">'+esc(x.character_name||'Maceracı')+' · '+esc(x.user_id)+'</option>').join('');
 const threads=data.threads.map(x=>'<article class="personal-center-item"><strong>'+esc(x.other_id)+'</strong><p>'+esc(x.body)+'</p><small>'+new Date(x.created_at).toLocaleString('tr-TR')+(x.unread?' · Okunmadı':'')+'</small><a href="/maceraci/merkez?guildId='+encodeURIComponent(profile.guild_id)+'&thread='+encodeURIComponent(x.other_id)+'#personal-messages">Konuşmayı aç</a></article>').join('')||'<p class="empty-state">Henüz özel mesajın yok.</p>';
 const conversation=data.messages?.map(x=>'<article class="personal-center-item"><strong>'+(x.sender_id===profile.user_id?'Sen':esc(data.activeThread))+'</strong><p>'+esc(x.body)+'</p><small>'+new Date(x.created_at).toLocaleString('tr-TR')+'</small></article>').join('')||'<p class="empty-state">Bu konuşmada henüz mesaj yok.</p>';
 const guestbook=data.guestbook.map(x=>'<article class="personal-center-item"><strong>'+esc(x.author_id)+'</strong><p>'+esc(x.message)+'</p><small>'+new Date(x.created_at).toLocaleString('tr-TR')+'</small>'+form('guestbook-delete','<input type="hidden" name="entryId" value="'+esc(x.entry_id)+'"><button class="btn ghost" type="submit">Sil</button>')+'</article>').join('')||'<p class="empty-state">Ziyaretçi defterinde henüz mesaj yok.</p>';
 const planner=data.planner.map(x=>'<article class="personal-center-item"><strong>'+esc(x.title)+'</strong><p>'+esc(x.body)+'</p><small>'+esc(x.kind)+' · '+(x.due_at?new Date(x.due_at).toLocaleString('tr-TR'):'Tarih yok')+(x.completed_at?' · Tamamlandı':' · Devam ediyor')+'</small>'+form('planner-update','<input type="hidden" name="entryId" value="'+esc(x.entry_id)+'">'+field('Başlık','title',x.title,100)+field('Açıklama','body',x.body,2000)+'<input type="hidden" name="dueAt" value="'+esc(x.due_at||'')+'"><input type="hidden" name="completed" value="'+(x.completed_at?'false':'true')+'"><button class="btn ghost" type="submit">'+(x.completed_at?'Yeniden aç':'Tamamlandı işaretle')+'</button>')+form('planner-delete','<input type="hidden" name="entryId" value="'+esc(x.entry_id)+'"><button class="btn ghost" type="submit">Sil</button>')+'</article>').join('')||'<p class="empty-state">Ajandan henüz boş.</p>';
 const friendIds=new Set(data.friends.map(x=>x.user_id));
 const profileVisits=data.profileVisits.map(x=>'<article class="personal-center-item"><strong>'+esc(x.character_name||'Maceracı')+'</strong><p>'+esc(x.visit_count)+' ziyaret</p><small>'+new Date(x.last_visited_at).toLocaleString('tr-TR')+'</small></article>').join('')||'<p class="empty-state">Henüz profil ziyaretin yok.</p>';
 const closeFriends=data.closeFriends.map(x=>'<article class="personal-center-item"><strong>'+esc(x.character_name||'Maceracı')+'</strong><small>'+esc(x.user_id)+'</small>'+form('close-friend-remove','<input type="hidden" name="targetId" value="'+esc(x.user_id)+'"><button class="btn ghost" type="submit">Yakın arkadaşlardan çıkar</button>')+'</article>').join('')||'<p class="empty-state">Henüz yakın arkadaş eklemedin.</p>';
 const players=options.map(x=>'<article class="personal-center-item"><strong>'+esc(x.character_name||'Yol Arkadaşı')+'</strong><p>Seviye XP: '+esc(x.xp??'—')+' · İtibar: '+esc(x.reputation??x.mutual_friends??0)+'</p><small>Oyuncu kimliği: '+esc(x.user_id)+'</small>'+('<a href="/maceraci/oyuncu?guildId='+encodeURIComponent(profile.guild_id)+'&userId='+encodeURIComponent(x.user_id)+'">Profili görüntüle</a>')+(friendIds.has(x.user_id)?form('close-friend-add','<input type="hidden" name="targetId" value="'+esc(x.user_id)+'"><button class="btn ghost" type="submit">Yakın arkadaş ekle</button>'):'')+'</article>').join('')||'<p class="empty-state">Şu anda önerilecek oyuncu bulunamadı.</p>';
 const report=(r,label)=>'<article class="personal-center-stat"><strong>'+esc(r.xp??0)+' XP</strong><span>'+label+' · '+esc(r.adventures??0)+' macera · '+esc(r.achievements??0)+' başarım · '+esc(r.completed_tasks??0)+' tamamlanan görev</span></article>';
 const html='<main class="wrap user-center-page personal-center-page"><section class="user-center-hero"><div class="eyebrow">✧ MACERACI MERKEZİ</div><h1>Kişisel yaşamın ve sosyal alanın</h1><p class="lead">'+esc(profile.character_name||user.username)+' · Sunucu '+esc(profile.guild_id)+'</p><div class="user-center-metrics"><article><span>Haftalık XP</span><strong>'+esc(data.week.xp??0)+'</strong></article><article><span>Aylık XP</span><strong>'+esc(data.month.xp??0)+'</strong></article><article><span>Mesajlaşma</span><strong>'+data.threads.length+'</strong></article><article><span>Ajanda</span><strong>'+data.planner.length+'</strong></article></div></section><nav class="user-center-tabs"><a href="#personal-profile">Profil</a><a href="#personal-messages">Mesajlar</a><a href="#personal-planner">Ajanda</a><a href="#personal-discovery">Keşfet</a><a href="#personal-close-friends">Yakın Arkadaşlar</a><a href="#personal-profile-visits">Profil Ziyaretleri</a><a href="#personal-guestbook">Ziyaretçi Defteri</a><a href="#personal-reports">Raporlar</a></nav>'+(status?'<p class="notice">İşlem durumu: '+esc(status)+'</p>':'')+
 '<section class="section" id="personal-profile"><div class="section-head"><h2>Kişisel profil ayarları</h2><p>Biyografin, durumun ve profil görünümün.</p></div><div class="card">'+form('profile-save',field('Biyografi','bio',data.personal.bio,280)+field('Durum','statusText',data.personal.status_text,80)+'<label>Tema<select name="theme">'+['midnight','violet','starlight','forest'].map(t=>'<option value="'+t+'"'+(data.personal.theme===t?' selected':'')+'>'+t+'</option>').join('')+'</select></label><label class="check-row"><input type="checkbox" name="guestbookEnabled" value="true"'+(data.personal.guestbook_enabled?' checked':'')+'> Ziyaretçi defterini açık tut</label><button class="btn" type="submit">Profili kaydet</button>')+'</div></section>'+
 '<section class="section" id="personal-messages"><div class="section-head"><h2>Özel mesajlar</h2><p>Engellenen kullanıcılarla mesajlaşma kapalıdır.</p></div><div class="portal-grid"><div class="card"><h3>Yeni mesaj</h3>'+form('dm-send','<label>Oyuncu<select name="targetId" required>'+optionHtml+'</select></label><label>Mesaj<textarea name="body" maxlength="2000" required></textarea></label><button class="btn" type="submit">Mesaj gönder</button>')+'</div><div class="card"><h3>Son konuşmalar</h3>'+threads+(data.activeThread?'<h3>Konuşma · '+esc(data.activeThread)+'</h3>'+conversation:'')+'</div></div></section>'+
 '<section class="section" id="personal-planner"><div class="section-head"><h2>Kişisel ajanda</h2><p>Görevlerini, notlarını ve etkinliklerini tek yerde tut.</p></div><div class="portal-grid"><div class="card"><h3>Yeni kayıt</h3>'+form('planner-create','<label>Tür<select name="kind"><option value="task">Görev</option><option value="note">Not</option><option value="event">Etkinlik</option></select></label>'+field('Başlık','title','',100)+'<label>Açıklama<textarea name="body" maxlength="2000"></textarea></label><label>Tarih<input type="datetime-local" name="dueAt"></label><button class="btn" type="submit">Ajandaya ekle</button>')+'</div><div class="card"><h3>Kayıtlarım</h3>'+planner+'</div></div></section>'+
 '<section class="section" id="personal-discovery"><div class="section-head"><h2>Oyuncu keşfi ve öneriler</h2><p>Aynı sunucudaki yeni yol arkadaşlarını keşfet.</p></div><div class="portal-grid">'+players+'</div><div class="card">'+form('player-report','<h3>Oyuncu bildir</h3><label>Oyuncu<select name="targetId" required>'+optionHtml+'</select></label><label>Neden<select name="reason"><option value="harassment">Taciz</option><option value="spam">Spam</option><option value="cheating">Hile</option><option value="inappropriate">Uygunsuz davranış</option><option value="other">Diğer</option></select></label><label>Detay<textarea name="details" maxlength="1000"></textarea></label><button class="btn ghost" type="submit">Şikâyet gönder</button>')+'</div></section>'+
 '<section class="section" id="personal-close-friends"><div class="section-head"><h2>Yakın arkadaşlarım</h2><p>En fazla 10 arkadaşını hızlı erişim listene ekleyebilirsin.</p></div><div class="portal-grid">'+closeFriends+'</div></section>'+ '<section class="section" id="personal-profile-visits"><div class="section-head"><h2>Profil ziyaretleri</h2><p>Herkese açık profilini son dönemde ziyaret eden oyuncular.</p></div><div class="portal-grid">'+profileVisits+'</div></section>'+ '<section class="section" id="personal-guestbook"><div class="section-head"><h2>Ziyaretçi defterim</h2><p>Profiline bırakılan son mesajlar.</p></div><div class="card">'+guestbook+'</div></section>'+
 '<section class="section" id="personal-reports"><div class="section-head"><h2>İlerleme raporların</h2><p>Son 7 ve 30 günlük macera özeti.</p></div><div class="portal-grid">'+report(data.week,'Haftalık')+report(data.month,'Aylık')+'</div></section></main>';
 return page('Kişisel Merkez',html,user);
}

function injectPublicChat(html,user,csrfToken,isOwnerOverride=null){
 const canSend=SITE_ACCOUNT_ID.test(String(user?.id||'')),isOwner=isOwnerOverride===null?isOwnerSiteAccount(user):isOwnerOverride===true;
 const ownerControls=isOwner?'<div class="public-chat-owner-controls"><strong>Owner sohbet yönetimi</strong><span data-chat-control-status>Durum yükleniyor…</span><button class="public-chat-action" type="button" data-chat-toggle-pause disabled>Sohbeti durdur</button><button class="public-chat-action" type="button" data-chat-reports-refresh>Bekleyen bildirimleri yükle</button><div class="public-chat-reports" data-chat-reports hidden></div></div>':'';
 const section='<section id="topluluk-sohbeti" class="section public-chat-section"><div class="wrap"><div class="section-head public-chat-intro"><div class="eyebrow">✧ FRIEREN TOPLULUĞU · YOL ARKADAŞLARI</div><h2>Yol arkadaşlarınla sohbet et</h2><p>Genel sohbet. Mesajları herkes okuyabilir; mesaj göndermek ve etkileşim kurmak için hesabınla giriş yap.</p></div><div class="public-chat-panel" data-public-chat data-can-send="'+(canSend?'true':'false')+'" data-chat-owner="'+(isOwner?'true':'false')+'"><div class="public-chat-head"><span><i></i> # genel-sohbet</span><small data-chat-presence>Çevrimiçi durumu yükleniyor</small></div>'+ownerControls+'<div class="public-chat-tools"><label class="public-chat-search-label" for="public-chat-search">Sohbette ara</label><input id="public-chat-search" type="search" data-chat-search maxlength="80" placeholder="Mesaj veya kullanıcı ara…"><span data-chat-count aria-live="polite">Mesajlar yükleniyor…</span></div><nav class="public-chat-tabs" aria-label="Sohbet görünümleri"><button class="public-chat-tab is-active" type="button" data-chat-tab="chat" aria-pressed="true">Sohbet</button><button class="public-chat-tab" type="button" data-chat-tab="pinned" aria-pressed="false">📌 Sabitlenenler</button></nav><div class="public-chat-pinned-top" data-chat-pinned-top hidden><div class="public-chat-pinned-heading"><strong>📌 Sabitlenmiş mesajlar</strong><span data-chat-pinned-count></span></div><ol class="public-chat-pinned-list" data-chat-pinned-top-list></ol></div><button class="public-chat-action public-chat-new-messages" type="button" data-chat-new-messages hidden>Yeni mesajlar var · en alta git</button><ol class="public-chat-messages" data-chat-messages aria-live="polite"><li class="public-chat-empty">Sohbet yükleniyor…</li></ol><section class="public-chat-pinned-view" data-chat-pinned-view hidden><div class="public-chat-pinned-heading"><strong>📌 Sabitlenmiş mesajlar</strong><span>Bir mesaja dokunarak sohbet içindeki konumuna git</span></div><ol class="public-chat-pinned-list" data-chat-pinned-list><li class="public-chat-empty">Henüz sabitlenmiş mesaj yok.</li></ol></section>'+(canSend?'<form class="public-chat-form" data-chat-form><input type="hidden" name="csrf" value="'+esc(csrfToken)+'"><input type="hidden" name="replyToMessageId" value=""><div class="public-chat-reply-preview" data-chat-reply-preview hidden><span data-chat-reply-label></span><button class="public-chat-action" type="button" data-chat-reply-clear>Yanıtı iptal et</button></div><label class="sr-only" for="public-chat-message">Mesajın</label><textarea id="public-chat-message" name="message" maxlength="500" rows="2" autocomplete="off" placeholder="Bir büyücü selamı bırak… (en fazla 500 karakter)"></textarea><div class="public-chat-compose-tools"><label class="chat-media-picker"><span>Dosya ekle</span><input type="file" data-chat-media accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,audio/mpeg,audio/ogg,audio/wav,audio/flac,audio/webm"></label><small data-chat-media-status role="status"></small></div><div class="public-chat-compose-meta"><small data-chat-counter>0 / 500</small><button class="btn" type="submit">Mesajı gönder ✧</button></div></form>':'<div class="public-chat-login"><a class="btn" href="/login">Giriş yap ve sohbete katıl</a></div>')+(canSend?'<section class="public-chat-dm-hub" data-site-dm-hub><div class="public-chat-dm-tabs"><button class="public-chat-action is-active" type="button" data-site-dm-tab="direct" aria-pressed="true">Özel mesajlar</button><button class="public-chat-action" type="button" data-site-dm-tab="group" aria-pressed="false">Grup sohbetleri</button></div><section class="public-chat-dm" data-site-dm><div class="public-chat-dm-head"><strong>Özel mesajlar</strong><span>Yalnızca kabul ettiğin arkadaşlarınla</span></div><label for="site-dm-friend">Arkadaş seç</label><select id="site-dm-friend" data-site-dm-friend><option value="">Arkadaşların yükleniyor…</option></select><a class="public-chat-profile-link" data-site-dm-profile href="/profil" hidden>Profili aç</a><ol class="public-chat-dm-messages" data-site-dm-messages aria-live="polite"><li>Bir arkadaş seçerek sohbete başla.</li></ol><form data-site-dm-form><input type="hidden" name="csrf" value="'+esc(csrfToken)+'"><label class="sr-only" for="site-dm-message">Özel mesajın</label><textarea id="site-dm-message" name="message" maxlength="1000" rows="2" placeholder="Arkadaşına özel mesaj yaz…"></textarea><label class="chat-media-picker">Dosya ekle<input type="file" data-chat-media accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,audio/mpeg,audio/ogg,audio/wav,audio/flac,audio/webm"></label><small data-chat-media-status role="status"></small><button class="btn" type="submit">Özel mesaj gönder</button></form><p data-site-dm-feedback role="status"></p></section><section class="public-chat-dm-group" data-site-dm-group hidden><div class="public-chat-dm-head"><strong>Grup sohbetleri</strong><span>En fazla 8 kişi · yalnızca davet edilen üyeler</span></div><form data-site-dm-group-create><input type="hidden" name="csrf" value="'+esc(csrfToken)+'"><label for="site-dm-group-title">Grup adı</label><input id="site-dm-group-title" name="title" maxlength="40" placeholder="Örn. Büyü akademisi" required><label for="site-dm-group-friends">Arkadaşlarını seç (en az 2)</label><select id="site-dm-group-friends" data-site-dm-group-friends multiple size="4"></select><button class="public-chat-action" type="submit">Grup oluştur</button></form><label for="site-dm-group-select">Grubun</label><select id="site-dm-group-select" data-site-dm-group-select><option value="">Henüz grup yok</option></select><ol class="public-chat-dm-messages" data-site-dm-group-messages aria-live="polite"><li>Bir grup oluştur veya davet edildiğin grubu seç.</li></ol><form data-site-dm-group-form><input type="hidden" name="csrf" value="'+esc(csrfToken)+'"><label class="sr-only" for="site-dm-group-message">Grup mesajın</label><textarea id="site-dm-group-message" name="message" maxlength="1000" rows="2" placeholder="Gruba mesaj yaz…"></textarea><label class="chat-media-picker">Dosya ekle<input type="file" data-chat-media accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,audio/mpeg,audio/ogg,audio/wav,audio/flac,audio/webm"></label><small data-chat-media-status role="status"></small><button class="btn" type="submit">Gruba gönder</button></form><button class="public-chat-action" type="button" data-site-dm-group-leave>Gruptan ayrıl</button><p data-site-dm-group-feedback role="status"></p></section></section>':'')+'<button class="public-chat-action public-chat-load-older" type="button" data-chat-load-older hidden>Eski mesajları yükle</button><div class="public-chat-blocks" data-chat-blocks></div><p class="public-chat-feedback" data-chat-feedback role="status"></p></div></div></section>';
 const source=String(html);const mainStart=source.indexOf('<main id="main-content"');const firstSectionEnd=mainStart>=0?source.indexOf('</section>',mainStart):-1;
 const positioned=firstSectionEnd>=0?source.slice(0,firstSectionEnd+10)+section+source.slice(firstSectionEnd+10):source.replace('</main>',section+'</main>');
 return positioned.replace('</body>','<script src="/assets/public-chat.js?v=chat-282-1" defer></script></body>');
}
function home(client, user, csrfToken) {
  const ready = client?.isReady?.() === true;
  return page('Büyülü Ana Sayfa', '<main><section class="wrap hero"><div><div class="eyebrow">✧ FANTASTİK BİR YOLCULUK BAŞLIYOR ✧</div><h1>Bin yıllık bir<br><em>büyü yolculuğu.</em></h1><p class="lead">Frieren evreninden ilham alan, keşiflerle dolu bir Discord RPG dünyası. Büyüler öğren, dostlar edin, zindanlara in ve kendi hikâyeni yaz.</p><div class="actions"><a class="btn" href="/pogaca">Poğaça Frieren’i keşfet ✧</a><a class="btn ghost" href="/frieren-ai">Frieren AI’ı tanı</a></div><p class="muted">Poğaça Frieren · ' + (ready ? 'Discord bağlantısı aktif' : 'Discord bağlantısı bekleniyor') + '</p></div><div class="hero-art"><img src="/assets/frieren.gif" alt="Frieren büyü yolculuğunda" fetchpriority="high" decoding="async" width="390" height="390"></div></section>' +
  '<section class="section"><div class="wrap"><div class="section-head"><div class="eyebrow">YOL ARKADAŞLARIN</div><h2>Bir evren, iki ayrı uzmanlık</h2><p>RPG macerası ve teknik zekâ aynı büyülü dünyada buluşuyor.</p></div><div class="grid"><article class="card"><div class="icon">✧</div><h3>Poğaça Frieren</h3><p>Karakter, büyü, zindan, boss, ekonomi, görevler ve anime eğlencesiyle dolu RPG botu.</p><a class="btn ghost" href="/pogaca">Macerayı keşfet →</a></article><article class="card"><div class="icon">⌘</div><h3>Frieren AI</h3><p>Hafıza, sohbet, kod denetimi, test senaryoları ve hata raporları için ayrı asistan.</p><a class="btn ghost" href="/frieren-ai">AI’ı tanı →</a></article><article class="card"><div class="icon">☾</div><h3>Kişisel alanın</h3><p>Frieren hesabınla giriş yaptığın kişisel alan ve sayfada seninle gezen minik Frieren.</p><a class="btn ghost" href="#profil">Profiline göz at →</a></article><article class="card"><div class="icon">♜</div><h3>Maceracı Loncası</h3><p>Discord hesabını bağla, yönetebildiğin sunucuları seç ve Frieren modüllerini düzenle.</p><a class="btn ghost" href="/lonca">Sunucu panelini aç →</a></article></div></div></section>' +
  '<section class="section"><div class="wrap split"><div class="profile"><div class="profile-banner profile-banner-art"><img src="/assets/site-banner.svg" loading="lazy" decoding="async" alt="Yıldızlı gece, hilal ve dağ silüetlerinden oluşan Frieren bannerı"></div><div class="profile-info"><img class="profile-avatar" src="' + esc(user.avatarUrl || '/assets/site-avatar.webp') + '" loading="lazy" decoding="async" alt="' + esc(user.username || 'Gezgin') + ' profil fotoğrafı"><div><span class="profile-label">MACERACI HESABI</span><h3>' + esc(user.username || 'Gezgin') + '</h3><p>✧ Frieren hesabı · Yolculuk aktif</p></div></div><div class="profile-body">Kişisel yolculuk alanın. Discord karakterini bağlayarak envanterini, koleksiyonunu, yaşam alanını ve lonca etkinliklerini tek yerden yönetebilirsin.</div></div><div id="profil"><div class="eyebrow">BİRLİKTE BİRİKTİRİLEN HATIRALAR</div><h2>Her karede başka bir hikâye.</h2><p class="lead">Frieren’in yolculuğundan küçük anlar, yuvarlak GIF galerisi ve sayfanın etrafında dolaşan minik bir büyücü.</p><p class="muted">Hoş geldin, ' + esc(user.username || 'gezgin') + '. Frieren evrenindeki yolculuğuna buradan devam edebilirsin.</p></div></div></section>' +
  '<section class="section"><div class="wrap"><div class="section-head"><div class="eyebrow">BÜYÜLÜ ALBÜM</div><h2>Yolculuktan küçük anlar</h2><p>Yuvarlak GIF’ler; her biri ayrı bir karakter, ayrı bir anı.</p></div><div class="gif-gallery"><div class="gif-item"><img loading="lazy" decoding="async" src="/assets/frieren.gif" alt="Frieren GIF"><span>Frieren</span></div><div class="gif-item"><img loading="lazy" decoding="async" src="/assets/fern.gif" alt="Fern GIF"><span>Fern</span></div><div class="gif-item"><img loading="lazy" decoding="async" src="/assets/stark.gif" alt="Stark GIF"><span>Stark</span></div><div class="gif-item"><img loading="lazy" decoding="async" src="/assets/eisen.gif" alt="Eisen GIF"><span>Eisen</span></div><div class="gif-item"><img loading="lazy" decoding="async" src="/assets/himmel.gif" alt="Himmel GIF"><span>Himmel</span></div><div class="gif-item"><img loading="lazy" decoding="async" src="/assets/heiter.gif" alt="Heiter GIF"><span>Heiter</span></div><div class="gif-item"><img loading="lazy" decoding="async" src="/assets/macera.gif" alt="Macera GIF"><span>Macera</span></div><div class="gif-item"><img loading="lazy" decoding="async" src="/assets/profil.gif" alt="Profil GIF"><span>Karakter profili</span></div><div class="gif-item"><img loading="lazy" decoding="async" src="/assets/envanter.gif" alt="Envanter GIF"><span>Envanter</span></div><div class="gif-item"><img loading="lazy" decoding="async" src="/assets/buyusavasi.gif" alt="Büyü savaşı GIF"><span>Büyü savaşı</span></div><div class="gif-item"><img loading="lazy" decoding="async" src="/assets/buyusavasi_vurus.gif" alt="Büyü darbesi GIF"><span>Büyü darbesi</span></div><div class="gif-item"><img loading="lazy" decoding="async" src="/assets/buyusavasi_kazandi.gif" alt="Zafer GIF"><span>Zafer</span></div><div class="gif-item"><img loading="lazy" decoding="async" src="/assets/animequiz.gif" alt="Anime quiz GIF"><span>Anime zamanı</span></div><div class="gif-item"><img loading="lazy" decoding="async" src="/assets/quizdogru.gif" alt="Doğru cevap GIF"><span>Doğru cevap</span></div><div class="gif-item"><img loading="lazy" decoding="async" src="/assets/quizyanlis.gif" alt="Yanlış cevap GIF"><span>Yanlış cevap</span></div><div class="gif-item"><img loading="lazy" decoding="async" src="/assets/yardim.gif" alt="Yardım GIF"><span>Yardım</span></div></div></div></section>' +
  '<section class="section"><div class="wrap stats"><div class="stat"><b>' + (client?.guilds?.cache?.size ?? '—') + '</b><span>Bağlı sunucu</span></div><div class="stat"><b>' + (client?.commands?.size ?? '—') + '</b><span>Yüklenmiş komut</span></div><div class="stat"><b>2</b><span>Bağımsız bot</span></div><div class="stat"><b>' + (ready ? 'Aktif' : 'Kontrol') + '</b><span>Poğaça bağlantısı</span></div></div></section>' +
  '<section class="section"><div class="wrap cta"><h2>Birlikte maceraya çıkalım mı?</h2><p>Poğaça Frieren’i sunucuna davet et ve yolculuğu başlat.</p><a class="btn" href="/pogaca">Botu ve komutları keşfet ✧</a></div></section></main>', user);
}

function pogaca(client, user, seo = {}) {
  const invite = process.env.CLIENT_ID ? 'https://discord.com/oauth2/authorize?client_id=' + encodeURIComponent(process.env.CLIENT_ID) + '&permissions=274878221376&scope=bot%20applications.commands' : null;
  const commands = [['/yardim','Botun temel yardımını ve komut kategorilerini gösterir.'],['/karakter','RPG karakterini ve gelişim bilgilerini açar.'],['/bakiye','Cüzdanındaki oyun parasını görüntüler.'],['/market','Oyun içi eşyaları ve ekipmanları keşfetmeni sağlar.'],['/zindan','Zindan macerasına katılmanı sağlar.'],['/animequiz','Anime bilginle eğlenceli quizlere katıl.'],['/loncaoyun','Frieren temalı bilgi, kelime, hafıza ve bilmece oyunları oyna; lonca sıralamasına katıl.'],['/yoldas','Yoldaşını sahiplen, besle ve geliştir.'],['/balik','Kuzey Kıtası’nda balık tut ve koleksiyonunu tamamla.'],['/sera','Büyülü Sera’da tohum ek ve hasat yap.'],['/yaratik','Vahşi yaratıkları yakala ve arşivini genişlet.'],['/karakteristek','Hedeflediğin anime karakterlerini istek listene ekle.']];
  return page('Poğaça Frieren', '<main><section class="wrap" style="padding:60px 0 38px;text-align:center"><div class="eyebrow">EĞLENCE · RPG · FANTASTİK MACERA</div><h1 class="hero-title">Poğaça <em>Frieren</em></h1><p class="lead" style="margin:auto">Karakter oluştur, büyüler öğren, zindanlara in, bosslarla savaş ve kendi macera hikâyeni yaz.</p><div class="actions" style="justify-content:center"><a class="btn" href="' + (invite || '#komutlar') + '"' + (invite ? ' target="_blank" rel="noopener"' : '') + '>' + (invite ? 'Discord sunucuna ekle ↗' : 'Davet bağlantısı yapılandırılıyor') + '</a><a class="btn ghost" href="#komutlar">Komutları incele</a></div></section><section class="wrap split"><div class="visual"><img src="/assets/macera.gif" alt="RPG macerası"></div><div><div class="eyebrow">KENDİ HİKÂYENİ YAZ</div><h2>Yaşayan bir RPG dünyası.</h2><p class="lead">Kalıcı karakter verileri, ekipmanlar, envanter, görevler ve ilerleme sistemiyle her macera kaldığın yerden devam eder.</p><p class="muted">' + (client?.commands?.size ?? '—') + ' komut yüklenmiş · ' + (client?.isReady?.() ? 'Discord bağlantısı aktif' : 'Bağlantı kontrol ediliyor') + '</p></div></section><section class="section"><div class="wrap"><div class="section-head"><div class="eyebrow">MACERA SİSTEMLERİ</div><h2>Her adımda yeni keşif</h2></div><div class="grid"><article class="card"><div class="icon">⚔</div><h3>Karakter & sınıflar</h3><p>Seviye, XP, stat puanları, ekipman ve karakter gelişimi.</p></article><article class="card"><div class="icon">✧</div><h3>Büyü & yetenekler</h3><p>Büyü öğrenme, yetenek ağacı, ustalık ve mana yönetimi.</p></article><article class="card"><div class="icon">♜</div><h3>Zindan & boss</h3><p>Karşılaşmalar, boss savaşları, ödüller ve ilerleme.</p></article><article class="card"><div class="icon">◈</div><h3>Ekonomi & envanter</h3><p>Market, eşya, ekipman, takas ve para sistemi.</p></article><article class="card"><div class="icon">✦</div><h3>Görev & keşif</h3><p>Günlük görevler, maceralar ve başarımlar.</p></article><article class="card"><div class="icon">♧</div><h3>Anime & topluluk</h3><p>Anime quizleri, karakterler, koleksiyon ve eğlence.</p></article></div></div></section><section class="section" id="komutlar"><div class="wrap split"><div><div class="eyebrow">İLK ADIMLAR</div><h2>Başlamak çok kolay.</h2><p class="lead">Botu sunucuna ekledikten sonra temel komutlarla başlayabilirsin.</p>' + commands.map(([name,desc]) => '<div class="command"><code>' + name + '</code><span>' + desc + '</span></div>').join('') + '</div><div class="visual"><img src="/assets/yardim.gif" alt="Yardım ve komutlar"></div></div></section><section class="section"><div class="wrap cta"><h2>Sunucunda yeni bir macera başlat.</h2><p>Poğaça Frieren’i davet et, arkadaşlarını topla ve ilk zindana gir.</p><a class="btn" href="' + (invite || '#komutlar') + '"' + (invite ? ' target="_blank" rel="noopener"' : '') + '>Poğaça Frieren’i davet et ↗</a></div></section></main>', user, seo);
}


function getPublicCommandCategory(name, description) {
  const value = (String(name || '') + ' ' + String(description || '')).normalize('NFKC').toLocaleLowerCase('tr');
  if (/anime|quiz|mimic|kimimben|hikaye|hikâye|sans|eğlence|eglence/.test(value)) return 'Anime & Eğlence';
  if (/bakiye|market|envanter|ekipman|takas|zanaat|hazine|koleksiyon|parçala|parcala/.test(value)) return 'Ekonomi & Koleksiyon';
  if (/büyü|buyu|yetenek|savaş|savas|iblis|mana|spell/.test(value)) return 'Büyü & Savaş';
  if (/karakter|macera|zindan|boss|görev|gorev|keşif|kesif|parti|ekip|başarım|basarim|seviye|liderlik|profil|yoldas|yoldaş|pet|companion|balik|balık|sera|farming|yaratik|yaratık|creature|wishlist/.test(value)) return 'RPG & Macera';
  return 'Diğer';
}

const COMMAND_OPTION_TYPES = Object.freeze({
  1: 'Alt komut', 2: 'Alt komut grubu', 3: 'Metin', 4: 'Tam sayı', 5: 'Evet/Hayır',
  6: 'Kullanıcı', 7: 'Kanal', 8: 'Rol', 9: 'Kullanıcı / rol / kanal', 10: 'Sayı', 11: 'Dosya'
});
const COMMAND_PERMISSION_LABELS = Object.freeze([
  ['Administrator', 'Yönetici'],
  ['ManageGuild', 'Sunucuyu Yönet'],
  ['ManageMessages', 'Mesajları Yönet'],
  ['ManageRoles', 'Rolleri Yönet'],
  ['KickMembers', 'Üyeleri At'],
  ['BanMembers', 'Üyeleri Yasakla']
]);

function renderPublicCommandOptions(options, depth = 0) {
  if (!Array.isArray(options) || !options.length) {
    return '<p class="command-no-options">Ek parametre gerektirmiyor.</p>';
  }
  if (depth >= 4) return '<p class="command-no-options">Daha fazla alt seçenek var.</p>';
  return '<ul class="command-options">' + options.slice(0, 25).map(option => {
    const name = esc(option?.name || 'parametre');
    const description = esc(option?.description || 'Açıklama eklenmemiş.');
    const type = COMMAND_OPTION_TYPES[Number(option?.type)] || 'Seçenek';
    const required = option?.required === true;
    const choices = Array.isArray(option?.choices) ? option.choices.slice(0, 25).map(choice =>
      '<li><code>' + esc(choice?.name || choice?.value || '') + '</code></li>'
    ).join('') : '';
    const nested = renderPublicCommandOptions(option?.options, depth + 1);
    const constraints = [];
    if (Number.isFinite(Number(option?.min_value))) constraints.push('En az ' + esc(option.min_value));
    if (Number.isFinite(Number(option?.max_value))) constraints.push('En çok ' + esc(option.max_value));
    if (Number.isFinite(Number(option?.min_length))) constraints.push('En az ' + esc(option.min_length) + ' karakter');
    if (Number.isFinite(Number(option?.max_length))) constraints.push('En çok ' + esc(option.max_length) + ' karakter');
    return '<li class="command-option"><div class="command-option-head"><code>--' + name + '</code><span>' + type + '</span><span class="' + (required ? 'required' : 'optional') + '">' + (required ? 'Zorunlu' : 'İsteğe bağlı') + '</span></div><p>' + description + '</p>' +
      (choices ? '<div class="command-choice-label">Seçenekler</div><ul class="command-choices">' + choices + '</ul>' : '') +
      (constraints.length ? '<p class="command-constraints">' + constraints.join(' · ') + '</p>' : '') +
      (option?.autocomplete ? '<p class="command-constraints">Yazarken öneri sunulur.</p>' : '') +
      (Array.isArray(option?.options) && option.options.length ? nested : '') + '</li>';
  }).join('') + '</ul>';
}

function getPublicCommandPermissionLabel(data) {
  const raw = data?.default_member_permissions;
  if (raw === null || raw === undefined) return 'Tüm üyeler · Discord varsayılanı';
  try {
    const bits = BigInt(raw);
    if (bits === 0n) return 'Varsayılan olarak kapalı';
    const labels = COMMAND_PERMISSION_LABELS
      .filter(([key]) => (bits & BigInt(PermissionFlagsBits[key] ?? 0n)) !== 0n)
      .map(([, label]) => label);
    return labels.length ? 'Gerekli: ' + labels.join(', ') : 'Özel Discord izin gereksinimi';
  } catch {
    return 'Discord izin gereksinimi tanımlı';
  }
}

function siteSearchPage(client,user,query,categoryFilter) {
  const q=String(query||'').trim().slice(0,80);
  const category=String(categoryFilter||'').trim();
  const normalize=value=>String(value||'').toLocaleLowerCase('tr-TR');
  const pages=[
    {title:'Poğaça Frieren',description:'Botun özellikleri, RPG ve topluluk deneyimi.',href:'/pogaca'},
    {title:'Frieren AI',description:'Frieren yapay zekâ özellikleri ve durum bilgisi.',href:'/frieren-ai'},
    {title:'Komut Rehberi',description:'Discord komutları, kullanımları ve seçenekleri.',href:'/komutlar'},
    {title:'Karakter Ansiklopedisi',description:'Anime karakterleri, seri ve nadirlik filtreleri.',href:'/ansiklopedi'},
    {title:'Maceracı Profili',description:'Seviye, başarımlar, büyüler ve RPG ilerlemesi.',href:'/maceraci/profil'},
    {title:'Bildirim Merkezi',description:'Hesap bildirimleri ve okunmamış mesajlar.',href:'/bildirimler'},
    {title:'Macera Pazarı',description:'RPG eşyaları ve oyuncu ilanları.',href:'/pazar'},
    {title:'Keşfet',description:'Frieren portalı ve topluluk sayfaları.',href:'/kesfet'}
  ].map(item=>({...item,category:'page',search:item.title+' '+item.description}));
  const commands=Array.from(client?.commands?.values?.()||[]).map(command=>{
    const data=typeof command?.data?.toJSON==='function'?command.data.toJSON():(command?.data||{});
    const name=String(data.name||command?.name||'').trim();
    if(!name)return null;
    const description=String(data.description||'Discord komutu');
    return {category:'command',title:'/'+name,description:'Discord komutu · '+description,href:'/komutlar',search:name+' '+description};
  }).filter(Boolean);
  const characters=ANIME_CHARACTERS.map(character=>({
    category:'character',title:character.name,description:character.anime+' · '+character.rarity,
    href:'/ansiklopedi?q='+encodeURIComponent(character.name),
    search:[character.name,character.anime,character.rarity].join(' ')
  }));
  const spells=Object.entries(RPG_SPELL_DETAILS).map(([key,spell])=>({
    category:'spell',title:spell.name,description:spell.cost+' · '+spell.effect+' · Discord /buyular',
    href:'/komutlar',search:[key,spell.name,spell.cost,spell.effect,'buyular'].join(' ')
  }));
  const index=[...pages,...commands,...characters,...spells];
  const results=(q?index.filter(item=>(!category||item.category===category)&&normalize(item.search).includes(normalize(q))):pages.slice(0,6)).slice(0,60);
  const labels={page:'Sayfa',command:'Discord komutu',character:'Karakter',spell:'Büyü'};
  const resultCards=results.map(item=>'<a class="card site-search-result" href="'+esc(item.href)+'" data-search-category="'+item.category+'"><span class="eyebrow">'+labels[item.category]+'</span><h2>'+esc(item.title)+'</h2><p>'+esc(item.description)+'</p></a>').join('');
  const content='<main class="wrap site-search-page"><header class="section-head"><span class="eyebrow">FRIEREN PORTALI · EVRENSEL ARAMA</span><h1>Site Araması</h1><p>Sayfaları, Discord komutlarını, karakterleri ve büyüleri tek yerden bul.</p></header><form class="card site-search-form" method="get" action="/ara"><label>Ne arıyorsun?<input type="search" name="q" value="'+esc(q)+'" maxlength="80" placeholder="Örn. Frieren, /kesif, Alev Küresi…" autofocus></label><label>İçerik türü<select name="category"><option value="">Tüm içerikler</option><option value="page"'+(category==='page'?' selected':'')+'>Sayfalar</option><option value="command"'+(category==='command'?' selected':'')+'>Discord komutları</option><option value="character"'+(category==='character'?' selected':'')+'>Karakterler</option><option value="spell"'+(category==='spell'?' selected':'')+'>Büyüler</option></select></label><button class="btn primary" type="submit">Ara</button></form><div class="site-search-summary" aria-live="polite">'+(q?results.length+' sonuç bulundu':'Popüler içerikler')+'</div><section class="site-search-results" aria-label="Arama sonuçları">'+(resultCards||'<article class="card site-search-empty">Bu aramayla eşleşen içerik bulunamadı. Farklı bir kelime veya içerik türü dene.</article>')+'</section></main>';
  return page('Site Araması',content,user,{
    description:'Frieren portalında sayfaları, Discord komutlarını, anime karakterlerini ve büyüleri tek yerden ara.',
    canonical:'https://frierenbot.vercel.app/ara',
    indexable:false
  });
}

function characterEncyclopediaPage(user) {
  const animeOptions=[...new Set(ANIME_CHARACTERS.map(character=>character.anime))].sort((a,b)=>a.localeCompare(b,'tr'));
  const rarityOptions=[...new Set(ANIME_CHARACTERS.map(character=>character.rarity))].sort((a,b)=>a.localeCompare(b,'tr'));
  const animeSelect=animeOptions.map(value=>'<option value="'+esc(value)+'">'+esc(value)+'</option>').join('');
  const raritySelect=rarityOptions.map(value=>'<option value="'+esc(value)+'">'+esc(value)+'</option>').join('');
  const cards=ANIME_CHARACTERS.map(character=>{
    const search=[character.name,character.anime,character.rarity].join(' ').toLocaleLowerCase('tr-TR');
    return '<article class="card encyclopedia-character-card" data-character-card data-search="'+esc(search)+'" data-anime="'+esc(character.anime)+'" data-rarity="'+esc(character.rarity)+'"><div class="encyclopedia-character-heading"><span class="encyclopedia-character-emoji" aria-hidden="true">'+esc(character.emoji||'✧')+'</span><div><h2>'+esc(character.name)+'</h2><small>'+esc(character.anime)+'</small></div><span class="encyclopedia-rarity">'+esc(character.rarity)+'</span></div><button class="btn ghost" type="button" data-character-spoiler-toggle aria-expanded="false">Gizli bilgileri göster</button><div class="character-spoiler" data-character-spoiler hidden><p>'+esc(character.description)+'</p><small>'+esc(character.traits)+'</small></div></article>';
  }).join('');
  const content='<main class="wrap encyclopedia-page" data-character-encyclopedia><header class="section-head"><span class="eyebrow">FRIEREN DÜNYASI · KARAKTER ARŞİVİ</span><h1>Karakter Ansiklopedisi</h1><p>Frieren ve diğer anime evrenlerinden karakterleri ara, seriye ve nadirliğe göre filtrele. Karakter açıklamaları spoiler olmaması için başlangıçta kapalıdır.</p></header><section class="card encyclopedia-toolbar" aria-label="Karakter filtreleri"><label>Karakter ara<input type="search" data-character-search placeholder="İsim, seri veya nadirlik ara…" autocomplete="off"></label><label>Anime serisi<select data-character-anime><option value="">Tüm seriler</option>'+animeSelect+'</select></label><label>Nadirlik<select data-character-rarity><option value="">Tüm nadirlikler</option>'+raritySelect+'</select></label><output data-character-count aria-live="polite">'+ANIME_CHARACTERS.length+' / '+ANIME_CHARACTERS.length+' karakter</output></section><section class="encyclopedia-character-grid" aria-label="Karakterler">'+cards+'</section><p class="card encyclopedia-empty" data-character-empty hidden>Bu filtrelerle eşleşen karakter bulunamadı.</p></main>';
  return page('Karakter Ansiklopedisi',content+'<script src="/assets/character-encyclopedia.js" defer></script>',user,{
    description:'Frieren evreni ve anime karakterlerini ara, seriye ve nadirliğe göre filtrele; spoiler ayrıntılarını istediğinde aç.',
    canonical:'https://frierenbot.vercel.app/ansiklopedi',
    indexable:true
  });
}

function commandCatalog(client, user) {
  const commands = [...(client?.commands?.values?.() || [])]
    .map(command => {
      const data = typeof command?.data?.toJSON === 'function' ? command.data.toJSON() : command?.data;
      if (!data?.name) return null;
      const description = String(data.description || 'Komut açıklaması henüz eklenmemiş.');
      return {
        name: String(data.name), description, category: getPublicCommandCategory(data.name, description),
        options: Array.isArray(data.options) ? data.options : [],
        permissionLabel: getPublicCommandPermissionLabel(data),
        dmAllowed: data.dm_permission !== false,
        nsfw: data.nsfw === true
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  const categories = [...new Set(commands.map(command => command.category))].sort((a, b) => a.localeCompare(b, 'tr'));
  const categoryOptions = ['<option value="all">Tüm kategoriler</option>', ...categories.map(category => '<option value="' + esc(category) + '">' + esc(category) + '</option>')].join('');
  const cards = commands.map(command => '<article class="command-card" data-name="' + esc((command.name + ' ' + command.description + ' ' + command.options.map(option => option.name || '').join(' ')).toLocaleLowerCase('tr')) + '" data-category="' + esc(command.category) + '"><div class="command-card-top"><code>/' + esc(command.name) + '</code><span>' + esc(command.category) + '</span></div><p>' + esc(command.description) + '</p><div class="command-meta"><span>' + esc(command.permissionLabel) + '</span><span>' + (command.dmAllowed ? 'Sunucu ve izin verilen DM bağlamları' : 'DM kullanımına kapalı') + '</span>' + (command.nsfw ? '<span>Yaş kısıtlı kanal</span>' : '') + '</div><details class="command-details"><summary>Parametreler ve kullanım</summary>' + renderPublicCommandOptions(command.options) + '</details></article>').join('');
  const content = '<main><section class="wrap catalog-hero"><div class="eyebrow">✧ KOMUT ARŞİVİ · FRIEREN YOLCULUĞU ✧</div><h1 class="hero-title">Bütün <em>komutlar.</em></h1><p class="lead">Poğaça Frieren sunucunda kullanabileceğin komutları tek yerde keşfet. Arama yap, kategoriye göre filtrele ve yeni macerana hazırlan.</p><div class="catalog-count"><strong>' + commands.length + '</strong><span>yüklenmiş komut</span></div></section><section class="section"><div class="wrap"><div class="catalog-tools"><label class="sr-only" for="command-search">Komutlarda ara</label><input id="command-search" type="search" placeholder="Komut adı veya açıklamada ara…" autocomplete="off"><label class="sr-only" for="command-category">Kategori seç</label><select id="command-category">' + categoryOptions + '</select><span id="command-result-count" aria-live="polite">' + commands.length + '/' + commands.length + ' komut gösteriliyor</span></div><div class="command-catalog" id="command-catalog">' + (cards || '<p class="muted">Komut kataloğu şu anda yüklenemiyor.</p>') + '</div><p class="catalog-empty" id="command-empty" hidden>Bu aramayla eşleşen komut bulunamadı.</p></div></section><section class="section"><div class="wrap cta"><h2>Maceraya hazır mısın?</h2><p>Komutları Discord sunucunda kullanarak kendi hikâyeni oluştur.</p><a class="btn" href="/pogaca">Poğaça Frieren sayfasına dön</a></div></section></main><script>(()=>{const search=document.getElementById("command-search");const category=document.getElementById("command-category");const cards=[...document.querySelectorAll(".command-card")];const count=document.getElementById("command-result-count");const empty=document.getElementById("command-empty");const filter=()=>{const query=search.value.trim().toLocaleLowerCase("tr");let visible=0;for(const card of cards){const matchesText=card.dataset.name.includes(query);const matchesCategory=category.value==="all"||card.dataset.category===category.value;const show=matchesText&&matchesCategory;card.hidden=!show;if(show)visible++;}count.textContent=visible+" / "+cards.length+" komut gösteriliyor";empty.hidden=visible!==0;};search.addEventListener("input",filter);category.addEventListener("change",filter);})();</script>';
  return page('Komut Arşivi', content, user);
}

function adventurerClassEmblem(className) {
  const value=String(className||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('tr-TR');
  const classes=[
    {keys:['buyucu','mage','wizard','sihirbaz'],label:'Büyücü',path:'M12 2 14.8 9.2 22 12l-7.2 2.8L12 22l-2.8-7.2L2 12l7.2-2.8L12 2Z'},
    {keys:['savasci','warrior','berserker','dovuscu'],label:'Savaşçı',path:'M5 3l6 6-2 2-6-6V3h2Zm14 0v2l-6 6-2-2 6-6h2ZM8 13l3 3-5 5-3-3 5-5Zm8 0 5 5-3 3-5-5 3-3Z'},
    {keys:['sovalye','knight','paladin','muhafiz'],label:'Şövalye',path:'M12 2 20 5v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5l8-3Zm0 4-4 2v3c0 3 1.5 5.5 4 7 2.5-1.5 4-4 4-7V8l-4-2Z'},
    {keys:['okcu','archer','avci','hunter'],label:'Okçu',path:'M4 20 20 4m-9 0h9v9M5 7l12 12m-7-12 7 7'},
    {keys:['suikastci','assassin','ninja','hirsiz','rogue'],label:'Suikastçı',path:'M12 2 22 12 12 22 2 12 12 2Zm0 5-5 5 5 5 5-5-5-5Z'},
    {keys:['rahip','priest','sifaci','healer','cleric'],label:'Rahip',path:'M10 2h4v8h8v4h-8v8h-4v-8H2v-4h8V2Z'},
    {keys:['simyaci','alchemist'],label:'Simyacı',path:'M9 2h6v2h-1v5l6 10a2 2 0 0 1-2 3H6a2 2 0 0 1-2-3l6-10V4H9V2Zm3 9-5 9h10l-5-9Z'},
    {keys:['cagirici','summoner','warlock'],label:'Çağırıcı',path:'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12Zm0 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z'}
  ];
  const selected=classes.find(item=>item.keys.some(key=>value.includes(key)))||{label:String(className||'Maceracı'),path:'M12 2 14 9l7 3-7 3-2 7-3-7-7-3 7-3 3-7Z'};
  return '<span class="adventurer-class-emblem" role="img" aria-label="'+esc(selected.label)+' sınıfı" title="'+esc(selected.label)+'"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+selected.path+'"/></svg></span>';
}

function adventurerPanel(user, data, status) {
  const notice = status === 'linked' ? '<p class="notice">Discord karakterin web hesabına bağlandı.</p>' :
    status === 'invalid' ? '<p class="notice">Bağlantı kodu geçersiz, süresi dolmuş veya daha önce kullanılmış.</p>' :
    status === 'joined' ? '<p class="notice">Etkinliğe katılımın kaydedildi.</p>' :
    status === 'left' ? '<p class="notice">Etkinlikten ayrıldın.</p>' :
    status === 'full' ? '<p class="notice">Etkinliğin katılımcı kapasitesi dolu.</p>' :
    status === 'already_joined' ? '<p class="notice">Bu etkinliğe zaten kayıtlısın.</p>' :
    status === 'team_full' ? '<p class="notice">Seçtiğin raid takımı dolu. Diğer takımı seç.</p>' :
    status === 'team_required' ? '<p class="notice">Boss / Raid etkinliğine katılmak için üyesi olduğun bir lonca takımını seç.</p>' :
    status === 'not_team_member' ? '<p class="notice">Bu takıma üye değilsin. Önce Discord’da /etkinlik takim-katil komutuyla katıl.</p>' :
    status === 'invalid_team' ? '<p class="notice">Takım kimliği geçersiz. Takımını yeniden seç.</p>' : '';
  const profiles = data.profiles.map(profile => {
    const hp = Math.max(0, Math.min(100, Number(profile.hp) / Math.max(1, Number(profile.max_hp)) * 100));
    const mana = Math.max(0, Math.min(100, Number(profile.mana) / Math.max(1, Number(profile.max_mana)) * 100));
    const guild = encodeURIComponent(profile.guild_id);
    const xpProgress = playerXpProgress(profile, isVipSiteAccount(user));
    return '<article class="card adventurer-character-card">' + adventurerClassEmblem(profile.class_name) + '<div class="eyebrow">SUNUCU · ' + esc(profile.guild_id) + '</div><h2>' + esc(profile.character_name || 'Maceracı') + '</h2><p>' + esc(profile.class_name) + ' · Seviye ' + levelForXp(profile.xp) + '</p>' + xpProgress + '<div class="stats" id="battle-stats"><span><b>' + Number(profile.xp) + '</b> XP</span><span><b>' + Number(profile.coins) + '</b> Altın</span><span><b>' + Number(profile.rating) + '</b> MMR</span></div><p>HP ' + Number(profile.hp) + '/' + Number(profile.max_hp) + '</p><div class="progress"><i style="width:' + hp.toFixed(1) + '%"></i></div><p>Mana ' + Number(profile.mana) + '/' + Number(profile.max_mana) + '</p><div class="progress"><i style="width:' + mana.toFixed(1) + '%"></i></div><p>' + esc(profile.season_name || 'Sezon başlamadı') + ' · ' + Number(profile.wins) + ' galibiyet / ' + Number(profile.losses) + ' mağlubiyet</p><div class="actions"><a class="btn ghost" href="/maceraci/envanter?guildId=' + guild + '">Envanterim</a><a class="btn ghost" href="/maceraci/koleksiyon?guildId=' + guild + '">Koleksiyonum</a><a class="btn ghost" href="/maceraci/sosyal?guildId=' + guild + '">Sosyal alanım</a><a class="btn ghost" href="/maceraci/yasam?guildId=' + guild + '">Yaşam alanım</a><a class="btn ghost" href="/maceraci/bildirimler?guildId=' + guild + '">Haberci kuş ve bildirimler</a><a class="btn ghost" href="/maceraci/atolye?guildId=' + guild + '">Embed / Büyü Atölyesi</a><a class="btn ghost" href="/pazar?guildId=' + guild + '">Kuzey Pazarı</a></div></article>';
  }).join('');
  const events = data.events.map(event => {
    const action = event.joined ? 'leave' : 'join';
    const label = event.joined ? 'Katılımdan ayrıl' : event.event_type==='boss_raid'?'Raid takımına katıl':'Etkinliğe katıl';
    const teams=Array.isArray(event.available_teams)?event.available_teams:[];
    const teamOptions=teams.map(team=>'<option value="'+esc(team.team_id)+'">'+esc(team.team_name)+'</option>').join('');
    const joinedTeam=event.joined_team_name||(event.joined_team_key?'Takım '+event.joined_team_key:'');
    const teamChoice=event.event_type==='boss_raid'&&!event.joined
      ? teams.length?'<label>Raid takımı<select name="teamId" required><option value="">Üyesi olduğun takımı seç</option>'+teamOptions+'</select></label>':'<p class="market-meta">Raid kaydı için önce Discord’da /etkinlik takim-olustur veya /etkinlik takim-katil ile bir takıma katıl.</p>'
      :event.joined&&joinedTeam?'<p class="market-meta">Katıldığın raid takımı: '+esc(joinedTeam)+'</p>':'';
    const canJoin=event.event_type!=='boss_raid'||event.joined||teams.length>0;
    return '<article class="card"><div class="eyebrow">' + esc(event.event_type) + '</div><h3>' + esc(event.title) + '</h3><p>' + esc(event.description || 'Açıklama yok.') + '</p><p><b>' + esc(new Date(event.starts_at).toLocaleString('tr-TR', { dateStyle:'medium', timeStyle:'short', timeZone:'Europe/Istanbul' })) + '</b></p><p>' + Number(event.participants) + (event.max_participants ? '/' + Number(event.max_participants) : '') + ' katılımcı</p><form method="post" action="/maceraci/event"><input type="hidden" name="csrf" value="' + esc(createSiteCsrfToken(process.env.ADMIN_SESSION_SECRET)) + '"><input type="hidden" name="guildId" value="' + esc(event.guild_id) + '"><input type="hidden" name="eventId" value="' + esc(event.event_id) + '"><input type="hidden" name="action" value="' + action + '">' + teamChoice + '<button class="btn ghost" type="submit"'+(canJoin?'':' disabled')+'>' + label + '</button></form></article>';
  }).join('');
  const empty = '<article class="card"><h2>Henüz bağlı karakter yok</h2><p>Discord sunucunda <b>/maceraci bagla</b> komutunu çalıştır. Sana özel, 10 dakika geçerli bağlantı kodunu buraya gir.</p></article>';
  const content = '<main class="wrap" style="padding:54px 0 80px"><div class="eyebrow">✧ FRIEREN ADVENTURER PORTAL ✧</div><h1 class="hero-title">Maceracı <em>Paneli</em></h1><p class="lead">Discord karakterlerinin ilerlemesi, arena sezonları ve yaklaşan topluluk etkinlikleri.</p>' + notice +
    '<section class="section"><div class="section-head"><h2>Karakterlerim</h2><p>Yalnızca tek kullanımlık Discord bağlantı koduyla bağlanan profiller gösterilir.</p></div><div class="grid">' + (profiles || empty) + '</div></section>' +
    '<section class="section"><div class="card"><h2>Discord karakterini bağla</h2><form method="post" action="/maceraci/link"><input type="hidden" name="csrf" value="' + esc(createSiteCsrfToken(process.env.ADMIN_SESSION_SECRET)) + '"><label for="link-token">Tek kullanımlık bağlantı kodu</label><input id="link-token" name="token" minlength="24" maxlength="80" autocomplete="one-time-code" required><button class="btn" type="submit">Karakteri bağla</button></form></div></section>' +
    '<section class="section"><div class="section-head"><h2>Etkinlik Takvimi</h2><p>Bağlı olduğun Discord sunucularındaki yaklaşan maceralar.</p></div><div class="grid">' + (events || '<article class="card"><p>Bağlı sunucularında yaklaşan etkinlik bulunmuyor.</p></article>') + '</div></section></main>' +
    '<style>.notice{padding:14px 18px;border:1px solid #7664a9;border-radius:14px;margin:18px 0}.progress{height:8px;border-radius:20px;background:#29263d;overflow:hidden}.progress i{display:block;height:100%;background:#9b83d7}.card form{display:grid;gap:12px}.card input,.card select{width:100%;padding:13px;border-radius:10px;border:1px solid #62577d;background:#17152c;color:#fff}.card label{font-weight:600}.portal-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}.market-price{font-size:1.2rem;font-weight:700;color:#d9c8ff}.market-meta{color:#b9b2d1;font-size:.92rem}.portal-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}</style>';
  return page('Maceracı Paneli', content, { ...user, playerProfiles: data.profiles });
}

function portalGuildPicker(user, profiles, route, title) {
  const [routePath, routeHash=''] = String(route).split('#', 2);
  if (!profiles.length) return page(title, '<main class="wrap" style="padding:54px 0 80px"><h1 class="hero-title">Maceracı <em>bağlantısı gerekli</em></h1><article class="card"><p>Önce Discord sunucunda <b>/maceraci bagla</b> komutuyla karakterini web hesabına bağla.</p><a class="btn" href="/maceraci">Maceracı paneline dön</a></article></main>', user);
  const cards = profiles.map(profile => '<article class="card adventurer-character-card">' + adventurerClassEmblem(profile.class_name) + '<div class="eyebrow">' + esc(profile.guild_id) + '</div><h2>' + esc(profile.character_name || 'Maceracı') + '</h2><p>' + esc(profile.class_name) + ' · Seviye ' + Number(profile.level) + '</p><a class="btn" href="' + routePath + '?guildId=' + encodeURIComponent(profile.guild_id) + (routeHash ? '#' + esc(routeHash) : '') + '">Bu sunucuyu seç</a></article>').join('');
  return page(title, '<main class="wrap" style="padding:54px 0 80px"><div class="eyebrow">✧ MACERACI LONCASI</div><h1 class="hero-title">Sunucunu <em>seç.</em></h1><p class="lead">İşlemler yalnızca Discord hesabına bağladığın karakterin bulunduğu sunucuda yapılır.</p><div class="portal-grid">' + cards + '</div></main>', user);
}


async function loadAdventurerCollections(db, guildId, userId) {
  const [companion, fish, farm, creatures, creatureWishlist, characterWishlist, cardVariants] = await Promise.all([
    getCompanion(db, guildId, userId), getFishCollection(db, guildId, userId), getFarmPlot(db, guildId, userId),
    getCreatureCollection(db, guildId, userId), getCreatureWishlist(db, guildId, userId), getCharacterWishlist(db, guildId, userId), listCardVariants(db,guildId,userId)
  ]);
  return { companion, fish, farm, creatures, creatureWishlist, characterWishlist, cardVariants };
}

function adventurerCollectionPage(user, profile, collection) {
  const guild = encodeURIComponent(profile.guild_id);
  const companion = collection.companion
    ? '<article class="card"><div class="eyebrow">YOLDAŞ AKADEMİSİ</div><h2>' + esc(collection.companion.catalog?.name || collection.companion.companion_key) + '</h2><p>Seviye ' + Number(collection.companion.level) + ' · ' + Number(collection.companion.xp) + ' XP</p><p>Mutluluk ' + Number(collection.companion.happiness) + '/100 · Enerji ' + Number(collection.companion.energy) + '/100 · Açlık ' + Number(collection.companion.hunger) + '/100</p></article>'
    : '<article class="card"><div class="eyebrow">YOLDAŞ AKADEMİSİ</div><h2>Henüz yoldaşın yok</h2><p>Discord’da /yoldas sahiplen komutuyla ilk yoldaşını seçebilirsin.</p></article>';
  const fishEntries = collection.fish.entries.map(row => '<li>' + esc(row.fish?.emoji || '🐟') + ' ' + esc(row.fish?.name || row.fish_key) + ' × ' + Number(row.quantity) + ' <span class="market-meta">· ' + esc(row.fish?.rarity || 'Bilinmiyor') + '</span></li>').join('');
  const creatureEntries = collection.creatures.entries.map(row => '<li>' + (row.creature?.variant === 'shiny' ? '✨ ' : '') + esc(row.creature?.emoji || '✧') + ' ' + esc(row.creature?.name || row.creature_key) + ' × ' + Number(row.quantity) + ' <span class="market-meta">· ' + esc(row.creature?.rarity || 'Bilinmiyor') + '</span></li>').join('');
  const creatureWishes = collection.creatureWishlist.map(item => '<li>' + esc(item.emoji) + ' ' + esc(item.name) + ' · ' + esc(item.rarity) + '</li>').join('');
  const characterWishes = collection.characterWishlist.map(item => '<li>' + esc(item.character?.emoji || '🎴') + ' ' + esc(item.character_name) + ' · ' + esc(item.character?.rarity || 'Karakter') + '</li>').join('');
  const cardVariantEntries = collection.cardVariants.map(item => '<article class="card"><div class="eyebrow">' + esc(item.series_name) + '</div><h3>' + esc(item.character_name) + '</h3><p>' + esc(item.variant.label) + ' · ×' + Number(item.quantity) + '</p></article>').join('');
  const farm = collection.farm
    ? '<p><b>' + esc(collection.farm.seed?.name || collection.farm.seed_key) + '</b> · ' + (collection.farm.ready ? 'Hasada hazır' : 'Yetişiyor') + '</p><p class="market-meta">Hasat zamanı: ' + esc(new Date(collection.farm.harvest_at).toLocaleString('tr-TR', { dateStyle:"medium", timeStyle:"short", timeZone:"Europe/Istanbul" })) + '</p>'
    : '<p>Şu anda ekili bitkin yok. Discord’da /sera ekim ile başlayabilirsin.</p>';
  const content = '<main class="wrap user-center-page collection-center-page" style="padding:54px 0 80px"><header class="user-center-hero"><div class="eyebrow">✧ FRIEREN KOLEKSİYON ARŞİVİ</div><h1 class="hero-title">Koleksiyon <em>Arşivim.</em></h1><p class="lead">Yoldaş, balık, yaratık, sera ve anime kartlarını kendi vitrininde keşfet.</p><div class="user-center-metrics"><article><span>Balık türü</span><strong>'+Number(collection.fish.unique)+'</strong></article><article><span>Yaratık varyantı</span><strong>'+Number(collection.creatures.unique)+'</strong></article><article><span>Karakter hedefi</span><strong>'+collection.characterWishlist.length+'/10</strong></article><article><span>Kart varyantı</span><strong>'+collection.cardVariants.length+'</strong></article></div></header><nav class="user-center-tabs" aria-label="Kullanıcı merkezi"><a href="/maceraci/profil">Hesap Profilim</a><a href="/maceraci/sosyal">Sosyal Alan</a><a href="/maceraci/yasam">Yaşam Alanım</a><a href="/maceraci/koleksiyon" aria-current="page">Koleksiyonum</a><a href="/destek">Hesap ve Destek</a></nav><p class="lead">Aktif karakter: '+esc(profile.character_name||'Maceracı')+' · Koleksiyonlar sunucu karakterine bağlıdır.</p><p class="lead">Yoldaşın, balık defterin, yaratıkların ve takip ettiğin karakterler. Veriler seçili Discord sunucusundan okunur.</p><div class="portal-actions"><a class="btn ghost" href="/maceraci">Maceracı paneli</a><a class="btn ghost" href="/maceraci/envanter?guildId=' + guild + '">Envanterim</a><a class="btn ghost" href="/pazar?guildId=' + guild + '">Kuzey Pazarı</a></div><section class="section"><div class="section-head"><h2>Anime Kart Serileri ve Varyantlar</h2><p>Keşfettiğin karakterlerin farklı baskıları ayrı ayrı saklanır.</p></div><div class="portal-grid">' + (cardVariantEntries || '<article class="card"><p>Henüz kart varyantı keşfetmedin.</p></article>') + '</div></section><section class="section"><div class="portal-grid">' + companion + '<article class="card"><div class="eyebrow">KUZEY BALIK DEFTERİ</div><h2>' + Number(collection.fish.unique) + '/' + Number(collection.fish.totalSpecies) + ' tür</h2><p>' + Number(collection.fish.caught) + ' toplam yakalama</p><ul>' + (fishEntries || '<li>Henüz balık yakalamadın.</li>') + '</ul></article><article class="card"><div class="eyebrow">BÜYÜLÜ SERA</div><h2>Bitki durumun</h2>' + farm + '</article><article class="card"><div class="eyebrow">YARATIK ARŞİVİ</div><h2>' + Number(collection.creatures.unique) + '/' + Number(collection.creatures.totalSpecies) + ' varyant</h2><p>' + Number(collection.creatures.total) + ' toplam yakalama</p><ul>' + (creatureEntries || '<li>Henüz yaratık yakalamadın.</li>') + '</ul></article><article class="card"><div class="eyebrow">YARATIK İSTEK LİSTESİ</div><h2>' + collection.creatureWishlist.length + ' takip</h2><ul>' + (creatureWishes || '<li>Henüz takip ettiğin yaratık yok.</li>') + '</ul></article><article class="card"><div class="eyebrow">KARAKTER İSTEK LİSTESİ</div><h2>' + collection.characterWishlist.length + '/10 hedef</h2><ul>' + (characterWishes || '<li>Henüz takip ettiğin karakter yok.</li>') + '</ul></article></div></section></main>';
  return page('Maceracı Koleksiyonu', content, user);
}

function adventurerInventoryPage(user, data) {
  const inventoryRows=Array.isArray(data.items)?data.items:[];
  const items = inventoryRows.map(item => '<article class="card"><h3>' + esc(item.item_key) + '</h3><p>Adet: <b>' + Number(item.quantity) + '</b></p><p class="market-meta">' + (item.slot ? 'Takılı: ' + esc(({weapon:'Silah',armor:'Zırh',ring1:'Yüzük I',ring2:'Yüzük II'})[item.slot] || item.slot) : 'Envanter') + '</p></article>').join('');
  const guild = encodeURIComponent(data.profile.guild_id);
  const content = '<main class="wrap user-center-page inventory-center-page" style="padding:54px 0 80px"><header class="user-center-hero"><div class="eyebrow">✧ FRIEREN MACERACI EKİPMANI</div><h1 class="hero-title">Envanter <em>Arşivim.</em></h1><p class="lead">Eşyaların ve kuşanılmış ekipmanların seçili RPG karakterine göre düzenlenir.</p><div class="user-center-metrics"><article><span>Farklı eşya</span><strong>'+items.length+'</strong></article><article><span>Toplam adet</span><strong>'+inventoryRows.reduce((sum,item)=>sum+Number(item.quantity||0),0)+'</strong></article><article><span>Takılı ekipman</span><strong>'+inventoryRows.filter(item=>item.slot).length+'</strong></article><article><span>Sunucu</span><strong>Aktif</strong></article></div></header><nav class="user-center-tabs" aria-label="Kullanıcı merkezi"><a href="/maceraci/profil">Hesap Profilim</a><a href="/maceraci/sosyal">Sosyal Alan</a><a href="/maceraci/yasam">Yaşam Alanım</a><a href="/maceraci/envanter" aria-current="page">Envanterim</a><a href="/destek">Hesap ve Destek</a></nav><p class="lead">Yalnızca bağladığın Discord karakterinin bu sunucudaki eşyaları görüntülenir.</p><div class="portal-actions"><a class="btn" href="/pazar?guildId=' + guild + '">Kuzey Pazarı</a><a class="btn ghost" href="/maceraci">Maceracı paneli</a></div><section class="section"><div class="portal-grid">' + (items || '<article class="card"><p>Envanterinde henüz eşya yok.</p></article>') + '</div></section></main>';
  return page('Maceracı Envanteri', content, user);
}

export const COSMETIC_SLOT_LABELS=Object.freeze({profile_frame:'Profil çerçevesi',nameplate:'İsimlik',title_effect:'Unvan efekti',spell_trail:'Büyü izi',victory_pose:'Zafer duruşu',avatar_border:'Avatar kenarlığı',guild_banner:'Profil sancağı',seasonal_theme:'Mevsim teması',collection_display:'Koleksiyon vitrini'});
const COSMETIC_SLOT_GLYPHS=Object.freeze({profile_frame:'◉',nameplate:'✧',title_effect:'✦',spell_trail:'➶',victory_pose:'⚔',avatar_border:'◌',guild_banner:'⚑',seasonal_theme:'❄',collection_display:'◇'});
function cosmeticShowcaseCard(item,compact=false){
 if(!item||!COSMETIC_SLOT_LABELS[item.slot])return '';
 return '<article class="cosmetic-showcase-item cosmetic-slot--'+esc(item.slot)+'" data-cosmetic-key="'+esc(item.key)+'"><div class="cosmetic-preview" aria-hidden="true"><span class="cosmetic-preview-orbit"></span><strong>'+COSMETIC_SLOT_GLYPHS[item.slot]+'</strong></div><div class="cosmetic-showcase-copy"><strong>'+esc(item.name)+'</strong><span>'+COSMETIC_SLOT_LABELS[item.slot]+'</span></div></article>';
}

export function publicHomeShowcasePage(user,data){
 const settings=data.settings||{show_stats:false,show_achievements:true,show_collections:true,show_activity:false,show_cosmetics:true};
 const rooms=data.rooms.map(x=>HOME_ROOMS.find(r=>r.key===x.room_key)?.name||x.room_key);
 const unlockedRooms=new Set(data.rooms.map(x=>x.room_key));
 const stationPanel=HOME_STATIONS.map(station=>'<article class="card"><h3>'+esc(station.name)+'</h3><p class="market-meta">'+(unlockedRooms.has(station.roomKey)?'Açık':'Kilitli')+'</p></article>').join('');
 const achievementById=new Map(RPG_ACHIEVEMENTS.map(item=>[item.id,item]));
 const trophies=settings.show_achievements?data.trophies.filter(x=>x.display_slot!==null).sort((a,b)=>a.display_slot-b.display_slot).map(x=>'<li>Vitrin '+Number(x.display_slot)+': '+esc(achievementById.get(x.achievement_key)?.title||x.achievement_key)+'</li>').join(''):'';
 const equippedItems=settings.show_cosmetics?(data.loadout||[]).map(x=>PLAYER_COSMETICS.find(c=>c.key===x.cosmetic_key)).filter(Boolean):[];
 const loadout=equippedItems.map(item=>cosmeticShowcaseCard(item,true)).join('');
 const equippedBanner=equippedItems.find(item=>item.slot==='guild_banner')||null;
 const seasonalTheme=equippedItems.find(item=>item.slot==='seasonal_theme')||null;
 const cosmeticTheme=seasonalTheme?.key==='spring_theme'?'spring':seasonalTheme?.key==='winter_theme'?'winter':'default';
 const bannerKey=equippedBanner?.key==='frieren_banner'?'frieren':equippedBanner?.key==='north_banner'?'north':'default';
 const bannerName=equippedBanner?.name||'Yolculuk Sancağı';
 const banner='<section class="section"><article class="player-banner player-banner--'+bannerKey+'" aria-label="Maceracı profil sancağı"><div class="player-banner-content"><span class="eyebrow">✧ MACERACI SANCAGI</span><h2>'+esc(bannerName)+'</h2><p>'+esc(data.profile.character_name||'Maceracı')+' · '+esc(data.profile.class_name||'Gezgin')+' · Seviye '+Number(data.profile.level||1)+'</p></div></article></section>';
 const companion=data.companion?'<article class="card"><h3>'+esc(data.companion.catalog?.name||data.companion.companion_key)+'</h3><p>Seviye '+Number(data.companion.level)+' · '+Number(data.companion.xp)+' XP</p><p>Gelişim aşaması '+Number(data.companion.evolution_stage||1)+'</p></article>':'<article class="card">Henüz sergilenecek yoldaş yok.</article>';
 const cards=(data.cardVariants||[]).map(item=>'<article class="card"><div class="eyebrow">'+esc(item.series_name)+'</div><h3>'+esc(item.character_name)+'</h3><p>'+esc(item.variant?.label||item.variant_key)+' · ×'+Number(item.quantity)+'</p></article>').join('');
 const layout=Array.isArray(data.home.layout)?data.home.layout:[];
 const stats=settings.show_stats?'<section class="section"><h2>Savaş İstatistikleri</h2><article class="card"><p>Boss zaferi: '+Number(data.profile.boss_defeats||0)+' · Zindan zaferi: '+Number(data.profile.dungeon_wins||0)+'</p></article></section>':'';
 const collections=settings.show_collections?'<section class="section"><h2>Anime Kart Koleksiyonu</h2><div class="portal-grid">'+(cards||'<article class="card">Henüz sergilenen kart yok.</article>')+'</div><section class="section"><h2>Yoldaş Vitrini</h2><div class="portal-grid">'+companion+'</div></section>':'';
 const activity=settings.show_activity?'<section class="section"><h2>Son Macera Etkinlikleri</h2><article class="card">'+((data.activity||[]).map(x=>'<p>'+esc(x.activity_type)+' · '+esc(x.activity_label)+' · '+esc(new Date(x.activity_at).toLocaleDateString('tr-TR'))+'</p>').join('')||'Henüz herkese açık etkinlik yok.')+'</article></section>':'';
 const achievementSection=settings.show_achievements?'<section class="section"><h2>Rozet ve Başarım Vitrini</h2><article class="card">'+(trophies?'<ul>'+trophies+'</ul>':'Henüz sergilenen kupa yok.')+'</article></section>':'';
 const cosmeticsSection=settings.show_cosmetics?'<section class="section"><h2>Kuşanılan Kozmetikler</h2><div class="cosmetic-showcase-grid cosmetic-showcase-grid--profile">'+(loadout||'<article class="card"><p>Kozmetik kuşanılmamış.</p></article>')+'</div></section>':'';
 const activeTitle=settings.active_title?'<p class="profile-active-title">'+esc(settings.active_title)+'</p>':'';
 const cosmeticForSlot=slot=>equippedItems.find(item=>item.slot===slot)||null;
 const profileFrame=cosmeticForSlot('profile_frame'),avatarBorder=cosmeticForSlot('avatar_border'),nameplate=cosmeticForSlot('nameplate'),titleEffect=cosmeticForSlot('title_effect'),spellTrail=cosmeticForSlot('spell_trail'),victoryPose=cosmeticForSlot('victory_pose');
 const cosmeticIdentity=settings.show_cosmetics?'<section class="player-cosmetic-identity" aria-label="Kuşanılan profil efektleri"><div class="player-cosmetic-avatar" data-profile-frame="'+esc(profileFrame?.key||'none')+'" data-avatar-border="'+esc(avatarBorder?.key||'none')+'" aria-hidden="true"><span>✧</span></div><div class="player-cosmetic-identity-copy"><div class="player-cosmetic-nameplate" data-nameplate="'+esc(nameplate?.key||'none')+'"><h2 class="player-cosmetic-character-name" data-title-effect="'+esc(titleEffect?.key||'none')+'">'+esc(data.profile.character_name||'Maceracı')+'</h2><p>'+esc(data.profile.class_name||'Gezgin')+' · Seviye '+levelForXp(data.profile.xp)+'</p></div>'+activeTitle+(spellTrail?'<div class="player-cosmetic-spell-trail" data-spell-trail="'+esc(spellTrail.key)+'"><span aria-hidden="true">✧ ━━━ ✦</span><span>'+esc(spellTrail.name)+'</span></div>':'')+(victoryPose?'<span class="player-cosmetic-victory-pose" data-victory-pose="'+esc(victoryPose.key)+'">✦ '+esc(victoryPose.name)+'</span>':'')+'</div></section>':'';
 const content='<main class="wrap player-showcase" data-cosmetic-theme="'+cosmeticTheme+'" style="padding:54px 0 80px"><div class="eyebrow">✧ PAYLAŞILABİLİR MACERACI PROFİLİ</div><h1 class="hero-title">'+esc(data.profile.character_name||'Maceracı')+' <em>Profil Vitrini</em></h1><p class="lead">Bu profil, oyuncunun açık paylaşım izniyle görüntüleniyor.</p>'+cosmeticIdentity+banner+'<section class="section"><article class="card"><h2>Maceracı Kimliği</h2>'+activeTitle+'<p><b>'+esc(data.profile.class_name||'Gezgin')+'</b> · Seviye '+levelForXp(data.profile.xp)+' · '+Number(data.profile.xp||0).toLocaleString('tr-TR')+' XP</p></article></section>'+stats+collections+'<section class="section"><h2>Açık Odalar</h2><div class="portal-grid">'+rooms.map(x=>'<article class="card"><h3>'+esc(x)+'</h3></article>').join('')+'</div></section><section class="section"><h2>Ev Yerleşimi</h2><div class="portal-grid">'+(layout.map(x=>'<article class="card"><h3>'+esc(HOME_ROOMS.find(r=>r.key===x.roomKey)?.name||x.roomKey)+'</h3><p>'+esc(x.decorationKey)+'</p><p class="market-meta">Konum '+Number(x.position)+'</p></article>').join('')||'<article class="card"><p>Henüz sergilenen dekorasyon yok.</p></article>')+'</div></section><section class="section"><h2>Ev İstasyonları</h2><div class="portal-grid">'+stationPanel+'</div></section>'+achievementSection+cosmeticsSection+activity+'</main>';
 return page('Topluluk Ev Vitrini',content,user);
}

async function loadPlayerDailyQuestBoard(db,guildId,userId,className){
 const result=await db.query('SELECT quest_key,title,description,objective_type,class_name,reward_coins,active,is_system FROM guild_daily_quests WHERE guild_id=$1 ORDER BY is_system DESC,title ASC LIMIT 100',[guildId]);
 const catalog=result.rows?.length?result.rows:DEFAULT_DAILY_QUESTS.map(quest=>({...quest,active:true,is_system:true}));
 const available=catalog.filter(quest=>quest.active===true&&(!quest.class_name||quest.class_name===className));
 const [claims,objectiveRows]=await Promise.all([
  db.query('SELECT mission_key FROM daily_mission_claims WHERE guild_id=$1 AND user_id=$2 AND mission_date=CURRENT_DATE',[guildId,userId]),
  Promise.all([...new Set(available.map(quest=>quest.objective_type))].map(async objectiveType=>{
   const progress=await db.query(getDailyQuestObjectiveSql(objectiveType),[guildId,userId]);
   return [objectiveType,Boolean(progress.rows?.[0]?.done)];
  }))
 ]);
 const claimed=new Set((claims.rows||[]).map(row=>row.mission_key));
 const progressByType=new Map(objectiveRows);
 return available.map(quest=>({...quest,done:progressByType.get(quest.objective_type)===true,claimed:claimed.has(quest.quest_key)}));
}

function playerProfilePage(user,profile,data,status){
 const owner=isOwnerSiteAccount(user),vip=!owner&&isVipSiteAccount(user),xp=playerXpProgress(profile,vip,owner),settings=data.settings||{},guild=encodeURIComponent(profile.guild_id);
 const achievementById=new Map(RPG_ACHIEVEMENTS.map(item=>[item.id,item]));
 const earned=(data.achievements||[]).map(row=>({...row,meta:achievementById.get(row.achievement_key)}));
 const pinned=earned.filter(row=>row.display_slot!==null&&Number(row.display_slot)>=0&&Number(row.display_slot)<=5).sort((a,b)=>Number(a.display_slot)-Number(b.display_slot));
 const topRewards=[...earned].sort((a,b)=>Number(b.meta?.reward||0)-Number(a.meta?.reward||0)).slice(0,3);
 const titleOptions=(data.titles||[]).map(row=>'<option value="'+esc(row.title)+'"'+(settings.active_title===row.title?' selected':'')+'>'+esc(row.title)+'</option>').join('');
 const boolSelect=(name,label,value)=>'<label>'+label+'<select name="'+name+'"><option value="false"'+(value?'':' selected')+'>Gizli</option><option value="true"'+(value?' selected':'')+'>Herkese açık</option></select></label>';
 const settingsForm='<form method="post" action="/maceraci/yasam" id="profile-settings-form" class="profile-settings-form"><input type="hidden" name="csrf" value="'+esc(createSiteCsrfToken(process.env.ADMIN_SESSION_SECRET))+'"><input type="hidden" name="guildId" value="'+guild+'"><input type="hidden" name="action" value="set-profile-settings">'+boolSelect('showStats','Savaş istatistikleri',settings.show_stats===true)+boolSelect('showAchievements','Başarımlar',settings.show_achievements!==false)+boolSelect('showCollections','Koleksiyonlar',settings.show_collections!==false)+boolSelect('showActivity','Son etkinlikler',settings.show_activity===true)+boolSelect('showCosmetics','Kuşanılan kozmetikler',settings.show_cosmetics!==false)+'<label>Aktif unvan<select name="activeTitle"><option value="">Unvan gösterme</option>'+titleOptions+'</select></label><button class="btn" type="submit">Gizlilik ayarlarını kaydet</button></form>';
 const stats=data.stats||{},arena=data.arena||{},collections=data.collections||{};
 const profileStats='<div class="profile-stat-grid"><article class="card"><strong>'+Number(stats.boss_defeats||0)+'</strong><span>Boss zaferi</span></article><article class="card"><strong>'+Number(stats.dungeon_wins||0)+'</strong><span>Zindan zaferi</span></article><article class="card"><strong>'+Number(arena.rating||1000)+'</strong><span>Arena MMR</span></article><article class="card"><strong>'+Number(arena.wins||0)+'G / '+Number(arena.losses||0)+'M</strong><span>Arena sonucu</span></article><article class="card"><strong>'+Number(stats.exploration_count||0)+'</strong><span>Keşif</span></article><article class="card"><strong>'+Number(stats.best_daily_streak||0)+'</strong><span>En iyi günlük seri</span></article></div>';
 const achievementRows=earned.map(row=>'<article class="profile-achievement" data-achievement-name="'+esc(String(row.meta?.title||row.achievement_key).toLocaleLowerCase('tr-TR'))+'" data-achievement-reward="'+Number(row.meta?.reward||0)+'" data-achievement-date="'+new Date(row.claimed_at).getTime()+'"><span class="profile-achievement-icon">'+esc(row.meta?.emoji||'✧')+'</span><div><strong>'+esc(row.meta?.title||row.achievement_key)+'</strong><small>'+esc(row.meta?.description||row.achievement_key)+' · '+esc(new Date(row.claimed_at).toLocaleDateString('tr-TR',{timeZone:'Europe/Istanbul'}))+'</small></div><b>+'+Number(row.meta?.reward||0)+' altın</b></article>').join('');
 const pinnedRows=pinned.map(row=>'<article class="profile-pinned"><span>'+esc(row.meta?.emoji||'✧')+'</span><strong>'+esc(row.meta?.title||row.achievement_key)+'</strong><small>Vitrin '+(Number(row.display_slot)+1)+'</small></article>').join('');
 const highRewardRows=topRewards.map(row=>'<li><b>'+esc(row.meta?.title||row.achievement_key)+'</b> · '+Number(row.meta?.reward||0)+' altın</li>').join('');
 const titleRows=(data.titles||[]).map(row=>'<li><b>'+esc(row.title)+'</b><small>'+esc(new Date(row.unlocked_at).toLocaleDateString('tr-TR',{timeZone:'Europe/Istanbul'}))+'</small></li>').join('');
 const activityRows=(data.activity||[]).map(row=>'<li data-activity-type="'+esc(String(row.activity_type||'').toLocaleLowerCase('tr-TR'))+'"><b>'+esc(row.activity_type)+'</b> · '+esc(row.activity_label)+' <small>'+esc(new Date(row.activity_at).toLocaleString('tr-TR',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Istanbul'}))+'</small>'+(Number(row.xp_awarded)>0?' · +'+Number(row.xp_awarded)+' XP':'')+'</li>').join('');
 const xpHistory=(data.xpHistory||[]).filter(row=>Number(row.xp)>0),maxXp=Math.max(1,...xpHistory.map(row=>Number(row.xp)||0));
 const xpBars=xpHistory.map(row=>'<div class="profile-xp-day"><span>'+esc(row.day_label||row.day)+'</span><div><i style="width:'+Math.max(0,Math.min(100,Number(row.xp)/maxXp*100)).toFixed(1)+'%"></i></div><b>'+Number(row.xp)+' XP</b></div>').join('');
 const boards=(data.rankings||[]).map(board=>{
  const rows=Array.isArray(board.players)?board.players:typeof board.players==='string'?JSON.parse(board.players||'[]'):[];
  const labels={xp:'Seviye ve XP',boss:'Boss zaferleri',dungeon:'Zindan zaferleri',arena:'Arena MMR',daily_adventure_xp:'Son 24 saat macera XP',collection:'Anime koleksiyonu',achievements:'Başarım sayısı'};
  const metric={xp:r=>Number(r.xp||0).toLocaleString('tr-TR')+' XP',boss:r=>Number(r.boss_defeats||0)+' zafer',dungeon:r=>Number(r.dungeon_wins||0)+' zafer',arena:r=>Number(r.rating||0)+' MMR',daily_adventure_xp:r=>Number(r.xp||0)+' XP',collection:r=>Number(r.anime_cards||0)+' kart',achievements:r=>Number(r.achievements||0)+' başarım'}[board.board]||(()=>'-');
  return '<article class="card profile-board"><h3>'+esc(labels[board.board]||board.board)+'</h3><ol>'+rows.map((row,index)=>'<li><span>'+String(index+1)+'. '+esc(row.character_name||'Maceracı')+'</span><b>'+metric(row)+'</b></li>').join('')+'</ol></article>';
 }).join('');
 const completion=[['Karakter bağlantısı',true],['En az bir başarım',earned.length>0],['Unvan seçimi',Boolean(settings.active_title)],['Profil vitrini paylaşımı',data.home?.is_public===true],['Kozmetik kuşanma',(data.loadout||[]).length>0],['Başarım sabitleme',pinned.length>0]];
 const completionCount=completion.filter(x=>x[1]).length;
 const completionRows=completion.map(x=>'<li class="'+(x[1]?'is-complete':'')+'">'+(x[1]?'✓':'○')+' '+esc(x[0])+'</li>').join('');
 const claimedJournal=new Set(data.claimedJournalCollections||[]);
 const journalRows=(data.journalProgress||[]).map(collection=>{
  const percent=Math.max(0,Math.min(100,Math.round(Number(collection.progress||0)*100)));
  const claimed=claimedJournal.has(collection.key);
  const state=claimed?'Ödül alındı':collection.complete?'Ödül hazır · /gunluk':'Kayıt topla';
  return '<article class="card journal-collection-card"><div class="eyebrow">'+esc(collection.label)+'</div><strong>'+Number(collection.found)+'/'+Number(collection.total)+' kayıt</strong><div class="progress" role="progressbar" aria-label="'+esc(collection.label)+' ilerlemesi" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+percent+'"><i style="width:'+percent+'%"></i></div><small>Ödül: +'+Number(collection.reward?.coins||0)+' altın · +'+Number(collection.reward?.xp||0)+' XP</small><p class="journal-collection-state">'+state+'</p></article>';
 }).join('');
 const journalSection='<section class="section" id="journey-journal"><div class="section-head"><h2>Keşif ve Büyü Günlüğü</h2><p>Discord maceralarında bulduğun keşifleri, boss izlerini, büyüleri ve yadigârları burada takip et. İlerleme seçili sunucu karakterine aittir.</p></div><div class="profile-board-grid">'+(journalRows||'<article class="card">Henüz günlük kaydı yok. Discord’da keşif, büyü ve boss maceralarına katıldıkça burada ilerlemen görünür.</article>')+'</div><p class="market-meta">Tamamlanan koleksiyonların ödülünü Discord’da /gunluk komutuyla alabilirsin.</p></section>';
 const mapContent=buildExplorationMapContent({
  level:levelForXp(profile.xp),regionVisits:data.regionMastery||[],journalEntries:data.journalEntries||[],
  inventory:data.inventory||[],bosses:[...(data.mapBosses||DEFAULT_SOLO_BOSSES),...(data.mapRaidBosses||DEFAULT_RAID_BOSSES)],
  dungeons:data.mapDungeons||DEFAULT_DUNGEON_TIERS,dungeonWins:stats.dungeon_wins
 });
 const dailyQuestRows=(data.dailyQuests||[]).map(quest=>{
  const state=quest.claimed?'Ödül alındı':quest.done?'Tamamlandı · ödül bekliyor':'Devam ediyor';
  const stateClass=quest.claimed?'is-claimed':quest.done?'is-complete':'is-pending';
  return '<article class="card daily-quest-card '+stateClass+'"><div class="daily-quest-card-heading"><div><div class="eyebrow">'+(quest.class_name?'✧ '+esc(quest.class_name)+' özel görev':'GÜNLÜK GÖREV')+'</div><h3>'+esc(quest.title)+'</h3></div><strong>+'+Number(quest.reward_coins||0)+' altın</strong></div><p>'+esc(quest.description)+'</p><span class="daily-quest-state">'+state+'</span></article>';
 }).join('');
 const learnedSpellKeys=[...new Set(['zoltraak',...(data.learnedSpells||[]).map(row=>String(row.spell_key||''))])].filter(Boolean);
 const spellMasteryByKey=new Map((data.spellMastery||[]).map(row=>[row.spell_key,row]));
 const spellbookRows=learnedSpellKeys.map(key=>{
  const spell=RPG_SPELL_DETAILS[key],mastery=spellMasteryByKey.get(key)||{};
  const name=spell?.name||key,effect=spell?.effect||'Bu büyünün ayrıntısı henüz katalogda bulunmuyor.',cost=spell?.cost||'Öğrenilmiş büyü';
  const masteryLevel=Math.max(0,Number(mastery.mastery_level)||0);
  const search=[key,name,cost,effect].join(' ').toLocaleLowerCase('tr-TR');
  return '<details class="spellbook-entry" data-spellbook-entry data-search="'+esc(search)+'" data-mastery="'+masteryLevel+'"><summary><span>'+esc(name)+'</span><small>'+esc(cost)+'</small></summary><p>'+esc(effect)+'</p><small>'+Number(mastery.casts||0)+' kullanım · Ustalık '+masteryLevel+'</small></details>';
 }).join('');
 const spellbookSection='<section class="section" id="spellbook" data-spellbook><div class="section-head"><h2>Öğrendiğin Savaş Büyüleri</h2><p>Karakterinin büyü arşivi. Büyü ayrıntılarını aç, ada göre ara ve ustalık seviyene göre filtrele.</p></div><div class="spellbook-toolbar card"><label>Büyü ara<input type="search" data-spellbook-filter maxlength="80" placeholder="Büyü adı veya etkisi…" autocomplete="off"></label><label>Ustalık seviyesi<select data-spellbook-mastery><option value="">Tüm seviyeler</option><option value="0">Ustalık 0</option><option value="1">Ustalık 1</option><option value="2">Ustalık 2</option><option value="3">Ustalık 3+</option></select></label><output data-spellbook-count aria-live="polite">'+learnedSpellKeys.length+' / '+learnedSpellKeys.length+' büyü</output></div><div class="spellbook-grid">'+(spellbookRows||'<article class="card">Başlangıç büyüsü dışında henüz savaş büyüsü öğrenmedin. /buyuogren komutuyla yeni büyüler öğrenebilirsin.</article>')+'</div><p class="card spellbook-empty" data-spellbook-empty hidden>Bu aramayla eşleşen büyü bulunamadı.</p><p class="market-meta">Zoltraak başlangıç büyüsü olarak her karakterin kitabında bulunur. Yeni büyüleri Discord’da /buyuogren ile öğrenebilirsin.</p></section>';
 const dailyQuestSection='<section class="section" id="daily-quests"><div class="section-head"><h2>Günlük Görev Panosu</h2><p>Sunucuda etkin olan görevler ve bugünkü karakter ilerlemen. Sınıfına özel görevler yalnızca kendi sınıfın için gösterilir.</p></div><div class="profile-board-grid">'+(dailyQuestRows||'<article class="card">Şu anda bu karakter için etkin günlük görev yok.</article>')+'</div><p class="market-meta">Tamamlanan görevlerin altın ödülünü Discord’da /gunlukgorev komutundan alabilirsin. Web paneli ödül işlemi yapmaz.</p></section>';
 const explorationMapSection=renderExplorationAtlas({mapContent,stats,esc});
 const notices={profile_saved:'Profil ve gizlilik tercihlerin kaydedildi.',title_not_owned:'Yalnızca gerçekten kazandığın bir unvanı seçebilirsin.',invalid:'Profil ayarları geçersiz.'};
 const notice=status&&notices[status]?'<article class="card profile-notice" role="status">'+esc(notices[status])+'</article>':'';
 const share=data.home?.is_public?'<a class="btn ghost" href="/maceraci/ev?guildId='+guild+'&userId='+esc(profile.user_id)+'">Herkese açık vitrini görüntüle</a>':'<p class="market-meta">Herkese açık vitrin şu anda kapalı. Yaşam Alanı sayfasından paylaşımı açabilirsin.</p>';
 const joined=stats.created_at?new Date(stats.created_at).toLocaleDateString('tr-TR',{timeZone:'Europe/Istanbul'}):'Bilinmiyor';
 const identityAvatar=owner?'<span class="profile-owner-frame" aria-label="Owner özel profil çerçevesi"><img src="'+esc(user.avatarUrl||'/assets/site-avatar.webp')+'" alt=""></span>':'<img src="'+esc(user.avatarUrl||'/assets/site-avatar.webp')+'" alt="">';
 const mediaCsrf=esc(createSiteCsrfToken(process.env.ADMIN_SESSION_SECRET));
 const mediaEditor='<section class="card profile-media-editor" id="profile-editor" hidden data-profile-media-editor data-csrf="'+mediaCsrf+'" data-discord-avatar="'+esc(user.discordAvatarUrl||user.avatarUrl||'/assets/site-avatar.webp')+'"><div><div class="profile-editor-heading"><div><span class="eyebrow">HESAP KİMLİĞİ</span><h2>Profilini kişiselleştir</h2></div><button class="btn ghost" type="button" data-profile-editor-close>Kapat</button></div><p class="market-meta">JPG, PNG veya WebP seç. Görseller tarayıcıda küçültülüp JPEG olarak güvenli biçimde kaydedilir.</p></div><div class="profile-media-grid"><label class="profile-media-control"><strong>Profil Fotoğrafı</strong><span>Yalnızca hesap avatarını değiştirir.</span><img data-media-preview="avatar" src="'+esc(user.avatarUrl||'/assets/site-avatar.webp')+'" alt="Profil fotoğrafı önizlemesi"><input type="file" accept="image/png,image/jpeg,image/webp" data-media-input="avatar"></label><label class="profile-media-control"><strong>Profil Bannerı</strong><span>Hesap profilinin üst görselini değiştirir.</span><img data-media-preview="banner" src="'+esc(data.bannerUrl||'/assets/site-profile-banner.svg')+'" alt="Profil bannerı önizlemesi" ><input type="file" accept="image/png,image/jpeg,image/webp" data-media-input="banner"></label></div><div class="profile-media-actions"><button class="btn ghost" type="button" data-media-reset="avatar">Discord avatarına dön</button><button class="btn ghost" type="button" data-media-reset="banner">Varsayılan banner</button></div><p data-media-status role="status" aria-live="polite"></p></section>';
 const identityTitle=owner?'<p class="profile-active-title owner-special-title">Kurucu · Owner</p>':settings.active_title?'<p class="profile-active-title">'+esc(settings.active_title)+'</p>':'';
 const quickNav='<nav class="profile-quick-nav" aria-label="Profil bölümleri">'+[['#progress','✧','İlerleme'],['#daily-quests','▤','Görevler'],['#spellbook','✧','Büyü Kitabım'],['#journey-journal','☾','Keşif Defteri'],['#battle-stats','⚔','Savaş'],['#achievements','♛','Başarımlar'],['#leaderboards','⌁','Sıralamalar'],['#recent-activity','⌁','Etkinlikler'],['#privacy','◈','Gizlilik']].map(([href,icon,label])=>'<a class="btn ghost profile-nav-action" href="'+href+'"><span aria-hidden="true">'+icon+'</span>'+label+'</a>').join('')+'</nav>';
 const bannerUrl=data.bannerUrl||'/assets/site-profile-banner.svg';
 const content='<main class="wrap profile-page"><div class="profile-account-heading"><div><span class="eyebrow">FRIEREN HESAP MERKEZİ</span><h1>Hesap Profilin</h1><p class="market-meta">Bu kimlik hesabına aittir; seçtiğin RPG karakterinden bağımsızdır.</p></div><button class="btn profile-edit-trigger" type="button" data-profile-editor-open>✧ PROFİLİ DÜZENLE</button></div><nav class="user-center-tabs" aria-label="Kullanıcı merkezi"><a href="/maceraci/profil" aria-current="page">Hesap Profilim</a><a href="/maceraci/sosyal">Sosyal Alan</a><a href="/maceraci/yasam">Yaşam Alanım</a><a href="/destek">Hesap ve Destek</a></nav>'+mediaEditor+'<div class="profile-hero"><div class="profile-banner profile-banner-art"><img src="'+esc(bannerUrl)+'" alt="Profil bannerı"></div><div class="profile-identity'+(owner?' is-owner':vip?' is-vip':'')+'">'+identityAvatar+'<div><span class="eyebrow">MACERACI PROFİLİ</span><h1>'+esc(user.username||'Gezgin')+(owner?' <span class="site-owner-badge">OWNER</span>':vip?' <span class="site-vip-badge">VIP</span>':'')+'</h1><p>Frieren hesabı · '+esc(user.username||'Gezgin')+'</p><div class="profile-character-link"><strong>Aktif RPG karakteri</strong><span>'+esc(profile.character_name||'Maceracı')+' · '+esc(profile.class_name||'Gezgin')+' · Seviye '+levelForXp(profile.xp)+'</span></div><small class="profile-joined">Maceraya katılım: '+esc(joined)+'</small>'+identityTitle+'</div></div><div class="profile-xp-card">'+xp+'</div><div class="profile-share-actions">'+share+'</div></div>'+quickNav+notice+dailyQuestSection+spellbookSection+explorationMapSection+journalSection+'<section class="section" id="progress"><div class="section-head"><h2>İlerleme Merkezi</h2><p>Karakter gelişimin ve son yedi gündeki macera XP hareketi.</p></div><div class="profile-stat-grid"><article class="card"><strong>'+Number(profile.xp||0).toLocaleString('tr-TR')+'</strong><span>Toplam XP</span></article><article class="card" data-profile-privacy="showCollections"><strong>'+Number(collections.anime_cards||0)+'</strong><span>Anime kartı</span></article><article class="card" data-profile-privacy="showCollections"><strong>'+Number(collections.journal_entries||0)+'</strong><span>Keşif kaydı</span></article><article class="card"><strong>'+earned.length+'</strong><span>Kazanılmış başarım</span></article></div><article class="card"><h3>Son 7 gün · Macera XP</h3>'+(xpBars||'<p class="market-meta">Son yedi günde kaydedilmiş macera XP verisi yok.</p>')+'</article><article class="card"><h3>Profil tamamlama · '+completionCount+'/'+completion.length+'</h3><ul class="profile-completion">'+completionRows+'</ul></article></section><section class="section" id="battle-stats" data-profile-privacy="showStats"><h2>Savaş İstatistiklerim</h2><p class="market-meta">'+esc(arena.season_name||'Aktif arena sezonu bulunmuyor')+'</p>'+profileStats+'</section><section class="section" id="achievements" data-profile-privacy="showAchievements"><h2>Başarım Vitrini</h2><div class="profile-toolbar"><label for="profile-achievement-search">Başarım ara</label><input id="profile-achievement-search" type="search" placeholder="Başarım adını yaz…" autocomplete="off" data-profile-achievement-search><label for="profile-achievement-sort">Sıralama</label><select id="profile-achievement-sort" data-profile-achievement-sort><option value="date-desc">En yeni</option><option value="date-asc">En eski</option><option value="reward-desc">En yüksek ödül</option><option value="name-asc">Ada göre</option></select><output id="profile-achievement-count" aria-live="polite"></output></div><div class="profile-pinned-grid">'+(pinnedRows||'<article class="card">Henüz sabitlenmiş başarım yok. Yaşam Alanı → Zafer Salonu bölümünden en fazla altı kupa sergileyebilirsin.</article>')+'</div><div class="profile-columns"><article class="card"><h3>En yüksek ödüllü başarımlar</h3><ul>'+(highRewardRows||'<li>Henüz kazanılmış başarım yok.</li>')+'</ul></article><article class="card"><h3>Kazanılmış unvanlar</h3><ul>'+(titleRows||'<li>Henüz unvan açılmadı.</li>')+'</ul></article></div><span id="badges" aria-hidden="true"></span><div class="profile-achievement-list" id="profile-achievement-list">'+(achievementRows||'<article class="card">Henüz başarım kazanılmadı.</article>')+'</div></section><section class="section" id="leaderboards"><h2>Sıralamalar</h2><p class="market-meta">Tablolar seçili Discord sunucusuna aittir. Günlük tablo yalnızca kaydedilmiş macera XP kazanımlarını kapsar.</p><div class="profile-board-grid">'+(boards||'<article class="card">Henüz sıralama verisi yok.</article>')+'</div></section><section class="section" id="recent-activity" data-profile-privacy="showActivity"><h2>Macera Güncesi</h2><div class="profile-filter-actions" role="group" aria-label="Günlük filtresi"><button class="btn ghost is-active" type="button" data-profile-activity-filter="all" aria-pressed="true">Tümü</button><button class="btn ghost" type="button" data-profile-activity-filter="macera" aria-pressed="false">Macera</button><button class="btn ghost" type="button" data-profile-activity-filter="başarım" aria-pressed="false">Başarımlar</button><button class="btn ghost" type="button" data-profile-activity-filter="kozmetik" aria-pressed="false">Kozmetikler</button></div><article class="card"><ul id="profile-activity-list">'+(activityRows||'<li>Henüz etkinlik kaydı yok.</li>')+'</ul></article></section><section class="section" id="privacy"><h2>Gizlilik ayarları</h2><div class="profile-preview-actions"><button class="btn" type="button" id="profile-preview-toggle" aria-pressed="false">Ziyaretçi önizlemesini aç</button><button class="btn ghost" type="button" id="profile-settings-reset">Varsayılanları yükle</button></div><p class="profile-preview-note" id="profile-preview-note" role="status" hidden>Bu yalnızca geçici önizlemedir. Kalıcı değişiklik için aşağıdaki ayarları kaydet.</p><p class="lead">Bu seçenekler yalnızca paylaşımı açtığın herkese açık profil vitrininin hangi bölümleri göstereceğini belirler. Vitrin kapalıysa bu ayarlar başka ziyaretçilere veri açmaz.</p><article class="card">'+settingsForm+'</article></section><section class="section" data-profile-privacy="showCosmetics"><h2>Kişisel görünüm</h2><article class="card"><p>Profil çerçevesi, isimlik, unvan efekti ve tema gibi görünümler mevcut kozmetik yüklemesinden gelir.</p><ul>'+((data.loadout||[]).map(x=>{const item=PLAYER_COSMETICS.find(c=>c.key===x.cosmetic_key);return item?'<li>'+esc(item.name)+' · '+esc(item.slot)+'</li>':''}).join('')||'<li>Henüz kozmetik kuşanılmadı.</li>')+'</ul><a class="btn ghost" href="/maceraci/yasam?guildId='+guild+'#cosmetics">Kozmetiklerini düzenle</a></article></section></main>';
 return page('Maceracı Profili',content+'<script src="/assets/profile-media.js" defer></script><script src="/assets/user-center.js?v=user-center-264-1" defer></script><script src="/assets/spellbook-controls.js?v=spellbook-1" defer></script><script src="/assets/exploration-atlas.js?v=atlas-379-1" defer></script>',{...user,playerProfiles:[]});
}

function playerExperiencePage(user,profile,home,ownedRows,loadoutRows,presetRows,trophyRows,status){
 const guild=encodeURIComponent(profile.guild_id),csrf=esc(createSiteCsrfToken(process.env.ADMIN_SESSION_SECRET));
 const owned=new Set(ownedRows.map(x=>x.cosmetic_key)),ownedByKey=new Map(ownedRows.map(x=>[x.cosmetic_key,x])),equipped=new Map(loadoutRows.map(x=>[x.slot,x.cosmetic_key]));
 const form=(action,fields,button)=>'<form method="post" action="/maceraci/yasam"><input type="hidden" name="csrf" value="'+csrf+'"><input type="hidden" name="guildId" value="'+guild+'"><input type="hidden" name="action" value="'+esc(action)+'">'+fields+'<button class="btn ghost" type="submit">'+esc(button)+'</button></form>';
 const rooms=HOME_ROOMS.map(room=>{
  const isOwned=home.rooms.some(x=>x.room_key===room.key);
  return '<article class="card"><h3>'+esc(room.name)+'</h3><p>Seviye '+room.level+' · '+room.cost+' altın</p>'+(isOwned?'<span class="market-meta">Açık</span>':form('unlock-room','<input type="hidden" name="roomKey" value="'+esc(room.key)+'">','Odayı aç'))+'</article>';
 }).join('');
 const cosmetics=PLAYER_COSMETICS.map(item=>{
  const action=owned.has(item.key)?'equip-cosmetic':'buy-cosmetic';
  const label=owned.has(item.key)?(equipped.get(item.slot)===item.key?'Kuşanıldı':'Kuşan'):'Satın al · '+item.cost+' altın';
  const record=ownedByKey.get(item.key);const acquired=record?'<p class="market-meta">Kaynak: '+esc(record.acquisition_source==='event'?'Etkinlik':'Mağaza')+' · '+esc(new Date(record.acquired_at).toLocaleDateString('tr-TR',{timeZone:'Europe/Istanbul'}))+'</p>':'';return '<article class="card cosmetic-shop-card">'+cosmeticShowcaseCard(item)+'<p>'+esc(COSMETIC_SLOT_LABELS[item.slot]||item.slot)+' · Seviye '+item.level+' · '+item.cost+' altın</p>'+acquired+form(action,'<input type="hidden" name="cosmeticKey" value="'+esc(item.key)+'">',label)+'</article>';
 }).join('');
 const trophies=(trophyRows||[]).map(row=>'<li>'+esc(row.achievement_key)+(row.display_slot===null?'':' · Zafer Salonu vitrini '+Number(row.display_slot))+'</li>').join('');
 const trophyOptions=(trophyRows||[]).map(row=>'<option value="'+esc(row.achievement_key)+'">'+esc(row.achievement_key)+'</option>').join('');
 const trophyPanel='<article class="card"><h3>Kazanılmış Kupalar</h3>'+(trophies?'<ul>'+trophies+'</ul>':'<p>Henüz kazanılmış başarımın yok.</p>')+(trophyOptions?form('place-trophy','<label>Başarım <select name="achievementKey">'+trophyOptions+'</select></label><label>Vitrin konumu <select name="displaySlot">'+[0,1,2,3,4,5].map(n=>'<option value="'+n+'">'+n+'</option>').join('')+'</select></label>','Kupayı sergile'):'<p class="market-meta">Kupa sergilemek için önce bir başarım kazan.</p>')+'</article>';
 const unlockedRooms=new Set(home.rooms.map(x=>x.room_key));
 const stationPanel=HOME_STATIONS.map(station=>'<article class="card"><h3>'+esc(station.name)+'</h3><p class="market-meta">'+(unlockedRooms.has(station.roomKey)?'Açık':'Kilitli oda: '+esc(HOME_ROOMS.find(x=>x.key===station.roomKey)?.name||station.roomKey))+'</p><p>'+station.commands.map(esc).join(' · ')+'</p>'+(station.roomKey==='alchemy'?(unlockedRooms.has('alchemy')?form('brew-potion','<label>Tarif <select name="recipeKey">'+ALCHEMY_RECIPES.map(x=>'<option value="'+esc(x.key)+'">'+esc(x.name)+'</option>').join('')+'</select></label>','İksir demle'):''):'')+'</article>').join('');
 const presets=presetRows.map(row=>'<article class="card"><h3>'+esc(row.preset_name)+'</h3>'+form('apply-preset','<input type="hidden" name="presetName" value="'+esc(row.preset_name)+'">','Görünümü uygula')+'</article>').join('');
 const events=home.events||[];
 const eventHtml=events.map(event=>{
  const ended=new Date(event.ends_at).getTime()<=Date.now(),started=new Date(event.starts_at).getTime()<=Date.now();
  const checkin=started&&!ended?form('check-in','<input type="hidden" name="eventId" value="'+esc(event.event_id)+'">','Yoklamayı doğrula'):'';
  const rewards=ended?['participant','checkin'].map(key=>form('claim-event','<input type="hidden" name="eventId" value="'+esc(event.event_id)+'"><input type="hidden" name="rewardKey" value="'+key+'">',key==='participant'?'Katılım ödülünü al':'Yoklama ödülünü al')).join(''):'<span class="market-meta">Etkinlik bitince ödül alınabilir.</span>';
  return '<article class="card"><h3>'+esc(event.title)+'</h3><p>Kayıt: '+Number(event.participation)+'/1 · Yoklama: '+Number(event.checkin)+'/1</p><p class="market-meta">Bitiş: '+esc(new Date(event.ends_at).toLocaleString('tr-TR',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Istanbul'}))+'</p>'+checkin+rewards+'</article>';
 }).join('');
 const notices={brewed:'İksir üretildi; malzemeler envanterinden düşüldü.',station_locked:'Simya Laboratuvarı kilitli. Önce odayı aç.',missing_material:'İksir için gereken malzemeler envanterinde yetersiz.',invalid_recipe:'İksir tarifi bulunamadı.',updated:'Ev paylaşım ayarı güncellendi.',placed:'Kupa Zafer Salonuna yerleştirildi.',trophy_missing:'Bu başarıma sahip değilsin.',invalid_trophy:'Kupa veya konum geçersiz.',unlocked:'Oda açıldı.',saved:'Ev yerleşimi kaydedildi.',purchased:'Kozmetik satın alındı.',equipped:'Kozmetik kuşanıldı.',applied:'Görünüm uygulandı.',claimed:'Etkinlik ödülü alındı.',checked_in:'Etkinlik yoklaman kaydedildi.',already_checked_in:'Bu etkinlikte yoklaman zaten alınmış.',not_eligible:'Yoklama yalnızca kayıtlı katılımcılara etkinlik başladıktan sonra açıktır.',already_claimed:'Bu ödül daha önce alındı.',event_not_finished:'Etkinlik henüz bitmedi.',milestone_locked:'Ödül için gereken ilerleme tamamlanmadı.',already_owned:'Bu kozmetik zaten sende.',already_unlocked:'Bu oda zaten açık.',level_locked:'Seviye şartı karşılanmıyor.',insufficient_funds:'Yeterli altının yok.',not_owned:'Kozmetik koleksiyonunda bulunmuyor.',room_locked:'Aktif oda veya yerleşimdeki oda henüz açılmadı.',invalid_layout:'Yerleşim biçimi veya dekorasyon anahtarı geçersiz.',invalid_preset:'Preset adı geçersiz.',preset_missing:'Bu isimde preset bulunamadı.',ownership_missing:'Preset içindeki kozmetik artık hesabında yok.'};
 const notice=status&&notices[status]?'<article class="card"><p>'+esc(notices[status])+'</p></article>':'';
 const layout=esc(JSON.stringify(Array.isArray(home.home.layout)?home.home.layout:[],null,2));
 const visibilityForm=form('set-visibility','<select name="isPublic"><option value="false"'+(home.home.is_public?'':' selected')+'>Gizli</option><option value="true"'+(home.home.is_public?' selected':'')+'>Herkese açık</option></select>','Paylaşım ayarını kaydet');
 const publicLink=home.home.is_public?'<p><a class="btn ghost" href="/maceraci/ev?guildId='+guild+'&userId='+esc(profile.user_id)+'" >Paylaşılabilir profil ve rozet vitrini</a></p>':'';
 const content='<main class="wrap user-center-page life-center-page" style="padding:54px 0 80px"><header class="user-center-hero"><div class="eyebrow">✧ FRIEREN KİŞİSEL ALAN</div><h1 class="hero-title">Yaşam <em>Alanım.</em></h1><p class="lead">Evin, koleksiyonların, kozmetiklerin ve etkinlik ilerlemen tek bir kişisel alanda.</p><div class="user-center-metrics"><article><span>Açık oda</span><strong>'+home.rooms.length+'</strong></article><article><span>Kozmetik</span><strong>'+ownedRows.length+'</strong></article><article><span>Kupa</span><strong>'+(trophyRows||[]).length+'</strong></article><article><span>Etkinlik</span><strong>'+events.length+'</strong></article></div></header><nav class="user-center-tabs" aria-label="Kullanıcı merkezi"><a href="/maceraci/profil">Hesap Profilim</a><a href="/maceraci/sosyal">Sosyal Alan</a><a href="/maceraci/yasam" aria-current="page">Yaşam Alanım</a><a href="/destek">Hesap ve Destek</a></nav><p class="lead">Aktif karakter: '+esc(profile.character_name||'Maceracı')+' · Bu alan yalnızca seçili sunucudaki RPG karakterinin verilerini yönetir.</p><p class="lead">Ev odalarını aç, yerleşimini kaydet, kozmetiklerini yönet ve tamamladığın etkinliklerin ödüllerini al. Tüm işlemler bağlı Discord karakterine aittir.</p><div class="portal-actions"><a class="btn ghost" href="/maceraci?guildId='+guild+'">Maceracı paneli</a><a class="btn ghost" href="/maceraci/koleksiyon?guildId='+guild+'">Koleksiyon</a></div>'+notice+'<section class="section"><h2>Kişisel Ev</h2>'+visibilityForm+publicLink+'<div class="portal-grid">'+rooms+'</div><article class="card"><h3>Oda Yerleşimi</h3><p class="market-meta">Dekorasyon anahtarları: '+HOME_DECORATIONS.map(esc).join(', ')+'</p>'+form('save-layout','<label>Aktif oda <select name="activeRoom">'+HOME_ROOMS.filter(x=>home.rooms.some(r=>r.room_key===x.key)).map(x=>'<option value="'+esc(x.key)+'"'+(home.home.active_room===x.key?' selected':'')+'>'+esc(x.name)+'</option>').join('')+'</select></label><label>Yerleşim JSON <textarea name="layout" rows="5" maxlength="1500">'+layout+'</textarea></label>','Yerleşimi kaydet')+'</article></section><section class="section"><h2>Ev İstasyonları</h2><div class="portal-grid">'+stationPanel+'</div></section><section class="section" id="achievement-showcase"><h2>Zafer Salonu</h2><div class="portal-grid">'+trophyPanel+'</div></section><section class="section" id="cosmetics"><h2>Genel Kozmetikler</h2><div class="portal-grid">'+cosmetics+'</div><article class="card"><h3>Görünüm presetleri</h3>'+form('save-preset','<input name="presetName" maxlength="32" required placeholder="Preset adı">','Mevcut görünümü kaydet')+'</article><div class="portal-grid">'+(presets||'<article class="card"><p>Henüz preset kaydedilmedi.</p></article>')+'</div></section><section class="section" id="event-progress"><h2>Etkinlik İlerlemesi</h2><p class="lead">Kayıt ve yoklama ilerlemesi sunucu etkinlikleriyle ortak veritabanında tutulur.</p><div class="portal-grid">'+(eventHtml||'<article class="card"><p>Görüntülenecek etkinlik ilerlemesi yok.</p></article>')+'</div></section></main>';
 return page('Kişisel Yaşam Alanı',content,user);
}

function playerMarketPage(user, data, listings, history, status, filters = {}, offers = [], alerts = []) {
  const notices = {listed:'İlanın oluşturuldu; eşya emanet kasasına alındı.',purchased:'Satın alma tamamlandı; altın ve eşya aynı işlemde aktarıldı.',cancelled:'İlan iptal edildi; eşyan envanterine geri döndü.',offer_created:'Teklifin satıcıya iletildi. Altın yalnızca kabul edilirse tahsil edilir.',offer_accepted:'Teklif kabul edildi; eşya ve altın aktarıldı.',offer_rejected:'Teklif reddedildi.',offer_cancelled:'Teklifin geri çekildi.',offer_insufficient_funds:'Alıcının kabul anında yeterli altını yok; teklif beklemede kaldı.',offer_not_owner:'Bu teklifi yalnızca ilanın sahibi yönetebilir.',offer_unavailable:'Teklif artık beklemede değil veya ilan aktif değil.',offer_limit:'Aynı anda en fazla 20 bekleyen teklif verebilirsin.',already_offered:'Bu ilan için zaten bekleyen bir teklifin var.',self_offer:'Kendi ilanına teklif veremezsin.',unavailable:'İlan artık kullanılamıyor.',insufficient_funds:'Bu ilan için yeterli altının yok.',insufficient_items:'Yeterli eşyan yok.',equipped_item:'Takılı ekipman pazara konulamaz.',listing_limit:'En fazla 10 aktif ilan açabilirsin.',self_purchase:'Kendi ilanını satın alamazsın.',not_owner:'Yalnızca kendi ilanını iptal edebilirsin.',invalid:'Gönderilen bilgiler geçersiz.',alert_created:'Fiyat alarmın kaydedildi; eşya hedef fiyatına indiğinde Discord DM alacaksın.',alert_cancelled:'Fiyat alarmı iptal edildi.',alert_limit:'En fazla 10 aktif fiyat alarmı kurabilirsin.',player_missing:'Oyuncu kaydın bulunamadı.'};
  const guild = encodeURIComponent(data.profile.guild_id);
  const csrf = esc(createSiteCsrfToken(process.env.ADMIN_SESSION_SECRET));
  const ownItems = data.items.filter(item => Number(item.quantity) > 0);
  const options = ownItems.map(item => '<option value="' + esc(item.item_key) + '">' + esc(item.item_key) + ' · ' + Number(item.quantity) + ' adet</option>').join('');
  const active = listings.map(item => {
    const own = String(item.seller_id) === String(data.profile.user_id);
    const action = own
      ? '<form method="post" action="/pazar/iptal"><input type="hidden" name="csrf" value="' + csrf + '"><input type="hidden" name="guildId" value="' + guild + '"><input type="hidden" name="listingId" value="' + esc(item.listing_id) + '"><button class="btn ghost" type="submit">İlanı iptal et</button></form>'
      : '<form method="post" action="/pazar/al"><input type="hidden" name="csrf" value="' + csrf + '"><input type="hidden" name="guildId" value="' + guild + '"><input type="hidden" name="listingId" value="' + esc(item.listing_id) + '"><button class="btn" type="submit">Satın al</button></form>' +
        '<form method="post" action="/pazar/teklif-ver"><input type="hidden" name="csrf" value="' + csrf + '"><input type="hidden" name="guildId" value="' + guild + '"><input type="hidden" name="listingId" value="' + esc(item.listing_id) + '"><label>Teklifin (altın)</label><input type="number" name="offerCoins" min="1" max="1000000" required><output class="market-offer-preview" aria-live="polite">Teklif tutarını gir; satıcıya gönderilmeden önce burada kontrol edebilirsin.</output><button class="btn ghost" type="submit">Pazarlık teklifi gönder</button></form>';
    return '<article class="card"><div class="eyebrow">' + (own ? 'SENİN İLANIN' : 'KUZEY PAZARI') + '</div><h3>' + esc(item.item_key) + ' ×' + Number(item.quantity) + '</h3><p class="market-price">' + Number(item.price_coins).toLocaleString('tr-TR') + ' altın</p><p class="market-meta">' + esc(new Date(item.created_at).toLocaleString('tr-TR',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Istanbul'})) + '</p>' + action + '</article>';
  }).join('');
  const offerCards = offers.map(offer => {
    const isSeller = String(offer.seller_id) === String(data.profile.user_id);
    const pending = offer.status === 'pending' && offer.listing_status === 'active';
    let actions = '';
    if (pending && isSeller) {
      actions = '<form method="post" action="/pazar/teklif-kabul"><input type="hidden" name="csrf" value="' + csrf + '"><input type="hidden" name="guildId" value="' + guild + '"><input type="hidden" name="offerId" value="' + esc(offer.offer_id) + '"><button class="btn" type="submit">Teklifi kabul et</button></form>' +
        '<form method="post" action="/pazar/teklif-reddet"><input type="hidden" name="csrf" value="' + csrf + '"><input type="hidden" name="guildId" value="' + guild + '"><input type="hidden" name="offerId" value="' + esc(offer.offer_id) + '"><button class="btn ghost" type="submit">Reddet</button></form>';
    } else if (pending && !isSeller) {
      actions = '<form method="post" action="/pazar/teklif-iptal"><input type="hidden" name="csrf" value="' + csrf + '"><input type="hidden" name="guildId" value="' + guild + '"><input type="hidden" name="offerId" value="' + esc(offer.offer_id) + '"><button class="btn ghost" type="submit">Teklifi geri çek</button></form>';
    }
    return '<article class="card"><div class="eyebrow">' + (isSeller ? 'GELEN TEKLİF' : 'GÖNDERDİĞİN TEKLİF') + '</div><h3>' + esc(offer.item_key) + ' ×' + Number(offer.quantity) + '</h3><p class="market-price">' + Number(offer.offer_coins).toLocaleString('tr-TR') + ' altın</p><p class="market-meta">' + (offer.status === 'pending' ? 'Bekliyor' : offer.status === 'accepted' ? 'Kabul edildi' : offer.status === 'rejected' ? 'Reddedildi' : 'Geri çekildi') + ' · Teklif ' + esc(offer.offer_id) + '</p>' + actions + '</article>';
  }).join('');
  const historyCards = history.map(item => '<article class="card"><h3>' + esc(item.item_key) + ' ×' + Number(item.quantity) + '</h3><p>' + Number(item.price_coins).toLocaleString('tr-TR') + ' altın · ' + (item.status === 'sold' ? 'Satıldı' : item.status === 'cancelled' ? 'İptal edildi' : 'Aktif') + '</p></article>').join('');
  const alertCards = alerts.map(alert => '<article class="card"><h3>' + esc(alert.item_key) + '</h3><p class="market-price">≤ ' + Number(alert.target_price).toLocaleString('tr-TR') + ' altın</p><p class="market-meta">' + (alert.status === 'active' ? 'Aktif' : 'Bildirildi') + '</p>' + (alert.status === 'active' ? '<form method="post" action="/pazar/alarm-sil"><input type="hidden" name="csrf" value="' + csrf + '"><input type="hidden" name="guildId" value="' + guild + '"><input type="hidden" name="alertId" value="' + esc(alert.alert_id) + '"><button class="btn ghost" type="submit">Alarmı iptal et</button></form>' : '') + '</article>').join('');
  const alertForm = '<article class="card"><h2>Fiyat alarmı kur</h2><form method="post" action="/pazar/alarm-kur"><input type="hidden" name="csrf" value="' + csrf + '"><input type="hidden" name="guildId" value="' + guild + '"><label for="alert-item">Eşyanın tam adı</label><input id="alert-item" name="itemKey" maxlength="120" required placeholder="Örn. Mana Kristali"><label for="alert-price">Hedef fiyat (altın)</label><input id="alert-price" type="number" name="targetPrice" min="1" max="1000000" required><button class="btn" type="submit">Alarmı kaydet</button></form><p class="market-meta">En fazla 10 aktif alarm. Hedef fiyat veya altındaki aktif ilan bulunduğunda Discord DM olarak bildirilir.</p></article>';

  const filterForm = '<article class="card"><h2>İlanları filtrele</h2><form method="get" action="/pazar"><input type="hidden" name="guildId" value="' + guild + '"><label for="market-category">Eşya kategorisi</label><select id="market-category" name="category"><option value="all"' + (!filters.category || filters.category === 'all' ? ' selected' : '') + '>Tüm kategoriler</option><option value="equipment"' + (filters.category === 'equipment' ? ' selected' : '') + '>Ekipman</option><option value="fishing"' + (filters.category === 'fishing' ? ' selected' : '') + '>Balıkçılık</option><option value="creatures"' + (filters.category === 'creatures' ? ' selected' : '') + '>Yaratıklar</option><option value="other"' + (filters.category === 'other' ? ' selected' : '') + '>Diğer eşyalar</option></select><label for="market-search">Eşya ara</label><input id="market-search" name="q" maxlength="60" value="' + esc(filters.query || '') + '" placeholder="Örn. mana"><div class="form-row"><div><label for="market-min">En düşük fiyat</label><input id="market-min" type="number" name="min" min="0" max="1000000" value="' + esc(filters.minPrice || '') + '"></div><div><label for="market-max">En yüksek fiyat</label><input id="market-max" type="number" name="max" min="0" max="1000000" value="' + esc(filters.maxPrice || '') + '"></div></div><label for="market-sort">Sıralama</label><select id="market-sort" name="sort"><option value="price_asc"' + (filters.sort === 'price_asc' || !filters.sort ? ' selected' : '') + '>En düşük fiyat</option><option value="price_desc"' + (filters.sort === 'price_desc' ? ' selected' : '') + '>En yüksek fiyat</option><option value="newest"' + (filters.sort === 'newest' ? ' selected' : '') + '>En yeni ilan</option></select><button class="btn ghost" type="submit">Filtrele</button><a class="btn ghost" href="/pazar?guildId=' + guild + '">Filtreleri temizle</a></form></article>';
  const sellForm = '<article class="card"><h2>Eşyanı satışa çıkar</h2><form method="post" action="/pazar/sat" id="market-listing-form"><input type="hidden" name="csrf" value="' + csrf + '"><input type="hidden" name="guildId" value="' + guild + '"><label for="market-item">Eşya</label><select id="market-item" name="itemKey" required>' + (options || '<option value="">Satılabilir eşya yok</option>') + '</select><label for="market-quantity">Adet</label><input id="market-quantity" type="number" name="quantity" min="1" max="1000" value="1" required><label for="market-price">Toplam fiyat (altın)</label><input id="market-price" type="number" name="priceCoins" min="1" max="1000000" required><output id="market-price-preview" class="market-price-preview" aria-live="polite">Birim fiyat ve toplam tutar burada hesaplanır.</output><button class="btn" type="submit"' + (options ? '' : ' disabled') + '>Emanet kasasına koy ve ilan aç</button></form><p class="market-meta">İlan açıldığında eşya emanet kasasına taşınır. Satış veya iptal tamamlanana kadar envanterinde harcanamaz.</p></article>';
  const content = '<main class="wrap" style="padding:54px 0 80px"><div class="eyebrow">✧ KUZEY PAZARI</div><h1 class="hero-title">Maceracı <em>pazarı.</em></h1><p class="lead">' + esc(data.profile.character_name || 'Maceracı') + ' · ' + Number(data.profile.coins) + ' altın · Bu pazar yalnızca seçili Discord sunucusuna aittir.</p>' + (notices[status] ? '<p class="notice" role="status">' + notices[status] + '</p>' : '') + '<div class="portal-actions"><a class="btn ghost" href="/maceraci/envanter?guildId=' + guild + '">Envanterim</a><a class="btn ghost" href="/maceraci">Maceracı paneli</a></div><section class="section"><div class="portal-grid">' + sellForm + filterForm + '</div></section><section class="section"><div class="portal-grid">' + alertForm + '<article class="card"><h2>Fiyat alarmlarım</h2><div class="portal-grid">' + (alertCards || '<p>Henüz fiyat alarmın yok.</p>') + '</div></article></div></section><section class="section"><div class="section-head"><h2>Aktif ilanlar</h2><p>Arama, fiyat aralığı ve sıralama filtreleri seçili sunucunun aktif ilanlarına uygulanır. Satın alma atomik olarak tamamlanır.</p></div><div class="portal-grid">' + (active || '<article class="card"><p>Şu anda aktif ilan yok.</p></article>') + '</div></section><section class="section"><div class="section-head"><h2>Tekliflerim ve gelen teklifler</h2><p>Teklif gönderirken altın hemen kesilmez; satıcı kabul ettiği anda alıcının bakiyesi kontrol edilir ve transfer tek işlemde yapılır.</p></div><div class="portal-grid">' + (offerCards || '<article class="card"><p>Henüz teklifin yok.</p></article>') + '</div></section><section class="section"><div class="section-head"><h2>İşlem geçmişim</h2></div><div class="portal-grid">' + (historyCards || '<article class="card"><p>Henüz pazar işlemin yok.</p></article>') + '</div></section></main>';
  return page('Kuzey Pazarı', content + '<script src="/assets/market-preview.js" defer></script>', user);
}


function adventurerSocialPage(user, profile, social, status) {
  const guild=encodeURIComponent(profile.guild_id),csrf=esc(createSiteCsrfToken(process.env.ADMIN_SESSION_SECRET));
  const notices={blocked:'Oyuncu engellendi; mevcut bağlar ve bekleyen istekler kaldırıldı.',unblocked:'Oyuncu engeli kaldırıldı.',request_sent:'Arkadaşlık isteği gönderildi.',already_pending:'Bekleyen isteğin zaten var.',incoming_request:'Bu oyuncudan gelen isteği aşağıda yanıtlayabilirsin.',already_friends:'Bu oyuncu zaten arkadaşın.',rival_exists:'Önce rakiplik bağını kaldırmalısın.',accepted:'Arkadaşlık isteği kabul edildi.',rejected:'Arkadaşlık isteği reddedildi.',not_recipient:'Bu isteği yalnızca hedef kullanıcı yanıtlayabilir.',request_unavailable:'İstek bulunamadı veya süresi doldu.',rival_created:'RPG rakipliği oluşturuldu.',already_rivals:'Bu oyuncu zaten rakibin.',removed:'Sosyal bağ kaldırıldı.',not_found:'Kayıtlı sosyal bağ bulunamadı.',sent:'Altın hediyesi gönderildi.',insufficient_funds:'Yeterli altının yok.',commended:'İtibar puanı verildi.',already_voted:'Bu haftaki itibar puanını kullandın.',invalid:'Bilgiler geçersiz veya oyuncu bu sunucuda kayıtlı değil.'};
  const form=(action,target='',label='İşlemi uygula',extra='')=>'<form method="post" action="/maceraci/sosyal"><input type="hidden" name="csrf" value="'+csrf+'"><input type="hidden" name="guildId" value="'+guild+'"><input type="hidden" name="action" value="'+action+'">'+(target?'<input type="hidden" name="targetId" value="'+esc(target)+'">':'')+extra+'<button class="btn ghost" type="submit">'+label+'</button></form>';
  const friendCards=social.friends.map(r=>'<article class="card"><div class="eyebrow">ARKADAŞ</div><code>'+esc(r.user_id)+'</code>'+form('remove',r.user_id,'Sosyal bağı kaldır')+'</article>').join('');
  const rivalCards=social.rivals.map(r=>'<article class="card"><div class="eyebrow">RPG RAKİBİ</div><code>'+esc(r.user_id)+'</code>'+form('remove',r.user_id,'Sosyal bağı kaldır')+'</article>').join('');
  const requests=social.requests.map(r=>'<article class="card"><div class="eyebrow">GELEN ARKADAŞLIK İSTEĞİ</div><code>'+esc(r.requester_id)+'</code><p class="market-meta">'+esc(r.request_id)+'</p>'+form('accept','','Kabul et','<input type="hidden" name="requestId" value="'+esc(r.request_id)+'">')+form('reject','','Reddet','<input type="hidden" name="requestId" value="'+esc(r.request_id)+'">')+'</article>').join('');
  const targetInput=(id)=>'<label for="'+id+'">Discord kullanıcı ID</label><input id="'+id+'" name="targetId" inputmode="numeric" pattern="[0-9]{17,20}" minlength="17" maxlength="20" required>';
  const forms='<div class="portal-grid">'+
    '<article class="card"><h2>Arkadaşlık isteği</h2><form method="post" action="/maceraci/sosyal"><input type="hidden" name="csrf" value="'+csrf+'"><input type="hidden" name="guildId" value="'+guild+'"><input type="hidden" name="action" value="request">'+targetInput('social-friend-id')+'<button class="btn" type="submit">İstek gönder</button></form></article>'+
    '<article class="card"><h2>Rakip belirle</h2><form method="post" action="/maceraci/sosyal"><input type="hidden" name="csrf" value="'+csrf+'"><input type="hidden" name="guildId" value="'+guild+'"><input type="hidden" name="action" value="rival">'+targetInput('social-rival-id')+'<button class="btn ghost" type="submit">Rakip yap</button></form></article>'+
    '<article class="card"><h2>Altın hediye et</h2><form method="post" action="/maceraci/sosyal"><input type="hidden" name="csrf" value="'+csrf+'"><input type="hidden" name="guildId" value="'+guild+'"><input type="hidden" name="action" value="gift">'+targetInput('social-gift-id')+'<label for="social-gift-amount">Altın (1–50.000)</label><input id="social-gift-amount" name="amount" type="number" min="1" max="50000" step="1" required><label for="social-gift-note">Not</label><input id="social-gift-note" name="note" maxlength="100"><button class="btn" type="submit">Hediye gönder</button></form></article>'+
    '<article class="card"><h2>Haftalık itibar</h2><p>Her hafta bir oyuncuya bir puan verebilirsin.</p><form method="post" action="/maceraci/sosyal"><input type="hidden" name="csrf" value="'+csrf+'"><input type="hidden" name="guildId" value="'+guild+'"><input type="hidden" name="action" value="commend">'+targetInput('social-commend-id')+'<button class="btn ghost" type="submit">İtibar ver</button></form></article>'+
    '<article class="card"><h2>Oyuncuyu engelle</h2><p>Engellediğin oyuncu seninle arkadaşlık, rakiplik, hediye ve itibar etkileşimi kuramaz. Mevcut bağlar ve bekleyen istekler kaldırılır.</p><form method="post" action="/maceraci/sosyal"><input type="hidden" name="csrf" value="'+csrf+'"><input type="hidden" name="guildId" value="'+guild+'"><input type="hidden" name="action" value="block">'+targetInput('social-block-id')+'<button class="btn ghost" type="submit">Oyuncuyu engelle</button></form></article></div>';
  const content='<main class="wrap user-center-page social-center-page" data-user-center="social" style="padding:54px 0 80px"><header class="user-center-hero"><div class="eyebrow">✧ FRIEREN TOPLULUK MERKEZİ</div><h1 class="hero-title">Yol <em>Arkadaşların.</em></h1><p class="lead">Arkadaşlıklarını, RPG rekabetini ve oyuncular arası desteği tek merkezden yönet.</p><div class="user-center-metrics"><article><span>Arkadaş</span><strong>'+social.friends.length+'</strong></article><article><span>Rakip</span><strong>'+social.rivals.length+'</strong></article><article><span>Bekleyen istek</span><strong>'+social.requests.length+'</strong></article><article><span>İtibar</span><strong>'+Number(social.reputation)+'</strong></article></div></header><nav class="user-center-tabs" aria-label="Kullanıcı merkezi"><a href="/maceraci/profil">Hesap Profilim</a><a href="/maceraci/sosyal" aria-current="page">Sosyal Alan</a><a href="/maceraci/yasam">Yaşam Alanım</a><a href="/destek">Hesap ve Destek</a></nav><p class="lead">'+esc(profile.character_name||'Maceracı')+' · Yalnızca seçili sunucudaki bağlı karakterin kullanılır.</p>'+(notices[status]?'<p class="notice" role="status">'+notices[status]+'</p>':'')+
    '<div class="portal-actions"><a class="btn ghost" href="/maceraci">Maceracı paneli</a><a class="btn ghost" href="/maceraci/envanter?guildId='+guild+'">Envanterim</a><a class="btn ghost" href="/pazar?guildId='+guild+'">Kuzey Pazarı</a></div>'+
    '<section class="section social-actions-section" id="social-actions"><div class="section-head"><div class="eyebrow">BAĞLARINI YÖNET</div><h2>Yeni bir bağ kur</h2><p>Oyuncu ID’siyle arkadaşlık isteği gönder, rakip belirle veya güvenli oyun içi hediye paylaş.</p></div>'+forms+'</section>'+
    '<section class="section social-list-section" id="friends"><div class="section-head"><div class="eyebrow">YOL ARKADAŞLARI</div><h2>Arkadaşların</h2><p>Bu sunucuda karşılıklı kabul edilmiş arkadaşlık bağların.</p></div><div class="portal-grid">'+(friendCards||'<article class="card empty-state">Henüz arkadaşın yok. İlk isteğini göndererek başlayabilirsin.</article>')+'</div></section>'+
    '<section class="section social-list-section" id="rivals"><div class="section-head"><div class="eyebrow">DOSTÇA REKABET</div><h2>RPG rakiplerin</h2><p>Rekabet bağların yalnızca bu sunucunun RPG ilişkilerini etkiler.</p></div><div class="portal-grid">'+(rivalCards||'<article class="card empty-state">Henüz rakip belirlemedin.</article>')+'</div></section>'+
    '<section class="section social-list-section" id="requests"><div class="section-head"><div class="eyebrow">GELEN DAVETLER</div><h2>Arkadaşlık istekleri</h2><p>İstekleri kabul etmeden arkadaşlık bağı kurulmaz.</p></div><div class="portal-grid">'+(requests||'<article class="card empty-state">Bekleyen isteğin yok.</article>')+'</div></section></main>'+
    '<style>.card form{display:grid;gap:12px}.card input{width:100%;padding:13px;border-radius:10px;border:1px solid #62577d;background:#17152c;color:#fff}.card label{font-weight:600}</style>';
  return page('Sosyal Alan',content,user);
}

function accountCenterPage(user,tickets,status,thread=null){
 const csrf=esc(createSiteCsrfToken(process.env.ADMIN_SESSION_SECRET));
 const notice=status==='created'?'Destek talebin kaydedildi.':status==='reply_sent'?'Yanıtın destek ekibine iletildi.':status==='daily_limit'?'24 saat içinde en fazla 5 destek talebi açabilirsin.':status==='invalid'?'Form bilgilerini kontrol et.':'';
 const rows=tickets.map(ticket=>'<article class="card"><h3>'+esc(ticket.subject)+'</h3><p>'+esc(ticket.category)+' · '+(ticket.status==='open'?'Açık':ticket.status==='in_progress'?'İnceleniyor':'Kapalı')+'</p><p class="market-meta">'+esc(new Date(ticket.created_at).toLocaleString('tr-TR',{dateStyle:'medium',timeStyle:'short'}))+' · '+esc(ticket.ticket_id)+'</p><a class="btn ghost" href="/destek?ticket='+encodeURIComponent(ticket.ticket_id)+'">Konuşmayı görüntüle</a></article>').join('');
 const threadHtml=thread?'<section class="section"><h2>Talep konuşması · '+esc(thread.ticket.ticket_id)+'</h2><article class="card"><h3>İlk mesaj</h3><p>'+esc(thread.ticket.message)+'</p></article><div class="portal-grid">'+thread.messages.map(item=>'<article class="card"><p><b>'+(item.author_type==='support'?'Frieren Destek':'Sen')+'</b></p><p>'+esc(item.message)+'</p><small>'+esc(new Date(item.created_at).toLocaleString('tr-TR',{dateStyle:'medium',timeStyle:'short'}))+'</small></article>').join('')+'</div><article class="card"><h3>Durum geçmişi</h3><ul>'+thread.events.map(item=>'<li>'+esc(item.previous_status||'oluşturuldu')+' → '+esc(item.new_status)+' · '+esc(new Date(item.created_at).toLocaleString('tr-TR'))+'</li>').join('')+'</ul>'+(thread.ticket.status==='closed'?'Bu talep kapatılmış. Yeni bir talep oluşturabilirsin.':'<form method="post" action="/destek/yanit"><input type="hidden" name="csrf" value="'+csrf+'"><input type="hidden" name="ticketId" value="'+esc(thread.ticket.ticket_id)+'"><label for="ticket-reply">Yanıtın</label><textarea id="ticket-reply" name="message" minlength="1" maxlength="5000" required></textarea><button class="btn" type="submit">Yanıt gönder</button></form>')+'</article></section>':'';
 const content='<main class="wrap user-center-page account-center-page" style="padding:54px 0 80px"><header class="user-center-hero"><div class="eyebrow">✧ FRIEREN HESAP GÜVENLİĞİ</div><h1 class="hero-title">Hesap ve <em>Destek Merkezi.</em></h1><p class="lead">Destek geçmişini, hesap verilerini ve hesap yaşam döngüsünü tek yerden yönet.</p></header><nav class="user-center-tabs" aria-label="Kullanıcı merkezi"><a href="/maceraci/profil">Hesap Profilim</a><a href="/maceraci/sosyal">Sosyal Alan</a><a href="/maceraci/yasam">Yaşam Alanım</a><a href="/destek" aria-current="page">Hesap ve Destek</a></nav><p class="lead">Teknik sorun, oyun hatası veya hesap talebi oluştur. Verilerini JSON olarak dışa aktarabilir veya portal hesabını silebilirsin.</p>'+(notice?'<p class="notice" role="status">'+esc(notice)+'</p>':'')+'<section class="section"><div class="portal-grid"><article class="card"><h2>Destek talebi oluştur</h2><form method="post" action="/destek"><input type="hidden" name="csrf" value="'+csrf+'"><label for="ticket-category">Kategori</label><select id="ticket-category" name="category"><option value="technical">Teknik sorun</option><option value="bug">Hata bildirimi</option><option value="account">Hesap / OAuth</option><option value="gameplay">RPG / oyun</option><option value="other">Diğer</option></select><label for="ticket-subject">Konu</label><input id="ticket-subject" name="subject" maxlength="160" required><label for="ticket-message">Açıklama</label><textarea id="ticket-message" name="message" minlength="10" maxlength="5000" required></textarea><button class="btn" type="submit">Talebi gönder</button></form></article><article class="card"><span id="account-settings" aria-hidden="true"></span><h2>Verilerim</h2><p>Site hesabı, bağlı Discord karakterleri, envanter, koleksiyon, başarımlar ve pazar geçmişini JSON dosyası olarak al.</p><a class="btn" href="/hesap/veri">Verilerimi dışa aktar</a><p class="market-meta">Şifre ve oturum doğrulama sırları dışa aktarıma dahil edilmez.</p></article></div></section><section class="section"><div class="section-head"><h2>Destek geçmişim</h2></div><div class="portal-grid">'+(rows||'<article class="card">Henüz destek talebin yok.</article>')+'</div></section>'+threadHtml+'<section class="section"><article class="card"><h2>Portal hesabını sil</h2><p>Bu işlem portal hesabını ve Discord bağlantılarını kaldırır. Discord hesabına ait RPG karakterleri ve sunucu oyun kayıtları silinmez.</p><form method="post" action="/hesap/sil"><input type="hidden" name="csrf" value="'+csrf+'"><label for="delete-confirm">Onaylamak için HESABIMI SIL yaz</label><input id="delete-confirm" name="confirmation" maxlength="32" required><button class="btn ghost" type="submit">Portal hesabını sil</button></form></article></section></main><style>.card form{display:grid;gap:12px}.card input,.card textarea,.card select{width:100%;padding:13px;border-radius:10px;border:1px solid #62577d;background:#17152c;color:#fff}.card textarea{min-height:140px}.card label{font-weight:600}</style>';
 return page('Destek ve Hesap Merkezi',content,user);
}

function notificationPreferencesPage(user,profile,preferences,status){
 const guild=encodeURIComponent(profile.guild_id),csrf=esc(createSiteCsrfToken(process.env.ADMIN_SESSION_SECRET));
 const labels={anime_news:'Haberci kuş · Günlük anime haber özeti',event_reminders:'Topluluk etkinliği hatırlatmaları',boss_raid_reminders:'Boss / Raid hatırlatmaları'};
 const cards=Object.entries(labels).map(([category,label])=>{
  const enabled=Boolean(preferences[category]);
  return '<article class="card"><h2>'+esc(label)+'</h2><p>'+(enabled?'Açık':'Kapalı')+'</p><form method="post" action="/maceraci/bildirimler"><input type="hidden" name="csrf" value="'+csrf+'"><input type="hidden" name="guildId" value="'+guild+'"><input type="hidden" name="category" value="'+category+'"><input type="hidden" name="enabled" value="'+(!enabled)+'"><button class="btn '+(enabled?'ghost':'')+'" type="submit">'+(enabled?'Kapat':'Aç')+'</button></form></article>';
 }).join('');
 const notice=status==='saved'?'Bildirim tercihin kaydedildi.':status==='invalid'?'Bildirim tercihi geçersiz.':'';
 const content='<main class="wrap user-center-page notification-center-page" style="padding:54px 0 80px"><header class="user-center-hero"><div class="eyebrow">✧ FRIEREN HABERCİ KUŞU</div><h1 class="hero-title">Bildirim <em>Merkezim.</em></h1><p class="lead">Haber, etkinlik ve boss/raid hatırlatmalarını kendi tercihlerinle yönet.</p><div class="user-center-metrics"><article><span>Anime haberleri</span><strong>'+ (preferences.anime_news?'Açık':'Kapalı') +'</strong></article><article><span>Etkinlik</span><strong>'+ (preferences.event_reminders?'Açık':'Kapalı') +'</strong></article><article><span>Boss / Raid</span><strong>'+ (preferences.boss_raid_reminders?'Açık':'Kapalı') +'</strong></article><article><span>Sunucu</span><strong>Aktif</strong></article></div></header><nav class="user-center-tabs" aria-label="Kullanıcı merkezi"><a href="/maceraci/profil">Hesap Profilim</a><a href="/maceraci/sosyal">Sosyal Alan</a><a href="/maceraci/yasam">Yaşam Alanım</a><a href="/maceraci/bildirimler" aria-current="page">Bildirimler</a><a href="/destek">Hesap ve Destek</a></nav><p class="lead">'+esc(profile.character_name||'Maceracı')+' · Tercihler yalnızca bu Discord sunucusundaki karakterin için geçerlidir.</p>'+(notice?'<p class="notice" role="status">'+notice+'</p>':'')+'<div class="portal-actions"><a class="btn ghost" href="/maceraci">Maceracı paneli</a></div><section class="section"><div class="portal-grid">'+cards+'</div></section><article class="card"><p>Anime haberleri, Anime News Network’ün herkese açık RSS akışından alınır ve günde en fazla bir kez özel mesajla özetlenir. Özel mesajların kapalıysa haberci kuş tercihini otomatik kapatır. Takvim ve boss/raid hatırlatmalarında etkinliğe kayıt olmak varsayılan izindir; buradan kapatabilirsin.</p></article></main><style>.card form{display:flex;gap:12px;align-items:center}.card form button{min-width:110px}</style>';
 return page('Bildirim Tercihleri',content,user);
}

async function canSendAutomationToChannel(client,guildId,channelId,usesEmbed=false){
 try{
  if(!client?.user||!/^\d{17,20}$/.test(String(channelId||'')))return false;
  const channel=await client.channels.fetch(channelId);
  if(!channel||channel.guildId!==guildId||!channel.isTextBased())return false;
  const permissions=channel.permissionsFor(client.user);
  return Boolean(permissions?.has(PermissionFlagsBits.SendMessages)&&(!usesEmbed||permissions.has(PermissionFlagsBits.EmbedLinks)));
 }catch{return false;}
}

async function canManageGuild(client,guildId,userId){
 try{
  const guild=client?.guilds?.cache?.get(guildId)||await client?.guilds?.fetch(guildId);
  if(!guild)return false;
  if(guild.ownerId===userId)return true;
  const member=await guild.members.fetch(userId);
  return member.permissions.has(PermissionFlagsBits.ManageGuild)||member.permissions.has(PermissionFlagsBits.Administrator);
 }catch{return false;}
}

function guildWorkshopPage(user,profile,templates,commands,automations,status){
 const guild=encodeURIComponent(profile.guild_id),csrf=esc(createSiteCsrfToken(process.env.ADMIN_SESSION_SECRET));
 const notice=status==='saved_embed'?'Embed şablonu kaydedildi.':status==='saved_command'?'Özel komut / büyü kaydedildi.':status==='saved_automation'?'Büyü otomasyonu kaydedildi.':status==='invalid'?'Form alanlarını kontrol et.':'';
 const previews=templates.map(item=>'<article class="embed-preview" style="border-left:4px solid #'+Number(item.color).toString(16).padStart(6,'0')+'"><div class="eyebrow">'+esc(item.name)+'</div><h3>'+esc(item.title)+'</h3><p>'+esc(item.description)+'</p>'+(Array.isArray(item.fields)?item.fields.map(field=>'<p><b>'+esc(field.name)+'</b><br>'+esc(field.value)+'</p>').join(''):'')+'<small>'+esc(item.footer||'Frieren Atölyesi')+'</small><p class="market-meta">Şablon: '+esc(item.template_id)+'</p></article>').join('');
 const commandRows=commands.map(item=>'<article class="card"><h3>/buyu ad: '+esc(item.trigger_name)+'</h3><p>'+(item.kind==='spell'?'Özel büyü · '+esc(item.element)+' · '+Number(item.mana_cost)+' mana · güç '+Number(item.power):'Özel yanıt komutu')+'</p></article>').join('');
 const automationRows=automations.map(item=>'<article class="card"><h3>'+esc(item.name)+'</h3><p>'+esc(item.trigger_key)+' → #'+esc(item.channel_id)+' · '+Number(item.cooldown_seconds)+' sn bekleme</p></article>').join('');
 const content='<main class="wrap" style="padding:54px 0 80px"><div class="eyebrow">✧ LONCA BÜYÜ ATÖLYESİ</div><h1 class="hero-title">Görsel Embed ve <em>Otomasyon</em></h1><p class="lead">'+esc(profile.character_name||'Maceracı')+' · Bu atölyeyi yalnızca sunucu sahibi veya Yönet sunucu izni olanlar kullanabilir.</p>'+(notice?'<p class="notice" role="status">'+notice+'</p>':'')+'<div class="portal-actions"><a class="btn ghost" href="/maceraci">Maceracı paneli</a></div><section class="section"><div class="portal-grid"><article class="card"><h2>Görsel Embed Tasarımcısı</h2><form method="post" action="/maceraci/atolye"><input type="hidden" name="csrf" value="'+csrf+'"><input type="hidden" name="guildId" value="'+guild+'"><input type="hidden" name="action" value="embed"><label>Şablon adı</label><input name="name" maxlength="40" required><label>Başlık</label><input id="embed-title" name="title" maxlength="256" required><label>Açıklama</label><textarea id="embed-description" name="description" maxlength="4000" required></textarea><label>Renk (#RRGGBB)</label><input id="embed-color" name="color" value="#9b8cff" pattern="#?[0-9a-fA-F]{6}" required><label>Alt bilgi</label><input id="embed-footer" name="footer" maxlength="2048"><label>Alan 1 başlık</label><input name="field1Name" maxlength="256"><label>Alan 1 metni</label><textarea name="field1Value" maxlength="1024"></textarea><label>Alan 2 başlık</label><input name="field2Name" maxlength="256"><label>Alan 2 metni</label><textarea name="field2Value" maxlength="1024"></textarea><button class="btn" type="submit">Embed şablonunu kaydet</button></form></article><article class="card"><h2>Canlı Embed Önizlemesi</h2><div id="embed-live-preview" class="embed-preview" aria-live="polite"><h3 id="embed-preview-title">Başlık önizlemesi</h3><p id="embed-preview-description">Açıklama burada görünecek.</p><small id="embed-preview-footer">Frieren Atölyesi</small></div><p class="market-meta">Önizleme yalnızca tarayıcında çalışır; Discord&#39;a gönderim yapmaz.</p></article><article class="card"><h2>Özel Komut / Büyü Oluşturucu</h2><form method="post" action="/maceraci/atolye"><input type="hidden" name="csrf" value="'+csrf+'"><input type="hidden" name="guildId" value="'+guild+'"><input type="hidden" name="action" value="command"><label>Komut adı (küçük harf)</label><input name="triggerName" pattern="[a-z0-9_-]{2,32}" maxlength="32" required><label>Tür</label><select name="kind"><option value="command">Özel yanıt komutu</option><option value="spell">Özel büyü</option></select><label>Yanıt / büyü açıklaması</label><textarea name="responseText" maxlength="1800" required></textarea><label>Element (büyü için)</label><select name="element"><option value="fire">Ateş</option><option value="ice">Buz</option><option value="wind">Rüzgâr</option><option value="light">Işık</option><option value="shadow">Gölge</option></select><label>Mana (1–100)</label><input type="number" name="manaCost" min="1" max="100" value="20"><label>Büyü gücü (1–300)</label><input type="number" name="power" min="1" max="300" value="50"><button class="btn" type="submit">Komutu / büyüyü kaydet</button></form><p class="market-meta">Kayıtlı komutlar Discord’da /buyu ad:komut_adı ile çalıştırılır. Kod veya script çalıştırılmaz.</p></article></div></section><section class="section"><article class="card"><h2>Büyü Otomasyonu Oluşturucu</h2><form method="post" action="/maceraci/atolye"><input type="hidden" name="csrf" value="'+csrf+'"><input type="hidden" name="guildId" value="'+guild+'"><input type="hidden" name="action" value="automation"><label>Otomasyon adı</label><input name="automationName" maxlength="48" required><label>Tetikleyici</label><select name="triggerKey"><option value="event_reminder">Etkinlik hatırlatması</option><option value="custom_spell">Özel büyü kullanımı</option></select><label>Discord kanal ID</label><input name="channelId" inputmode="numeric" pattern="[0-9]{17,20}" maxlength="20" required><label>Gönderilecek mesaj</label><textarea name="automationMessage" maxlength="1800" required placeholder="{{player}} · {{event}} · {{spell}}"></textarea><label>Embed şablonu (isteğe bağlı)</label><select name="templateId"><option value="">Yok</option>'+templates.map(item=>'<option value="'+esc(item.template_id)+'">'+esc(item.name)+'</option>').join('')+'</select><label>Bekleme (30–3600 sn)</label><input type="number" name="cooldownSeconds" min="30" max="3600" value="60"><button class="btn" type="submit">Otomasyonu kaydet</button></form></article></section><section class="section"><div class="section-head"><h2>Kaydedilmiş Embed Şablonları</h2></div><div class="portal-grid">'+(previews||'<article class="card">Henüz embed şablonu yok.</article>')+'</div></section><section class="section"><div class="section-head"><h2>Özel Komutlar ve Büyüler</h2></div><div class="portal-grid">'+(commandRows||'<article class="card">Henüz özel komut yok.</article>')+'</div></section><section class="section"><div class="section-head"><h2>Aktif Otomasyonlar</h2></div><div class="portal-grid">'+(automationRows||'<article class="card">Henüz otomasyon yok.</article>')+'</div></section></main><script src="/assets/embed-preview.js" defer></script><style>.card form{display:grid;gap:10px}.card input,.card textarea,.card select{width:100%;padding:12px;border-radius:10px;border:1px solid #62577d;background:#17152c;color:#fff}.card textarea{min-height:90px}.card label{font-weight:600}.embed-preview{background:#17152c;border-radius:12px;padding:16px;margin:8px 0;overflow-wrap:anywhere}</style>';
 return page('Lonca Büyü Atölyesi',content,user);
}

function aiPage(user) {
  const healthLink = user.id === OWNER_ID ? '<a class="btn ghost" href="/owner/frieren-ai/health">Servis sağlık durumu</a>' : '';
  return page('Frieren AI', '<main><section class="wrap" style="padding:65px 0 42px;text-align:center"><div class="eyebrow">AKILLI ASİSTAN · TEST · TEKNİK ANALİZ</div><h1 class="hero-title">Frieren <em>AI</em></h1><p class="lead" style="margin:auto">Poğaça Frieren’in teknik yol arkadaşı. Sohbet ve hafızadan kod denetimine, test senaryolarından hata raporlarına uzanan ayrı bir AI servisi.</p><div class="actions" style="justify-content:center"><a class="btn" href="/owner">AI kontrol merkezine git ↗</a>' + healthLink + '</div></section><section class="section"><div class="wrap grid"><article class="card"><div class="icon">✧</div><h3>Frieren sohbeti</h3><p>Karakter odaklı sohbet akışı ve izinli kullanıcı hafızası.</p></article><article class="card"><div class="icon">⌘</div><h3>Teknik denetim</h3><p>Komut sözleşmeleri, kod incelemesi ve hata teşhisi.</p></article><article class="card"><div class="icon">✓</div><h3>Test sistemi</h3><p>Senaryo bazlı testler, PASS/FAIL raporları ve kanıt odaklı doğrulama.</p></article></div></section><section class="section"><div class="wrap cta"><h2>İki bot, tek büyülü platform.</h2><p>RPG macerası ve teknik asistan birbirinden bağımsız servislerde çalışır.</p><a class="btn" href="/pogaca">Poğaça Frieren’i keşfet</a></div></section></main>', user);
}

function publicSeoLandingPage() {
  const canonical = 'https://frierenbot.vercel.app/tanitim';
  const description = 'Poğaça Frieren; görevler, büyüler, zindanlar, boss savaşları, ekipman ve koleksiyon sistemleri sunan Frieren temalı Discord RPG botudur.';
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': canonical + '#website',
        url: canonical,
        name: 'Frieren Bot',
        inLanguage: 'tr-TR',
        publisher: { '@id': canonical + '#creator' }
      },
      {
        '@type': 'Person',
        '@id': canonical + '#creator',
        name: 'Soiree',
        url: 'https://github.com/soire07'
      },
      {
        '@type': 'SoftwareApplication',
        '@id': canonical + '#application',
        name: 'Poğaça Frieren',
        alternateName: 'Frieren Bot',
        applicationCategory: 'GameApplication',
        operatingSystem: 'Discord',
        url: canonical,
        description,
        creator: { '@id': canonical + '#creator' }
      }
    ]
  };
  const content = '<main><section class="wrap hero"><div><div class="eyebrow">✧ FRIEREN EVRENİNDEN İLHAM ALAN DİSCORD RPG ✧</div><h1>Frieren Bot:<br><em>Poğaça Frieren</em></h1><p class="lead">Görevler, büyüler, zindanlar, boss savaşları, ekipman, koleksiyon ve topluluk etkinlikleriyle kendi maceranı yaz.</p><div class="actions"><a class="btn" href="/pogaca">Poğaça Frieren’i keşfet ✧</a><a class="btn ghost" href="/login">Discord ile giriş yap</a></div><p class="muted">Proje geliştiricisi: <a href="https://github.com/soire07" rel="me noopener">Soiree · GitHub soire07</a></p></div><div class="hero-art"><img src="/assets/site-banner.webp" alt="Poğaça Frieren — Frieren Discord RPG" fetchpriority="high" decoding="async" width="1000" height="353"></div></section><section class="section"><div class="wrap"><div class="section-head"><div class="eyebrow">MACERA SİSTEMLERİ</div><h2>Discord sunucunda yaşayan bir RPG dünyası</h2><p>Poğaça Frieren, Frieren dünyasının büyü ve keşif atmosferini topluluk tabanlı bir rol yapma deneyimine taşır.</p></div><div class="grid"><article class="card"><h3>Karakter ve ilerleme</h3><p>Karakterini oluştur, deneyim kazan, seviyeni yükselt ve maceranın ilerleyişini takip et. Karakter gelişimi sunucu kapsamındaki RPG verileriyle ilişkilidir.</p></article><article class="card"><h3>Görevler ve keşif</h3><p>Görevleri tamamla, ödüller kazan, farklı etkinliklere katıl ve yeni hedefler aç. Tek başına ilerleyebilir veya diğer maceracılarla birlikte oynayabilirsin.</p></article><article class="card"><h3>Büyüler ve savaşlar</h3><p>Büyü sistemlerini keşfet, zindanlara gir, boss karşılaşmalarına hazırlan ve ekipmanını savaş tarzına göre geliştir.</p></article><article class="card"><h3>Envanter ve ekonomi</h3><p>Eşyalarını ve ekipmanını yönet, üretim ve pazar sistemlerini kullan, oyun içi kaynaklarını planlı biçimde değerlendir.</p></article><article class="card"><h3>Koleksiyon ve yoldaşlar</h3><p>Yoldaşlarını geliştir, balık ve yaratık koleksiyonlarını tamamla, kozmetiklerini düzenle ve kişisel yaşam alanını özelleştir.</p></article><article class="card"><h3>Topluluk özellikleri</h3><p>Lonca etkinlikleri, sosyal etkileşimler ve takım mücadeleleriyle sunucundaki diğer oyuncularla birlikte ilerle.</p></article></div></div></section><section class="section"><div class="wrap"><div class="section-head"><div class="eyebrow">FRIEREN ASİSTANI</div><h2>RPG deneyimine eşlik eden yapay zekâ</h2><p>Frieren AI yetenekleri Poğaça Frieren deneyiminin parçası olarak ele alınır; ayrı bir bot veya bağımsız bir ürün olarak sunulmaz.</p></div><div class="grid"><article class="card"><h3>Karakter odaklı sohbet</h3><p>Frieren temalı sohbet deneyimi ve izin verilen kullanıcı hafızasıyla etkileşim kur.</p></article><article class="card"><h3>Teknik destek ve denetim</h3><p>Proje geliştirme sürecinde hata analizi, test sonuçlarını yorumlama ve kod denetimi için yardımcı yetenekler.</p></article></div></div></section><section class="section"><div class="wrap"><div class="section-head"><div class="eyebrow">SIK SORULAN SORULAR</div><h2>Poğaça Frieren hakkında</h2></div><div class="grid"><article class="card"><h3>Poğaça Frieren nedir?</h3><p>Frieren evreninden ilham alan, Discord sunucularında oynanan RPG ve topluluk botudur.</p></article><article class="card"><h3>Nasıl başlanır?</h3><p>Botun bulunduğu Discord sunucusunda komutları kullanarak karakterini oluşturabilir ve maceraya başlayabilirsin. Web paneline Discord hesabınla giriş yapılır.</p></article><article class="card"><h3>Hangi sistemler bulunur?</h3><p>Karakter gelişimi, görevler, büyüler, zindanlar, boss savaşları, envanter, ekipman, ekonomi, koleksiyon, yoldaşlar ve etkinlik sistemleri bulunur.</p></article><article class="card"><h3>Web hesabı Discord hesabıyla mı açılır?</h3><p>Evet. Web girişinde Discord OAuth kullanılır; yeni bir parola veya ayrı kayıt formu gerekmez.</p></article></div></div></section><section class="section"><div class="wrap cta"><h2>Kendi macerana başla.</h2><p>Frieren dünyasını Discord sunucunda keşfet.</p><a class="btn" href="/login">Discord ile giriş yap</a></div></section></main>';
  return page('Frieren Bot | Poğaça Frieren Discord RPG', content, {
    id: '',
    username: 'Ziyaretçi',
    avatarUrl: '/assets/site-avatar.webp'
  }, {
    description,
    canonical,
    image: 'https://frierenbot.vercel.app/assets/site-banner.webp',
    indexable: true,
    structuredData
  });
}

export async function handlePublicSiteRequest(req, res, { client, db } = {}) {
  if (await handleGuildDashboardRequest(req, res, { client, db })) return true;
  const url = new URL(req.url, 'http://localhost');
  if(req.method==='POST'&&url.pathname==='/api/chat-media/upload'){
    const session=readPublicSiteSession(cookies(req)[SITE_COOKIE],process.env.ADMIN_SESSION_SECRET);
    if(!requireSiteAccount(res,session?.id))return true;
    if(!db){res.writeHead(503,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:'media_unavailable'}));return true;}
    const mimeType=String(req.headers['content-type']||'').toLowerCase().split(';')[0].trim();
    if(!verifySiteCsrfToken(req.headers['x-csrf-token'],process.env.ADMIN_SESSION_SECRET)){res.writeHead(403,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:'csrf_failed'}));return true;}
    const scope=String(req.headers['x-chat-scope']||''),target=String(req.headers['x-chat-target']||'');
    let scopeKey='';
    if(scope==='public')scopeKey='public';
    else if(scope==='dm'){
      if(!SITE_ACCOUNT_ID.test(target)||!await canSiteDmAccountsMessage(db,session.id,target)){res.writeHead(403,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:'media_scope_denied'}));return true;}
      scopeKey='dm:'+[session.id,target].sort().join(':');
    }else if(scope==='group'){
      if(!/^[0-9a-f-]{36}$/i.test(target)||!await isSiteDmGroupMember(db,session.id,target)){res.writeHead(403,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:'media_scope_denied'}));return true;}
      scopeKey='group:'+target;
    }else{res.writeHead(400,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:'media_scope_invalid'}));return true;}
    const chunks=[];let size=0;const max=24*1024*1024;
    for await(const chunk of req){size+=chunk.length;if(size>max){res.writeHead(413,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:'media_too_large'}));return true;}chunks.push(chunk);}
    try{
      const result=await uploadChatMedia(db,{accountId:session.id,scope,scopeKey,mimeType,buffer:Buffer.concat(chunks)});
      res.writeHead(201,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(result));return true;
    }catch(error){
      const code=String(error?.message||'');
      const status=code==='CHAT_MEDIA_STORAGE_NOT_CONFIGURED'?503:code==='CHAT_MEDIA_DAILY_QUOTA'||code==='CHAT_MEDIA_STORAGE_QUOTA'?429:code.includes('SCOPE')?403:400;
      const message=code==='CHAT_MEDIA_STORAGE_NOT_CONFIGURED'?'media_storage_not_configured':code==='CHAT_MEDIA_DAILY_QUOTA'?'media_daily_quota':code==='CHAT_MEDIA_STORAGE_QUOTA'?'media_storage_quota':code==='CHAT_MEDIA_SIZE_INVALID'?'media_size_invalid':code==='CHAT_MEDIA_TYPE_INVALID'||code==='CHAT_MEDIA_SIGNATURE_INVALID'?'media_type_invalid':'media_upload_failed';
      res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify({error:message}));return true;
    }
  }
  if(req.method==='POST'&&url.pathname==='/api/chat-media/discard'){
    const session=readPublicSiteSession(cookies(req)[SITE_COOKIE],process.env.ADMIN_SESSION_SECRET);
    if(!requireSiteAccount(res,session?.id))return true;
    if(!String(req.headers['content-type']||'').toLowerCase().includes('application/x-www-form-urlencoded')){res.writeHead(415,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:'invalid_content_type'}));return true;}
    let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>2048){res.writeHead(413,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:'message_too_large'}));return true;}chunks.push(chunk);}
    const form=new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
    if(!verifySiteCsrfToken(form.get('csrf'),process.env.ADMIN_SESSION_SECRET)){res.writeHead(403,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:'csrf_failed'}));return true;}
    try{const result=await discardChatMedia(db,{mediaId:form.get('mediaId'),accountId:session.id});res.writeHead(result.status==='deleted'?200:404,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(result));return true;}
    catch(error){if(String(error?.message||'').startsWith('CHAT_MEDIA_')){res.writeHead(400,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:'media_discard_failed'}));return true;}throw error;}
  }
  if(req.method==='GET'&&url.pathname==='/api/chat-events'){
    const session=readPublicSiteSession(cookies(req)[SITE_COOKIE],process.env.ADMIN_SESSION_SECRET);
    if(!requireSiteAccount(res,session?.id))return true;
    const unsubscribe=subscribeChatEvents(session.id,event=>{
      if(!res.writableEnded)res.write('event: chat-update\\ndata: '+JSON.stringify(event)+'\\n\\n');
    });
    if(!unsubscribe){res.writeHead(503,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:'realtime_capacity'}));return true;}
    res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no','X-Content-Type-Options':'nosniff'});
    res.write('retry: 3000\\n: connected\\n\\n');
    const heartbeat=setInterval(()=>{if(!res.writableEnded)res.write(': keep-alive\\n\\n');},20000);
    let maxLifetime=null;
    const cleanup=()=>{clearInterval(heartbeat);if(maxLifetime)clearTimeout(maxLifetime);unsubscribe();};
    maxLifetime=setTimeout(()=>{cleanup();if(!res.writableEnded)res.end();},90000);
    res.on('close',cleanup);
    res.on('error',cleanup);
    return true;
  }
  if (req.method === 'GET' && url.pathname === '/google1941de4c3bd5e8ea.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public,max-age=3600', 'X-Content-Type-Options': 'nosniff' });
    res.end('google-site-verification: google1941de4c3bd5e8ea.html\n');
    return true;
  }
  if (req.method === 'GET' && url.pathname === '/robots.txt') {
    const body = 'User-agent: *\nAllow: /\nAllow: /tanitim\nAllow: /login\nAllow: /sitemap.xml\nAllow: /assets/site-banner.webp\nAllow: /assets/site-avatar.webp\nAllow: /assets/site-avatar.svg\nAllow: /assets/site.css\nDisallow: /maceraci\nDisallow: /owner\nDisallow: /hesap-merkezi\nDisallow: /destek\nSitemap: https://frierenbot.vercel.app/sitemap.xml\n';
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public,max-age=3600', 'X-Content-Type-Options': 'nosniff' });
    res.end(body);
    return true;
  }
  if (req.method === 'GET' && url.pathname === '/sitemap.xml') {
    const body = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://frierenbot.vercel.app/</loc></url><url><loc>https://frierenbot.vercel.app/tanitim</loc></url></urlset>';
    res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public,max-age=3600', 'X-Content-Type-Options': 'nosniff' });
    res.end(body);
    return true;
  }
  if (req.method === 'GET' && url.pathname === '/') {
    const visitor = { id: '', username: 'Ziyaretçi', avatarUrl: '/assets/site-avatar.webp' };
    const description = 'Poğaça Frieren; görevler, büyüler, zindanlar, boss savaşları, ekipman, koleksiyon ve topluluk etkinlikleri sunan Frieren temalı Discord RPG botudur.';
    const canonical = 'https://frierenbot.vercel.app/';
    const structuredData = { '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'Poğaça Frieren', applicationCategory: 'GameApplication', operatingSystem: 'Discord', url: canonical, description };
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public,max-age=300', 'X-Robots-Tag': 'index, follow', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' });
    res.end(pogaca(client, visitor, { description, canonical, image: 'https://frierenbot.vercel.app/assets/site-banner.webp', indexable: true, structuredData }));
    return true;
  }
  if (req.method === 'GET' && url.pathname === '/tanitim') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public,max-age=300', 'X-Robots-Tag': 'index, follow', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' });
    res.end(publicSeoLandingPage());
    return true;
  }
  if(url.pathname==='/api/site-dm/friends'&&req.method==='GET'){
    const session=readPublicSiteSession(cookies(req)[SITE_COOKIE],process.env.ADMIN_SESSION_SECRET);
    if(!requireSiteAccount(res,session?.id))return true;
    if(!db){res.writeHead(503,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:'messages_unavailable'}));return true;}
    const friends=await listAccountFriends(db,session.id);
    res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify({friends:friends.friends||[]}));return true;
  }
  if(url.pathname==='/api/site-dm/messages'&&req.method==='GET'){
    const session=readPublicSiteSession(cookies(req)[SITE_COOKIE],process.env.ADMIN_SESSION_SECRET);
    if(!requireSiteAccount(res,session?.id))return true;
    if(!db){res.writeHead(503,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:'messages_unavailable'}));return true;}
    const other=String(url.searchParams.get('with')||'');
    if(!SITE_ACCOUNT_ID.test(other)){res.writeHead(400,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:'invalid_recipient'}));return true;}
    const result=await listSiteDirectMessages(db,{accountId:session.id,otherAccountId:other,limit:60});
    res.writeHead(result.status==='ok'?200:403,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(result));return true;
  }
  if(url.pathname==='/api/site-dm/read'&&req.method==='POST'){
    const session=readPublicSiteSession(cookies(req)[SITE_COOKIE],process.env.ADMIN_SESSION_SECRET);
    if(!requireSiteAccount(res,session?.id))return true;
    if(!db){res.writeHead(503,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:'messages_unavailable'}));return true;}
    if(!String(req.headers['content-type']||'').toLowerCase().includes('application/x-www-form-urlencoded')){res.writeHead(415,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:'invalid_content_type'}));return true;}
    let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>2048){res.writeHead(413,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:'message_too_large'}));return true;}chunks.push(chunk);}
    const form=new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
    if(!verifySiteCsrfToken(form.get('csrf'),process.env.ADMIN_SESSION_SECRET)){res.writeHead(403,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:'csrf_failed'}));return true;}
    try{const result=await markSiteDirectMessagesRead(db,{accountId:session.id,otherAccountId:form.get('recipientAccountId')});res.writeHead(result.status==='read'?200:403,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(result));return true;}catch(error){if(String(error?.message||'').startsWith('SITE_DM_')||String(error?.message||'').startsWith('CHAT_MEDIA_')){res.writeHead(400,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:'invalid_recipient'}));return true;}throw error;}
  }
  if(url.pathname==='/api/site-dm/messages'&&req.method==='POST'){
    const session=readPublicSiteSession(cookies(req)[SITE_COOKIE],process.env.ADMIN_SESSION_SECRET);
    if(!requireSiteAccount(res,session?.id))return true;
    if(!db){res.writeHead(503,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:'messages_unavailable'}));return true;}
    if(!String(req.headers['content-type']||'').toLowerCase().includes('application/x-www-form-urlencoded')){res.writeHead(415,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:'invalid_content_type'}));return true;}
    let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>4096){res.writeHead(413,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:'message_too_large'}));return true;}chunks.push(chunk);}
    const form=new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
    if(!verifySiteCsrfToken(form.get('csrf'),process.env.ADMIN_SESSION_SECRET)){res.writeHead(403,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:'csrf_failed'}));return true;}
    try{
      const result=await sendSiteDirectMessage(db,{senderAccountId:session.id,recipientAccountId:form.get('recipientAccountId'),body:form.get('message'),mediaId:form.get('mediaId')||null});
      if(result.status==='sent'){const recipient=String(form.get('recipientAccountId')||'');publishChatEvent({scope:'dm',conversationId:[session.id,recipient].sort().join(':'),accountIds:[session.id,recipient]});}
      const status=result.status==='sent'?201:result.status==='rate_limited'?429:result.status==='not_allowed'?403:result.status==='thread_limit'?409:400;
      res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(result));return true;
    }catch(error){
      if(String(error?.message||'').startsWith('SITE_DM_')||String(error?.message||'').startsWith('CHAT_MEDIA_')){res.writeHead(400,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:'invalid_message'}));return true;}
      throw error;
    }
  }
  if(url.pathname==='/api/site-dm/groups'&&req.method==='GET'){
    const session=readPublicSiteSession(cookies(req)[SITE_COOKIE],process.env.ADMIN_SESSION_SECRET);if(!requireSiteAccount(res,session?.id))return true;
    if(!db){res.writeHead(503,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:'messages_unavailable'}));return true;}
    const groups=await listSiteDmGroups(db,session.id);res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({groups}));return true;
  }
  if(url.pathname==='/api/site-dm/group-messages'&&req.method==='GET'){
    const session=readPublicSiteSession(cookies(req)[SITE_COOKIE],process.env.ADMIN_SESSION_SECRET);if(!requireSiteAccount(res,session?.id))return true;
    if(!db){res.writeHead(503,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:'messages_unavailable'}));return true;}
    const groupId=String(url.searchParams.get('groupId')||'');if(!/^[0-9a-f-]{36}$/i.test(groupId)){res.writeHead(400,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:'invalid_group'}));return true;}
    const result=await listSiteDmGroupMessages(db,{accountId:session.id,groupId,limit:60});res.writeHead(result.status==='ok'?200:403,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(result));return true;
  }
  if(['/api/site-dm/groups','/api/site-dm/group-messages','/api/site-dm/group-read','/api/site-dm/group-leave'].includes(url.pathname)&&req.method==='POST'){
    const session=readPublicSiteSession(cookies(req)[SITE_COOKIE],process.env.ADMIN_SESSION_SECRET);if(!requireSiteAccount(res,session?.id))return true;
    if(!db){res.writeHead(503,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:'messages_unavailable'}));return true;}
    if(!String(req.headers['content-type']||'').toLowerCase().includes('application/x-www-form-urlencoded')){res.writeHead(415,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:'invalid_content_type'}));return true;}
    let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>4096){res.writeHead(413,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:'message_too_large'}));return true;}chunks.push(chunk);}
    const form=new URLSearchParams(Buffer.concat(chunks).toString('utf8'));if(!verifySiteCsrfToken(form.get('csrf'),process.env.ADMIN_SESSION_SECRET)){res.writeHead(403,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:'csrf_failed'}));return true;}
    try{let result;if(url.pathname==='/api/site-dm/groups'){let members=[];try{members=JSON.parse(form.get('memberAccountIds')||'[]');}catch{}result=await createSiteDmGroup(db,{creatorAccountId:session.id,memberAccountIds:members,title:form.get('title')});}
      else if(url.pathname==='/api/site-dm/group-messages'){result=await sendSiteDmGroupMessage(db,{senderAccountId:session.id,groupId:form.get('groupId'),body:form.get('message'),mediaId:form.get('mediaId')||null});if(result.status==='sent'){const members=await db.query('SELECT gm.account_id FROM frieren_site_dm_group_members gm WHERE gm.group_id=$1 AND gm.account_id<>$2 AND NOT EXISTS(SELECT 1 FROM frieren_public_chat_blocks b WHERE (b.blocker_account_id=gm.account_id AND b.blocked_account_id=$2) OR (b.blocker_account_id=$2 AND b.blocked_account_id=gm.account_id))',[form.get('groupId'),session.id]);publishChatEvent({scope:'group',conversationId:form.get('groupId'),accountIds:[session.id,...members.rows.map(row=>row.account_id)]});}}
      else if(url.pathname==='/api/site-dm/group-read')result=await markSiteDmGroupMessagesRead(db,{accountId:session.id,groupId:form.get('groupId')});
      else result=await leaveSiteDmGroup(db,{accountId:session.id,groupId:form.get('groupId')});
      const status=result.status==='created'||result.status==='sent'?201:result.status==='rate_limited'?429:result.status==='not_allowed'?403:result.status==='not_found'?404:200;
      res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(result));return true;
    }catch(error){if(String(error?.message||'').startsWith('SITE_DM_')||String(error?.message||'').startsWith('CHAT_MEDIA_')){res.writeHead(400,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:'invalid_group_message'}));return true;}throw error;}
  }
  if(url.pathname==='/api/public-chat/reports'&&req.method==='GET'){
    const session=readPublicSiteSession(cookies(req)[SITE_COOKIE],process.env.ADMIN_SESSION_SECRET);
    if(!requireSiteAccount(res,session?.id))return true;
    if(!db){res.writeHead(503,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:'chat_unavailable'}));return true;}
    if(!await isLinkedOwnerSiteAccount(db,session)){res.writeHead(403,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:'owner_only'}));return true;}
    const status=String(url.searchParams.get('status')||'pending');
    const reports=await listPublicChatReports(db,{status,limit:50});
    res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify({reports}));return true;
  }
  if(url.pathname==='/api/public-chat/messages'&&req.method==='GET'){
    if(!db){res.writeHead(503,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:'chat_unavailable'}));return true;}
    const chatSession=readPublicSiteSession(cookies(req)[SITE_COOKIE],process.env.ADMIN_SESSION_SECRET);
    const viewerId=SITE_ACCOUNT_ID.test(String(chatSession?.id||''))?chatSession.id:null;
    const before=String(url.searchParams.get('before')||''),search=String(url.searchParams.get('q')||'').slice(0,80);const ownerAccountIds=String(process.env.FRIEREN_OWNER_ACCOUNT_IDS||'').split(',').map(value=>value.trim().replace(/^site_/i,'').toLowerCase()).filter(value=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)).map(value=>'site_'+value);const [messages,pinned,blocked,presence,control]=await Promise.all([listPublicChatMessages(db,{limit:100,viewerAccountId:viewerId,before,search,ownerAccountIds}),listPublicChatMessages(db,{limit:100,viewerAccountId:viewerId,search,ownerAccountIds,pinnedOnly:true}),viewerId?listPublicChatBlocks(db,{accountId:viewerId}):Promise.resolve([]),getPublicChatPresence(db),getPublicChatControl(db)]);
    res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(JSON.stringify({messages,pinned,blocked,presence,control}));return true;
  }
  if(url.pathname==='/api/public-chat/messages'&&req.method==='POST'){
    const session=readPublicSiteSession(cookies(req)[SITE_COOKIE],process.env.ADMIN_SESSION_SECRET);
    if(!requireSiteAccount(res,session?.id))return true;
    if(!db){res.writeHead(503,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:'chat_unavailable'}));return true;}
    if(!String(req.headers['content-type']||'').toLowerCase().includes('application/x-www-form-urlencoded')){res.writeHead(415,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:'invalid_content_type'}));return true;}
    let size=0;const chunks=[];
    for await(const chunk of req){size+=chunk.length;if(size>4096){res.writeHead(413,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:'message_too_large'}));return true;}chunks.push(chunk);}
    const form=new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
    if(!verifySiteCsrfToken(form.get('csrf'),process.env.ADMIN_SESSION_SECRET)){res.writeHead(403,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:'csrf_failed'}));return true;}
    try{
      const result=await sendPublicChatMessage(db,{accountId:session.id,username:session.username,body:form.get('message'),replyToMessageId:form.get('replyToMessageId')||null,mediaId:form.get('mediaId')||null});
      if(result.status==='sent')publishChatEvent({scope:'public'});
      const status=result.status==='sent'?201:result.status==='rate_limited'?429:result.status==='chat_paused'?423:400;
      res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(result));return true;
    }catch(error){
      const code=String(error?.message||'');
      if(code.startsWith('PUBLIC_CHAT_')||code.startsWith('CHAT_MEDIA_')){res.writeHead(400,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:'invalid_message'}));return true;}
      throw error;
    }
  }
  if(['/api/public-chat/reactions','/api/public-chat/blocks','/api/public-chat/blocks/unblock','/api/public-chat/messages/edit','/api/public-chat/messages/delete','/api/public-chat/pins','/api/public-chat/presence','/api/public-chat/typing','/api/public-chat/read','/api/public-chat/reports','/api/public-chat/reports/review','/api/public-chat/control'].includes(url.pathname)&&req.method==='POST'){
    const session=readPublicSiteSession(cookies(req)[SITE_COOKIE],process.env.ADMIN_SESSION_SECRET);
    if(!requireSiteAccount(res,session?.id))return true;
    if(!db){res.writeHead(503,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:'chat_unavailable'}));return true;}
    if(!String(req.headers['content-type']||'').toLowerCase().includes('application/x-www-form-urlencoded')){res.writeHead(415,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:'invalid_content_type'}));return true;}
    let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>4096){res.writeHead(413,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:'message_too_large'}));return true;}chunks.push(chunk);}
    const form=new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
    if(!verifySiteCsrfToken(form.get('csrf'),process.env.ADMIN_SESSION_SECRET)){res.writeHead(403,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:'csrf_failed'}));return true;}
    const owner=await isLinkedOwnerSiteAccount(db,session);
    if(['/api/public-chat/pins','/api/public-chat/control','/api/public-chat/reports/review'].includes(url.pathname)&&!owner){res.writeHead(403,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:'owner_only'}));return true;}
    try{
      let result;
      if(url.pathname==='/api/public-chat/reactions')result=await togglePublicChatReaction(db,{accountId:session.id,messageId:form.get('messageId'),emoji:form.get('emoji')});
      else if(url.pathname==='/api/public-chat/blocks')result=await blockPublicChatUser(db,{accountId:session.id,messageId:form.get('messageId')});
      else if(url.pathname==='/api/public-chat/blocks/unblock')result=await unblockPublicChatUser(db,{accountId:session.id,targetAccountId:form.get('targetAccountId')});
      else if(url.pathname==='/api/public-chat/messages/edit')result=await updatePublicChatMessage(db,{accountId:session.id,messageId:form.get('messageId'),body:form.get('body')});
      else if(url.pathname==='/api/public-chat/messages/delete')result=owner?await deletePublicChatMessage(db,{accountId:session.id,messageId:form.get('messageId'),isOwner:true}):await deleteOwnPublicChatMessage(db,{accountId:session.id,messageId:form.get('messageId')});
      else if(url.pathname==='/api/public-chat/pins')result=await togglePublicChatPin(db,{accountId:session.id,messageId:form.get('messageId'),isOwner:owner});
      else if(url.pathname==='/api/public-chat/control')result=await setPublicChatPaused(db,{accountId:session.id,paused:form.get('paused')==='true',isOwner:owner});
      else if(url.pathname==='/api/public-chat/typing')result=await setPublicChatTyping(db,{accountId:session.id});
      else if(url.pathname==='/api/public-chat/read'){let messageIds=[];try{messageIds=JSON.parse(form.get('messageIds')||'[]');}catch{messageIds=[];}result=await markPublicChatMessagesRead(db,{accountId:session.id,messageIds});}
      else if(url.pathname==='/api/public-chat/reports')result=await reportPublicChatMessage(db,{accountId:session.id,messageId:form.get('messageId'),reason:form.get('reason')||'other',details:form.get('details')||''});
      else if(url.pathname==='/api/public-chat/reports/review')result=await resolvePublicChatReport(db,{accountId:session.id,reportId:form.get('reportId'),status:form.get('status'),isOwner:owner});
      else result=await touchPublicChatPresence(db,{accountId:session.id});
      const status=result.status==='not_found'?404:['self_block','self_report'].includes(result.status)?400:['added','removed','blocked','already_blocked','unblocked','updated','deleted','pinned','unpinned','online','typing','read','reported','already_reported','reviewed','dismissed'].includes(result.status)?200:400;
      if(status===200&&url.pathname!=='/api/public-chat/presence')publishChatEvent({scope:'public'});
      res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(result));return true;
    }catch(error){
      if(String(error?.message||'').startsWith('PUBLIC_CHAT_')||String(error?.message||'').startsWith('CHAT_MEDIA_')){res.writeHead(400,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:'invalid_chat_action'}));return true;}
      throw error;
    }
  }
  const authHandled = await handleSiteAuthRequest(req, res, { db, sessionSecret: process.env.ADMIN_SESSION_SECRET, createSession: createPublicSiteSession });
  if (authHandled) return true;
  if (req.method === 'GET' && url.pathname === '/hesap/veri') {
    const session = readPublicSiteSession(cookies(req)[SITE_COOKIE], process.env.ADMIN_SESSION_SECRET);
    if (!requireSiteAccount(res, session?.id)) return true;
    if (!db) { res.writeHead(503,{'Cache-Control':'no-store'});res.end('Hesap veritabanı kullanılamıyor.');return true; }
    const data = await exportSiteAccountData(db,session.id);
    if (!data) { res.writeHead(404,{'Cache-Control':'no-store'});res.end('Hesap bulunamadı.');return true; }
    res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Content-Disposition':'attachment; filename="frieren-account-data.json"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    res.end(JSON.stringify(data,null,2));return true;
  }
  if (req.method === 'POST' && (url.pathname === '/destek' || url.pathname === '/destek/yanit' || url.pathname === '/hesap/sil')) {
    const session = readPublicSiteSession(cookies(req)[SITE_COOKIE],process.env.ADMIN_SESSION_SECRET);
    if (!requireSiteAccount(res, session?.id)) return true;
    if (!db) { res.writeHead(503,{'Cache-Control':'no-store'});res.end('Hesap veritabanı kullanılamıyor.');return true; }
    if (!String(req.headers['content-type']||'').toLowerCase().includes('application/x-www-form-urlencoded')) { res.writeHead(415,{'Cache-Control':'no-store'});res.end('Form biçimi geçersiz.');return true; }
    let size=0;const chunks=[];
    for await(const chunk of req){size+=chunk.length;if(size>8192){res.writeHead(413,{'Cache-Control':'no-store'});res.end('Form çok büyük.');return true;}chunks.push(chunk);}
    const form=new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
    if(!verifySiteCsrfToken(form.get('csrf'),process.env.ADMIN_SESSION_SECRET)){res.writeHead(403,{'Cache-Control':'no-store'});res.end('Güvenlik doğrulaması başarısız. Sayfayı yenile.');return true;}
    if(url.pathname==='/destek' || url.pathname==='/destek/yanit'){
      try{
        if(url.pathname==='/destek/yanit'){
          const result=await replySupportTicket(db,session.id,String(form.get('ticketId')||''),String(form.get('message')||''));
          res.writeHead(303,{Location:'/destek?'+new URLSearchParams({status:result.status==='replied'?'reply_sent':result.status}).toString(),'Cache-Control':'no-store'});res.end();return true;
        }
        const result=await createSupportTicket(db,session.id,{category:form.get('category'),subject:form.get('subject'),message:form.get('message')});
        res.writeHead(303,{Location:'/destek?status='+result.status,'Cache-Control':'no-store'});res.end();return true;
      }catch(error){
        const status=String(error?.message||'').startsWith('SUPPORT_TICKET_')?'invalid':'invalid';
        res.writeHead(303,{Location:'/destek?status='+status,'Cache-Control':'no-store'});res.end();return true;
      }
    }
    const result=await deleteSiteAccount(db,session.id,String(form.get('confirmation')||''));
    if(result.status==='deleted'){
      res.writeHead(303,{Location:'/register?status=account_deleted','Cache-Control':'no-store','Set-Cookie':SITE_COOKIE+'=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'});res.end();return true;
    }
    res.writeHead(303,{Location:'/destek?status=delete_confirmation_required','Cache-Control':'no-store'});res.end();return true;
  }
  if (req.method === 'POST' && (url.pathname === '/maceraci/profil/media' || url.pathname === '/profil/media')) {
    const session=readPublicSiteSession(cookies(req)[SITE_COOKIE],process.env.ADMIN_SESSION_SECRET);
    if(!requireSiteAccount(res,session?.id))return true;
    if(!db){res.writeHead(503,{'Cache-Control':'no-store'});res.end('Profil veritabanı kullanılamıyor.');return true;}
    if(!String(req.headers['content-type']||'').toLowerCase().includes('application/json')){res.writeHead(415,{'Cache-Control':'no-store'});res.end('Görsel aktarım biçimi geçersiz.');return true;}
    const csrf=String(req.headers['x-csrf-token']||'');
    if(!verifySiteCsrfToken(csrf,process.env.ADMIN_SESSION_SECRET)){res.writeHead(403,{'Cache-Control':'no-store'});res.end('Güvenlik doğrulaması başarısız. Sayfayı yenile.');return true;}
    let size=0;const chunks=[];
    for await(const chunk of req){size+=chunk.length;if(size>6*1024*1024){res.writeHead(413,{'Cache-Control':'no-store'});res.end('Görsel isteği çok büyük.');return true;}chunks.push(chunk);}
    try{
      const payload=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const kind=String(payload?.kind||''),data=String(payload?.data||'');
      if(data.length>5_600_000||!(/^[A-Za-z0-9+/]+={0,2}$/.test(data))){res.writeHead(400,{'Cache-Control':'no-store'});res.end('Görsel verisi geçersiz.');return true;}
      const saved=await saveProfileMedia(db,session.id,kind,Buffer.from(data,'base64'));
      res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(saved));return true;
    }catch(error){
      const code=String(error?.message||'');
      if(code.startsWith('PROFILE_MEDIA_')){res.writeHead(400,{'Cache-Control':'no-store'});res.end('Görsel biçimi, boyutu veya ölçüleri desteklenmiyor.');return true;}
      throw error;
    }
  }
  if (req.method === 'DELETE' && (url.pathname === '/maceraci/profil/media' || url.pathname === '/profil/media')) {
    const session=readPublicSiteSession(cookies(req)[SITE_COOKIE],process.env.ADMIN_SESSION_SECRET);
    if(!requireSiteAccount(res,session?.id))return true;
    if(!db){res.writeHead(503,{'Cache-Control':'no-store'});res.end('Profil veritabanı kullanılamıyor.');return true;}
    if(!verifySiteCsrfToken(String(req.headers['x-csrf-token']||''),process.env.ADMIN_SESSION_SECRET)){res.writeHead(403,{'Cache-Control':'no-store'});res.end('Güvenlik doğrulaması başarısız.');return true;}
    try{const kind=String(url.searchParams.get('kind')||'');await deleteProfileMedia(db,session.id,kind);res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({status:'deleted',kind}));}
    catch(error){if(String(error?.message||'').startsWith('PROFILE_MEDIA_')){res.writeHead(400,{'Cache-Control':'no-store'});res.end('Görsel türü geçersiz.');return true;}throw error;}
    return true;
  }
  if (req.method === 'POST' && url.pathname === '/maceraci/link') {
    const session = readPublicSiteSession(cookies(req)[SITE_COOKIE], process.env.ADMIN_SESSION_SECRET);
    if (!requireSiteAccount(res, session?.id)) return true;
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
  if(req.method==='POST'&&url.pathname==='/maceraci/oyuncu/ziyaretci-defteri'){
    const session=readPublicSiteSession(cookies(req)[SITE_COOKIE],process.env.ADMIN_SESSION_SECRET);
    if(!requireSiteAccount(res,session?.id))return true;
    if(!db){res.writeHead(503,{'Cache-Control':'no-store'});res.end('Ziyaretçi defteri veritabanı kullanılamıyor.');return true;}
    if(!String(req.headers['content-type']||'').toLowerCase().includes('application/x-www-form-urlencoded')){res.writeHead(415,{'Cache-Control':'no-store'});res.end('Form biçimi geçersiz.');return true;}
    let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>4096){res.writeHead(413,{'Cache-Control':'no-store'});res.end('Form çok büyük.');return true;}chunks.push(chunk);}
    const form=new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
    if(!verifySiteCsrfToken(form.get('csrf'),process.env.ADMIN_SESSION_SECRET)){res.writeHead(403,{'Cache-Control':'no-store'});res.end('Güvenlik doğrulaması başarısız.');return true;}
    const guildId=String(form.get('guildId')||''),ownerId=String(form.get('ownerId')||'');
    if(!/^\d{17,20}$/.test(guildId)||!/^\d{17,20}$/.test(ownerId)){res.writeHead(400,{'Cache-Control':'no-store'});res.end('Profil bağlantısı geçersiz.');return true;}
    const author=await getLinkedAdventurer(db,session.id,guildId);if(!author){res.writeHead(403,{'Cache-Control':'no-store'});res.end('Önce bu sunucudaki karakterini hesabına bağla.');return true;}
    await ensureSiteSocialSchema(db);
    try{const result=await addGuestbookEntry(db,{guildId,ownerId,authorId:author.user_id,message:form.get('message')});const status=result.status==='created'?'guestbook_added':result.status;res.writeHead(303,{Location:'/maceraci/oyuncu?'+new URLSearchParams({guildId,userId:ownerId,status}).toString(),'Cache-Control':'no-store'});res.end();return true;}
    catch(error){if(String(error?.message||'').startsWith('GUESTBOOK_')){res.writeHead(303,{Location:'/maceraci/oyuncu?'+new URLSearchParams({guildId,userId:ownerId,status:'invalid'}).toString(),'Cache-Control':'no-store'});res.end();return true;}throw error;}
  }
  if(req.method==='POST'&&url.pathname==='/maceraci/merkez'){
    const session=readPublicSiteSession(cookies(req)[SITE_COOKIE],process.env.ADMIN_SESSION_SECRET);
    if(!requireSiteAccount(res,session?.id))return true;
    if(!db){res.writeHead(503,{'Cache-Control':'no-store'});res.end('Kişisel merkez veritabanı kullanılamıyor.');return true;}
    if(!String(req.headers['content-type']||'').toLowerCase().includes('application/x-www-form-urlencoded')){res.writeHead(415,{'Cache-Control':'no-store'});res.end('Form biçimi geçersiz.');return true;}
    let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>8192){res.writeHead(413,{'Cache-Control':'no-store'});res.end('Form çok büyük.');return true;}chunks.push(chunk);}
    const form=new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
    if(!verifySiteCsrfToken(form.get('csrf'),process.env.ADMIN_SESSION_SECRET)){res.writeHead(403,{'Cache-Control':'no-store'});res.end('Güvenlik doğrulaması başarısız.');return true;}
    const guildId=String(form.get('guildId')||'');if(!/^\d{17,20}$/.test(guildId)){res.writeHead(400,{'Cache-Control':'no-store'});res.end('Sunucu seçimi geçersiz.');return true;}
    const profile=await getLinkedAdventurer(db,session.id,guildId);if(!profile){res.writeHead(403,{'Cache-Control':'no-store'});res.end('Bu sunucudaki karakter hesabına bağlı değil.');return true;}
    await ensurePersonalCenterSchema(db);await ensureSiteSocialSchema(db);
    try{
      const action=String(form.get('action')||'');let outcome=null;
      if(action==='profile-save')outcome=await updatePersonalProfile(db,{guildId,userId:profile.user_id,bio:form.get('bio'),statusText:form.get('statusText'),theme:form.get('theme'),guestbookEnabled:form.get('guestbookEnabled')==='true'});
      else if(action==='dm-send')outcome=await sendDirectMessage(db,{guildId,senderId:profile.user_id,recipientId:String(form.get('targetId')||''),body:form.get('body')});
      else if(action==='close-friend-add')outcome=await setCloseFriend(db,{guildId,ownerId:profile.user_id,friendId:String(form.get('targetId')||'')});
      else if(action==='close-friend-remove')outcome=await removeCloseFriend(db,{guildId,ownerId:profile.user_id,friendId:String(form.get('targetId')||'')});
      else if(action==='player-report'){outcome=await reportPlayer(db,{guildId,reporterId:profile.user_id,targetId:String(form.get('targetId')||''),reason:String(form.get('reason')||''),details:form.get('details')});if(outcome.status==='submitted'){const ticket=await createSupportTicket(db,session.id,{category:'gameplay',subject:'Oyuncu bildirimi',message:'Sunucu: '+guildId+'\\nBildirilen oyuncu: '+String(form.get('targetId')||'')+'\\nNeden: '+String(form.get('reason')||'')+'\\nDetay: '+String(form.get('details')||'')});outcome={...outcome,supportTicketStatus:ticket.status};}}
      else if(action==='planner-create')outcome=await createPlannerEntry(db,{guildId,userId:profile.user_id,kind:String(form.get('kind')||''),title:form.get('title'),body:form.get('body'),dueAt:form.get('dueAt')||null});
      else if(action==='planner-update')outcome=await updatePlannerEntry(db,{guildId,userId:profile.user_id,entryId:String(form.get('entryId')||''),title:form.get('title'),body:form.get('body'),dueAt:form.get('dueAt')||null,completed:form.get('completed')==='true'});
      else if(action==='planner-delete')outcome=await deletePlannerEntry(db,{guildId,userId:profile.user_id,entryId:String(form.get('entryId')||'')});
      else if(action==='guestbook-delete')outcome=await deleteGuestbookEntry(db,{guildId,ownerId:profile.user_id,entryId:String(form.get('entryId')||'')});
      else {res.writeHead(400,{'Cache-Control':'no-store'});res.end('İşlem tanınmadı.');return true;}
      res.writeHead(303,{Location:'/maceraci/merkez?'+new URLSearchParams({guildId,status:outcome?.status||action+'_ok'}).toString(),'Cache-Control':'no-store'});res.end();return true;
    }catch(error){
      const code=String(error?.message||'');const status=code.startsWith('PERSONAL_')||code.startsWith('PLANNER_')||code.startsWith('PLAYER_')||code.startsWith('GUESTBOOK_')?'invalid':'failed';
      res.writeHead(303,{Location:'/maceraci/merkez?'+new URLSearchParams({guildId,status}).toString(),'Cache-Control':'no-store'});res.end();return true;
    }
  }
  const mutationPaths = new Set(['/maceraci/event','/maceraci/yasam','/pazar/sat','/pazar/al','/pazar/iptal','/pazar/teklif-ver','/pazar/teklif-kabul','/pazar/teklif-reddet','/pazar/teklif-iptal','/pazar/alarm-kur','/pazar/alarm-sil','/maceraci/sosyal','/maceraci/bildirimler','/maceraci/atolye']);
  if (req.method === 'POST' && mutationPaths.has(url.pathname)) {
    const session=readPublicSiteSession(cookies(req)[SITE_COOKIE],process.env.ADMIN_SESSION_SECRET);
    if (!requireSiteAccount(res, session?.id)) return true;
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
    if(url.pathname==='/maceraci/sosyal'&&!await getGuildFeatureEnabled(db,guildId,'social')){res.writeHead(403,{'Cache-Control':'no-store'});res.end('Sosyal modül bu sunucuda kapalı.');return true;}
    if(url.pathname==='/maceraci/atolye'){
      if(!await canManageGuild(client,guildId,profile.user_id)){res.writeHead(403,{'Cache-Control':'no-store'});res.end('Bu atölye için sunucu sahibi veya Yönet sunucu izni gerekir.');return true;}
      try{
        const action=String(form.get('action')||'');
        if(action==='embed'){
          const fields=[];
          for(let index=1;index<=2;index++){
            const name=String(form.get('field'+index+'Name')||'').trim();
            const value=String(form.get('field'+index+'Value')||'').trim();
            if(name||value)fields.push({name,value});
          }
          await saveGuildEmbedTemplate(db,{guildId,creatorId:profile.user_id,template:{
            name:form.get('name'),title:form.get('title'),description:form.get('description'),
            color:form.get('color'),footer:form.get('footer'),fields
          }});
          res.writeHead(303,{Location:'/maceraci/atolye?'+new URLSearchParams({guildId,status:'saved_embed'}).toString(),'Cache-Control':'no-store'});res.end();return true;
        }
        if(action==='command'){
          await saveGuildCustomCommand(db,{guildId,creatorId:profile.user_id,command:{
            triggerName:form.get('triggerName'),kind:form.get('kind'),responseText:form.get('responseText'),
            element:form.get('element'),manaCost:Number(form.get('manaCost')),power:Number(form.get('power'))
          }});
          res.writeHead(303,{Location:'/maceraci/atolye?'+new URLSearchParams({guildId,status:'saved_command'}).toString(),'Cache-Control':'no-store'});res.end();return true;
        }
        if(action==='automation'){
          const channelId=String(form.get('channelId')||''),templateId=String(form.get('templateId')||'')||null;
          if(!await canSendAutomationToChannel(client,guildId,channelId,Boolean(templateId))){res.writeHead(403,{'Cache-Control':'no-store'});res.end('Otomasyon kanalı seçili sunucuda olmalı ve botun mesaj gönderme izni bulunmalı.');return true;}
          await saveGuildSpellAutomation(db,{guildId,creatorId:profile.user_id,rule:{
            name:form.get('automationName'),triggerKey:form.get('triggerKey'),channelId,
            message:form.get('automationMessage'),templateId,cooldownSeconds:Number(form.get('cooldownSeconds'))
          }});
          res.writeHead(303,{Location:'/maceraci/atolye?'+new URLSearchParams({guildId,status:'saved_automation'}).toString(),'Cache-Control':'no-store'});res.end();return true;
        }
        throw new Error('GUILD_WORKSHOP_ACTION_INVALID');
      }catch(error){
        if(String(error?.message||'').startsWith('GUILD_')||String(error?.message||'').endsWith('_INVALID')){res.writeHead(303,{Location:'/maceraci/atolye?'+new URLSearchParams({guildId,status:'invalid'}).toString(),'Cache-Control':'no-store'});res.end();return true;}
        throw error;
      }
    }
    if(url.pathname==='/maceraci/bildirimler'){
      try{
        const category=String(form.get('category')||'');
        const enabled=String(form.get('enabled')||'')==='true';
        await setNotificationPreference(db,{guildId,userId:profile.user_id,category,enabled});
        res.writeHead(303,{Location:'/maceraci/bildirimler?'+new URLSearchParams({guildId,status:'saved'}).toString(),'Cache-Control':'no-store'});res.end();return true;
      }catch(error){
        if(String(error?.message||'').endsWith('_INVALID')){res.writeHead(303,{Location:'/maceraci/bildirimler?'+new URLSearchParams({guildId,status:'invalid'}).toString(),'Cache-Control':'no-store'});res.end();return true;}
        throw error;
      }
    }

    let status='invalid';
  if(url.pathname==='/maceraci/yasam'){
    if (!requireSiteAccount(res, session?.id)) return true;
      const action=String(form.get('action')||'');
      if(action==='unlock-room')status=(await unlockHomeRoom(db,{guildId,userId:profile.user_id,roomKey:String(form.get('roomKey')||'')})).status;
      else if(action==='save-layout'){
        try{const layout=JSON.parse(String(form.get('layout')||''));status=(await saveHomeLayout(db,{guildId,userId:profile.user_id,layout,activeRoom:String(form.get('activeRoom')||'starter')})).status;}
        catch(error){status=error?.message==='HOME_LAYOUT_INVALID'?'invalid_layout':'invalid';}
      } else if(action==='buy-cosmetic')status=(await purchaseCosmetic(db,{guildId,userId:profile.user_id,cosmeticKey:String(form.get('cosmeticKey')||'')})).status;
      else if(action==='equip-cosmetic')status=(await equipCosmetic(db,{guildId,userId:profile.user_id,cosmeticKey:String(form.get('cosmeticKey')||'')})).status;
      else if(action==='save-preset')status=(await saveCosmeticPreset(db,{guildId,userId:profile.user_id,presetName:String(form.get('presetName')||'')})).status;
      else if(action==='apply-preset')status=(await applyCosmeticPreset(db,{guildId,userId:profile.user_id,presetName:String(form.get('presetName')||'')})).status;
      else if(action==='brew-potion')status=(await brewHomePotion(db,{guildId,userId:profile.user_id,recipeKey:String(form.get('recipeKey')||'')})).status;
      else if(action==='set-visibility')status=(await setHomeVisibility(db,{guildId,userId:profile.user_id,isPublic:String(form.get('isPublic'))==='true'})).status;
      else if(action==='place-trophy')status=(await placeHomeTrophy(db,{guildId,userId:profile.user_id,achievementKey:String(form.get('achievementKey')||''),displaySlot:Number(form.get('displaySlot'))})).status;
      else if(action==='set-profile-settings'){
        try{
          const saved=await setPlayerProfileSettings(db,{guildId,userId:profile.user_id,settings:{showStats:String(form.get('showStats'))==='true',showAchievements:String(form.get('showAchievements'))==='true',showCollections:String(form.get('showCollections'))==='true',showActivity:String(form.get('showActivity'))==='true',showCosmetics:String(form.get('showCosmetics'))==='true',activeTitle:String(form.get('activeTitle')||'')}});
          status=saved.status==='updated'?'profile_saved':saved.status;
        }catch(error){if(error?.message==='PROFILE_SETTINGS_INVALID')status='invalid';else throw error;}
        res.writeHead(303,{Location:'/maceraci/profil?'+new URLSearchParams({guildId,status}).toString(),'Cache-Control':'no-store'});res.end();return true;
      }
      else if(action==='check-in')status=(await checkInGuildEvent(db,{guildId,userId:profile.user_id,eventId:String(form.get('eventId')||'')})).status;
      else if(action==='claim-event')status=(await claimEventMilestone(db,{guildId,userId:profile.user_id,eventId:String(form.get('eventId')||''),rewardKey:String(form.get('rewardKey')||'')})).status;
      res.writeHead(303,{Location:'/maceraci/yasam?'+new URLSearchParams({guildId,status}).toString(),'Cache-Control':'no-store'});res.end();return true;
    }
    if(url.pathname==='/maceraci/event'){
      const eventId=String(form.get('eventId')||'');const action=String(form.get('action')||'');
      if(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(eventId)){
        if(action==='join') status=(await joinGuildEvent(db,{guildId,eventId,userId:profile.user_id,teamId:String(form.get('teamId')||'')||null})).status;
        else if(action==='leave') status=(await leaveGuildEvent(db,{guildId,eventId,userId:profile.user_id})).removed?'left':'unavailable';
      }
      res.writeHead(303,{Location:'/maceraci?'+new URLSearchParams({status}).toString(),'Cache-Control':'no-store'});res.end();return true;
    }
    try{
      if(url.pathname==='/maceraci/sosyal'){
        const action=String(form.get('action')||''),targetId=String(form.get('targetId')||'');
        if(action==='request')status=(await createFriendRequest(db,{guildId,requesterId:profile.user_id,targetId})).status;
        else if(action==='rival')status=(await setPlayerRival(db,{guildId,actorId:profile.user_id,targetId})).status;
        else if(action==='remove')status=(await removeSocialRelationship(db,{guildId,actorId:profile.user_id,targetId})).status;
        else if(action==='accept'||action==='reject')status=(await respondFriendRequest(db,{guildId,requestId:String(form.get('requestId')||''),actorId:profile.user_id,accept:action==='accept'})).status;
        else if(action==='gift')status=(await sendCoinGift(db,{guildId,senderId:profile.user_id,recipientId:targetId,amount:Number(form.get('amount')),note:String(form.get('note')||'')})).status;
        else if(action==='commend')status=(await commendPlayer(db,{guildId,giverId:profile.user_id,recipientId:targetId})).status;
        else if(action==='block')status=(await blockSocialPlayer(db,{guildId,blockerId:profile.user_id,blockedId:targetId})).status;
        else if(action==='unblock')status=(await unblockSocialPlayer(db,{guildId,blockerId:profile.user_id,blockedId:targetId})).status;
        else status='invalid';
        if(action==='request'&&status==='sent')status='request_sent';
        if(['player_missing','SOCIAL_ID_INVALID','SOCIAL_SELF_INTERACTION','SOCIAL_GIFT_AMOUNT_INVALID','SOCIAL_REQUEST_ID_INVALID'].includes(status))status='invalid';
        res.writeHead(303,{Location:'/maceraci/sosyal?'+new URLSearchParams({guildId,status}).toString(),'Cache-Control':'no-store'});res.end();return true;
      }
      if(url.pathname==='/pazar/sat') status=(await createPlayerMarketListing(db,{guildId,sellerId:profile.user_id,itemKey:form.get('itemKey'),quantity:Number(form.get('quantity')),priceCoins:Number(form.get('priceCoins'))})).status;
      else if(url.pathname==='/pazar/al') status=(await buyPlayerMarketListing(db,{guildId,buyerId:profile.user_id,listingId:form.get('listingId')})).status;
      else if(url.pathname==='/pazar/iptal') status=(await cancelPlayerMarketListing(db,{guildId,sellerId:profile.user_id,listingId:form.get('listingId')})).status;
      else if(url.pathname==='/pazar/teklif-ver') status=(await createPlayerMarketOffer(db,{guildId,buyerId:profile.user_id,listingId:form.get('listingId'),offerCoins:Number(form.get('offerCoins'))})).status;
      else if(url.pathname==='/pazar/teklif-kabul') { const result=await resolvePlayerMarketOffer(db,{guildId,sellerId:profile.user_id,offerId:form.get('offerId'),decision:'accept'});status='offer_'+result.status; }
      else if(url.pathname==='/pazar/teklif-reddet') { const result=await resolvePlayerMarketOffer(db,{guildId,sellerId:profile.user_id,offerId:form.get('offerId'),decision:'reject'});status='offer_'+result.status; }
      else if(url.pathname==='/pazar/teklif-iptal') { const result=await cancelPlayerMarketOffer(db,{guildId,buyerId:profile.user_id,offerId:form.get('offerId')});status=result.status==='cancelled'?'offer_cancelled':'offer_'+result.status; }
      else if(url.pathname==='/pazar/alarm-kur') {
        const result=await createPlayerMarketPriceAlert(db,{guildId,userId:profile.user_id,itemKey:String(form.get('itemKey')||''),targetPrice:Number(form.get('targetPrice'))});
        status=result.status==='created'?'alert_created':result.status;
      }
      else if(url.pathname==='/pazar/alarm-sil') {
        const result=await cancelPlayerMarketPriceAlert(db,{guildId,userId:profile.user_id,alertId:String(form.get('alertId')||'')});
        status=result.status==='cancelled'?'alert_cancelled':'unavailable';
      }

    }catch(error){if(String(error?.message||'').endsWith('_INVALID')||String(error?.message||'')==='SOCIAL_SELF_INTERACTION')status='invalid';else throw error;}
    const destination=url.pathname==='/maceraci/sosyal'?'/maceraci/sosyal':'/pazar';res.writeHead(303,{Location:destination+'?'+new URLSearchParams({guildId,status}).toString(),'Cache-Control':'no-store'});res.end();return true;
  }
  if(['/api/account-profile','/api/account-profile/follow','/api/account-profile/friends','/api/account-profile/friends/respond','/api/account-notifications/read'].includes(url.pathname)&&req.method==='POST'){
    const session=readPublicSiteSession(cookies(req)[SITE_COOKIE],process.env.ADMIN_SESSION_SECRET);
    if(!requireSiteAccount(res,session?.id))return true;
    if(!db){res.writeHead(503,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:'profile_unavailable'}));return true;}
    if(!String(req.headers['content-type']||'').toLowerCase().includes('application/x-www-form-urlencoded')){res.writeHead(415,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({error:'invalid_content_type'}));return true;}
    let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>8192){res.writeHead(413,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({error:'payload_too_large'}));return true;}chunks.push(chunk);}
    const form=new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
    if(!verifySiteCsrfToken(form.get('csrf'),process.env.ADMIN_SESSION_SECRET)){res.writeHead(403,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({error:'csrf_failed'}));return true;}
    try{
      if(url.pathname==='/api/account-profile'){
        const socialLinks=Object.fromEntries(['website','youtube','twitch','instagram','x','github','tiktok'].map(k=>[k,form.get('social_'+k)||'']));
        await updateAccountProfile(db,{accountId:session.id,displayName:form.get('displayName')||session.username,profileSlug:form.get('profileSlug')||'',bannerPosition:form.get('bannerPosition')||'center',bio:form.get('bio'),statusText:form.get('statusText'),interests:String(form.get('interests')||'').split(',').map(x=>x.trim()).filter(Boolean),tags:String(form.get('tags')||'').split(',').map(x=>x.trim()).filter(Boolean),theme:form.get('theme'),accentColor:form.get('accentColor'),socialLinks,visibility:form.get('visibility'),showActivity:form.get('showActivity')==='true',allowVisitors:form.get('allowVisitors')==='true'});
        res.writeHead(303,{Location:'/profil?status=saved','Cache-Control':'no-store'});res.end();return true;
      }
      if(url.pathname==='/api/account-profile/friends'){
        const result=await sendAccountFriendRequest(db,{requesterAccountId:session.id,recipientAccountId:form.get('targetAccountId')});
        res.writeHead(303,{Location:'/u/'+encodeURIComponent(form.get('targetAccountId'))+'?status='+result.status,'Cache-Control':'no-store'});res.end();return true;
      }
      if(url.pathname==='/api/account-notifications/read'){
        await markAccountNotificationsRead(db,session.id);res.writeHead(303,{Location:'/bildirimler','Cache-Control':'no-store'});res.end();return true;
      }
      if(url.pathname==='/api/account-profile/friends/respond'){
        const result=await respondAccountFriendRequest(db,{accountId:session.id,requestId:form.get('requestId'),accept:form.get('action')==='accept'});
        res.writeHead(303,{Location:'/profil?status='+result.status,'Cache-Control':'no-store'});res.end();return true;
      }
      const target=form.get('targetAccountId'),result=form.get('action')==='unfollow'?await unfollowAccount(db,{followerAccountId:session.id,followedAccountId:target}):await followAccount(db,{followerAccountId:session.id,followedAccountId:target});
      res.writeHead(303,{Location:'/u/'+encodeURIComponent(target)+'?status='+result.status,'Cache-Control':'no-store'});res.end();return true;
    }catch(error){if(String(error?.message||'').startsWith('ACCOUNT_')||error?.code==='23505'){res.writeHead(400,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:'invalid_profile'}));return true;}throw error;}
  }
  if (req.method !== 'GET') return false;
  const cookie = cookies(req);
  if (url.pathname === '/owner' || url.pathname.startsWith('/owner/')) return false;
  if (assets.has(url.pathname) && ['site-avatar.svg', 'site-avatar.webp', 'site-shortcut.svg', 'site.webmanifest', 'site-banner.svg', 'site-banner.webp', 'site-profile-banner.svg', 'site.css', 'owner.css', 'public-assets/embed-preview.js', 'public-assets/market-preview.js', 'public-assets/site-navigation.js', 'public-assets/site-actions.js', 'public-assets/profile-interactions.js', 'public-assets/character-encyclopedia.js', 'public-assets/theme-gallery.js', 'public-assets/accessibility-controls.js', 'public-assets/spellbook-controls.js', 'public-assets/exploration-atlas.js', 'public-assets/profile-media.js', 'public-assets/frieren-world-map.svg', 'public-assets/user-center.js', 'public-assets/public-chat.js'].includes(assets.get(url.pathname))) {
    try {
      const file = assets.get(url.pathname);
      const data = await readFile(new URL('./' + file, import.meta.url));
      res.writeHead(200, { 'Content-Type': file.endsWith('.webmanifest') ? 'application/manifest+json; charset=utf-8' : file.endsWith('.css') ? 'text/css; charset=utf-8' : file.endsWith('.js') ? 'text/javascript; charset=utf-8' : file.endsWith('.webp') ? 'image/webp' : 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public,max-age=86400', 'X-Content-Type-Options': 'nosniff' });
      res.end(data);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Asset bulunamadı.');
    }
    return true;
  }
  const publicPaths = new Set(['/', '/kesfet', '/pogaca', '/komutlar', '/frieren-ai', '/hizmet-kosullari', '/gizlilik-politikasi', '/destek', '/maceraci/oyuncu', '/maceraci/merkez', '/maceraci', '/maceraci/profil', '/maceraci/yasam', '/maceraci/ev', '/maceraci/envanter', '/maceraci/koleksiyon', '/maceraci/sosyal', '/maceraci/bildirimler', '/maceraci/atolye', '/maceraci/profil/media', '/profil', '/profil/media', '/profil/media/public', '/hesap-merkezi', '/bildirimler', '/pazar', '/ansiklopedi', '/ara']);
  const isPublicProfilePath=url.pathname.startsWith('/u/');
  if (!publicPaths.has(url.pathname) && !assets.has(url.pathname) && !isPublicProfilePath) return false;
  const sessionUser = readPublicSiteSession(cookie[SITE_COOKIE], process.env.ADMIN_SESSION_SECRET);
  const user = await enrichSiteUser(db,client,sessionUser || (url.pathname === '/maceraci/ev' ? { id: 'public-viewer', username: 'Gezgin' } : (url.pathname === '/kesfet' || url.pathname === '/ansiklopedi' || url.pathname === '/ara' || url.pathname === '/maceraci/oyuncu' || isPublicProfilePath) ? { id: '', username: 'Gezgin', avatarUrl: '/assets/site-avatar.webp' } : null));
  if (!user && url.pathname !== '/hizmet-kosullari' && url.pathname !== '/gizlilik-politikasi' && url.pathname !== '/kesfet' && url.pathname !== '/ansiklopedi' && url.pathname !== '/ara' && url.pathname !== '/maceraci/oyuncu' && !isPublicProfilePath && url.pathname !== '/profil/media/public') {
    res.writeHead(302, { Location: '/login', 'Cache-Control': 'no-store' });
    res.end();
    return true;
  }
  if(req.method==='GET'&&url.pathname==='/profil/media/public'){
    const target=String(url.searchParams.get('accountId')||'');
    if(!SITE_ACCOUNT_ID.test(target)||!db){res.writeHead(404,{'Cache-Control':'no-store'});res.end('Görsel bulunamadı.');return true;}
    const viewer=SITE_ACCOUNT_ID.test(String(user?.id||''))?user.id:null;
    const profile=await getAccountProfile(db,target,{viewerAccountId:viewer});
    if(!profile.canView){res.writeHead(404,{'Cache-Control':'no-store'});res.end('Görsel bulunamadı.');return true;}
    await ensureSiteAccountSchema(db);await ensureProfileMediaSchema(db);const kind=String(url.searchParams.get('kind')||'avatar');if(!['avatar','banner'].includes(kind)){res.writeHead(404,{'Cache-Control':'no-store'});res.end('Görsel bulunamadı.');return true;}const media=await getProfileMedia(db,target,kind);
    if(!media){res.writeHead(404,{'Cache-Control':'no-store'});res.end('Görsel bulunamadı.');return true;}
    res.writeHead(200,{'Content-Type':media.mime_type,'Content-Length':media.media_data.length,'Cache-Control':'private,no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(media.media_data);return true;
  }
  if(url.pathname==='/maceraci/profil/media'||url.pathname==='/profil/media'){
    if(!requireSiteAccount(res,user?.id))return true;
    if(!db){res.writeHead(503,{'Cache-Control':'no-store'});res.end('Profil görseli veritabanı kullanılamıyor.');return true;}
    const media=await getProfileMedia(db,user.id,String(url.searchParams.get('kind')||''));
    if(!media){res.writeHead(404,{'Cache-Control':'no-store'});res.end('Profil görseli bulunamadı.');return true;}
    res.writeHead(200,{'Content-Type':media.mime_type,'Content-Length':media.media_data.length,'Cache-Control':'private,no-store','X-Content-Type-Options':'nosniff'});res.end(media.media_data);return true;
  }
  if (assets.has(url.pathname)) {
    try {
      const file = assets.get(url.pathname);
      const data = await readFile(new URL('./' + file, import.meta.url));
      const contentType = file.endsWith('.webmanifest') ? 'application/manifest+json; charset=utf-8' : file.endsWith('.js') ? 'text/javascript; charset=utf-8' : file.endsWith('.svg') ? 'image/svg+xml; charset=utf-8' : file.endsWith('.css') ? 'text/css; charset=utf-8' : file.endsWith('.webp') ? 'image/webp' : 'image/gif';
      res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'private,max-age=86400', 'X-Content-Type-Options': 'nosniff' });
      res.end(data);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Asset bulunamadı.');
    }
    return true;
  }
  if (url.pathname === '/profil') {
    if (!requireSiteAccount(res,user?.id)) return true;
    if (!db) { res.writeHead(503,{'Cache-Control':'no-store'});res.end('Profil veritabanı kullanılamıyor.');return true; }
    let bannerMedia=null;try{bannerMedia=await getProfileMedia(db,user.id,'banner');}catch{}
    const accountProfile=await getAccountProfile(db,user.id,{viewerAccountId:user.id});
    const [activity,friends]=await Promise.all([accountProfile.profile.show_activity===false?Promise.resolve([]):listAccountProfileActivity(db,user.id,12),listAccountFriends(db,user.id)]);
    const html=siteAccountProfilePage(user,{bannerUrl:bannerMedia?'/profil/media?kind=banner':'/assets/site-profile-banner.svg',profile:accountProfile.profile,activity,friends,visitors:accountProfile.visitors,badges:accountProfile.badges,notifications:await listAccountNotifications(db,user.id,50)});
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
    res.end(html);return true;
  }
  if(url.pathname.startsWith('/u/')&&req.method==='GET'){
    if(!db){res.writeHead(503,{'Cache-Control':'no-store'});res.end('Profil veritabanı kullanılamıyor.');return true;}
    const slugOrId=url.pathname.slice(3);
    const target=/^site_[0-9a-f-]{36}$/i.test(slugOrId)?slugOrId:await getAccountIdByProfileSlug(db,slugOrId);
    if(!target){res.writeHead(404);res.end('Profil bulunamadı.');return true;}
    const viewer=SITE_ACCOUNT_ID.test(String(user?.id||''))?user.id:null;
    const data=await getAccountProfile(db,target,{viewerAccountId:viewer});
    if(data.canView&&viewer&&viewer!==target)await recordAccountProfileVisit(db,{ownerAccountId:target,visitorAccountId:viewer});
    const p=data.profile||{},links=p.social_links||{};const activity=data.canView&&p.show_activity!==false?await listAccountProfileActivity(db,target,12):[];await ensureSiteAccountSchema(db);await ensureProfileMediaSchema(db);const [publicAvatar,publicBanner]=data.canView?await Promise.all([getProfileMedia(db,target,'avatar'),getProfileMedia(db,target,'banner')]):[null,null];const publicAvatarUrl=publicAvatar?'/profil/media/public?accountId='+encodeURIComponent(target)+'&kind=avatar':'/assets/site-avatar.webp';const publicBannerUrl=publicBanner?'/profil/media/public?accountId='+encodeURIComponent(target)+'&kind=banner':'/assets/site-profile-banner.svg';
    const social=Object.entries(links).filter(([k,v])=>typeof v==='string'&&v.startsWith('https://')).map(([k,v])=>'<a href="'+esc(v)+'" target="_blank" rel="noopener noreferrer">'+esc(k)+'</a>').join(' · ');
    const friendAction=viewer&&viewer!==target?'<form method="post" action="/api/account-profile/friends"><input type="hidden" name="csrf" value="'+esc(createSiteCsrfToken(process.env.ADMIN_SESSION_SECRET))+'"><input type="hidden" name="targetAccountId" value="'+esc(target)+'"><button class="btn ghost" type="submit">Arkadaşlık isteği gönder</button></form>':'';
    const follow=viewer&&viewer!==target?(data.following?'<form method="post" action="/api/account-profile/follow"><input type="hidden" name="csrf" value="'+esc(createSiteCsrfToken(process.env.ADMIN_SESSION_SECRET))+'"><input type="hidden" name="targetAccountId" value="'+esc(target)+'"><input type="hidden" name="action" value="unfollow"><button class="btn ghost" type="submit">Takibi bırak</button></form>':'<form method="post" action="/api/account-profile/follow"><input type="hidden" name="csrf" value="'+esc(createSiteCsrfToken(process.env.ADMIN_SESSION_SECRET))+'"><input type="hidden" name="targetAccountId" value="'+esc(target)+'"><input type="hidden" name="action" value="follow"><button class="btn" type="submit">Takip et</button></form>'):'';
    const activityHtml=p.show_activity!==false&&activity.length?'<section class="card account-public-activity"><h2>Son etkinlikler</h2><ul>'+activity.map(item=>'<li><strong>'+esc(item.label)+'</strong><small>'+esc(item.activity_type)+' · '+esc(new Date(item.created_at).toLocaleString('tr-TR',{dateStyle:'medium',timeStyle:'short'}))+'</small></li>').join('')+'</ul></section>':'';
    const body=data.canView?'<main class="wrap public-account-profile"><section class="public-profile-hero" data-theme="'+esc(p.theme||'midnight')+'" style="--profile-accent:'+esc(p.accent_color||'#a78bfa')+'"><img class="public-profile-banner" src="'+publicBannerUrl+'" alt="Profil bannerı" style="object-position:center '+esc(p.banner_position||'center')+'"><div class="public-profile-identity"><div class="public-profile-avatar-row"><img class="public-profile-avatar" src="'+publicAvatarUrl+'" alt="Profil fotoğrafı"><p class="public-profile-status"><span class="public-profile-status-dot" aria-hidden="true"></span>'+esc(p.status_text||'Bir büyü yolculuğunda')+'</p></div><h1>'+esc(p.display_name||'Gezgin')+'</h1><div class="public-profile-badges">'+(data.badges||[]).map(x=>'<span class="public-profile-badge">'+esc(x)+'</span>').join('')+'</div><div class="public-profile-follow-stats"><div><strong>'+data.followers+'</strong><span>Takipçi</span></div><div><strong>'+data.followingCount+'</strong><span>Takip</span></div></div><div class="public-profile-actions">'+follow+friendAction+'</div></div></section><div class="public-profile-content"><section class="card public-profile-section public-profile-bio"><div class="public-profile-section-heading"><span>01</span><h2>Hakkımda</h2></div><p>'+esc(p.bio||'Bu kullanıcı henüz biyografi eklememiş.')+'</p></section><section class="card public-profile-section"><div class="public-profile-section-heading"><span>02</span><h2>İlgi alanları</h2></div><div class="public-profile-chip-list">'+((p.interests||[]).map(x=>'<span class="public-profile-chip">'+esc(x)+'</span>').join('')||'<span class="public-profile-empty">Henüz ilgi alanı eklenmemiş.</span>')+'</div></section><section class="card public-profile-section"><div class="public-profile-section-heading"><span>03</span><h2>Etiketler</h2></div><div class="public-profile-chip-list public-profile-tags">'+((p.tags||[]).map(x=>'<span class="public-profile-chip">#'+esc(x)+'</span>').join('')||'<span class="public-profile-empty">Henüz etiket eklenmemiş.</span>')+'</div></section><section class="card public-profile-section"><div class="public-profile-section-heading"><span>04</span><h2>Sosyal bağlantılar</h2></div><div class="public-profile-social">'+(social||'<span class="public-profile-empty">Henüz bağlantı eklenmemiş.</span>')+'</div></section>'+activityHtml+'</div></main>':'<main class="wrap public-account-profile"><section class="card public-profile-private"><h1>Bu profil görüntülenemiyor</h1><p>Profil sahibi görünürlüğü sınırlandırmış.</p></section></main>';
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(page('Gezgin Profili',body,user));return true;
  }
  if(url.pathname==='/bildirimler'&&req.method==='GET'){
    if(!requireSiteAccount(res,user?.id))return true;if(!db){res.writeHead(503,{'Cache-Control':'no-store'});res.end('Bildirimler şu anda kullanılamıyor.');return true;}
    const items=await listAccountNotifications(db,user.id,50),unread=items.filter(x=>!x.read_at).length;
    const rows=items.map(x=>{
      const isUnread=!x.read_at;
      const storedHref=String(x.href||'/profil');
      const href=storedHref.startsWith('/')&&!storedHref.startsWith('//')&&!storedHref.includes(String.fromCharCode(92))&&!/[\\u0000-\\u001f\\u007f]/.test(storedHref)?storedHref:'/profil';
      return '<article class="card notification-card'+(isUnread?' is-unread':' is-read')+'" data-notification-state="'+(isUnread?'unread':'read')+'"><div class="notification-card-heading"><div class="eyebrow">'+esc(x.notification_type)+'</div><span class="notification-state"'+(isUnread?' aria-label="Okunmadı"':' aria-label="Okundu"')+'>'+(isUnread?'Okunmadı':'Okundu')+'</span></div><h2>'+esc(x.title)+'</h2><p>'+esc(x.body)+'</p><a class="btn ghost" href="'+esc(href)+'">Aç</a><small>'+new Date(x.created_at).toLocaleString('tr-TR')+'</small></article>';
    }).join('')||'<article class="card">Henüz hesabına ait bildirim yok.</article>';
    const csrf=esc(createSiteCsrfToken(process.env.ADMIN_SESSION_SECRET));const html='<main class="wrap user-center-page notification-center-page"><header class="user-center-hero"><div class="eyebrow">✧ FRIEREN HESAP MERKEZİ</div><h1>Bildirimlerim</h1><p class="lead" aria-live="polite">Okunmamış: '+unread+'</p>'+(unread?'<form method="post" action="/api/account-notifications/read"><input type="hidden" name="csrf" value="'+csrf+'"><button class="btn" type="submit">Tümünü okundu işaretle</button></form>':'<p class="notification-all-read">Tüm bildirimlerin okundu.</p>')+'</header><nav class="user-center-tabs"><a href="/profil">Hesap Profilim</a><a href="/bildirimler" aria-current="page">Bildirimler</a><a href="/kesfet#topluluk-sohbeti">Topluluk sohbeti</a></nav><section class="portal-grid">'+rows+'</section></main>';
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(page('Bildirimlerim',html,user));return true;
  }
  if (url.pathname === '/destek' || url.pathname === '/hesap-merkezi') {
    if (!requireSiteAccount(res, user?.id)) return true;
    if (!db) { res.writeHead(503,{'Cache-Control':'no-store'});res.end('Destek veritabanı kullanılamıyor.');return true; }
    const tickets=await listSupportTickets(db,user.id,20);
    const ticketId=String(url.searchParams.get('ticket')||'');
    const thread=ticketId?await listSupportTicketMessages(db,user.id,ticketId):null;
    const html=accountCenterPage(user,tickets,url.searchParams.get('status'),thread?.status==='ok'?thread:null);
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; form-action 'self'; base-uri 'self'; frame-ancestors 'self'"});
    res.end(html);return true;
  }
  if (url.pathname === '/maceraci/atolye') {
    if (!requireSiteAccount(res, user?.id)) return true;
    if (!db) { res.writeHead(503, {'Cache-Control':'no-store'}); res.end('Panel veritabanı kullanılamıyor.'); return true; }
    const guildId=String(url.searchParams.get('guildId')||'');
    if(!/^\d{17,20}$/.test(guildId)){const dashboard=await getAdventurerDashboard(db,user.id);const html=portalGuildPicker(user,dashboard.profiles,url.pathname,'Lonca Büyü Atölyesi');res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(html);return true;}
    const profile=await getLinkedAdventurer(db,user.id,guildId);
    if(!profile){res.writeHead(403,{'Cache-Control':'no-store'});res.end('Bu sunucudaki karakter web hesabına bağlı değil.');return true;}
    if(!await canManageGuild(client,guildId,profile.user_id)){res.writeHead(403,{'Cache-Control':'no-store'});res.end('Bu atölye için sunucu sahibi veya Yönet sunucu izni gerekir.');return true;}
    const [templates,commands,automations]=await Promise.all([listGuildEmbedTemplates(db,guildId),listGuildCustomCommands(db,guildId),listGuildSpellAutomations(db,guildId)]);
    const html=guildWorkshopPage(user,profile,templates,commands,automations,url.searchParams.get('status'));
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; form-action 'self'; base-uri 'self'; frame-ancestors 'self'"});
    res.end(html);return true;
  }
  if (url.pathname === '/maceraci/bildirimler') {
    if (!requireSiteAccount(res, user?.id)) return true;
    if (!db) { res.writeHead(503, {'Cache-Control':'no-store'}); res.end('Panel veritabanı kullanılamıyor.'); return true; }
    const guildId=String(url.searchParams.get('guildId')||'');
    if(!/^\d{17,20}$/.test(guildId)){const dashboard=await getAdventurerDashboard(db,user.id);const html=portalGuildPicker(user,dashboard.profiles,url.pathname,'Bildirim Tercihleri');res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(html);return true;}
    const profile=await getLinkedAdventurer(db,user.id,guildId);
    if(!profile){res.writeHead(403,{'Cache-Control':'no-store'});res.end('Bu sunucudaki karakter web hesabına bağlı değil.');return true;}
    const preferences=await getNotificationPreferences(db,guildId,profile.user_id);
    const html=notificationPreferencesPage(user,profile,preferences,url.searchParams.get('status'));
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; form-action 'self'; base-uri 'self'; frame-ancestors 'self'"});
    res.end(html);return true;
  }
  if (url.pathname === '/maceraci/ev') {
    if (!db) { res.writeHead(503, { 'Cache-Control': 'no-store' }); res.end('Panel veritabanı kullanılamıyor.'); return true; }
    const guildId = String(url.searchParams.get('guildId') || '');
    const userId = String(url.searchParams.get('userId') || '');
    if (!/^[0-9]{17,20}$/.test(guildId) || !/^[0-9]{17,20}$/.test(userId)) { res.writeHead(400, { 'Cache-Control': 'no-store' }); res.end('Ev bağlantısı geçersiz.'); return true; }
    const showcase = await getPublicPlayerHome(db, { guildId, userId });
    if (!showcase) { res.writeHead(404, { 'Cache-Control': 'no-store' }); res.end('Bu ev paylaşılmıyor veya bulunamadı.'); return true; }
    const [companion,cardVariants]=showcase.settings?.show_collections?await Promise.all([getCompanion(db,guildId,userId),listCardVariants(db,guildId,userId)]):[null,[]];
    const html = publicHomeShowcasePage(user, {...showcase,companion,cardVariants});
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Content-Security-Policy': "default-src 'self'; img-src 'self' data: https://cdn.discordapp.com; style-src 'self' 'unsafe-inline'; base-uri 'self'; frame-ancestors 'self'" });
    res.end(html);
    return true;
  }

  if(url.pathname==='/maceraci/oyuncu'){
    if(!db){res.writeHead(503,{'Cache-Control':'no-store'});res.end('Oyuncu profili veritabanı kullanılamıyor.');return true;}
    const guildId=String(url.searchParams.get('guildId')||''),userId=String(url.searchParams.get('userId')||'');
    if(!/^\d{17,20}$/.test(guildId)||!/^\d{17,20}$/.test(userId)){res.writeHead(400,{'Cache-Control':'no-store'});res.end('Profil bağlantısı geçersiz.');return true;}
    const showcase=await getPublicPlayerHome(db,{guildId,userId});
    if(!showcase){res.writeHead(404,{'Cache-Control':'no-store'});res.end('Bu oyuncunun profili herkese açık değil.');return true;}
    await ensureSiteSocialSchema(db);
    const [personal,guestbook,author]=await Promise.all([getPersonalProfile(db,guildId,userId),listGuestbookEntries(db,{guildId,ownerId:userId}),SITE_ACCOUNT_ID.test(String(user?.id||''))?getLinkedAdventurer(db,user.id,guildId):Promise.resolve(null)]);
    if(author&&author.user_id!==userId)await recordProfileVisit(db,{guildId,ownerId:userId,visitorId:author.user_id});
    const html=publicPlayerProfilePage(user,{...showcase,guildId},personal,guestbook,createSiteCsrfToken(process.env.ADMIN_SESSION_SECRET),Boolean(author&&author.user_id!==userId));
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Content-Security-Policy':"default-src 'self'; img-src 'self' data: https://cdn.discordapp.com; style-src 'self' 'unsafe-inline'; form-action 'self'; base-uri 'self'; frame-ancestors 'self'"});res.end(html);return true;
  }
  if(url.pathname==='/maceraci/merkez'){
    if(!requireSiteAccount(res,user?.id))return true;
    if(!db){res.writeHead(503,{'Cache-Control':'no-store'});res.end('Kişisel merkez veritabanı kullanılamıyor.');return true;}
    const guildId=String(url.searchParams.get('guildId')||'');
    if(!guildId){const dashboard=await getAdventurerDashboard(db,user.id);const html=portalGuildPicker(user,dashboard.profiles,url.pathname,'Kişisel Merkez');res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(html);return true;}
    if(!/^\d{17,20}$/.test(guildId)){res.writeHead(400,{'Cache-Control':'no-store'});res.end('Sunucu seçimi geçersiz.');return true;}
    const profile=await getLinkedAdventurer(db,user.id,guildId);if(!profile){res.writeHead(403,{'Cache-Control':'no-store'});res.end('Bu sunucudaki karakter hesabına bağlı değil.');return true;}
    await ensurePersonalCenterSchema(db);await ensureSocialPlatformTables(db);
    const [personal,threads,planner,guestbook,week,month,discover,recommended,closeFriends,friends,profileVisits]=await Promise.all([
      getPersonalProfile(db,guildId,profile.user_id),listMessageThreads(db,{guildId,userId:profile.user_id}),listPlannerEntries(db,{guildId,userId:profile.user_id}),listGuestbookEntries(db,{guildId,ownerId:profile.user_id}),getPersonalProgressReport(db,{guildId,userId:profile.user_id,period:'week'}),getPersonalProgressReport(db,{guildId,userId:profile.user_id,period:'month'}),discoverPlayers(db,{guildId,userId:profile.user_id}),recommendPlayers(db,{guildId,userId:profile.user_id}),listCloseFriends(db,{guildId,ownerId:profile.user_id}),listSocialRelationships(db,guildId,profile.user_id,'friend',50),listProfileVisits(db,{guildId,ownerId:profile.user_id})
    ]);
    const threadId=String(url.searchParams.get('thread')||'');
    let messages=[],activeThread=null;
    if(/^\d{17,20}$/.test(threadId)&&threadId!==profile.user_id){
      activeThread=threadId;
      messages=await listDirectMessages(db,{guildId,userId:profile.user_id,otherUserId:threadId});
      await markDirectMessagesRead(db,{guildId,userId:profile.user_id,otherUserId:threadId});
    }
    const html=personalCenterPage(user,profile,{personal,threads,planner,guestbook,week,month,discover,recommended,closeFriends,friends,profileVisits,messages,activeThread},createSiteCsrfToken(process.env.ADMIN_SESSION_SECRET),url.searchParams.get('status'));
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; img-src 'self' data: https://cdn.discordapp.com; style-src 'self' 'unsafe-inline'; form-action 'self'; base-uri 'self'; frame-ancestors 'self'"});res.end(html);return true;
  }
  if(url.pathname==='/maceraci/profil'){
    if(!requireSiteAccount(res,user?.id))return true;
    if(!db){res.writeHead(503,{'Cache-Control':'no-store'});res.end('Profil veritabanı kullanılamıyor.');return true;}
    const guildId=String(url.searchParams.get('guildId')||'');
    if(!guildId){
      const dashboard=await getAdventurerDashboard(db,user.id);
      const html=portalGuildPicker(user,dashboard.profiles,url.pathname+url.hash,'Maceracı Profili');
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
      res.end(html);return true;
    }
    if(!/^\d{17,20}$/.test(guildId)){res.writeHead(400,{'Cache-Control':'no-store'});res.end('Sunucu seçimi geçersiz.');return true;}
    const profile=await getLinkedAdventurer(db,user.id,guildId);
    if(!profile){res.writeHead(403,{'Cache-Control':'no-store'});res.end('Bu sunucudaki karakter web hesabına bağlı değil.');return true;}
    const settings=await getPlayerProfileSettings(db,{guildId,userId:profile.user_id});
    const [stats,titles,earned,activity,collections,arena,rankings,home,loadout,xpHistory,journalEntries,claimedJournalCollections,regionMastery,learnedSpells,spellMastery,inventory,mapBosses,mapDungeons,mapRaidBosses]=await Promise.all([
      db.query('SELECT created_at,boss_defeats,dungeon_wins,exploration_count,items_used_count,daily_streak,best_daily_streak FROM users WHERE guild_id=$1 AND user_id=$2',[guildId,profile.user_id]),
      db.query('SELECT title,unlocked_at FROM user_titles WHERE guild_id=$1 AND user_id=$2 ORDER BY unlocked_at DESC,title',[guildId,profile.user_id]),
      db.query('SELECT a.achievement_key,a.claimed_at,h.display_slot FROM achievement_claims a LEFT JOIN player_home_trophies h ON h.guild_id=a.guild_id AND h.user_id=a.user_id AND h.achievement_key=a.achievement_key WHERE a.guild_id=$1 AND a.user_id=$2 ORDER BY a.claimed_at DESC,a.achievement_key',[guildId,profile.user_id]),
      db.query("SELECT activity_type,activity_label,activity_at,xp_awarded FROM (SELECT 'Macera' AS activity_type,outcome_text AS activity_label,occurred_at AS activity_at,xp_awarded FROM adventure_history WHERE guild_id=$1 AND user_id=$2 UNION ALL SELECT 'Başarım',achievement_key,claimed_at,0 FROM achievement_claims WHERE guild_id=$1 AND user_id=$2 UNION ALL SELECT 'Kozmetik',cosmetic_key,acquired_at,0 FROM player_cosmetic_ownership WHERE guild_id=$1 AND user_id=$2) recent ORDER BY activity_at DESC LIMIT 12",[guildId,profile.user_id]),
      db.query('SELECT (SELECT COUNT(DISTINCT character_name)::int FROM anime_character_collection WHERE guild_id=$1 AND user_id=$2) AS anime_cards,(SELECT COALESCE(SUM(quantity),0)::int FROM anime_character_collection WHERE guild_id=$1 AND user_id=$2) AS anime_copies,(SELECT COUNT(*)::int FROM adventure_journal_entries WHERE guild_id=$1 AND user_id=$2) AS journal_entries',[guildId,profile.user_id]),
      db.query("SELECT s.name AS season_name,COALESCE(r.rating,1000)::int AS rating,COALESCE(r.wins,0)::int AS wins,COALESCE(r.losses,0)::int AS losses,COALESCE(r.matches,0)::int AS matches FROM arena_seasons s LEFT JOIN arena_ratings r ON r.season_id=s.season_id AND r.guild_id=s.guild_id AND r.user_id=$2 WHERE s.guild_id=$1 AND s.status='active' ORDER BY s.season_id DESC LIMIT 1",[guildId,profile.user_id]),
      db.query(`WITH xp_board AS (SELECT user_id,character_name,(FLOOR(SQRT(GREATEST(xp,0)::numeric/100))::int+1) AS level,xp FROM users WHERE guild_id=$1 ORDER BY xp DESC,level DESC,user_id LIMIT 10),
       boss_board AS (SELECT user_id,character_name,boss_defeats FROM users WHERE guild_id=$1 ORDER BY boss_defeats DESC,user_id LIMIT 10),
       dungeon_board AS (SELECT user_id,character_name,dungeon_wins FROM users WHERE guild_id=$1 ORDER BY dungeon_wins DESC,user_id LIMIT 10),
       active_season AS (SELECT season_id FROM arena_seasons WHERE guild_id=$1 AND status='active' ORDER BY season_id DESC LIMIT 1),
       arena_board AS (SELECT r.user_id,u.character_name,r.rating FROM arena_ratings r JOIN users u USING(guild_id,user_id) JOIN active_season s ON s.season_id=r.season_id WHERE r.guild_id=$1 ORDER BY r.rating DESC,r.wins DESC,r.user_id LIMIT 10),
       daily_board AS (SELECT h.user_id,u.character_name,SUM(h.xp_awarded)::int AS xp FROM adventure_history h JOIN users u USING(guild_id,user_id) WHERE h.guild_id=$1 AND h.occurred_at>=NOW()-INTERVAL '24 hours' GROUP BY h.user_id,u.character_name ORDER BY xp DESC,h.user_id LIMIT 10),
       collection_board AS (SELECT c.user_id,u.character_name,COUNT(DISTINCT c.character_name)::int AS anime_cards FROM anime_character_collection c JOIN users u USING(guild_id,user_id) WHERE c.guild_id=$1 GROUP BY c.user_id,u.character_name ORDER BY anime_cards DESC,c.user_id LIMIT 10),
       achievement_board AS (SELECT a.user_id,u.character_name,COUNT(*)::int AS achievements FROM achievement_claims a JOIN users u USING(guild_id,user_id) WHERE a.guild_id=$1 GROUP BY a.user_id,u.character_name ORDER BY achievements DESC,a.user_id LIMIT 10)
       SELECT 'xp' AS board,COALESCE((SELECT json_agg(to_jsonb(x)) FROM xp_board x),'[]'::json) AS players
       UNION ALL SELECT 'boss',COALESCE((SELECT json_agg(to_jsonb(x)) FROM boss_board x),'[]'::json)
       UNION ALL SELECT 'dungeon',COALESCE((SELECT json_agg(to_jsonb(x)) FROM dungeon_board x),'[]'::json)
       UNION ALL SELECT 'arena',COALESCE((SELECT json_agg(to_jsonb(x)) FROM arena_board x),'[]'::json)
       UNION ALL SELECT 'daily_adventure_xp',COALESCE((SELECT json_agg(to_jsonb(x)) FROM daily_board x),'[]'::json)
       UNION ALL SELECT 'collection',COALESCE((SELECT json_agg(to_jsonb(x)) FROM collection_board x),'[]'::json)
       UNION ALL SELECT 'achievements',COALESCE((SELECT json_agg(to_jsonb(x)) FROM achievement_board x),'[]'::json)`,[guildId]),
      db.query('SELECT is_public FROM player_homes WHERE guild_id=$1 AND user_id=$2',[guildId,profile.user_id]),
      db.query('SELECT slot,cosmetic_key FROM player_cosmetic_loadout WHERE guild_id=$1 AND user_id=$2 ORDER BY slot',[guildId,profile.user_id]),
      db.query("SELECT TO_CHAR(date_trunc('day',occurred_at),'YYYY-MM-DD') AS day_label,SUM(xp_awarded)::int AS xp FROM adventure_history WHERE guild_id=$1 AND user_id=$2 AND occurred_at>=NOW()-INTERVAL '7 days' GROUP BY date_trunc('day',occurred_at) ORDER BY date_trunc('day',occurred_at)",[guildId,profile.user_id]),
      getJournalEntries(db,guildId,profile.user_id),
      getClaimedJournalCollections(db,guildId,profile.user_id),
      db.query('SELECT region_key,visits FROM exploration_region_mastery WHERE guild_id=$1 AND user_id=$2 ORDER BY visits DESC,region_key ASC',[guildId,profile.user_id]),
      db.query('SELECT spell_key,learned_at FROM learned_spells WHERE guild_id=$1 AND user_id=$2 ORDER BY learned_at ASC',[guildId,profile.user_id]),
      db.query('SELECT spell_key,casts,mastery_level FROM spell_mastery WHERE guild_id=$1 AND user_id=$2 ORDER BY mastery_level DESC,casts DESC,spell_key ASC',[guildId,profile.user_id]),
      db.query('SELECT item_key,quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 AND quantity>0 ORDER BY item_key',[guildId,profile.user_id]),
      getGuildRpgContent(db,guildId,'solo_boss').catch(()=>DEFAULT_SOLO_BOSSES),
      getGuildRpgContent(db,guildId,'dungeon').catch(()=>DEFAULT_DUNGEON_TIERS),
      getGuildRpgContent(db,guildId,'raid_boss').catch(()=>DEFAULT_RAID_BOSSES)
    ]);
    let bannerUrl='/assets/site-profile-banner.svg';
    try{const banner=await getProfileMedia(db,user.id,'banner');if(banner)bannerUrl='/maceraci/profil/media?kind=banner';}catch{}
    const journalProgress=Object.entries(JOURNAL_COLLECTIONS).map(([key])=>getJournalCollectionProgress(key,journalEntries.filter(entry=>entry.collection_key===key).map(entry=>entry.entry_key)));
    const dailyQuests=await loadPlayerDailyQuestBoard(db,guildId,profile.user_id,profile.class_name);
    const html=playerProfilePage(user,profile,{
      settings,stats:stats.rows[0]||{},titles:titles.rows,achievements:earned.rows,activity:activity.rows,
      collections:collections.rows[0]||{},arena:arena.rows[0]||{},rankings:rankings.rows,
      home:home.rows[0]||{is_public:false},loadout:loadout.rows,xpHistory:xpHistory.rows,bannerUrl,
      journalProgress,claimedJournalCollections:[...claimedJournalCollections],regionMastery:regionMastery.rows,dailyQuests,
      learnedSpells:learnedSpells.rows,spellMastery:spellMastery.rows,
      journalEntries:journalEntries.rows,inventory:inventory.rows,mapBosses,mapDungeons,mapRaidBosses
    },url.searchParams.get('status'));
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Content-Security-Policy':"default-src 'self'; img-src 'self' data: https://cdn.discordapp.com; style-src 'self' 'unsafe-inline'; form-action 'self'; base-uri 'self'; frame-ancestors 'self'"});
    res.end(html);return true;
  }
  if (url.pathname === '/maceraci') {
    if (!requireSiteAccount(res, user?.id)) return true;
    if (!db) { res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }); res.end('Oyuncu paneli veritabanına şu anda bağlanamıyor.'); return true; }
    const data = await getAdventurerDashboard(db, user.id);
    const chatOwner=await isLinkedOwnerSiteAccount(db,user);
    const html = injectPublicChat(adventurerPanel(user, data, url.searchParams.get('status')),user,createSiteCsrfToken(process.env.ADMIN_SESSION_SECRET),chatOwner);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Content-Security-Policy': "default-src 'self'; img-src 'self' data: https://cdn.discordapp.com; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; form-action 'self'; base-uri 'self'; frame-ancestors 'self'" });
    res.end(html); return true;
  }
  if(url.pathname==='/maceraci/yasam'){
    if (!requireSiteAccount(res, user?.id)) return true;
    if(!db){res.writeHead(503,{'Cache-Control':'no-store'});res.end('Panel veritabanı kullanılamıyor.');return true;}
    const guildId=String(url.searchParams.get('guildId')||'');
    if(!guildId){const dashboard=await getAdventurerDashboard(db,user.id);const html=portalGuildPicker(user,dashboard.profiles,url.pathname,'Kişisel Yaşam Alanı');res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(html);return true;}
    if(!/^\d{17,20}$/.test(guildId)){res.writeHead(400,{'Cache-Control':'no-store'});res.end('Sunucu seçimi geçersiz.');return true;}
    const profile=await getLinkedAdventurer(db,user.id,guildId);
    if(!profile){res.writeHead(403,{'Cache-Control':'no-store'});res.end('Bu sunucudaki karakter web hesabına bağlı değil.');return true;}
    const home=await getPlayerHome(db,{guildId,userId:profile.user_id});
    const [owned,loadout,presets,events,trophies]=await Promise.all([
      getCosmeticAcquisitionHistory(db,{guildId,userId:profile.user_id}),
      db.query('SELECT slot,cosmetic_key FROM player_cosmetic_loadout WHERE guild_id=$1 AND user_id=$2',[guildId,profile.user_id]),
      db.query('SELECT preset_name FROM player_cosmetic_presets WHERE guild_id=$1 AND user_id=$2 ORDER BY preset_name',[guildId,profile.user_id]),
      db.query("SELECT e.event_id,e.title,e.starts_at,e.ends_at,COALESCE(p.progress,0)::int AS participation,COALESCE(c.progress,0)::int AS checkin FROM guild_events e LEFT JOIN guild_event_progress p ON p.event_id=e.event_id AND p.guild_id=e.guild_id AND p.user_id=$2 AND p.progress_key='participation' LEFT JOIN guild_event_progress c ON c.event_id=e.event_id AND c.guild_id=e.guild_id AND c.user_id=$2 AND c.progress_key='checkin' WHERE e.guild_id=$1 AND e.status IN ('scheduled','completed') AND e.ends_at>NOW()-INTERVAL '90 days' ORDER BY e.starts_at DESC LIMIT 50",[guildId,profile.user_id]),
      getHomeTrophies(db,{guildId,userId:profile.user_id})
    ]);
    const html=playerExperiencePage(user,profile,{...home,events:events.rows},owned,loadout.rows,presets.rows,trophies,url.searchParams.get('status'));
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Content-Security-Policy':"default-src 'self'; img-src 'self' data: https://cdn.discordapp.com; style-src 'self' 'unsafe-inline'; form-action 'self'; base-uri 'self'; frame-ancestors 'self'"});
    res.end(html);return true;
  }
  if (url.pathname === '/maceraci/envanter' || url.pathname === '/maceraci/koleksiyon' || url.pathname === '/maceraci/sosyal' || url.pathname === '/pazar') {
    if (!requireSiteAccount(res, user?.id)) return true;
    if (!db) { res.writeHead(503, { 'Content-Type':'text/plain; charset=utf-8', 'Cache-Control':'no-store' }); res.end('Panel veritabanı kullanılamıyor.'); return true; }
    const guildId=String(url.searchParams.get('guildId')||'');
    if(!guildId){
      const dashboard=await getAdventurerDashboard(db,user.id);
      const html=portalGuildPicker(user,dashboard.profiles,url.pathname,'Sunucu seçimi');
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Content-Security-Policy':"default-src 'self'; img-src 'self' data: https://cdn.discordapp.com; style-src 'self' 'unsafe-inline'; form-action 'self'; base-uri 'self'; frame-ancestors 'self'"});
      res.end(html);return true;
    }
    if(!/^\d{17,20}$/.test(guildId)){res.writeHead(400,{'Cache-Control':'no-store'});res.end('Sunucu seçimi geçersiz.');return true;}
    const data=url.pathname==='/maceraci/sosyal'?await getLinkedAdventurer(db,user.id,guildId):await getAdventurerInventory(db,user.id,guildId);
    if(!data){res.writeHead(403,{'Cache-Control':'no-store'});res.end('Bu sunucudaki karakter web hesabına bağlı değil.');return true;}
    const profile=url.pathname==='/maceraci/sosyal'?data:data.profile;
    if(url.pathname==='/maceraci/sosyal'&&!await getGuildFeatureEnabled(db,guildId,'social')){res.writeHead(403,{'Cache-Control':'no-store'});res.end('Sosyal modül bu sunucuda kapalı.');return true;}
    const filters={query:url.searchParams.get('q')||'',minPrice:url.searchParams.get('min')||'',maxPrice:url.searchParams.get('max')||'',sort:url.searchParams.get('sort')||'price_asc',category:url.searchParams.get('category')||'all'};
    const html=url.pathname==='/pazar'
      ?playerMarketPage(user,data,await listPlayerMarketListings(db,guildId,20,filters),await getPlayerMarketHistory(db,guildId,data.profile.user_id,15),url.searchParams.get('status'),filters,await getPlayerMarketOffers(db,guildId,data.profile.user_id,20),await listPlayerMarketPriceAlerts(db,guildId,data.profile.user_id,10))
      :url.pathname==='/maceraci/koleksiyon'
        ?adventurerCollectionPage(user,data.profile,await loadAdventurerCollections(db,guildId,data.profile.user_id))
        :url.pathname==='/maceraci/sosyal'
          ?adventurerSocialPage(user,profile,{
            friends:await listSocialRelationships(db,guildId,profile.user_id,'friend',50),
            rivals:await listSocialRelationships(db,guildId,profile.user_id,'rival',50),
            requests:await listPendingFriendRequests(db,guildId,profile.user_id,50),
            reputation:await getSocialReputation(db,guildId,profile.user_id)
          },url.searchParams.get('status'))
          :adventurerInventoryPage(user,data);
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Content-Security-Policy':"default-src 'self'; img-src 'self' data: https://cdn.discordapp.com; style-src 'self' 'unsafe-inline'; form-action 'self'; base-uri 'self'; frame-ancestors 'self'"});
    res.end(html);return true;
  }
  const routes = new Map([['/hizmet-kosullari', () => termsPage()], ['/gizlilik-politikasi', () => privacyPage()], ['/kesfet', () => home(client, user, createSiteCsrfToken(process.env.ADMIN_SESSION_SECRET))], ['/pogaca', () => pogaca(client, user)], ['/komutlar', () => commandCatalog(client, user)], ['/frieren-ai', () => aiPage(user)], ['/ansiklopedi', () => characterEncyclopediaPage(user)], ['/ara', () => siteSearchPage(client,user,url.searchParams.get('q'),url.searchParams.get('category'))]]);
  const render = routes.get(url.pathname);
  if (!render) return false;
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Content-Security-Policy': "default-src 'self'; img-src 'self' data: https://cdn.discordapp.com; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; form-action 'self'; base-uri 'self'; frame-ancestors 'self'" });
  const content=url.pathname==='/kesfet'?injectPublicChat(render(),user,createSiteCsrfToken(process.env.ADMIN_SESSION_SECRET),await isLinkedOwnerSiteAccount(db,user)):render();
  res.end(content);
  return true;
}
