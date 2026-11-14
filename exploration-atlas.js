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
  strahl: `<path d="M-39 8-24-5-9 8v21h-30Z M-4 12 11-1 27 12v19H-4Z M30 8 42-2 55 8v23H30Z" fill="#8b7658" stroke="#ead9b6" stroke-width="2.6"/><path d="m-24-5 15 13m-15-13-15 13M11-1l16 13M42-2l13 10" fill="none" stroke="#f2e5c8" stroke-width="2.5"/><path d="M-1 31V17h9v14m-40 0V18h8v13m56 0V18h8v13" fill="#5c5145" stroke="#d6c5a3" stroke-width="1.6"/>`,
  'royal-capital': `<path d="M-58 24v-34h116v34h-13V-2H-45v26Z" fill="#82735e" stroke="#e8d8b8" stroke-width="3"/><path d="M-62-10v-22h16v22m92 0v-22h16v22M-10 24V-9h20v33Z" fill="#a58b69" stroke="#f0dfbd" stroke-width="2.6"/><path d="m-62-32 8-14 8 14m76 0 8-14 8 14M-15-9 0-25 15-9" fill="#b89b70" stroke="#f3e4c5" stroke-width="2.5"/><path d="M-40 24V7h12v17m56 0V7h12v17M-4 24V7h8v17" fill="#354b4b" stroke="#d8c7a5" stroke-width="1.8"/>`,
  waal: `<path d="M-43 19v-30h86v30h-10V-2h-66v21Z" fill="#7f7664" stroke="#e4d5b9" stroke-width="2.8"/><path d="M-49-11v-24h17v24m64 0v-24h17v24M-12 19V-4h24v23Z" fill="#a08a6b" stroke="#f0e0c1" stroke-width="2.4"/><path d="m-49-35 8-12 9 12m47 0 8-12 9 12" fill="#b7a07a" stroke="#f1e2c4" stroke-width="2"/><path d="M-34 19V4h8v15m52 0V4h8v15M-4 19V8h8v11" fill="#34474a"/>`,
  'fabel-village': `<path d="M-31 8-17-4-3 8v17h-28Z M4 13 16 2 29 13v13H4Z M-2-14 7-22 16-14v11H-2Z" fill="#947957" stroke="#ead9b7" stroke-width="2.3"/><path d="m-17-4 14 12M16 2l13 11M7-22l9 8" fill="none" stroke="#f0e3c7" stroke-width="2"/><path d="M-21 25V14h7v11m25 1V18h7v8" fill="#40514a"/>`,
  'graf-granat': `<path d="M-48 21v-28h96v28h-11V1h-74v20Z" fill="#77766a" stroke="#e4d9bf" stroke-width="2.8"/><path d="M-53-7v-25h18v25m70 0v-25h18v25M-13 21V-13h26v34Z" fill="#9c8a70" stroke="#eee1c6" stroke-width="2.4"/><path d="m-53-32 9-13 9 13m52 0 9-13 9 13M-16-13 0-29 16-13" fill="#c1aa82" stroke="#f2e6ce" stroke-width="2"/><path d="M-5 21V4h10v17M-39 21V6h8v15m62 0V6h8v15" fill="#354a4a"/>`,
  aeusserst: `<circle cx="0" cy="0" r="38" fill="none" stroke="#b6a6ca" stroke-opacity=".62" stroke-width="2.5" stroke-dasharray="3 7"/><path d="M-35 20-27-21-17 20Z M-13 20-5-39 4 20Z M13 20 23-29 33 20Z" fill="#786b91" stroke="#e3d6ee" stroke-width="2.4"/><path d="m-27-21 0 15m22-33 0 17m28-7 0 17" stroke="#f5e9ff" stroke-width="3"/><path d="M-43 22h86M-18 22V9h36v13" fill="none" stroke="#d4c2df" stroke-width="2.4"/><circle cx="0" cy="-8" r="5" fill="#e8d6a9" stroke="#fff0d0" stroke-width="1.5"/>`,
  'village-of-sword': `<path d="M-34 10-20-3-6 10v18h-28Z M2 13 15 1 28 13v15H2Z M-3-12 7-21 17-12v10H-3Z" fill="#88735b" stroke="#e9d8b7" stroke-width="2.4"/><path d="m-20-3 14 13M15 1l13 12M7-21l10 9" fill="none" stroke="#f2e3c5" stroke-width="2.2"/><path d="M-25 28V15h7v13m25 0V17h7v11" fill="#40514c"/><path d="M-44 31h88" stroke="#d8c6a4" stroke-width="2" stroke-dasharray="3 5"/>`,
  weise: `<path d="M-48 22v-30h96v30h-10V0h-76v22Z" fill="#777e7c" stroke="#e5e4d6" stroke-width="2.8"/><path d="M-54-8v-28h18v28m72 0v-28h18v28M-15 22V-18h30v40Z" fill="#a3aaa0" stroke="#f0eee1" stroke-width="2.4"/><path d="m-54-36 9-14 9 14m54 0 9-14 9 14M-18-18 0-39 18-18" fill="#d1d8cb" stroke="#f8f5e9" stroke-width="2"/><path d="M-5 22V1h10v21M-39 22V5h8v17m62 0V5h8v17" fill="#34484b"/>`,
  ende: `<path d="M-48 24v-28h96v28h-12V2h-72v22Z" fill="#8e9f9d" stroke="#e8f0e9" stroke-width="2.8"/><path d="M-40-4v-30h13v30m54 0v-30h13v30M-12 24V-23h24v47Z" fill="#c0cfca" stroke="#f3f5eb" stroke-width="2.5"/><path d="m-40-34 6-16 7 16m54 0 6-16 7 16M-14-23 0-43 14-23" fill="#e8eee8" stroke="#fff" stroke-width="2"/><path d="M-5 24V1h10v23M-33 24V7h7v17m52 0V7h7v17" fill="#435b60"/>`,
  'demon-kings-castle': `<path d="M-48 22v-28h96v28h-10V0h-76v22Z" fill="#493d48" stroke="#c58d8c" stroke-width="3"/><path d="M-54-6v-32h17v32m74 0v-32h17v32M-15 22V-21h30v43Z" fill="#71515c" stroke="#d8a2a0" stroke-width="2.5"/><path d="m-54-38 8-20 9 20m54 0 8-20 9 20M-18-21 0-47 18-21" fill="#9b5960" stroke="#e5b2a5" stroke-width="2.4"/><path d="M-5 22V-1h10v23M-39 22V4h8v18m62 0V4h8v18" fill="#202d3a"/><path d="M-1-7v-15m-7 7h14" stroke="#f0c7a2" stroke-width="2.5"/>`
});

function buildAtlasSettlementSilhouettes(settlements=FRIEREN_WORLD_SETTLEMENTS,markerPositions=[]) {
  const positions=new Map(markerPositions.map(marker=>[marker.key,marker]));
  const groups=settlements.filter(place=>settlementSilhouetteTemplates[place.key]).map(place=>{
    const position=positions.get(place.key)||place;
    const x=Math.round(Number(position.x)*18);
    const y=Math.round(Number(position.y)*12);
    const scale=place.key==='ende' ? 0.62 : place.key==='demon-kings-castle' ? 0.54 : 1;
    return `<g class="atlas-settlement-silhouette atlas-settlement-${place.key}" data-settlement="${place.key}" transform="translate(${x} ${y}) scale(${scale})">${settlementSilhouetteTemplates[place.key]}</g>`;
  }).join('');
  return `<g class="atlas-settlement-architecture atlas-settlement-silhouettes" aria-hidden="true" pointer-events="none">${groups}</g>`;
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
      x:place.x,y:place.y,focus:'city',subtitle:place.subtitle
    })),
    ...points.flatMap(({item})=>item.bosses.map(boss=>{
      const location=boss.location||FRIEREN_WORLD_BOSS_LOCATIONS[boss.key];
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
  const arrangedMarkers=declutterAtlasPins(markerConfigs);\n  const markerPins=arrangedMarkers.map(marker=>pin(marker)).join('');
  const fogPaths=points.filter(point=>!point.item.discovered).map(point=>{
    const path=FOG_PATHS[point.item.region.key];
    return path?'<path d="'+path+'" fill="#243647" opacity=".18" stroke="#d4c4a1" stroke-opacity=".16" stroke-width=".35"/>':'';
  }).join('');
  const fog='<svg class="atlas-fog-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><defs><filter id="atlas-fog-soft"><feGaussianBlur stdDeviation="1.2"/></filter></defs><g filter="url(#atlas-fog-soft)">'+fogPaths+'</g></svg>';
  const panels=points.map(point=>panel(point.item,point.index,FRIEREN_WORLD_SETTLEMENTS,ATLAS_HISTORICAL_EVENTS,esc)).join('');
  const localDetailOverlay = buildAtlasLocalDetailLayer(FRIEREN_WORLD_SETTLEMENTS);
  const settlementSilhouettes = buildAtlasSettlementSilhouettes(FRIEREN_WORLD_SETTLEMENTS,arrangedMarkers.filter(marker=>marker.type==='city'));
  const geographyOverlay = `<svg class="atlas-geography-overlay" viewBox="0 0 1800 1200" preserveAspectRatio="none" aria-hidden="true"><defs><clipPath id="atlas-inline-land-clip"><path d="M206 292C259 221 371 179 492 198 585 133 718 129 832 163 940 100 1075 119 1170 157 1304 107 1442 167 1524 248 1632 309 1665 412 1618 516 1677 625 1634 741 1582 826 1631 929 1521 1033 1390 1038 1284 1104 1160 1073 1073 1043 948 1118 825 1086 739 1032 624 1092 505 1057 414 1000 300 989 220 901 233 793 159 708 160 590 192 501 139 412 151 339 206 292Z"/></clipPath></defs><g clip-path="url(#atlas-inline-land-clip)" pointer-events="none"><g data-atlas-geography-layer="waterways" class="atlas-waterways">
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
  const map='<div class="atlas-map-viewport" data-atlas-viewport tabindex="0" role="region" aria-label="Frieren anime dünyası ve RPG keşif haritası"><div class="atlas-map-camera" data-atlas-camera><div class="atlas-map-art atlas-world-map" data-atlas-weather="clear" data-atlas-season="summer" data-atlas-lighting="day" data-atlas-zoom-detail="overview" data-atlas-zoom-regional="1.35" data-atlas-zoom-local="2.2" role="group" aria-label="Frieren dünyasının anime yerleşimleri, dağları, ormanları ve yolları"><img class="atlas-map-image" src="/assets/frieren-world-map.svg?v=atlas-376-1" alt="Frieren dünyasından esinlenen Merkez Topraklar, Kuzey Toprakları, Größe Ormanı, Kühl Bölgesi, Schwer Dağları ve Ende haritası" draggable="false">'+geographyOverlay+localDetailOverlay+routeOverlay+'<div class="atlas-atmosphere-layer" aria-hidden="true"></div><div class="atlas-weather-layer" aria-hidden="true"></div>'+fog+'<div class="atlas-pin-layer">'+markerPins+'</div></div></div><div class="atlas-map-tools" aria-label="Harita yakınlaştırma kontrolleri"><button type="button" data-atlas-zoom="-1" aria-label="Uzaklaştır">−</button><output data-atlas-zoom-value>100%</output><button type="button" data-atlas-zoom="1" aria-label="Yakınlaştır">+</button><button type="button" data-atlas-reset aria-label="Haritayı sıfırla">Sıfırla</button></div></div><div class="atlas-layer-controls" aria-label="Harita işaret katmanları"><span>GÖSTER</span><button type="button" data-atlas-layer="region" aria-pressed="true">RPG Bölgeleri</button><button type="button" data-atlas-layer="city" aria-pressed="true">Anime Yerleşimleri</button><button type="button" data-atlas-layer="boss" aria-pressed="true">Bosslar</button><button type="button" data-atlas-layer="dungeon" aria-pressed="true">Zindanlar</button><button type="button" data-atlas-layer="event" aria-pressed="true">Anime olayları</button><button type="button" data-atlas-geography="waterways" aria-pressed="true">Nehirler ve göller</button><button type="button" data-atlas-geography="trails" aria-pressed="true">Yollar ve geçitler</button><button type="button" data-atlas-geography="settled-land" aria-pressed="true">Arazi geçişleri</button><button type="button" data-atlas-geography="terrain-details" aria-pressed="true">Kanyonlar, şelaleler ve kalıntılar</button><label class="atlas-atmosphere-control">Mevsim <select data-atlas-season aria-label="Harita mevsimi"><option value="spring">İlkbahar</option><option value="summer" selected>Yaz</option><option value="autumn">Sonbahar</option><option value="winter">Kış</option></select></label><label class="atlas-atmosphere-control">Hava <select data-atlas-weather aria-label="Harita hava görünümü"><option value="clear">Açık</option><option value="mist">Sis</option><option value="snow">Kar</option><option value="rain">Yağmur</option></select></label><button type="button" data-atlas-lighting-toggle aria-pressed="false">Gece görünümü</button><small>İşaretleri seçerek ayrıntıları aç. Haritayı sürükle veya iki parmakla yakınlaştır.</small></div>';
  const routePanel=routeControls;
  const legend='<div class="atlas-legend"><span><i class="key-region">✦</i>RPG bölgesi</span><span><i class="key-city">⌂</i>Anime yerleşimi</span><span><i class="key-boss">☠</i>RPG bossu</span><span><i class="key-dungeon">◇</i>RPG zindanı</span><span><i class="key-event">◷</i>Anime tarihsel olayı</span><small>Harita yerleşimleri anime coğrafyasına dayalı fan yapımı konumlandırmadır.</small></div>';
  const modal='<div class="atlas-modal" data-atlas-modal hidden><button class="atlas-backdrop" type="button" data-atlas-close aria-label="Pencereyi kapat"></button><section class="atlas-modal-card" role="dialog" aria-modal="true" aria-label="Bölge ayrıntıları"><header><span>FRIEREN · KEŞİF KAYDI</span><button type="button" data-atlas-close aria-label="Kapat">×</button></header><div class="atlas-modal-content">'+panels+'</div></section></div>';
  return '<section class="section atlas-section" id="exploration-map" data-exploration-atlas><div class="section-head"><span class="eyebrow">FRIEREN · DÜNYA ATLASI</span><h2>Frieren Dünyası</h2><p>Anime coğrafyasını temel alan dünya haritası; Poğaça Frieren RPG keşif bölgeleri, bossları ve zindanlarıyla bağlantılı.</p></div><div class="atlas-progress"><div class="atlas-progress-copy"><span>SEÇİLİ KARAKTER · KEŞİF DURUMU</span><strong>'+percent+'% keşfedildi</strong></div><div class="atlas-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+percent+'" aria-label="Keşfedilen bölgeler"><i style="width:'+percent+'%"></i></div><small>'+discovered+' / '+rows.length+' RPG bölgesi · Yenilen bosslar: '+Number(mapContent?.summary?.defeatedBosses||0)+' / '+Number(mapContent?.summary?.totalBosses||0)+' · Zindanlar: '+Number(mapContent?.summary?.totalDungeons||0)+' konum · bölge · boss · zindan · Boss zaferleri · karakter geneli: '+Number(stats.boss_defeats||0)+' · Zindan zaferleri · karakter geneli: '+Number(stats.dungeon_wins||0)+'</small></div><article class="atlas-map-shell"><span class="atlas-map-paper atlas-paper" aria-hidden="true"></span>'+map+routePanel+legend+'</article>'+'<div class="atlas-ecology-summary" data-atlas-ecology-summary aria-live="polite">'+Object.entries(REGIONS).map(([key,region])=>'<span data-atlas-ecology-profile="'+key+'">'+escapeHtml(region.name)+': '+escapeHtml(getAtlasEcologyProfile(key,'summer','clear').vegetation)+'</span>').join('')+'</div>'+renderRegionList(rows,esc)+modal+'</section>';
}
