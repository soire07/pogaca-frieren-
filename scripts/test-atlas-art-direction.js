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
