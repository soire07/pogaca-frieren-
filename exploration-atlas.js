import { CREATURE_CATALOG } from './creatures.js';

const BIOMES = {
 merkez:{name:'Altın Otlaklar',type:'Ilıman çayırlar',city:'Linden Meydanı',label:'Linden',x:26.4,y:57.5,cx:29.8,cy:62.8,npc:[['Mira','Gezgin büyücü'],['Eldan','Haritacı'],['Toma','Tüccar']],creatures:['mana_slime','forest_sprite'],className:'atlas-plains'},
 orman:{name:'Fısıltılı Mistik Orman',type:'Kadim orman',city:'Sylvan Köyü',label:'Sylvan',x:37.2,y:32.1,cx:41.2,cy:37.5,npc:[['Liora','Orman şifacısı'],['Fael','Rün araştırmacısı'],['Neris','Yol bekçisi']],creatures:['forest_sprite','rune_fox'],className:'atlas-forest'},
 harabeler:{name:'Kızıl Kum ve Kadim Harabeler',type:'Kurak çöl / harabe',city:'Aren Taş Şehri',label:'Aren',x:56.1,y:64.2,cx:60.2,cy:69.5,npc:[['Sahir','Kazı ustası'],['Nahla','Antika taciri'],['Orven','Yazıt uzmanı']],creatures:['mana_slime','ancient_drake'],className:'atlas-desert'},
 kuzey:{name:'Ayaz Geçidi',type:'Karlı dağ geçidi',city:'Frostholm',label:'Frostholm',x:57.8,y:26.3,cx:62.3,cy:32.5,npc:[['Eira','Dağ rehberi'],['Borin','Demirci'],['Sven','Sınır gözcüsü']],creatures:['frost_hare','rune_fox'],className:'atlas-snow'},
 yayla:{name:'Buzul Tacı Yaylaları',type:'Buzul ve yüksek dağ',city:'Hrafn Kalesi',label:'Hrafn',x:76.1,y:54.2,cx:79.2,cy:60.0,npc:[['Astrid','Kâhin'],['Rurik','Avcı'],['Helmi','Şifacı']],creatures:['frost_hare','ancient_drake'],className:'atlas-glacier'},
 aus:{name:'Kül Ateşi Volkan Kuşağı',type:'Volkanik arazi',city:'Emberwatch',label:'Ember',x:81.7,y:27.5,cx:85.8,cy:32.5,npc:[['Kael','Ateş büyücüsü'],['Varda','Maden ustası'],['Iven','Kervan koruyucusu']],creatures:['ancient_drake','mana_slime'],className:'atlas-volcano'}
};
const CREATURES = new Map(CREATURE_CATALOG.map(item => [item.key,item]));
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const position = (x,y) => 'left:'+x+'%;top:'+y+'%;';

function pin({key,label,type,icon,x,y,focus='region',extraClass=''}) {
 return '<button type="button" class="atlas-pin atlas-pin-'+type+' '+extraClass+'" style="'+position(x,y)+'" data-atlas-open="'+key+'" data-atlas-focus="'+focus+'" aria-label="'+escapeHtml(label)+'" title="'+escapeHtml(label)+'"><span class="atlas-pin-glyph" aria-hidden="true">'+icon+'</span><span class="atlas-pin-label">'+escapeHtml(label)+'</span></button>';
}
function panel(item,index,esc) {
 const region=item.region,biome=BIOMES[region.key]||BIOMES.merkez;
 const list=rows=>'<ul>'+rows.join('')+'</ul>';
 const npc=list(biome.npc.map(([name,role])=>'<li><strong>'+esc(name)+'</strong><span>'+esc(role)+'</span></li>'));
 const mobs=list(biome.creatures.map(key=>CREATURES.get(key)).filter(Boolean).map(creature=>'<li><strong>'+esc((creature.emoji||'')+' '+creature.name)+'</strong><span>'+esc(creature.rarity||'Biyom canlısı')+'</span></li>'));
 const bosses=list(item.bosses.map(boss=>'<li data-atlas-focus-target="boss"><strong>☠ '+esc(boss.name)+'</strong><span>'+(boss.defeated?'Yenildi':boss.unlocked?'Karşılaşma açık':'Seviye '+boss.minLevel+' gerekli')+'</span></li>'));
 const dungeon=item.dungeon?'<li data-atlas-focus-target="dungeon"><strong>♜ '+esc(item.dungeon.name)+'</strong><span>'+(item.dungeon.unlocked?'Giriş açık':'Seviye '+item.dungeon.minLevel+' gerekli')+' · '+esc(item.dungeon.lootName||'Zindan sandıkları')+'</span></li>':'<li><strong>Sandık alanı</strong><span>Bu bölgede tanımlı zindan noktası yok.</span></li>';
 const loot=list(item.rareItems.map(entry=>'<li><strong>✧ '+esc(entry.name)+'</strong><span>'+(entry.ownedQuantity?'Envanterinde ×'+entry.ownedQuantity:'Henüz bulunmadı')+'</span></li>'));
 return '<section class="atlas-panel" data-atlas-panel="'+esc(region.key)+'" hidden><div class="atlas-hero"><small>BÖLGE '+(index+1)+' · '+esc(biome.type)+'</small><h3>'+esc(biome.name)+'</h3><p>'+esc(region.name)+' · '+esc(biome.city)+'</p><div><span>'+(item.discovered?'Keşfedildi':item.unlocked?'Keşfe açık':'Kilitli · Seviye '+region.minLevel)+'</span><span>'+item.visits+' keşif ziyareti</span></div></div><div class="atlas-detail-grid"><section><h4>Yerleşim ve NPC’ler</h4>'+npc+'</section><section><h4>Biyom canavarları</h4>'+mobs+'</section><section><h4>Boss ve zindan noktaları</h4>'+bosses+'<ul>'+dungeon+'</ul></section><section><h4>Sandıklar ve nadir ganimet</h4>'+loot+'</section></div></section>';
}
export function renderExplorationAtlas({mapContent,stats={},esc=escapeHtml}={}) {
 const rows=Array.isArray(mapContent?.regions)?mapContent.regions:[];
 const total=Math.max(1,Number(mapContent?.summary?.totalRegions)||rows.length||1);
 const discovered=Math.max(0,Number(mapContent?.summary?.discoveredRegions)||0);
 const percent=Math.max(0,Math.min(100,Math.round(discovered/total*100)));
 const points=rows.map((item,index)=>({item,biome:BIOMES[item.region.key]||BIOMES.merkez,index}));
 const regionPins=points.map(({item,biome,index})=>pin({key:item.region.key,label:biome.name,type:'region',icon:'✦',x:biome.x,y:biome.y,focus:'region',extraClass:biome.className})).join('');
 const cityPins=points.map(({item,biome})=>pin({key:item.region.key,label:biome.city,type:'city',icon:'⌂',x:biome.cx,y:biome.cy,focus:'city'})).join('');
 const bossPins=points.flatMap(({item,biome})=>item.bosses.map((boss,index)=>pin({key:item.region.key,label:boss.name,type:'boss',icon:'☠',x:Math.min(94,biome.x+4+index*2.4),y:Math.min(88,biome.y+5+index*2),focus:'boss'}))).join('');
 const dungeonPins=points.filter(point=>point.item.dungeon).map(({item,biome})=>pin({key:item.region.key,label:item.dungeon.name,type:'dungeon',icon:'◇',x:Math.max(5,biome.x-4.5),y:Math.min(88,biome.y+5),focus:'dungeon'})).join('');
 const panels=points.map(point=>panel(point.item,point.index,esc)).join('');
 const map='<div class="atlas-map-viewport" aria-label="Frieren Kuzey Kıtası interaktif haritası"><div class="atlas-map-art" role="group" aria-label="Biyomları ve yerleşimleri gösteren dünya haritası"><img class="atlas-map-image" src="/assets/frieren-world-map.svg" alt="Orman, altın otlaklar, çöl, karlı dağlar, buzul ve volkan bölgelerinden oluşan resimli fantezi dünya haritası" draggable="false"><div class="atlas-pin-layer">'+regionPins+cityPins+bossPins+dungeonPins+'</div></div></div>';
 const legend='<div class="atlas-legend"><span><i class="key-region">✦</i>Bölge</span><span><i class="key-city">⌂</i>Şehir</span><span><i class="key-boss">♜</i>Boss</span><span><i class="key-dungeon">◇</i>Zindan</span><small>Bilgileri açmak için işaretlere dokun.</small></div>';
 const modal='<div class="atlas-modal" data-atlas-modal hidden><button class="atlas-backdrop" type="button" data-atlas-close aria-label="Pencereyi kapat"></button><section class="atlas-modal-card" role="dialog" aria-modal="true" aria-label="Bölge ayrıntıları"><header><span>FRIEREN · KEŞİF KAYDI</span><button type="button" data-atlas-close aria-label="Kapat">×</button></header><div class="atlas-modal-content">'+panels+'</div></section></div>';
 return '<section class="section atlas-section" id="exploration-map" data-exploration-atlas><div class="section-head"><span class="eyebrow">MACERA ATLASI</span><h2>Kuzey Kıtası Dünya Haritası</h2><p>Keşfedilecek bölgeler, yerleşimler ve macera noktaları.</p></div><div class="atlas-progress"><div class="atlas-progress-copy"><span>KUZEY KITA · KEŞİF DURUMU</span><strong>'+percent+'% keşfedildi</strong></div><div class="atlas-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+percent+'" aria-label="Keşfedilen bölgeler"><i style="width:'+percent+'%"></i></div><small>'+discovered+' / '+rows.length+' bölge · Yenilen bosslar: '+Number(mapContent?.summary?.defeatedBosses||0)+' / '+Number(mapContent?.summary?.totalBosses||0)+' · Boss zaferleri: '+Number(stats.boss_defeats||0)+' · Zindan zaferleri: '+Number(stats.dungeon_wins||0)+'</small></div><article class="atlas-map-shell"><span class="atlas-map-paper" aria-hidden="true"></span>'+map+legend+'</article>'+modal+'</section>';
}
