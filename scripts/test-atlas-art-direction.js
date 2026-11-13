import test from 'node:test';
import assert from 'node:assert/strict';
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
  const { declutterAtlasPins } = await import('../atlas-pin-layout.js');
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
    ...Object.entries(FRIEREN_WORLD_DUNGEON_LOCATIONS).map(([key,point])=>({id:'dungeon:'+key,type:'dungeon',x:point.x,y:point.y}))
  ];
  const arranged = declutterAtlasPins(markers);
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
  assert.match(atlas, /frieren-world-map\.svg\?v=atlas-361-1/);
  assert.match(css, /\.atlas-atmosphere-layer::before/);
  assert.match(css, /atlas-northfall/);
  assert.match(css, /atlas-forest-mist/);
  assert.match(css, /prefers-reduced-motion:reduce\)\{\.atlas-atmosphere-layer::before/);
  assert.match(site, /site\.css\?v=atlas-362-1/);
});


test('Frieren atlas terrain uses organic mountain ridgelines and fine terrain grain rather than repeated cartoon peaks', async () => {
  const artwork = await readFile(new URL('../public-assets/frieren-world-map.svg', import.meta.url), 'utf8');
  assert.match(artwork, /id="terrain-grain"/);
  assert.match(artwork, /M700 347 748 294 780 319 820 232/);
  assert.match(artwork, /stroke-opacity=".72" stroke-width="4"/);
  assert.match(artwork, /fill="url\(#terrain-grain\)" opacity=".42"/);
  assert.doesNotMatch(artwork, /<use href="#ridge" x="710"/);
  assert.match(artwork, /GRÖSSE ORMANI/);
  assert.match(artwork, /KUZEY PLATOSU/);
});


test('atlas geography layers are cohesive, optional and do not alter canonical encounter coordinates', async () => {
  const artwork = await readFile(new URL('../public-assets/frieren-world-map.svg', import.meta.url), 'utf8');
  const atlas = await readFile(new URL('../exploration-atlas.js', import.meta.url), 'utf8');
  const client = await readFile(new URL('../public-assets/exploration-atlas.js', import.meta.url), 'utf8');
  const locations = await readFile(new URL('../exploration-world-locations.js', import.meta.url), 'utf8');
  for (const layer of ['atlas-waterways', 'atlas-trails', 'atlas-settled-land']) {
    assert.match(artwork, new RegExp('data-atlas-geography-layer="' + layer + '"'));
  }
  assert.match(artwork, /atlas-river-main/);
  assert.match(artwork, /atlas-lake/);
  assert.match(artwork, /atlas-foothill-transition/);
  assert.match(artwork, /atlas-field-mosaic/);
  for (const layer of ['waterways', 'trails', 'settled-land']) {
    assert.match(atlas, new RegExp('data-atlas-geography="' + layer + '"'));
    assert.match(client, new RegExp('data-atlas-geography-layer="' + layer + '"'));
  }
  assert.match(client, /data-atlas-geography/);
  assert.match(atlas, /atlas-362-1/);
  assert.match(locations, /x:39, y:79/);
  assert.match(locations, /level_1: Object\.freeze\(\{ regionKey:'merkez', x:43, y:72/);
});
