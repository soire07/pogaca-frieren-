import test from 'node:test';
import assert from 'node:assert/strict';
import { ATLAS_HISTORICAL_EVENTS } from '../atlas-navigation.js';
import { readFile } from 'node:fs/promises';

test('Frieren atlas uses layered cartographic relief instead of flat decorative shapes', async () => {
  const artwork = await readFile(new URL('../public-assets/frieren-world-map.svg', import.meta.url), 'utf8');
  assert.match(artwork, /viewBox="0 0 1800 1200"/);
  for (const layer of ['land-clip', 'contours', 'forest-canopy', 'ridge', 'mountain-shadow', 'river', 'sea-depth', 'paper-fiber']) {
    assert.ok(artwork.includes(layer), 'atlas artwork should include ' + layer);
  }
  assert.match(artwork, /clipPath id="land-clip"/);
  assert.match(artwork, /stroke-dasharray="2 20"/);
  assert.match(artwork, /KUZEY PLATOSU/);
  assert.match(artwork, /GRÖSSE ORMANI/);
  assert.match(artwork, /MERKEZ TOPRAKLAR/);
  assert.doesNotMatch(artwork, /<circle[^>]+fill="black"/i);
  assert.match(artwork, /clip-path="url\(#land-clip\)"/);
  assert.match(artwork, /coastal shoals and small islands/);
  assert.match(artwork, /fine regional elevation lines/);
});

test('atlas landmark symbols are compact, category-coded and keep labels out of the default view', async () => {
  const css = await readFile(new URL('../site.css', import.meta.url), 'utf8');
  const artDirection = css.lastIndexOf('Premium atlas art direction');
  assert.ok(artDirection > 0, 'premium atlas overrides should be present after legacy rules');
  const active = css.slice(artDirection);
  assert.match(active, /\.atlas-pin-glyph\{[^}]*border-radius:50%/);
  assert.match(active, /\.atlas-pin-boss \.atlas-pin-glyph\{[^}]*background:#874d4b/);
  assert.match(active, /\.atlas-pin-dungeon \.atlas-pin-glyph\{[^}]*background:#75618d/);
  assert.match(active, /\.atlas-pin-city \.atlas-pin-label\{opacity:0\}/);
  assert.match(active, /\.atlas-pin:hover \.atlas-pin-label/);
  assert.match(active, /@media\(max-width:700px\)/);
});


test('atlas marker decluttering separates nearby pins without mutating canonical coordinates', async () => {
  const { declutterAtlasPins } = await import('../atlas-pin-layout.js');
  const source = [
    { key: 'region', type: 'region', x: 50, y: 50 },
    { key: 'city', type: 'city', x: 50.4, y: 50.2 },
    { key: 'boss', type: 'boss', x: 50.1, y: 50.3 },
    { key: 'dungeon', type: 'dungeon', x: 50.2, y: 50.1 }
  ];
  const before = structuredClone(source);
  const arranged = declutterAtlasPins(source);
  assert.deepEqual(source, before, 'canonical location records must remain untouched');
  assert.equal(arranged.length, source.length);
  assert.deepEqual(arranged.map(pin => pin.key), source.map(pin => pin.key));
  for (let i = 0; i < arranged.length; i++) {
    for (let j = i + 1; j < arranged.length; j++) {
      const dx = arranged[i].x - arranged[j].x;
      const dy = (arranged[i].y - arranged[j].y) * 1.5;
      assert.ok(Math.hypot(dx, dy) >= 3.1, 'visible pins should not overlap: ' + arranged[i].key + ' / ' + arranged[j].key);
    }
  }
});

test('atlas marker decluttering keeps isolated positions and clamps pins to the map', async () => {
  const { declutterAtlasPins } = await import('../atlas-pin-layout.js');
  const source = [
    { key: 'isolated', type: 'city', x: 20, y: 20 },
    { key: 'edge-a', type: 'city', x: 1, y: 1 },
    { key: 'edge-b', type: 'boss', x: 1.1, y: 1.1 }
  ];
  const arranged = declutterAtlasPins(source);
  assert.deepEqual(arranged[0], source[0], 'isolated landmarks should retain their canonical placement');
  for (const pin of arranged) {
    assert.ok(pin.x >= 1 && pin.x <= 99);
    assert.ok(pin.y >= 1 && pin.y <= 99);
  }
});


test('all atlas landmark categories are rendered through one collision-aware layout', async () => {
  const atlas = await readFile(new URL('../exploration-atlas.js', import.meta.url), 'utf8');
  assert.match(atlas, /import \{ declutterAtlasPins \} from '.\/atlas-pin-layout\.js'/);
  assert.match(atlas, /const markerConfigs = \[/);
  assert.match(atlas, /declutterAtlasPins\(markerConfigs\)/);
  assert.match(atlas, /markerPins/);
  assert.doesNotMatch(atlas, /regionPins\+cityPins\+bossPins\+dungeonPins/);
});

test('atlas CSS keeps every category distinct and city labels hidden until interaction', async () => {
  const css = await readFile(new URL('../site.css', import.meta.url), 'utf8');
  const refined = css.slice(css.lastIndexOf('Refined atlas presentation'));
  assert.match(refined, /\.atlas-pin-region \.atlas-pin-glyph/);
  assert.match(refined, /\.atlas-pin-city \.atlas-pin-glyph/);
  assert.match(refined, /\.atlas-pin-boss \.atlas-pin-glyph/);
  assert.match(refined, /\.atlas-pin-dungeon \.atlas-pin-glyph/);
  assert.match(refined, /\.atlas-pin-city \.atlas-pin-label\{[^}]*opacity:0/);
  assert.match(refined, /@media\(max-width:700px\)/);
  assert.match(refined, /prefers-reduced-motion:reduce/);
});
 
test('settlement labels open horizontally beside the village pin and flip inward near the right edge', async () => {
  const css = await readFile(new URL('../site.css', import.meta.url), 'utf8');
  const refined = css.slice(css.lastIndexOf('Refined atlas presentation'));
  const atlas = await readFile(new URL('../exploration-atlas.js', import.meta.url), 'utf8');
  assert.ok(refined.includes('.atlas-pin-city .atlas-pin-label{left:calc(100% + 7px);right:auto;top:50%;transform:translateY(-50%)'));
  assert.ok(refined.includes('.atlas-pin-city.atlas-pin-label-left .atlas-pin-label{left:auto;right:calc(100% + 7px)'));
  assert.match(atlas, /atlas-pin-label-left/);
  assert.match(atlas, /Number\(x\)>=68/);
});


test('current canon and RPG map coordinates are collision-adjusted as one visual layer', async () => {
  const { declutterAtlasPins, isInsideAtlasLand } = await import('../atlas-pin-layout.js');
  const {
    FRIEREN_WORLD_SETTLEMENTS,
    FRIEREN_WORLD_BOSS_LOCATIONS,
    FRIEREN_WORLD_DUNGEON_LOCATIONS
  } = await import('../exploration-world-locations.js');
  const markers = [
    ...[
      ['merkez',35,68],['orman',32,43],['harabeler',55,47],
      ['kuzey',68,31],['yayla',74,72],['aus',87,8]
    ].map(([key,x,y])=>({id:'region:'+key,type:'region',x,y})),
    ...FRIEREN_WORLD_SETTLEMENTS.map(place=>({id:'city:'+place.key,type:'city',x:place.x,y:place.y})),
    ...Object.entries(FRIEREN_WORLD_BOSS_LOCATIONS).map(([key,point])=>({id:'boss:'+key,type:'boss',x:point.x,y:point.y})),
    ...Object.entries(FRIEREN_WORLD_DUNGEON_LOCATIONS).map(([key,point])=>({id:'dungeon:'+key,type:'dungeon',x:point.x,y:point.y})),
    ...ATLAS_HISTORICAL_EVENTS.map(event=>({id:'event:'+event.id,type:'event',x:event.x,y:event.y}))
  ];
  const arranged = declutterAtlasPins(markers);
  for (const marker of arranged) {
    assert.ok(isInsideAtlasLand(marker.x, marker.y), 'marker must stay on the illustrated landmass: ' + marker.id);
  }
  for (let i = 0; i < arranged.length; i++) {
    for (let j = i + 1; j < arranged.length; j++) {
      const dx = arranged[i].x - arranged[j].x;
      const dy = (arranged[i].y - arranged[j].y) * 1.5;
      assert.ok(Math.hypot(dx, dy) >= 3.1, 'catalog pins overlap: ' + arranged[i].id + ' / ' + arranged[j].id);
    }
  }
});


test('Frieren atlas adds subtle northern snowfall and forest mist without changing map data', async () => {
  const atlas = await readFile(new URL('../exploration-atlas.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../site.css', import.meta.url), 'utf8');
  const site = await readFile(new URL('../public-site.js', import.meta.url), 'utf8');
  assert.match(atlas, /<div class="atlas-atmosphere-layer" aria-hidden="true"><\/div>/);
  assert.match(atlas, /frieren-world-map\.svg\?v=atlas-377-1/);
  assert.match(css, /\.atlas-atmosphere-layer::before/);
  assert.match(css, /atlas-northfall/);
  assert.match(css, /atlas-forest-mist/);
  assert.match(css, /prefers-reduced-motion:reduce\)\{\.atlas-atmosphere-layer::before/);
  assert.match(site, /site\.css\?v=atlas-377-1/);
});


test('mountain systems read as continuous layered ridgelines, not repeated toy-like triangular peaks', async () => {
  const artwork = await readFile(new URL('../public-assets/frieren-world-map.svg', import.meta.url), 'utf8');
  assert.match(artwork, /class="atlas-mountain-backdrop"/);
  assert.match(artwork, /class="atlas-mountain-relief"/);
  assert.match(artwork, /id="terrain-grain"/);
  assert.match(artwork, /stroke-linecap="round"/);
  assert.ok(artwork.includes('Q750 305 800 314') && artwork.includes('stroke-width="31"'), 'main mountain ridge must use layered continuous relief strokes');
  const relief = artwork.slice(artwork.indexOf('<g class="atlas-mountain-relief"'), artwork.indexOf('<g class="atlas-meadow-texture"'));
  assert.doesNotMatch(relief, /<use href="#atlas-peak-[a-d]"/, 'large repeated peak stamps must not dominate mountain ranges');
  assert.ok(artwork.includes('fill="url(#terrain-grain)" opacity=".42"'));
  assert.match(artwork, /GRÖSSE ORMANI/);
  assert.match(artwork, /KUZEY PLATOSU/);
});

test('Great Forest uses irregular separated groves and varied canopy spacing instead of one dark blob', async () => {
  const artwork = await readFile(new URL('../public-assets/frieren-world-map.svg', import.meta.url), 'utf8');
  assert.match(artwork, /class="atlas-forest-groves"/);
  assert.match(artwork, /class="atlas-forest-canopy" opacity=".9"/);
  assert.match(artwork, /M235 525Q260 480 314 480/);
  assert.ok(artwork.includes('translate(334 318) rotate(8) scale(.48)'));
  assert.ok(artwork.includes('translate(548 505) rotate(19) scale(.48)'));
  assert.match(artwork, /GRÖSSE ORMANI/);
});


test('atlas geography layers are cohesive, optional and do not alter canonical encounter coordinates', async () => {
  const artwork = await readFile(new URL('../public-assets/frieren-world-map.svg', import.meta.url), 'utf8');
  const atlas = await readFile(new URL('../exploration-atlas.js', import.meta.url), 'utf8');
  const client = await readFile(new URL('../public-assets/exploration-atlas.js', import.meta.url), 'utf8');
  const locations = await readFile(new URL('../exploration-world-locations.js', import.meta.url), 'utf8');
  const site = await readFile(new URL('../public-site.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../site.css', import.meta.url), 'utf8');
  for (const layer of ['waterways', 'trails', 'settled-land']) {
    assert.match(atlas, new RegExp('data-atlas-geography-layer="' + layer + '"'));
  }
  assert.match(atlas, /const geographyOverlay = `</);
  assert.match(atlas, /atlas-geography-overlay/);
  assert.ok(atlas.includes("geographyOverlay+localDetailOverlay+routeOverlay+biomeLabels+'<div class="), 'inline geography and route overlays must be inserted into map markup');
  assert.match(atlas, /atlas-inline-land-clip/);
  assert.match(atlas, /atlas-river-main/);
  assert.match(atlas, /atlas-lake/);
  assert.match(atlas, /atlas-foothill-transition/);
  assert.match(atlas, /atlas-field-mosaic/);
  assert.match(atlas, /data-atlas-geography-layer="terrain-details"/);
  assert.match(atlas, /atlas-waterfall/);
  assert.match(atlas, /atlas-regional-flora/);
  assert.match(atlas, /atlas-settlement-architecture/);
  assert.match(atlas, /atlas-ruin-remnants/);
  assert.match(atlas, /data-atlas-weather="clear"/);
  assert.match(atlas, /data-atlas-season="summer"/);
  assert.match(atlas, /buildAtlasLocalDetailLayer/);
  assert.match(atlas, /data-atlas-lighting="day"/);
  assert.match(atlas, /data-atlas-lighting-toggle/);
  assert.match(atlas, /data-atlas-weather/);
  assert.match(atlas, /data-atlas-lighting-toggle/);
  assert.match(atlas, /RPG tehlikesi:/);
  assert.match(client, /dataset\.atlasLighting/);
  assert.match(client, /dataset\.atlasWeather/);
  assert.match(css, /atlas-weather-layer/);
  assert.match(css, /atlas-cloud-shadow/);
  assert.match(css, /prefers-reduced-motion:reduce\)\{\.atlas-map-art::before/);
  assert.match(css, /data-atlas-weather="snow"/);
  assert.match(css, /data-atlas-lighting="night"/);
  assert.match(css, /prefers-reduced-motion:reduce\)\{\.atlas-terrain-details/);
  for (const layer of ['waterways', 'trails', 'settled-land']) {
    assert.match(atlas, new RegExp('data-atlas-geography="' + layer + '"'));

  }
  assert.match(client, /data-atlas-geography/);
  assert.ok(client.includes("querySelectorAll('[data-atlas-geography-layer="), 'client must locate the SVG layer rendered by the server module');
  assert.match(client, /toggleAttribute\('hidden',!enabled\)/, 'SVG layer visibility must use a real hidden attribute');
  assert.match(atlas, /atlas-377-1/);
  assert.match(site, /exploration-atlas\.js\?v=atlas-377-1/);
  assert.match(locations, /x:39, y:79/);
  assert.match(locations, /level_1: Object\.freeze\(\{ regionKey:'merkez', x:43, y:72/);
});


test('atlas terrain has organic biome edges and distinct painterly relief layers', async () => {
  const artwork = await readFile(new URL('../public-assets/frieren-world-map.svg', import.meta.url), 'utf8');
  assert.match(artwork, /id="biome-edge"/, 'biome boundaries need organic edge displacement');
  assert.match(artwork, /feTurbulence/);
  assert.match(artwork, /feDisplacementMap[^>]+scale="(?:1[2-9]|[2-9][0-9])"/);
  for (const layer of [
    'atlas-forest-canopy',
    'atlas-mountain-relief',
    'atlas-meadow-texture',
    'atlas-coastline-detail',
    'atlas-tundra-texture'
  ]) {
    assert.ok(artwork.includes(layer), 'missing painterly terrain layer: ' + layer);
  }
  assert.match(artwork, /clip-path="url\(#land-clip\)"/);
  assert.match(artwork, /stroke-linecap="round"/);
  assert.doesNotMatch(artwork, /<circle[^>]+fill="black"/i);
});


test('atlas color grading keeps terrain vivid and legible on desktop and mobile', async () => {
  const css = await readFile(new URL('../site.css', import.meta.url), 'utf8');
  const colorGrade = css.slice(css.lastIndexOf('Painterly atlas color grade'));
  assert.match(colorGrade, /saturate\(1\.14\)/);
  assert.match(colorGrade, /contrast\(1\.055\)/);
  assert.match(colorGrade, /@media\(max-width:700px\)/);
});


test('painterly terrain avoids tiled forest stamps and identical repeated mountain silhouettes', async () => {
  const artwork = await readFile(new URL('../public-assets/frieren-world-map.svg', import.meta.url), 'utf8');
  const css = await readFile(new URL('../site.css', import.meta.url), 'utf8');
  for (const variant of ['a', 'b', 'c', 'd']) {
    assert.match(artwork, new RegExp('id="atlas-canopy-' + variant + '"'), 'forest canopy needs distinct crown geometry: ' + variant);
    assert.match(artwork, new RegExp('href="#atlas-canopy-' + variant + '"'), 'forest should use canopy variant ' + variant);
  }
  assert.doesNotMatch(artwork, /<use href="#atlas-peak-[a-d]"/, 'mountain system should use continuous relief geometry rather than oversized icon stamps');
  assert.doesNotMatch(artwork, /<use href="#atlas-canopy" transform="translate\(\d+ \d+\) scale\([^)]+\)"\/>/);
  assert.doesNotMatch(artwork, /<use href="#atlas-peak" transform="translate\(\d+ \d+\) scale\([^)]+\)"\/>/);
  assert.match(artwork, /class="atlas-forest-groves"/, 'forest underpainting should use separate organic grove masses');
  assert.match(artwork, /fill="url\(#forest-canopy\)" opacity="\.2"/, 'forest canopy wash must remain restrained beneath individual tree crowns');
  const colorGrade = css.slice(css.lastIndexOf('Painterly atlas color grade'));
  assert.match(colorGrade, /\.atlas-map-viewport\{[^}]*aspect-ratio:3\/2/, '3:2 viewport ratio must remain authoritative');
  assert.match(colorGrade, /@media\(max-width:700px\)/, 'mobile map treatment must remain explicit');
});


test('boss map markers have distinct archetypes while canonical encounter coordinates remain untouched', async () => {
  const atlas = await readFile(new URL('../exploration-atlas.js', import.meta.url), 'utf8');
  const locations = await readFile(new URL('../exploration-world-locations.js', import.meta.url), 'utf8');
  const archetypes = [
    "level_1:['wildbeast','🐺']", "level_10:['ancient','🗿']", "level_20:['demon','👹']",
    "level_35:['warlord','🩸']", "level_50:['arcane','♛']", "'north-general':['general','⚔']",
    "'glass-wyrm':['wyrm','🐉']", "'fallen-mage':['fallen','🪽']", "zeldeila:['apex','♾']",
    "domaltazor:['executioner','🦴']", "'the-fool':['trickster','🃏']"
  ];
  for (const archetype of archetypes) assert.ok(atlas.includes(archetype), 'boss should have its own map archetype: '+archetype);
  assert.match(atlas, /boss-archetype-/);
  assert.match(atlas, /icon,x:point\.x,y:point\.y/);
  assert.match(locations, /level_1: Object\.freeze\(\{ regionKey:'merkez', x:43, y:72/);
  assert.match(locations, /'glass-wyrm': Object\.freeze\(\{ regionKey:'kuzey', x:62, y:49/);
});

test('boss archetypes receive distinct desktop and mobile visual treatments', async () => {
  const css = await readFile(new URL('../site.css', import.meta.url), 'utf8');
  const visualPass = css.slice(css.lastIndexOf('Boss visual identities'));
  for (const archetype of ['wildbeast','ancient','demon','warlord','arcane','general','wyrm','fallen','apex','executioner','trickster']) {
    assert.ok(visualPass.includes('.boss-archetype-'+archetype), 'missing boss visual treatment: '+archetype);
  }
  assert.match(visualPass, /@media\(max-width:700px\)/);
  assert.match(visualPass, /prefers-reduced-motion:reduce/);
});

test('each major biome has its own painterly signature without changing the 3:2 map canvas', async () => {
  const artwork = await readFile(new URL('../public-assets/frieren-world-map.svg', import.meta.url), 'utf8');
  assert.match(artwork, /viewBox="0 0 1800 1200"/);
  for (const layer of ['biome-central-meadow','biome-great-forest','biome-ancient-ruins','biome-northern-ice','biome-schwer-highlands','biome-ausserst-arcana']) {
    assert.ok(artwork.includes(layer), 'missing regional biome signature: '+layer);
  }
  assert.match(artwork, /atlas-biome-signatures/);
  assert.match(artwork, /pointer-events="none"/);
  assert.match(artwork, /GRÖSSE ORMANI/);
  assert.match(artwork, /KUZEY PLATOSU/);
});

test('atlas decluttering keeps bosses, settlements and dungeons inside the illustrated landmass', async () => {
  const { declutterAtlasPins, isInsideAtlasLand } = await import('../atlas-pin-layout.js');
  const source = [
    { id: 'boss:zeldeila', type: 'boss', x: 95, y: 36 },
    { id: 'city:demon-kings-castle', type: 'city', x: 94, y: 24 },
    { id: 'dungeon:level_30', type: 'dungeon', x: 92, y: 44 }
  ];
  const arranged = declutterAtlasPins(source);
  assert.deepEqual(source.map(pin => [pin.x, pin.y]), [[95,36],[94,24],[92,44]], 'canonical catalog coordinates must not be mutated');
  assert.ok(arranged.every(pin => isInsideAtlasLand(pin.x, pin.y)), 'every rendered pin must remain within the land silhouette');
  assert.notDeepEqual(arranged.map(pin => [pin.x,pin.y]), source.map(pin => [pin.x,pin.y]));
});


test('atlas settlement silhouettes give all ten catalogued towns distinct, layout-anchored skylines', async () => {
  const atlas = await readFile(new URL('../exploration-atlas.js', import.meta.url), 'utf8');
  const locations = await readFile(new URL('../exploration-world-locations.js', import.meta.url), 'utf8');
  const expected = [
    ['strahl', 39, 79], ['royal-capital', 49, 88], ['waal', 51, 63],
    ['fabel-village', 51, 48], ['graf-granat', 55, 58], ['aeusserst', 68, 42],
    ['village-of-sword', 75, 62], ['weise', 82, 46], ['ende', 88, 15],
    ['demon-kings-castle', 94, 24]
  ];
  assert.match(atlas, /const settlementSilhouetteTemplates = Object\.freeze\(\{/);
  assert.match(atlas, /function buildAtlasSettlementSilhouettes\(settlements=FRIEREN_WORLD_SETTLEMENTS,markerPositions=\[\]\)/);
  assert.match(atlas, /const positions=new Map\(markerPositions\.map\(marker=>\[marker\.key,marker\]\)\)/);
  assert.match(atlas, /const position=positions\.get\(place\.key\)\|\|place/);
  assert.match(atlas, /Math\.round\(Number\(position\.x\)\*18\)/);
  assert.match(atlas, /Math\.round\(Number\(position\.y\)\*12\)/);
  assert.match(atlas, /class="atlas-settlement-silhouette atlas-settlement-\$\{place\.key\}" data-settlement="\$\{place\.key\}" transform="translate\(\$\{x\} \$\{y\}\) scale\(\$\{scale\}\)"/);
  assert.match(atlas, /atlas-settlement-architecture atlas-settlement-silhouettes/);
  assert.match(atlas, /pointer-events="none"/);
  assert.match(atlas, /buildAtlasSettlementSilhouettes\(FRIEREN_WORLD_SETTLEMENTS,arrangedMarkers\.filter\(marker=>marker\.type==='city'\)\)/);
  for (const [key, x, y] of expected) {
    assert.ok(atlas.includes(key + ':') || atlas.includes("'" + key + "':"), 'settlement needs its own skyline geometry: ' + key);
    assert.match(locations, new RegExp("key:'" + key + "'[^\\n]*x:" + x + ", y:" + y), 'canonical settlement coordinate must remain unchanged: ' + key);
  }
});


test('atlas finish pass unifies frame, landmark focus, layer controls and mobile/reduced-motion behavior', async () => {
  const css = await readFile(new URL('../site.css', import.meta.url), 'utf8');
  const finish = css.slice(css.lastIndexOf('Unified atlas finish'));
  assert.match(finish, /\.atlas-map-shell::after\{[^}]*pointer-events:none/);
  assert.match(finish, /\.atlas-map-viewport\{[^}]*inset 0 0 44px/);
  assert.match(finish, /\.atlas-pin:hover \.atlas-pin-glyph/);
  assert.match(finish, /\.atlas-pin:hover,\.atlas-pin:focus-visible\{z-index:12\}/);
  assert.match(finish, /\.atlas-layer-controls button\[aria-pressed="true"\]/);
  assert.match(finish, /\.atlas-layer-controls button\[aria-pressed="false"\]/);
  assert.match(finish, /\.atlas-map-tools button:focus-visible/);
  assert.match(finish, /@media\(max-width:700px\)/);
  assert.match(finish, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(finish, /\.atlas-route-planner\{/);
});


test('castles and villages use layered architectural facades, openings and roof details instead of childlike line icons', async () => {
  const atlas = await readFile(new URL('../exploration-atlas.js', import.meta.url), 'utf8');
  const start = atlas.indexOf('const settlementSilhouetteTemplates = Object.freeze({');
  const end = atlas.indexOf('function buildAtlasSettlementSilhouettes', start);
  assert.ok(start >= 0 && end > start, 'settlement architecture templates must be present');
  const templates = atlas.slice(start, end);
  const keys = ['strahl','royal-capital','waal','fabel-village','graf-granat','village-of-sword','weise','ende','demon-kings-castle'];
  for (const key of keys) {
    const keyToken = key + ':';
    const quotedKeyToken = "'" + key + "':";
    const keyStart = templates.indexOf(keyToken) >= 0 ? templates.indexOf(keyToken) : templates.indexOf(quotedKeyToken);
    assert.ok(keyStart >= 0, key + ' needs a dedicated architecture template');
    const next = templates.indexOf("\n  ", keyStart + keyToken.length);
    const block = templates.slice(keyStart, next < 0 ? templates.length : next);
    const paths = (block.match(/<path\b/g) || []).length;
    assert.ok(paths >= 6, key + ' should have layered architectural detail, not a few crude strokes');
    assert.match(block, /<rect\b/, key + ' should include distinct facade/window geometry');
  }
  assert.match(templates, /castle-wall/);
  assert.match(templates, /battlement/);
  assert.match(templates, /arched-gate/);
  assert.match(templates, /timber-frame/);
  assert.match(templates, /roof-tile/);
});

test('regional biomes form broad connected land-cover zones with gradual transitions', async () => {
  const atlas = await readFile(new URL('../exploration-atlas.js', import.meta.url), 'utf8');
  assert.match(atlas, /atlas-biome-regions/);
  for (const biome of ['forest','central-plains','northern-tundra','highlands','eastern-mountains','ashen-north']) {
    assert.match(atlas, new RegExp('atlas-biome-' + biome));
  }
  assert.match(atlas, /atlas-biome-transition/);
  assert.match(atlas, /atlas-inline-land-clip/);
});

test('demon king castle sits inside a bleak deadwood and ashland environment', async () => {
  const atlas = await readFile(new URL('../exploration-atlas.js', import.meta.url), 'utf8');
  assert.match(atlas, /atlas-demon-wastes/);
  assert.match(atlas, /atlas-dead-tree/);
  assert.match(atlas, /atlas-ashen-ground/);
  assert.match(atlas, /atlas-demon-fog/);
  assert.match(atlas, /demon-kings-castle/);
});

test('boss markers prefer the dedicated map coordinate catalog over generic runtime location labels', async () => {
  const atlas = await readFile(new URL('../exploration-atlas.js', import.meta.url), 'utf8');
  assert.match(atlas, /function resolveAtlasBossLocation\(boss\)/);
  assert.match(atlas, /FRIEREN_WORLD_BOSS_LOCATIONS\[boss\.key\]/);
  assert.match(atlas, /Number\.isFinite\(Number\(location\.x\)\)/);
  assert.match(atlas, /Number\.isFinite\(Number\(location\.y\)\)/);
  assert.match(atlas, /resolveAtlasBossLocation\(boss\)/);
});


test('large groups of edge encounters are distributed to distinct free land positions', async () => {
  const { declutterAtlasPins, isInsideAtlasLand } = await import('../atlas-pin-layout.js');
  const source = Array.from({ length: 36 }, (_, index) => ({
    id: 'edge-encounter-' + index, type: 'boss', x: 99.5, y: 36
  }));
  const arranged = declutterAtlasPins(source);
  assert.equal(new Set(arranged.map(pin => pin.id)).size, source.length);
  for (const pin of arranged) {
    assert.ok(isInsideAtlasLand(pin.x, pin.y), 'every encounter must be placed on land');
  }
  for (let i = 0; i < arranged.length; i++) {
    for (let j = i + 1; j < arranged.length; j++) {
      const dx = arranged[i].x - arranged[j].x;
      const dy = (arranged[i].y - arranged[j].y) * 1.5;
      assert.ok(Math.hypot(dx, dy) >= 3.1, 'edge encounters must not collapse into one boundary pile');
    }
  }
});


test('map overlays show each biome name and its live completion percentage at stable geographic anchors', async () => {
  const atlas = await readFile(new URL('../exploration-atlas.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../site.css', import.meta.url), 'utf8');
  assert.ok(atlas.includes('function buildAtlasBiomeLabels(points)'));
  assert.ok(atlas.includes('data-atlas-biome-label='));
  assert.ok(atlas.includes("Tamamlanma '+progress+'%"));
  for (const key of ['orman','merkez','harabeler','kuzey','yayla','aus']) {
    assert.ok(atlas.includes(key+':{x:'), 'missing biome label anchor: '+key);
  }
  assert.ok(atlas.includes('geographyOverlay+localDetailOverlay+routeOverlay+biomeLabels'));
  assert.ok(css.includes('.atlas-biome-label-layer'));
});

test('Ende and Demon King castle use inward display anchors and zoom never shrinks below map bounds', async () => {
  const atlas = await readFile(new URL('../exploration-atlas.js', import.meta.url), 'utf8');
  const client = await readFile(new URL('../public-assets/exploration-atlas.js', import.meta.url), 'utf8');
  assert.ok(atlas.includes("place.key==='ende'?85:place.key==='demon-kings-castle'?89"));
  assert.ok(atlas.includes("place.key==='ende'?27:place.key==='demon-kings-castle'?38"));
  assert.ok(atlas.includes("place.key==='ende' ? 0.78 : place.key==='demon-kings-castle' ? 0.82 : 1"));
  assert.ok(client.includes('clamp(scale*delta,1,3.2)'));
  assert.ok(client.includes('clamp(scale*(distance/pinchDistance),1,3.2)'));
  assert.ok(atlas.includes('data-atlas-geography-layer="waterways" class="atlas-waterways">'));
  assert.ok(!atlas.includes('class="atlas-waterways"> class="atlas-waterways">'));
});
