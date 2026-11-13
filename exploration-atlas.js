import { CREATURE_CATALOG } from './creatures.js';
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
  return '<button type="button" class="atlas-pin atlas-pin-'+type+' '+extraClass+'" style="'+position(x,y)+'" data-atlas-layer-item="'+type+'" data-atlas-open="'+escapeHtml(key)+'" data-atlas-focus="'+focus+'" data-atlas-target-key="'+escapeHtml(targetKey)+'" aria-label="'+escapeHtml(title)+'" title="'+escapeHtml(title)+'"><span class="atlas-pin-glyph" aria-hidden="true">'+icon+'</span><span class="atlas-pin-label">'+escapeHtml(label)+'</span></button>';
}

function detailRow({key,name,description,icon,state='',focus=''}) {
  return '<li class="exploration-detail-row '+state+'" '+(focus?'data-atlas-focus-target="'+focus+'"':'')+' data-atlas-target-key="'+escapeHtml(key)+'"><span class="exploration-detail-icon" aria-hidden="true">'+icon+'</span><span><strong>'+escapeHtml(name)+'</strong><small>'+escapeHtml(description)+'</small></span></li>';
}

function panel(item,index,settlements,esc) {
  const region=item.region;
  const geography=REGIONS[region.key]||REGIONS.merkez;
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
  const section=(heading,rows,empty='Bu bölgede kayıtlı nokta bulunmuyor.')=>'<section><h4>'+heading+'</h4><ul>'+(rows||'<li class="atlas-empty-row">'+empty+'</li>')+'</ul></section>';
  return '<section class="atlas-panel" data-atlas-panel="'+esc(region.key)+'" hidden><div class="atlas-hero"><small>BÖLGE '+(index+1)+' · '+esc(geography.type)+'</small><h3>'+esc(geography.name)+'</h3><p>'+esc(region.name)+' · '+esc(geography.city)+'</p><div><span>'+(item.discovered?'Keşfedildi':item.unlocked?'Keşfe açık':'Kilitli · Seviye '+region.minLevel)+'</span><span>'+item.visits+' keşif ziyareti</span><span>Ustalık '+item.masteryLevel+'</span></div></div><div class="atlas-detail-grid">'+section('Anime yerleşimleri ve önemli noktalar',settlementRows)+section('Biyom canlıları',creatureRows)+section('Boss karşılaşmaları',bossRows)+section('Zindanlar',dungeonRows)+section('Nadir ganimet',lootRows)+'</div></section>';
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

export function renderExplorationAtlas({mapContent,stats={},esc=escapeHtml}={}) {
  const rows=Array.isArray(mapContent?.regions)?mapContent.regions:[];
  const total=Math.max(1,Number(mapContent?.summary?.totalRegions)||rows.length||1);
  const discovered=Math.max(0,Number(mapContent?.summary?.discoveredRegions)||0);
  const percent=Math.max(0,Math.min(100,Math.round(discovered/total*100)));
  const points=rows.map((item,index)=>({item,geo:REGIONS[item.region.key]||REGIONS.merkez,index}));
  const regionPins=points.map(({item,geo})=>pin({
    key:item.region.key,label:geo.name,type:'region',icon:'✦',x:geo.x,y:geo.y,focus:'region',extraClass:geo.className
  })).join('');
  const cityPins=FRIEREN_WORLD_SETTLEMENTS.map(place=>pin({
    key:place.regionKey,targetKey:place.key,label:place.name,type:'city',icon:'⌂',x:place.x,y:place.y,focus:'city',subtitle:place.subtitle
  })).join('');
  const bossPins=points.flatMap(({item,geo})=>item.bosses.map(boss=>{
    const location=boss.location||FRIEREN_WORLD_BOSS_LOCATIONS[boss.key];
    const anchor=REGION_ANCHORS[item.region.key]||REGION_ANCHORS.merkez;
    const point=location||{x:anchor.x,y:anchor.y,place:'Bölge boss alanı'};
    return pin({key:item.region.key,targetKey:boss.key,label:boss.name,type:'boss',icon:'☠',x:point.x,y:point.y,focus:'boss',extraClass:boss.defeated?'is-defeated':'',subtitle:point.place});
  })).join('');
  const dungeonPins=points.flatMap(({item})=>item.dungeons.map((dungeon,index)=>{
    const fallback={
      merkez:[{x:37,y:88},{x:42,y:83}],orman:[{x:21,y:58},{x:27,y:62}],harabeler:[{x:64,y:56},{x:59,y:62}],
      kuzey:[{x:72,y:46},{x:76,y:50}],yayla:[{x:82,y:76},{x:86,y:72}],aus:[{x:92,y:44},{x:89,y:50}]
    };
    const slots=fallback[item.region.key]||fallback.merkez;
    const point=dungeon.location||FRIEREN_WORLD_DUNGEON_LOCATIONS[dungeon.key]||slots[index%slots.length];
    return pin({key:item.region.key,targetKey:dungeon.key,label:dungeon.name,type:'dungeon',icon:'◇',x:point.x,y:point.y,focus:'dungeon',subtitle:point.place});
  })).join('');
  const fogPaths=points.filter(point=>!point.item.discovered).map(point=>{
    const path=FOG_PATHS[point.item.region.key];
    return path?'<path d="'+path+'" fill="#243647" opacity=".18" stroke="#d4c4a1" stroke-opacity=".16" stroke-width=".35"/>':'';
  }).join('');
  const fog='<svg class="atlas-fog-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><defs><filter id="atlas-fog-soft"><feGaussianBlur stdDeviation="1.2"/></filter></defs><g filter="url(#atlas-fog-soft)">'+fogPaths+'</g></svg>';
  const panels=points.map(point=>panel(point.item,point.index,FRIEREN_WORLD_SETTLEMENTS,esc)).join('');
  const map='<div class="atlas-map-viewport" data-atlas-viewport tabindex="0" role="region" aria-label="Frieren anime dünyası ve RPG keşif haritası"><div class="atlas-map-camera" data-atlas-camera><div class="atlas-map-art atlas-world-map" role="group" aria-label="Frieren dünyasının anime yerleşimleri, dağları, ormanları ve yolları"><img class="atlas-map-image" src="/assets/frieren-world-map.svg?v=atlas-356-2" alt="Frieren dünyasından esinlenen Merkez Topraklar, Kuzey Toprakları, Größe Ormanı, Kühl Bölgesi, Schwer Dağları ve Ende haritası" draggable="false">'+fog+'<div class="atlas-pin-layer">'+regionPins+cityPins+bossPins+dungeonPins+'</div></div></div><div class="atlas-map-tools" aria-label="Harita yakınlaştırma kontrolleri"><button type="button" data-atlas-zoom="-1" aria-label="Uzaklaştır">−</button><output data-atlas-zoom-value>100%</output><button type="button" data-atlas-zoom="1" aria-label="Yakınlaştır">+</button><button type="button" data-atlas-reset aria-label="Haritayı sıfırla">Sıfırla</button></div></div><div class="atlas-layer-controls" aria-label="Harita işaret katmanları"><span>GÖSTER</span><button type="button" data-atlas-layer="region" aria-pressed="true">RPG Bölgeleri</button><button type="button" data-atlas-layer="city" aria-pressed="true">Anime Yerleşimleri</button><button type="button" data-atlas-layer="boss" aria-pressed="true">Bosslar</button><button type="button" data-atlas-layer="dungeon" aria-pressed="true">Zindanlar</button><small>İşaretleri seçerek ayrıntıları aç. Haritayı sürükle veya iki parmakla yakınlaştır.</small></div>';
  const legend='<div class="atlas-legend"><span><i class="key-region">✦</i>RPG bölgesi</span><span><i class="key-city">⌂</i>Anime yerleşimi</span><span><i class="key-boss">☠</i>RPG bossu</span><span><i class="key-dungeon">◇</i>RPG zindanı</span><small>Harita yerleşimleri anime coğrafyasına dayalı fan yapımı konumlandırmadır.</small></div>';
  const modal='<div class="atlas-modal" data-atlas-modal hidden><button class="atlas-backdrop" type="button" data-atlas-close aria-label="Pencereyi kapat"></button><section class="atlas-modal-card" role="dialog" aria-modal="true" aria-label="Bölge ayrıntıları"><header><span>FRIEREN · KEŞİF KAYDI</span><button type="button" data-atlas-close aria-label="Kapat">×</button></header><div class="atlas-modal-content">'+panels+'</div></section></div>';
  return '<section class="section atlas-section" id="exploration-map" data-exploration-atlas><div class="section-head"><span class="eyebrow">FRIEREN · DÜNYA ATLASI</span><h2>Frieren Dünyası</h2><p>Anime coğrafyasını temel alan dünya haritası; Poğaça Frieren RPG keşif bölgeleri, bossları ve zindanlarıyla bağlantılı.</p></div><div class="atlas-progress"><div class="atlas-progress-copy"><span>SEÇİLİ KARAKTER · KEŞİF DURUMU</span><strong>'+percent+'% keşfedildi</strong></div><div class="atlas-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+percent+'" aria-label="Keşfedilen bölgeler"><i style="width:'+percent+'%"></i></div><small>'+discovered+' / '+rows.length+' RPG bölgesi · Yenilen bosslar: '+Number(mapContent?.summary?.defeatedBosses||0)+' / '+Number(mapContent?.summary?.totalBosses||0)+' · Zindanlar: '+Number(mapContent?.summary?.totalDungeons||0)+' konum · bölge · boss · zindan · Boss zaferleri · karakter geneli: '+Number(stats.boss_defeats||0)+' · Zindan zaferleri · karakter geneli: '+Number(stats.dungeon_wins||0)+'</small></div><article class="atlas-map-shell"><span class="atlas-map-paper atlas-paper" aria-hidden="true"></span>'+map+legend+'</article>'+renderRegionList(rows,esc)+modal+'</section>';
}
