import { CREATURE_CATALOG } from './creatures.js';
import { declutterAtlasPins } from './atlas-pin-layout.js';
import { ATLAS_HISTORICAL_EVENTS, ATLAS_ROUTE_STOPS, findAtlasRoute } from './atlas-navigation.js';
import { buildAtlasLocalDetailLayer, getAtlasEcologyProfile } from './atlas-advanced.js';
import {
  FRIEREN_WORLD_SETTLEMENTS,
  FRIEREN_WORLD_BOSS_LOCATIONS,
  FRIEREN_WORLD_DUNGEON_LOCATIONS
} from './exploration-world-locations.js';

const REGIONS = Object.freeze({
  merkez:{name:'Merkez Topraklar',type:'Güney kıta ovaları',city:'Strahl',x:35,y:68,className:'atlas-plains',creatures:['mana_slime','forest_sprite']},
  orman:{name:'Größe Ormanı',type:'Kadim orman kuşağı',city:'Größe Ormanı',x:32,y:43,className:'atlas-forest',creatures:['forest_sprite','rune_fox']},
  harabeler:{name:'Graf Granat Bölgesi',type:'Kuzey yerleşimleri ve harabeler',city:'Graf Granat Bölgesi',x:55,y:47,className:'atlas-highlands',creatures:['mana_slime','ancient_drake']},
  kuzey:{name:'Kühl Bölgesi',type:'Göller ve dağ geçitleri',city:'Äußerst',x:68,y:31,className:'atlas-north',creatures:['frost_hare','rune_fox']},
  yayla:{name:'Schwer Dağları',type:'Yüksek dağlar',city:'Kılıç Köyü',x:74,y:72,className:'atlas-mountains',creatures:['frost_hare','ancient_drake']},
  aus:{name:'Ende',type:'Kıtanın en kuzey ucu',city:'İblis Kralı’nın Şatosu',x:87,y:8,className:'atlas-ende',creatures:['ancient_drake','mana_slime']}
});
const REGION_ANCHORS = Object.freeze({
  merkez:{x:35,y:75},orman:{x:31,y:49},harabeler:{x:55,y:53},
  kuzey:{x:68,y:38},yayla:{x:76,y:65},aus:{x:88,y:19}
});
const CREATURES = new Map(CREATURE_CATALOG.map(item => [item.key,item]));
function resolveAtlasBossLocation(boss) {
  const catalogLocation = FRIEREN_WORLD_BOSS_LOCATIONS[boss.key];
  const runtimeLocation = boss.location;
  const valid = location => location && Number.isFinite(Number(location.x)) &&
    Number.isFinite(Number(location.y)) && Number(location.x) >= 0 && Number(location.x) <= 100 &&
    Number(location.y) >= 0 && Number(location.y) <= 100;
  if (valid(catalogLocation)) {
    return { ...catalogLocation, place: runtimeLocation?.place || catalogLocation.place };
  }
  return valid(runtimeLocation) ? runtimeLocation : null;
}
const FOG_PATHS = Object.freeze({
  merkez:'M17 69 Q25 63 35 67 Q44 71 47 82 L40 91 Q28 90 20 83 Z',
  orman:'M19 38 Q25 31 35 36 Q43 42 39 55 L30 61 Q20 55 17 47 Z',
  harabeler:'M44 45 Q54 39 64 46 L68 57 Q61 66 50 63 L43 55 Z',
  kuzey:'M59 26 Q68 20 76 27 L78 41 Q70 48 62 43 L57 34 Z',
  yayla:'M68 56 Q77 49 85 57 L88 70 Q80 78 71 72 L66 64 Z',
  aus:'M80 10 Q88 6 95 12 L97 25 Q91 32 83 27 L79 18 Z'
});
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const position = (x,y) => 'left:'+x+'%;top:'+y+'%;';

function pin({key,targetKey=key,label,type,icon,x,y,focus='region',extraClass='',subtitle=''}) {
  const title = subtitle ? label+' · '+subtitle : label;
  const edgeClass = (Number(x)>=68?'atlas-pin-label-left ':Number(x)<=18?'atlas-pin-label-right ':'')+(Number(y)>=80?'atlas-pin-label-top ':'');
  return '<button type="button" class="atlas-pin atlas-pin-'+type+' '+edgeClass+extraClass+'" style="'+position(x,y)+'" data-atlas-layer-item="'+type+'" data-atlas-open="'+escapeHtml(key)+'" data-atlas-focus="'+focus+'" data-atlas-target-key="'+escapeHtml(targetKey)+'" '+(type==='event'?'data-atlas-event="'+escapeHtml(targetKey)+'" ':'')+'aria-label="'+escapeHtml(title)+'" title="'+escapeHtml(title)+'"><span class="atlas-pin-glyph" aria-hidden="true">'+icon+'</span><span class="atlas-pin-label">'+escapeHtml(label)+'</span></button>';
}

function detailRow({key,name,description,icon,state='',focus=''}) {
  return '<li class="exploration-detail-row '+state+'" '+(focus?'data-atlas-focus-target="'+focus+'"':'')+' data-atlas-target-key="'+escapeHtml(key)+'"><span class="exploration-detail-icon" aria-hidden="true">'+icon+'</span><span><strong>'+escapeHtml(name)+'</strong><small>'+escapeHtml(description)+'</small></span></li>';
}

function panel(item,index,settlements,events,esc) {
  const region=item.region;
  const geography=REGIONS[region.key]||REGIONS.merkez;
  const encounterLevels=[...item.bosses,...item.dungeons].map(entry=>Number(entry.minLevel)||0);
  const dangerLevel=Math.max(Number(region.minLevel)||1,...encounterLevels);
  const dangerLabel=dangerLevel>=50?'Çok yüksek':dangerLevel>=35?'Yüksek':dangerLevel>=20?'Orta':dangerLevel>=10?'Dikkat':'Düşük';
  const localSettlements=settlements.filter(place=>place.regionKey===region.key);
  const settlementRows=localSettlements.map(place=>detailRow({
    key:place.key,name:place.name,description:place.subtitle,icon:'⌂',focus:'city'
  })).join('');
  const creatureRows=(geography.creatures||[]).map(key=>CREATURES.get(key)).filter(Boolean)
    .map(creature=>detailRow({key:creature.key,name:(creature.emoji||'')+' '+creature.name,description:creature.rarity||'Biyom canlısı',icon:'✧'})).join('');
  const bossRows=item.bosses.map(boss=>detailRow({
    key:boss.key,name:boss.name,
    description:(boss.defeated?'Yenildi':boss.unlocked?'Karşılaşma açık':'Seviye '+boss.minLevel+' gerekli')+(boss.location?' · '+boss.location.place:' · Bölge konumu'),
    icon:'☠',state:boss.defeated?'is-defeated':boss.unlocked?'is-open':'is-locked',focus:'boss'
  })).join('');
  const dungeonRows=item.dungeons.map(dungeon=>detailRow({
    key:dungeon.key,name:dungeon.name,
    description:(dungeon.unlocked?'Giriş açık':'Seviye '+dungeon.minLevel+' gerekli')+' · '+(dungeon.lootName||'Zindan ganimeti')+(dungeon.location?' · '+dungeon.location.place:''),
    icon:'◇',state:dungeon.unlocked?'is-open':'is-locked',focus:'dungeon'
  })).join('');
  const lootRows=item.rareItems.map(entry=>detailRow({
    key:'loot-'+entry.name,name:entry.name,
    description:(entry.ownedQuantity?'Envanterinde ×'+entry.ownedQuantity:'Henüz bulunmadı')+' · '+entry.sources.map(source=>source==='dungeon'?'Zindan':source==='boss_material'?'Boss malzemesi':'Boss').join(' / '),
    icon:'✧',state:entry.ownedQuantity?'is-owned':'is-unowned'
  })).join('');
  const eventRows=events.filter(event=>event.regionKey===region.key).map(event=>'<li class="exploration-detail-row atlas-event-row" data-atlas-focus-target="event" data-atlas-target-key="'+esc(event.id)+'"><span class="exploration-detail-icon" aria-hidden="true">◷</span><span><strong>'+esc(event.title)+'</strong><small>'+esc(event.episodeLabel)+' · '+esc(event.location)+'</small><a href="'+esc(event.officialSource)+'" target="_blank" rel="noopener noreferrer">Resmî anime yol haritası</a> · <a href="'+esc(event.locationSource)+'" target="_blank" rel="noopener noreferrer">Konum kaynağı</a> · '+(event.episodeSources||[]).map(source=>'<a href="'+esc(source.url)+'" target="_blank" rel="noopener noreferrer">'+esc(source.label)+' özeti</a>').join(' · ')+'</span></li>').join('');
  const section=(heading,rows,empty='Bu bölgede kayıtlı nokta bulunmuyor.')=>'<section><h4>'+heading+'</h4><ul>'+(rows||'<li class="atlas-empty-row">'+empty+'</li>')+'</ul></section>';
  return '<section class="atlas-panel" data-atlas-panel="'+esc(region.key)+'" hidden><div class="atlas-hero"><small>BÖLGE '+(index+1)+' · '+esc(geography.type)+'</small><h3>'+esc(geography.name)+'</h3><p>'+esc(region.name)+' · '+esc(geography.city)+'</p><div><span>'+(item.discovered?'Keşfedildi':item.unlocked?'Keşfe açık':'Kilitli · Seviye '+region.minLevel)+'</span><span>RPG tehlikesi: '+dangerLabel+' · Seviye '+dangerLevel+'+</span><span>'+item.visits+' keşif ziyareti</span><span>Ustalık '+item.masteryLevel+'</span></div></div><div class="atlas-detail-grid">'+section('Anime yerleşimleri ve önemli noktalar',settlementRows)+section('Biyom canlıları',creatureRows)+section('Boss karşılaşmaları',bossRows)+section('Zindanlar',dungeonRows)+section('Nadir ganimet',lootRows)+section('Anime tarihçesi',eventRows,'Bu bölgede doğrulanmış tarihsel olay kaydı yok.')+'</div></section>';
}

function renderRegionList(rows,esc) {
  const cards=rows.map(item=>{
    const {region,visits,discovered,unlocked}=item;
    const status=discovered?'Keşfedildi':unlocked?'Açık · henüz keşfedilmedi':'Kilitli · Seviye '+region.minLevel+' gerekli';
    const progress=unlocked
      ? '<div class="progress" role="progressbar" aria-label="'+esc(region.name)+' ustalık ilerlemesi" aria-valuemin="0" aria-valuemax="3" aria-valuenow="'+item.visitsToNextMastery+'"><i style="width:'+item.masteryProgressPercent+'%"></i></div><small>Ustalık seviyesi '+item.masteryLevel+' · sonraki ödül '+item.visitsToNextMastery+'/3 keşif</small>'
      : '<small>Bu bölge karakterin Seviye '+region.minLevel+' olduğunda açılır.</small>';
    const bossRows=item.bosses.map(boss=>{
      const bossState=boss.defeated?'Yenildi':boss.unlocked?'Karşılaşma açık':'Seviye '+boss.minLevel+' gerekli';
      const bossClass=boss.defeated?'is-defeated':boss.unlocked?'is-open':'is-locked';
      return '<li class="exploration-detail-row exploration-boss-row '+bossClass+'" data-boss-key="'+esc(boss.key)+'" data-atlas-focus-target="boss" data-atlas-target-key="'+esc(boss.key)+'"><span class="exploration-detail-icon" aria-hidden="true">♛</span><span><strong>'+esc(boss.name)+'</strong><small>'+bossState+'</small></span></li>';
    }).join('');
    const dungeonRows=item.dungeons.map(dungeon=>{
      const dungeonClass=dungeon.unlocked?'is-open':'is-locked';
      return '<li class="exploration-detail-row exploration-chest-row '+dungeonClass+'" data-atlas-focus-target="dungeon" data-atlas-target-key="'+esc(dungeon.key)+'"><span class="exploration-detail-icon" aria-hidden="true">▣</span><span><strong>'+esc(dungeon.name)+'</strong><small>'+(dungeon.unlocked?'Zindan girişi açık':'Seviye '+dungeon.minLevel+' gerekli')+' · Karakter genelinde '+mapDungeonWins(item)+' zindan zaferi</small></span></li>';
    }).join('');
    const itemRows=item.rareItems.map(loot=>{
      const sources=loot.sources.map(source=>source==='dungeon'?'Zindan ganimeti':source==='boss_material'?'Boss malzemesi':'Boss ganimeti').join(' · ');
      const owned=loot.ownedQuantity>0?'Envanterinde ×'+loot.ownedQuantity:'Henüz envanterinde yok';
      return '<li class="exploration-detail-row exploration-relic-row '+(loot.ownedQuantity>0?'is-owned':'is-unowned')+'"><span class="exploration-detail-icon" aria-hidden="true">◆</span><span><strong>'+esc(loot.name)+'</strong><small>'+sources+' · '+owned+'</small></span></li>';
    }).join('');
    const encounterDetails='<div class="exploration-region-details">'+(bossRows?'<section><h4>Boss noktaları</h4><ul>'+bossRows+'</ul></section>':'')+(dungeonRows?'<section><h4>Zindan ve sandık alanı</h4><ul>'+dungeonRows+'</ul><p class="exploration-map-note">Sandıklar mevcut zindan karşılaşmalarında rastgele bulunur; bu işaret zindan/ganimet alanını gösterir, yeni bir harita üstü sandık açma işlemi değildir.</p></section>':'')+(itemRows?'<section><h4>Nadir ganimet noktaları</h4><ul>'+itemRows+'</ul></section>':'<p class="exploration-map-note">Bu bölge için katalogda tanımlı nadir ganimet yok.</p>')+'</div>';
    return '<article class="card exploration-region-card is-'+item.state+'" id="region-'+esc(region.key)+'" data-region-key="'+esc(region.key)+'" data-region-state="'+item.state+'"><div class="eyebrow">'+region.emoji+' '+esc(region.name)+'</div><strong>Seviye '+region.minLevel+'+</strong><p>'+status+'</p><p>'+visits+' keşif ziyareti</p>'+progress+encounterDetails+'</article>';
  }).join('');
  return '<div class="exploration-region-grid">'+cards+'</div><p class="market-meta">Keşif yapmak için Discord’da /kesif komutunu kullan. Her üç başarılı ziyaret bölge ustalığı ödülü kazandırır.</p>';
}
function mapDungeonWins(item) {
  return Math.max(0,Number(item.dungeonWins)||0);
}

const settlementSilhouetteTemplates = Object.freeze({
  strahl: `<g class="village-architecture"><path class="village-road" d="M-58 39Q-24 22 0 32T59 19" fill="none" stroke="#c4aa7b" stroke-width="8" stroke-linecap="round"/><path d="M-53 26  -44 10 -27 7 -14 18 -14 35 -53 35Z" fill="#75624e" stroke="#ead7b4" stroke-width="2"/><path d="M-48 10-34-5-19 10Z" fill="#9a684d" stroke="#d9b88d" stroke-width="2"/><path d="M-10 30 1 10 22 8 35 21 35 38-10 38Z" fill="#8d775b" stroke="#ead9bb" stroke-width="2"/><path d="M-5 11 11-9 29 12Z" fill="#a56d50" stroke="#e1c39a" stroke-width="2"/><path d="M34 30 42 15 57 16 65 29 65 39 34 39Z" fill="#74644f" stroke="#dfcba9" stroke-width="2"/><path d="M39 16 49 2 61 17Z" fill="#a16b50" stroke="#e0c29a" stroke-width="2"/><rect x="-39" y="18" width="7" height="10" rx="1" fill="#263d42"/><rect x="5" y="22" width="8" height="11" rx="1" fill="#263d42"/><rect x="45" y="25" width="6" height="9" rx="1" fill="#263d42"/><path class="timber-frame" d="M-51 35v-17m8 17V14m-8 8h8M-5 37V18m10 19V16m-10 9H5M38 38V22m8 16V20" stroke="#d5bd96" stroke-width="1.5" fill="none"/><path d="M-57 40h124" stroke="#5b5946" stroke-width="2" opacity=".45"/></g>`,
  'royal-capital': `<g class="castle-architecture"><path class="castle-wall" d="M-66 34V-4h132v38h-12V7H-54v27Z" fill="#827a69" stroke="#e8d9bc" stroke-width="3"/><path class="battlement" d="M-66-4v-12h10v7h9v-7h10v12m64 0v-12h10v7h9v-7h10v12" fill="#a99a7e" stroke="#eee1c8" stroke-width="2"/><path d="M-57-8v-34h22v34m70 0v-34h22v34M-22 34V-26h44v60Z" fill="#a18b6b" stroke="#efe1c5" stroke-width="3"/><path d="M-61-42-46-61-31-42Zm66 0 17-25 17 25ZM-29-26 0-53 29-26Z" fill="#8c7159" stroke="#e7d2ac" stroke-width="2.5"/><path d="M-50-40v25m7-25v25M40-40v25m7-25v25M-14-8v20m28-20v20" stroke="#d6c4a1" stroke-width="2"/><rect x="-48" y="-30" width="8" height="12" fill="#34464a"/><rect x="40" y="-30" width="8" height="12" fill="#34464a"/><rect x="-8" y="-13" width="16" height="18" rx="8" fill="#35484a"/><path class="arched-gate" d="M-12 34V14Q0-3 12 14V34" fill="#263b43" stroke="#e0c9a3" stroke-width="2.5"/><path d="M-62 38h124M-35 39v-5m70 5v-5" stroke="#d5c29f" stroke-width="2"/><path class="castle-masonry-detail" d="M-54 8h37M17 8h37M-54 18h39M15 18h39M-45 28h28M17 28h28M-40 10v6M-24 19v7M24 10v6M40 19v7" fill="none" stroke="#eadcc3" stroke-opacity=".22" stroke-width="1.5" stroke-linecap="round"/></g>`,
  waal: `<g class="castle-architecture"><path class="castle-wall" d="M-57 31V-4h114v35h-10V7H-47v24Z" fill="#827d70" stroke="#e9dec7" stroke-width="3"/><path class="battlement" d="M-57-4v-10h9v6h8v-6h9v10m50 0v-10h9v6h8v-6h9v10" fill="#b1a38b" stroke="#eee4d0" stroke-width="2"/><path d="M-49-7v-30h19v30m60 0v-30h19v30M-17 31V-20h34v51Z" fill="#9d907a" stroke="#f0e4ce" stroke-width="2.8"/><path class="roof-tile" d="M-54-37-40-55-26-37m56 0 14-18 14 18M-22-20 0-43 22-20Z" fill="#766a5d" stroke="#e1d2b6" stroke-width="2.3"/><rect x="-43" y="-29" width="7" height="12" fill="#34474a"/><rect x="36" y="-29" width="7" height="12" fill="#34474a"/><rect x="-7" y="-9" width="14" height="13" fill="#394a4a"/><path class="arched-gate" d="M-10 31V12Q0-1 10 12V31" fill="#263b42" stroke="#e4d4b9" stroke-width="2"/><path d="M-61 35h122M-48 37v-5m96 5v-5" stroke="#c7b99f" stroke-width="2"/><path class="castle-masonry-detail" d="M-54 8h37M17 8h37M-54 18h39M15 18h39M-45 28h28M17 28h28M-40 10v6M-24 19v7M24 10v6M40 19v7" fill="none" stroke="#eadcc3" stroke-opacity=".22" stroke-width="1.5" stroke-linecap="round"/></g>`,
  'fabel-village': `<g class="village-architecture"><path class="village-road" d="M-58 42Q-27 23 0 29T58 12" fill="none" stroke="#bba27c" stroke-width="7" stroke-linecap="round"/><path d="M-52 27-42 10-22 10-12 25v16h-40Z" fill="#8b775b" stroke="#ead8b9" stroke-width="2"/><path class="roof-tile" d="M-47 11-32-7-17 11Z" fill="#9a6148" stroke="#e5c69b" stroke-width="2"/><path d="M-11 30 2 9 27 9 39 26v15h-50Z" fill="#9b8463" stroke="#f0dfc0" stroke-width="2"/><path d="M-5 10 14-13 34 10Z" fill="#a96d4d" stroke="#e7c89e" stroke-width="2"/><path d="M36 31 44 17 60 17 68 31v10H36Z" fill="#7d705a" stroke="#e5d2b2" stroke-width="2"/><path d="M40 18 52 2 64 18Z" fill="#9c674d" stroke="#e4c39a" stroke-width="2"/><rect x="-39" y="23" width="8" height="12" fill="#30474a"/><rect x="7" y="25" width="9" height="14" fill="#30474a"/><rect x="48" y="27" width="7" height="10" fill="#30474a"/><path class="timber-frame" d="M-49 40V15m9 25V17m-9 9h9M-6 40V15m12 25V14m-12 12H6M41 41V22m8 19V22" fill="none" stroke="#e0c49a" stroke-width="1.6"/><path d="M-58 43h130" stroke="#5e634c" stroke-width="2" opacity=".55"/></g>`,
  'graf-granat': `<g class="castle-architecture"><path class="castle-wall" d="M-62 34V-5h124v39h-12V6H-50v28Z" fill="#77786f" stroke="#e8ddc7" stroke-width="3"/><path class="battlement" d="M-62-5v-11h10v6h9v-6h10v11m56 0v-11h10v6h9v-6h10v11" fill="#b0a28a" stroke="#f0e5cf" stroke-width="2"/><path d="M-53-7v-31h22v31m62 0v-31h22v31M-20 34V-24h40v58Z" fill="#9d907b" stroke="#eee3cc" stroke-width="3"/><path class="roof-tile" class="roof-tile" d="M-58-38-42-59-26-38m52 0 16-21 16 21M-25-24 0-47 25-24Z" fill="#8b7863" stroke="#e7d8bd" stroke-width="2.5"/><rect x="-46" y="-28" width="8" height="13" fill="#33494b"/><rect x="38" y="-28" width="8" height="13" fill="#33494b"/><rect x="-7" y="-13" width="14" height="13" fill="#3c4d4b"/><path class="arched-gate" d="M-13 34V13Q0-4 13 13V34" fill="#283b41" stroke="#e5d2b1" stroke-width="2.5"/><path d="M-58 39h116M-36 39v-5m72 5v-5" stroke="#c7b99c" stroke-width="2"/><path class="castle-masonry-detail" d="M-54 8h37M17 8h37M-54 18h39M15 18h39M-45 28h28M17 28h28M-40 10v6M-24 19v7M24 10v6M40 19v7" fill="none" stroke="#eadcc3" stroke-opacity=".22" stroke-width="1.5" stroke-linecap="round"/></g>`,
  aeusserst: `<g class="arcane-architecture"><circle cx="0" cy="0" r="40" fill="none" stroke="#b6a6ca" stroke-opacity=".6" stroke-width="2.5" stroke-dasharray="3 7"/><path d="M-38 30-30-15-19 30Z M-18 30-8-48 4 30Z M10 30 23-31 36 30Z" fill="#786b91" stroke="#e3d6ee" stroke-width="2.5"/><path d="m-30-15 0 16m22-49 0 23m31-6 0 20" stroke="#f5e9ff" stroke-width="3"/><path d="M-43 31h86M-18 31V12h36v19" fill="none" stroke="#d4c2df" stroke-width="2.4"/><rect x="-3" y="-19" width="6" height="13" rx="3" fill="#e8d6a9"/><path d="M-34 7q12-12 24 0m20 0q12-12 24 0" fill="none" stroke="#d7c6e5" stroke-width="2"/></g>`,
  'village-of-sword': `<g class="village-architecture"><path class="village-road" d="M-57 42Q-20 28 8 34T58 23" fill="none" stroke="#b6a07e" stroke-width="8" stroke-linecap="round"/><path d="M-51 27-41 8-21 8-10 24v17h-41Z" fill="#766b58" stroke="#e6d7bd" stroke-width="2"/><path d="M-46 9-31-9-16 9Z" fill="#7d5d49" stroke="#d7c09b" stroke-width="2"/><path d="M-8 29 4 5 29 5 42 25v16H-8Z" fill="#87745d" stroke="#eadcc2" stroke-width="2"/><path d="M-2 6 17-17 36 6Z" fill="#795845" stroke="#e1c8a4" stroke-width="2"/><path d="M38 32 47 16 64 16 72 32v9H38Z" fill="#756b59" stroke="#e8d9bf" stroke-width="2"/><path d="M42 17 55 1 68 17Z" fill="#8a624a" stroke="#ddc49e" stroke-width="2"/><rect x="-36" y="23" width="8" height="12" fill="#293e43"/><rect x="9" y="23" width="9" height="14" fill="#293e43"/><rect x="50" y="26" width="7" height="10" fill="#293e43"/><path class="timber-frame" d="M-48 40V14m9 26V14m-9 13h9M-3 40V12m12 28V12m-12 15H9M43 41V22m9 19V22" fill="none" stroke="#d5c29f" stroke-width="1.6"/><path d="M-57 43h132" stroke="#5d594b" stroke-width="2"/></g>`,
  weise: `<g class="castle-architecture"><path class="castle-wall" d="M-61 35V-7h122v42H49V5H-49v30Z" fill="#7b8580" stroke="#e7e8dd" stroke-width="3"/><path class="battlement" d="M-61-7v-12h10v7h9v-7h10v12m54 0v-12h10v7h9v-7h10v12" fill="#c2c9bc" stroke="#f4f2e8" stroke-width="2"/><path d="M-52-8v-37h20v37m64 0v-37h20v37M-18 35V-27h36v62Z" fill="#adb7ac" stroke="#f0f1e8" stroke-width="3"/><path d="M-57-45-42-66-27-45m54 0 15-21 15 21M-23-27 0-54 23-27Z" fill="#d6ddd1" stroke="#fff" stroke-width="2.5"/><rect x="-45" y="-34" width="7" height="14" fill="#526a6b"/><rect x="38" y="-34" width="7" height="14" fill="#526a6b"/><rect x="-7" y="-16" width="14" height="15" fill="#50676a"/><path class="arched-gate" d="M-12 35V12Q0-5 12 12V35" fill="#40575c" stroke="#f4f0e4" stroke-width="2.5"/><path d="M-57 39h114" stroke="#dce2d6" stroke-width="2"/><path class="castle-masonry-detail" d="M-54 8h37M17 8h37M-54 18h39M15 18h39M-45 28h28M17 28h28M-40 10v6M-24 19v7M24 10v6M40 19v7" fill="none" stroke="#eadcc3" stroke-opacity=".22" stroke-width="1.5" stroke-linecap="round"/></g>`,
  ende: `<g class="castle-architecture"><path class="castle-wall" d="M-68 36V-6h136v42H55V6H-55v30Z" fill="#a9b8b0" stroke="#f2f2e7" stroke-width="3.2"/><path class="battlement" d="M-68-6v-12h11v7h9v-7h11v12m70 0v-12h11v7h9v-7h11v12" fill="#d6dfd4" stroke="#fff" stroke-width="2"/><path d="M-59-7v-42h21v42m76 0v-42h21v42M-22 36V-32h44v68Z" fill="#c2d0c9" stroke="#f7f7ee" stroke-width="3"/><path d="M-65-49-48-70-31-49m62 0 17-21 17 21M-28-32 0-59 28-32Z" fill="#e6ece4" stroke="#fff" stroke-width="2.5"/><rect x="-51" y="-37" width="7" height="16" fill="#61797a"/><rect x="44" y="-37" width="7" height="16" fill="#61797a"/><rect x="-8" y="-19" width="16" height="16" fill="#61797a"/><path class="arched-gate" d="M-13 36V12Q0-7 13 12V36" fill="#435d62" stroke="#f6f4e9" stroke-width="2.5"/><path d="M-63 40h126" stroke="#e7eee5" stroke-width="2"/><path class="castle-masonry-detail" d="M-54 8h37M17 8h37M-54 18h39M15 18h39M-45 28h28M17 28h28M-40 10v6M-24 19v7M24 10v6M40 19v7" fill="none" stroke="#eadcc3" stroke-opacity=".22" stroke-width="1.5" stroke-linecap="round"/></g>`,
  'demon-kings-castle': `<g class="castle-architecture demon-fortress"><path class="castle-wall" d="M-73 38V-9h146v47H59V3H-59v35Z" fill="#493d48" stroke="#c58d8c" stroke-width="3.5"/><path class="battlement" d="M-73-9v-15h12v8h10v-8h12v15m78 0v-15h12v8h10v-8h12v15" fill="#72535d" stroke="#dca5a0" stroke-width="2.5"/><path d="M-64-10v-46h24v46m80 0v-46h24v46M-25 38V-31h50v69Z" fill="#71515c" stroke="#d9a3a0" stroke-width="3"/><path d="M-70-56-52-82-34-56m68 0 18-26 18 26M-32-31 0-66 32-31Z" fill="#9b5960" stroke="#e5b2a5" stroke-width="2.8"/><rect x="-56" y="-42" width="9" height="18" fill="#202d3a"/><rect x="47" y="-42" width="9" height="18" fill="#202d3a"/><rect x="-9" y="-19" width="18" height="18" fill="#202d3a"/><path class="arched-gate" d="M-15 38V10Q0-13 15 10V38" fill="#202d3a" stroke="#e2b7a8" stroke-width="3"/><path d="M-7 9V-14m-8 8h30M-69 42h138" stroke="#f0c7a2" stroke-width="2.5"/><path d="M-43-6v-18m86 18v-18" stroke="#d28a87" stroke-width="2"/><path class="castle-masonry-detail" d="M-54 8h37M17 8h37M-54 18h39M15 18h39M-45 28h28M17 28h28M-40 10v6M-24 19v7M24 10v6M40 19v7" fill="none" stroke="#eadcc3" stroke-opacity=".22" stroke-width="1.5" stroke-linecap="round"/><path d="M-62 3V-35h9v38m106 0v-38h9V3M-24-27h8v14h-8Zm40 0h8v14h-8Z" fill="#392f3b" stroke="#d6a19a" stroke-width="2"/><path d="M-73-10h146M-73-3h146M-60 37h120" fill="none" stroke="#d7a39a" stroke-opacity=".65" stroke-width="2.2"/><path d="M-40-46v-12m80 12v-12M-5-61h10" stroke="#e7b5a7" stroke-width="2.4" stroke-linecap="round"/><g class="castle-ember-lights" fill="#e7a16e" opacity=".78"><rect x="-54" y="-40" width="5" height="13" rx="1"/><rect x="49" y="-40" width="5" height="13" rx="1"/><rect x="-4" y="-17" width="8" height="13" rx="1"/></g></g>`
});

const ATLAS_SETTLEMENT_VISUAL_ANCHORS = Object.freeze({
  // These inset anchors keep the large fortress silhouette clear of the clipped eastern coastline.
  'demon-kings-castle':{x:82,y:30},
  ende:{x:85,y:27}
});
export function getAtlasSettlementVisualPosition(place,markerPositions=[]) {
  const safeAnchor=ATLAS_SETTLEMENT_VISUAL_ANCHORS[place.key];
  if(safeAnchor)return {...place,...safeAnchor};
  return markerPositions.find(marker=>marker.key===place.key)||place;
}
function buildAtlasSettlementSilhouettes(settlements=FRIEREN_WORLD_SETTLEMENTS,markerPositions=[]) {
  const groups=settlements.filter(place=>settlementSilhouetteTemplates[place.key]).map(place=>{
    const position=getAtlasSettlementVisualPosition(place,markerPositions);
    const x=Math.round(Number(position.x)*18);
    const y=Math.round(Number(position.y)*12);
    const scale=place.key==='ende' ? 0.84 : place.key==='demon-kings-castle' ? 0.9 : 1;
    return `<g class="atlas-settlement-silhouette atlas-settlement-${place.key}" data-settlement="${place.key}" transform="translate(${x} ${y}) scale(${scale})">${settlementSilhouetteTemplates[place.key]}</g>`;
  }).join('');
  return `<g class="atlas-settlement-architecture atlas-settlement-silhouettes atlas-demon-fortress-safe-inset" aria-hidden="true" pointer-events="none">${groups}</g>`;
}

export function getAtlasBiomeCompletionPercent(item={}) {
  const bosses=Array.isArray(item.bosses)?item.bosses:[];
  const rareItems=Array.isArray(item.rareItems)?item.rareItems:[];
  // Dungeon wins are currently supplied as a character-wide total, not keyed by region.
  // Exclude them until the data model exposes per-dungeon completion records.
  const total=1+bosses.length+rareItems.length;
  const completed=(item.discovered||Number(item.visits)>0?1:0)+
    bosses.filter(boss=>boss.defeated).length+
    rareItems.filter(loot=>Number(loot.ownedQuantity)>0).length;
  return Math.max(0,Math.min(100,Math.round(completed/total*100)));
}

function buildAtlasBiomeLabels(points) {
  const anchors = Object.freeze({
    orman:{x:27.5,y:37.25}, merkez:{x:31.25,y:76.25}, harabeler:{x:49.25,y:55.25},
    kuzey:{x:59,y:23.75}, yayla:{x:77,y:71.75}, aus:{x:82,y:34}
  });
  return '<div class="atlas-biome-label-layer" aria-label="Biyom adları ve tamamlanma yüzdeleri">'+points.map(({item,geo})=>{
    const anchor=anchors[item.region.key];
    if(!anchor)return '';
    const progress=getAtlasBiomeCompletionPercent(item);
    const name=escapeHtml(geo.name);
    return '<div class="atlas-biome-label" data-atlas-biome-label="'+escapeHtml(item.region.key)+'" style="left:'+anchor.x+'%;top:'+anchor.y+'%" aria-label="'+name+' · Tamamlanma '+progress+'%"><strong>'+name+'</strong><small>Tamamlanma '+progress+'%</small></div>';
  }).join('')+'</div>';
}

export function renderExplorationAtlas({mapContent,stats={},esc=escapeHtml}={}) {
  const rows=Array.isArray(mapContent?.regions)?mapContent.regions:[];
  const total=Math.max(1,Number(mapContent?.summary?.totalRegions)||rows.length||1);
  const discovered=Math.max(0,Number(mapContent?.summary?.discoveredRegions)||0);
  const percent=Math.max(0,Math.min(100,Math.round(discovered/total*100)));
  const points=rows.map((item,index)=>({item,geo:REGIONS[item.region.key]||REGIONS.merkez,index}));
  const markerConfigs = [
    ...points.map(({item,geo})=>({
      id:'region:'+item.region.key,key:item.region.key,label:geo.name,type:'region',icon:'✦',
      x:geo.x,y:geo.y,focus:'region',extraClass:geo.className
    })),
    ...FRIEREN_WORLD_SETTLEMENTS.map(place=>({
      id:'city:'+place.key,key:place.key,targetKey:place.key,label:place.name,type:'city',icon:'⌂',
      x:place.key==='ende'?85:place.key==='demon-kings-castle'?82:place.x,y:place.key==='ende'?27:place.key==='demon-kings-castle'?30:place.y,focus:'city',subtitle:place.subtitle
    })),
    ...points.flatMap(({item})=>item.bosses.map(boss=>{
      const location=resolveAtlasBossLocation(boss);
      const anchor=REGION_ANCHORS[item.region.key]||REGION_ANCHORS.merkez;
      const point=location||{x:anchor.x,y:anchor.y,place:'Bölge boss alanı'};
      const archetypes = {
        level_1:['wildbeast','🐺'], level_10:['ancient','🗿'], level_20:['demon','👹'],
        level_35:['warlord','🩸'], level_50:['arcane','♛'], 'north-general':['general','⚔'],
        'glass-wyrm':['wyrm','🐉'], 'fallen-mage':['fallen','🪽'], zeldeila:['apex','♾'],
        domaltazor:['executioner','🦴'], 'the-fool':['trickster','🃏']
      };
      const [archetype,icon]=archetypes[boss.key]||['unknown','☠'];
      return {id:'boss:'+boss.key,key:item.region.key,targetKey:boss.key,label:boss.name,type:'boss',icon,x:point.x,y:point.y,focus:'boss',extraClass:'boss-archetype-'+archetype+(boss.defeated?' is-defeated':''),subtitle:point.place};
    })),
    ...points.flatMap(({item})=>item.dungeons.map((dungeon,index)=>{
      const fallback={merkez:[{x:37,y:88},{x:42,y:83}],orman:[{x:21,y:58},{x:27,y:62}],harabeler:[{x:64,y:56},{x:59,y:62}],kuzey:[{x:72,y:46},{x:76,y:50}],yayla:[{x:82,y:76},{x:86,y:72}],aus:[{x:92,y:44},{x:89,y:50}]};
      const slots=fallback[item.region.key]||fallback.merkez;
      const point=dungeon.location||FRIEREN_WORLD_DUNGEON_LOCATIONS[dungeon.key]||slots[index%slots.length];
      return {id:'dungeon:'+dungeon.key,key:item.region.key,targetKey:dungeon.key,label:dungeon.name,type:'dungeon',icon:'◇',x:point.x,y:point.y,focus:'dungeon',subtitle:point.place};
    })),
    ...ATLAS_HISTORICAL_EVENTS.map(event=>({id:'event:'+event.id,key:event.regionKey,targetKey:event.id,label:event.title,type:'event',icon:'◷',x:event.x,y:event.y,focus:'event',subtitle:event.episodeLabel}))
  ];
  const arrangedMarkers=declutterAtlasPins(markerConfigs);
  const markerPins=arrangedMarkers.map(marker=>pin(marker)).join('');
  const fogPaths=points.filter(point=>!point.item.discovered).map(point=>{
    const path=FOG_PATHS[point.item.region.key];
    return path?'<path d="'+path+'" fill="#243647" opacity=".18" stroke="#d4c4a1" stroke-opacity=".16" stroke-width=".35"/>':'';
  }).join('');
  const fog='<svg class="atlas-fog-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><defs><filter id="atlas-fog-soft"><feGaussianBlur stdDeviation="1.2"/></filter></defs><g filter="url(#atlas-fog-soft)">'+fogPaths+'</g></svg>';
  const panels=points.map(point=>panel(point.item,point.index,FRIEREN_WORLD_SETTLEMENTS,ATLAS_HISTORICAL_EVENTS,esc)).join('');
  const localDetailOverlay = buildAtlasLocalDetailLayer(FRIEREN_WORLD_SETTLEMENTS);
  const settlementSilhouettes = buildAtlasSettlementSilhouettes(FRIEREN_WORLD_SETTLEMENTS,arrangedMarkers.filter(marker=>marker.type==='city'));
  const biomeLabels = buildAtlasBiomeLabels(points);
  const geographyOverlay = `<svg class="atlas-geography-overlay" viewBox="0 0 1800 1200" preserveAspectRatio="none" aria-hidden="true"><defs><clipPath id="atlas-inline-land-clip"><path d="M206 292C259 221 371 179 492 198 585 133 718 129 832 163 940 100 1075 119 1170 157 1304 107 1442 167 1524 248 1632 309 1665 412 1618 516 1677 625 1634 741 1582 826 1631 929 1521 1033 1390 1038 1284 1104 1160 1073 1073 1043 948 1118 825 1086 739 1032 624 1092 505 1057 414 1000 300 989 220 901 233 793 159 708 160 590 192 501 139 412 151 339 206 292Z"/></clipPath>
 <linearGradient id="atlas-biome-forest-wash" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#315c43" stop-opacity=".42"/><stop offset="1" stop-color="#4e7551" stop-opacity=".1"/></linearGradient>
 <linearGradient id="atlas-biome-plains-wash" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#d4c58b" stop-opacity=".24"/><stop offset="1" stop-color="#8da77a" stop-opacity=".22"/></linearGradient>
 <linearGradient id="atlas-biome-tundra-wash" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#dce8e5" stop-opacity=".42"/><stop offset="1" stop-color="#9fb9b7" stop-opacity=".12"/></linearGradient>
 <linearGradient id="atlas-biome-highland-wash" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#9d9b7c" stop-opacity=".22"/><stop offset="1" stop-color="#687f72" stop-opacity=".2"/></linearGradient>
 <linearGradient id="atlas-biome-mountain-wash" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#647d7e" stop-opacity=".3"/><stop offset="1" stop-color="#405c63" stop-opacity=".18"/></linearGradient>
 <radialGradient id="atlas-ashen-wash"><stop stop-color="#1c2029" stop-opacity=".88"/><stop offset=".58" stop-color="#30303a" stop-opacity=".62"/><stop offset="1" stop-color="#3d3940" stop-opacity="0"/></radialGradient>
 <filter id="atlas-biome-edge-soft"><feGaussianBlur stdDeviation="24"/></filter>
 <filter id="atlas-demon-haze"><feGaussianBlur stdDeviation="18"/></filter>
 </defs><g clip-path="url(#atlas-inline-land-clip)" pointer-events="none">
 <g class="atlas-biome-regions" data-atlas-geography-layer="biomes">
  <path class="atlas-biome atlas-biome-forest" d="M115 245C245 155 440 165 585 230S810 335 815 485 735 725 555 785 285 745 175 615 90 385 115 245Z" fill="url(#atlas-biome-forest-wash)"/>
  <path class="atlas-biome atlas-biome-central-plains" d="M105 605C285 530 470 580 635 650S900 650 1050 750 1235 945 1150 1090 845 1165 600 1115 295 1085 160 950 75 755 105 605Z" fill="url(#atlas-biome-plains-wash)"/>
  <path class="atlas-biome atlas-biome-northern-tundra" d="M515 78C770 45 975 100 1140 110S1475 65 1650 195 1740 405 1625 565 1370 615 1170 535 895 590 730 475 515 300 515 78Z" fill="url(#atlas-biome-tundra-wash)"/>
  <path class="atlas-biome atlas-biome-highlands" d="M410 390C590 285 810 335 965 405S1200 425 1345 560 1390 765 1235 880 935 860 765 810 530 830 410 675 325 485 410 390Z" fill="url(#atlas-biome-highland-wash)"/>
  <path class="atlas-biome atlas-biome-eastern-mountains" d="M890 440C1080 355 1300 395 1475 480S1715 635 1690 835 1515 1080 1315 1105 1060 1005 1020 840 810 570 890 440Z" fill="url(#atlas-biome-mountain-wash)"/>
  <path class="atlas-biome atlas-biome-ashen-north" d="M1175 82C1370 45 1575 110 1700 235S1750 475 1620 575 1395 580 1275 480 1155 285 1175 82Z" fill="url(#atlas-ashen-wash)" opacity=".82"/>
  <g class="atlas-biome-transition" fill="none" stroke-linecap="round" stroke-linejoin="round" filter="url(#atlas-biome-edge-soft)" opacity=".48">
   <path d="M500 230C660 345 710 505 600 690" stroke="#66805b" stroke-width="68"/>
   <path d="M555 660C760 600 930 690 1085 850" stroke="#c6b88c" stroke-width="76"/>
   <path d="M735 145C925 315 1035 425 1195 500" stroke="#b7c9c2" stroke-width="72"/>
   <path d="M1080 445C1250 555 1365 720 1320 930" stroke="#74877c" stroke-width="78"/>
   <path d="M310 560C480 500 650 560 780 650" stroke="#7f9870" stroke-width="58"/>
  </g>
 </g>
 <g class="atlas-demon-wastes" data-atlas-geography-layer="demon-wastes">
  <path class="atlas-ashen-ground" d="M1190 155C1320 85 1535 110 1660 245 1720 335 1685 470 1585 535 1470 590 1300 520 1230 425 1165 340 1145 235 1190 155Z" fill="#10141e" opacity=".78"/>
  <path class="atlas-demon-fog" d="M1155 205C1320 85 1575 115 1700 275S1680 530 1510 585 1220 500 1165 365Z" fill="url(#atlas-ashen-wash)" filter="url(#atlas-demon-haze)"/>
  <g class="atlas-dead-tree" stroke="#29252c" stroke-linecap="round" stroke-linejoin="round" fill="none">
   <path d="M1350 420l8-56-18-23 20 10 8-37 4 36 22-16-18 29 7 58m-15-62-21-16m32 1 19-18" stroke-width="7"/>
   <path d="M1435 360l5-48-16-20 18 9 6-33 4 33 18-14-15 25 5 48m-15-48-18-14m29 3 16-17" stroke-width="6"/>
   <path d="M1510 455l7-60-20-25 22 11 7-40 5 39 21-17-17 30 8 62m-17-62-22-17m36 1 18-18" stroke-width="8"/>
   <path d="M1580 350l5-43-14-19 16 8 6-31 3 30 18-12-14 23 5 44m-13-43-16-13m28 0 15-14" stroke-width="5"/>
   <path d="M1320 300l4-35-13-17 15 7 5-26 3 26 15-11-12 20 4 36" stroke-width="5"/>
  </g>
  <g fill="none" stroke="#786b68" stroke-opacity=".58" stroke-width="3">
   <path d="M1300 470l55-28 44 16 38-34 50 18 43-32 60 20"/>
   <path d="M1335 510l36-17 38 12 35-20 47 15 38-22"/>
  </g>
  <g fill="#22232b" stroke="#6f5960" stroke-opacity=".5" stroke-width="2">
   <path d="M1370 465q18-22 35-2l-9 21h-24Z"/><path d="M1460 495q20-25 39-2l-10 24h-27Z"/>
   <path d="M1550 475q16-18 31-1l-8 19h-22Z"/>
  </g>
 </g>
 <g data-atlas-geography-layer="waterways" class="atlas-waterways">
  <path d="M1010 190C995 255 965 300 925 345S870 430 850 495 790 590 735 645 665 730 620 785 535 850 480 900" fill="none" stroke="#385d67" stroke-opacity=".48" stroke-width="18" stroke-linecap="round"/>
  <path class="atlas-river-main" d="M1010 190C995 255 965 300 925 345S870 430 850 495 790 590 735 645 665 730 620 785 535 850 480 900" fill="none" stroke="url(#river)" stroke-width="8" stroke-linecap="round"/>
  <path d="M1010 190C995 255 965 300 925 345S870 430 850 495 790 590 735 645 665 730 620 785 535 850 480 900" fill="none" stroke="#d5e5d9" stroke-opacity=".5" stroke-width="1.6" stroke-linecap="round"/>
  <path d="M1290 280C1250 330 1210 365 1165 390S1080 445 1045 500 1000 570 960 610" fill="none" stroke="#456e78" stroke-opacity=".34" stroke-width="12" stroke-linecap="round"/>
  <path d="M1290 280C1250 330 1210 365 1165 390S1080 445 1045 500 1000 570 960 610" fill="none" stroke="#86aeb1" stroke-width="5" stroke-linecap="round"/>
  <path d="M690 650C650 625 615 600 580 565S520 520 485 500" fill="none" stroke="#8bb0ad" stroke-opacity=".76" stroke-width="4" stroke-linecap="round"/>
  <g class="atlas-lake" fill="#6f9ba0" stroke="#d0ded0" stroke-opacity=".7" stroke-width="3">
   <path d="M1125 350c24-19 58-17 75 3 13 16 2 39-22 47-26 9-57-3-65-22-7-12-2-21 12-28Z"/>
   <path d="M790 565c18-13 42-10 54 4 9 12 1 27-17 32-20 6-43-2-48-15-4-8 1-16 11-21Z"/>
   <path d="M1360 730c17-12 40-8 49 5 7 12-2 25-18 29-19 4-39-5-42-17-2-7 2-13 11-17Z"/>
  </g>
  <g fill="none" stroke="#d5e7d9" stroke-opacity=".5" stroke-width="2"><path d="M1138 365q23-15 44 0M800 578q16-10 30 0M1368 740q15-9 29 0"/></g>
 </g>
 <g data-atlas-geography-layer="trails" class="atlas-trails" fill="none" stroke-linecap="round" stroke-linejoin="round">
  <path d="M440 930C475 870 500 830 540 790S620 735 670 700 740 620 770 570 820 500 870 470" stroke="#655b43" stroke-opacity=".5" stroke-width="9"/>
  <path d="M440 930C475 870 500 830 540 790S620 735 670 700 740 620 770 570 820 500 870 470" stroke="#d2b985" stroke-opacity=".85" stroke-width="4" stroke-dasharray="3 9"/>
  <path d="M1035 285C1080 325 1105 375 1130 430S1180 520 1240 570" stroke="#655b43" stroke-opacity=".42" stroke-width="7"/>
  <path d="M1035 285C1080 325 1105 375 1130 430S1180 520 1240 570" stroke="#d0b886" stroke-opacity=".72" stroke-width="3" stroke-dasharray="2 9"/>
  <path d="M790 590C825 560 850 525 875 485" stroke="#e8e0c9" stroke-opacity=".8" stroke-width="2" stroke-dasharray="2 8"/>
 </g>
 <g data-atlas-geography-layer="settled-land" class="atlas-settled-land">
  <!-- Foothills blend the Schwer highlands into the central valleys. -->
  <path class="atlas-foothill-transition" d="M620 480C690 430 760 430 820 465S930 520 1000 500 1115 535 1140 600 1090 700 1015 730 880 690 815 730 690 700 640 640Z" fill="#8d9b78" opacity=".2" stroke="#e0d3ad" stroke-opacity=".24" stroke-width="5"/>
  <path d="M650 510C720 465 780 475 835 505S945 555 1010 535M670 545C740 505 795 510 850 540S950 580 1035 560M700 585C760 555 815 555 870 580S960 610 1060 590" fill="none" stroke="#596e55" stroke-opacity=".24" stroke-width="3"/>
  <!-- Small field mosaics sit around the established central settlement corridor. -->
  <g class="atlas-field-mosaic" fill="#c6b77f" stroke="#7c805c" stroke-opacity=".55" stroke-width="2" opacity=".34">
   <path d="M345 825q42-22 88-5l-10 42q-48 12-83-8Z"/>
   <path d="M390 875q39-20 79-4l-9 36q-43 13-77-7Z"/>
   <path d="M465 820q37-17 68 2l-12 35q-37 8-64-8Z"/>
   <path d="M300 890q31-17 59-4l-8 31q-32 8-57-7Z"/>
  </g>
  <g fill="none" stroke="#e5d7ae" stroke-opacity=".46" stroke-width="1.5"><path d="M352 831l-5 29m20-35-5 34m25-37-4 35m35-28-5 30m-15 25-5 29m23-34-5 34m35-38-5 34"/></g>
  ${settlementSilhouettes}
 </g>
 <g data-atlas-geography-layer="terrain-details" class="atlas-terrain-details">
  <!-- Fan-made relief details; no new canonical locations or encounter coordinates. -->
  <path d="M1190 360C1155 415 1135 470 1090 520S1035 620 985 680 940 755 900 810" fill="none" stroke="#354e4e" stroke-opacity=".42" stroke-width="34" stroke-linecap="round"/>
  <path d="M1190 360C1155 415 1135 470 1090 520S1035 620 985 680 940 755 900 810" fill="none" stroke="#9b987b" stroke-opacity=".42" stroke-width="15" stroke-linecap="round"/>
  <path d="M1190 360C1155 415 1135 470 1090 520S1035 620 985 680 940 755 900 810" fill="none" stroke="#d5c9a4" stroke-opacity=".32" stroke-width="2" stroke-dasharray="5 12"/>
  <g class="atlas-waterfall" fill="none" stroke-linecap="round">
   <path d="M850 495q-10 18-23 31m17-27q-3 22-17 38m25-34q-1 18-8 30" stroke="#d8e7df" stroke-opacity=".82" stroke-width="4"/>
   <path d="M1045 500q-8 15-19 24m15-20q-2 18-13 31m21-28q-1 13-7 23" stroke="#d8e7df" stroke-opacity=".72" stroke-width="3"/>
   <path d="M817 531q15-8 28 0m175-3q12-7 25 0" stroke="#e9eee0" stroke-opacity=".55" stroke-width="5"/>
  </g>
  <g class="atlas-regional-flora">
   <g fill="#315b43" stroke="#a8b68b" stroke-opacity=".28" stroke-width="2">
    <path d="M370 410q-15-27 7-42 5-22 27-14 20-14 34 6 24 2 19 26 14 22-10 33-12 22-34 11-24 12-32-10-23 2-11-10Z"/>
    <path d="M450 475q-13-22 6-34 4-20 24-13 16-12 28 5 19 2 16 21 11 18-8 28-10 18-28 9-19 9-25-8-18 2-13-8Z"/>
    <path d="M520 390q-10-18 5-28 3-16 19-11 13-10 22 4 16 1 13 18 9 14-7 22-8 15-23 8-15 7-20-7-14 1-9-6Z"/>
   </g>
   <g fill="none" stroke="#c3c69a" stroke-opacity=".46" stroke-width="2"><path d="M387 408q12-18 27-19m47 79q11-14 25-16m40-64q9-11 19-11"/></g>
  </g><g class="atlas-ruin-remnants" fill="none" stroke="#a9a18a" stroke-opacity=".58" stroke-width="5">
   <path d="M965 520q28-34 60-4m-60 4 5 28m55-32-4 30M982 548l35-2"/>
   <path d="M1050 570q25-27 48-2m-47 2 4 22m43-24-2 21"/>
   <path d="M970 512l-7-10m65 10 8-12m-37 44 1 10"/>
  </g>
 <g data-atlas-detail-level="regional" class="atlas-zoom-detail-layer atlas-zoom-detail-regional">
  <path d="M870 450C940 420 1015 400 1080 410M720 760C780 720 850 705 920 720M1160 760C1230 730 1300 730 1360 760" fill="none" stroke="#f1e7ca" stroke-opacity=".55" stroke-width="2" stroke-dasharray="5 10"/>
  <g fill="#f3e9cf" stroke="#3b4a45" stroke-opacity=".72" stroke-width="1.4" paint-order="stroke" font-family="Georgia,serif" font-size="20" letter-spacing="2">
   <text x="870" y="430">RIEGEL KANYONU</text><text x="1180" y="350">OFFEN DAĞLARI</text><text x="1320" y="650">KUZEY PLATOSU</text>
  </g>
 </g>
 <g data-atlas-detail-level="local" class="atlas-zoom-detail-layer atlas-zoom-detail-local">
  <g fill="#f5edda" stroke="#263a3d" stroke-opacity=".82" stroke-width="2" paint-order="stroke" font-family="Georgia,serif" font-size="16" letter-spacing="1.5">
   <text x="850" y="520">KÜÇÜK GEÇİT YOLU</text><text x="1060" y="600">KRALIN MEZARI HARABELERİ</text><text x="690" y="940">YERLEŞİM TARLALARI</text>
  </g>
  <g fill="none" stroke="#f1e6c8" stroke-opacity=".52" stroke-width="2"><path d="M830 535q28-24 58-4t62-3M1010 615q30-20 58-3t52-2M650 980q40-18 80-4t70-2"/></g>
 </g>
 </g></g></svg>`;
  const routeCatalog={};
  for(const from of ATLAS_ROUTE_STOPS)for(const to of ATLAS_ROUTE_STOPS){const route=findAtlasRoute(from.id,to.id);if(route)routeCatalog[from.id+":"+to.id]={distanceUnits:route.distanceUnits,nodes:route.nodes.map(node=>({id:node.id,label:node.label,x:node.x,y:node.y}))};}
  const routeOptions=ATLAS_ROUTE_STOPS.map(stop=>'<option value="'+esc(stop.id)+'">'+esc(stop.label)+'</option>').join('');
  const routeControls='<section class="atlas-route-planner" data-atlas-route-planner data-atlas-route-catalog="'+esc(JSON.stringify(routeCatalog))+'"><div><span class="eyebrow">YOLCULUK PLANI</span><h3>Rota ve mesafe hesapla</h3><p>Anime kaynaklarında adı geçen yerleri bağlayan fan yapımı yol/geçit şemasıdır. Mesafe, ölçeği resmî olmayan atlasın harita birimidir; kilometre ölçeği belirtilmemiştir.</p></div><label>Başlangıç<select data-atlas-route-from aria-label="Rota başlangıç noktası">'+routeOptions+'</select></label><label>Varış<select data-atlas-route-to aria-label="Rota varış noktası">'+routeOptions.replace('<option value="ende">','<option value="ende" selected>')+'</select></label><div class="atlas-route-actions"><button type="button" data-atlas-route-submit>Rotayı hesapla</button><button type="button" data-atlas-route-clear>Temizle</button></div><label class="atlas-route-calibration">Ölçek kalibrasyonu (km / 100 harita birimi)<input type="number" min="0.1" step="0.1" inputmode="decimal" data-atlas-reference-km placeholder="Örn. 8" aria-label="100 harita birimi başına bilinen kilometre"></label><p class="atlas-route-calibration-note">Bilinen bir ölçek değerin varsa 100 harita biriminin kaç kilometre olduğunu gir. Doğrulanmış kaynak değeri olmadığı için varsayılan kilometre tahmini üretilmez.</p><p class="atlas-route-summary" data-atlas-route-summary role="status" aria-live="polite">Bir başlangıç ve varış noktası seçerek yolculuğu haritada göster.</p></section>';
  const routeOverlay='<svg class="atlas-route-overlay" viewBox="0 0 1800 1200" preserveAspectRatio="none" aria-hidden="true" hidden><path class="atlas-route-glow" data-atlas-route-glow d="" /><path class="atlas-route-line" data-atlas-route-path d="" /><circle class="atlas-route-endpoint" data-atlas-route-start cx="0" cy="0" r="13"/><circle class="atlas-route-endpoint" data-atlas-route-end cx="0" cy="0" r="13"/></svg>';
  const map='<div class="atlas-map-viewport" data-atlas-viewport tabindex="0" role="region" aria-label="Frieren anime dünyası ve RPG keşif haritası"><div class="atlas-map-camera" data-atlas-camera><div class="atlas-map-art atlas-world-map" data-atlas-weather="clear" data-atlas-season="summer" data-atlas-lighting="day" data-atlas-zoom-detail="overview" data-atlas-zoom-regional="1.35" data-atlas-zoom-local="2.2" role="group" aria-label="Frieren dünyasının anime yerleşimleri, dağları, ormanları ve yolları"><img class="atlas-map-image" src="/assets/frieren-world-map.svg?v=atlas-377-1" alt="Frieren dünyasından esinlenen Merkez Topraklar, Kuzey Toprakları, Größe Ormanı, Kühl Bölgesi, Schwer Dağları ve Ende haritası" draggable="false">'+geographyOverlay+localDetailOverlay+routeOverlay+biomeLabels+'<div class="atlas-atmosphere-layer" aria-hidden="true"></div><div class="atlas-weather-layer" aria-hidden="true"></div>'+fog+'<div class="atlas-pin-layer">'+markerPins+'</div></div></div><div class="atlas-map-tools" aria-label="Harita yakınlaştırma kontrolleri"><button type="button" data-atlas-zoom="-1" aria-label="Uzaklaştır">−</button><output data-atlas-zoom-value>100%</output><button type="button" data-atlas-zoom="1" aria-label="Yakınlaştır">+</button><button type="button" data-atlas-reset aria-label="Haritayı sıfırla">Sıfırla</button></div></div><div class="atlas-layer-controls" aria-label="Harita işaret katmanları"><span>GÖSTER</span><button type="button" data-atlas-layer="region" aria-pressed="true">RPG Bölgeleri</button><button type="button" data-atlas-layer="city" aria-pressed="true">Anime Yerleşimleri</button><button type="button" data-atlas-layer="boss" aria-pressed="true">Bosslar</button><button type="button" data-atlas-layer="dungeon" aria-pressed="true">Zindanlar</button><button type="button" data-atlas-layer="event" aria-pressed="true">Anime olayları</button><button type="button" data-atlas-geography="waterways" aria-pressed="true">Nehirler ve göller</button><button type="button" data-atlas-geography="trails" aria-pressed="true">Yollar ve geçitler</button><button type="button" data-atlas-geography="settled-land" aria-pressed="true">Arazi geçişleri</button><button type="button" data-atlas-geography="terrain-details" aria-pressed="true">Kanyonlar, şelaleler ve kalıntılar</button><label class="atlas-atmosphere-control">Mevsim <select data-atlas-season aria-label="Harita mevsimi"><option value="spring">İlkbahar</option><option value="summer" selected>Yaz</option><option value="autumn">Sonbahar</option><option value="winter">Kış</option></select></label><label class="atlas-atmosphere-control">Hava <select data-atlas-weather aria-label="Harita hava görünümü"><option value="clear">Açık</option><option value="mist">Sis</option><option value="snow">Kar</option><option value="rain">Yağmur</option></select></label><button type="button" data-atlas-lighting-toggle aria-pressed="false">Gece görünümü</button><small>İşaretleri seçerek ayrıntıları aç. Haritayı sürükle veya iki parmakla yakınlaştır.</small></div>';
  const routePanel=routeControls;
  const legend='<div class="atlas-legend"><span><i class="key-region">✦</i>RPG bölgesi</span><span><i class="key-city">⌂</i>Anime yerleşimi</span><span><i class="key-boss">☠</i>RPG bossu</span><span><i class="key-dungeon">◇</i>RPG zindanı</span><span><i class="key-event">◷</i>Anime tarihsel olayı</span><small>Harita yerleşimleri anime coğrafyasına dayalı fan yapımı konumlandırmadır.</small></div>';
  const modal='<div class="atlas-modal" data-atlas-modal hidden><button class="atlas-backdrop" type="button" data-atlas-close aria-label="Pencereyi kapat"></button><section class="atlas-modal-card" role="dialog" aria-modal="true" aria-label="Bölge ayrıntıları"><header><span>FRIEREN · KEŞİF KAYDI</span><button type="button" data-atlas-close aria-label="Kapat">×</button></header><div class="atlas-modal-content">'+panels+'</div></section></div>';
  return '<section class="section atlas-section" id="exploration-map" data-exploration-atlas><div class="section-head"><span class="eyebrow">FRIEREN · DÜNYA ATLASI</span><h2>Frieren Dünyası</h2><p>Anime coğrafyasını temel alan dünya haritası; Poğaça Frieren RPG keşif bölgeleri, bossları ve zindanlarıyla bağlantılı.</p></div><div class="atlas-progress"><div class="atlas-progress-copy"><span>SEÇİLİ KARAKTER · KEŞİF DURUMU</span><strong>'+percent+'% keşfedildi</strong></div><div class="atlas-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+percent+'" aria-label="Keşfedilen bölgeler"><i style="width:'+percent+'%"></i></div><small>'+discovered+' / '+rows.length+' RPG bölgesi · Yenilen bosslar: '+Number(mapContent?.summary?.defeatedBosses||0)+' / '+Number(mapContent?.summary?.totalBosses||0)+' · Zindanlar: '+Number(mapContent?.summary?.totalDungeons||0)+' konum · bölge · boss · zindan · Boss zaferleri · karakter geneli: '+Number(stats.boss_defeats||0)+' · Zindan zaferleri · karakter geneli: '+Number(stats.dungeon_wins||0)+'</small></div><article class="atlas-map-shell"><span class="atlas-map-paper atlas-paper" aria-hidden="true"></span>'+map+routePanel+legend+'</article>'+'<div class="atlas-ecology-summary" data-atlas-ecology-summary aria-live="polite">'+Object.entries(REGIONS).map(([key,region])=>'<span data-atlas-ecology-profile="'+key+'">'+escapeHtml(region.name)+': '+escapeHtml(getAtlasEcologyProfile(key,'summer','clear').vegetation)+'</span>').join('')+'</div>'+renderRegionList(rows,esc)+modal+'</section>';
}
