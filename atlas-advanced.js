const ECOLOGY = Object.freeze({
  merkez: Object.freeze({ spring: 'Ilık bozkır ve çiçekli çayırlar', summer: 'Kurak çayır ve seyrek çalı', autumn: 'Altın otlak ve yaprak döken çalılık', winter: 'Soğuk bozkır ve donmuş otlak' }),
  orman: Object.freeze({ spring: 'Nemli yosun, eğrelti ve genç yapraklar', summer: 'Yoğun geniş yapraklı orman', autumn: 'Kızıl yaprak örtüsü ve mantarlar', winter: 'Kar tutmuş iğne yapraklı ağaçlar' }),
  harabeler: Object.freeze({ spring: 'Yüksek çayır ve taşlık yamaç', summer: 'Kuru fundalık ve taşlık arazi', autumn: 'Solmuş fundalık ve sarı otlar', winter: 'Rüzgârlı, seyrek kar örtülü yayla' }),
  kuzey: Object.freeze({ spring: 'Soğuk göl kıyısı ve alpin çayır', summer: 'Serin göl kıyısı ve alpin çayır', autumn: 'Sisli tundra çalılıkları', winter: 'Kar ve buzla kaplı tundra' }),
  yayla: Object.freeze({ spring: 'Kar erimesi ve alpin çayırlar', summer: 'Kayalık dağ çayırı', autumn: 'Don başlangıcı ve seyrek otlar', winter: 'Buzul karı ve çıplak kaya' }),
  aus: Object.freeze({ spring: 'Kutup-altı seyrek bitki örtüsü', summer: 'Kısa yaz tundrası', autumn: 'Donmuş tundra ve liken', winter: 'Yoğun kar ve buz' })
});
const SEASONS = new Set(['spring', 'summer', 'autumn', 'winter']);
const WEATHER = new Set(['clear', 'mist', 'snow', 'rain']);

export function getAtlasEcologyProfile(regionKey, season = 'summer', weather = 'clear') {
  const safeSeason = SEASONS.has(season) ? season : 'summer';
  const safeWeather = WEATHER.has(weather) ? weather : 'clear';
  const region = ECOLOGY[regionKey] || ECOLOGY.merkez;
  const weatherLabel = ({ clear: 'Açık', mist: 'Sisli', snow: 'Karlı', rain: 'Yağışlı' })[safeWeather];
  return Object.freeze({
    season: safeSeason,
    weather: safeWeather,
    vegetation: region[safeSeason],
    climate: weatherLabel + ' mevsim koşulları'
  });
}

export function estimateAtlasKilometers(routeUnits, referenceRouteUnits, referenceKilometers) {
  const route = Number(routeUnits);
  const referenceUnits = Number(referenceRouteUnits);
  const referenceKm = Number(referenceKilometers);
  if (![route, referenceUnits, referenceKm].every(Number.isFinite) ||
      route < 0 || referenceUnits <= 0 || referenceKm <= 0) return null;
  const result = route / referenceUnits * referenceKm;
  return Number.isFinite(result) ? Number(result.toFixed(1)) : null;
}

// The street plans are deliberately schematic: they are anchored to known settlement
// coordinates, but do not claim to reproduce canonical street/building layouts.
export function buildAtlasLocalDetailLayer(settlements = []) {
  const groups = settlements.filter(place =>
    place && Number.isFinite(Number(place.x)) && Number.isFinite(Number(place.y)) &&
    typeof place.name === 'string'
  ).map(place => {
    const x = Number(place.x) * 18;
    const y = Number(place.y) * 12;
    const label = String(place.name).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    return '<g class="atlas-local-settlement-plan" data-atlas-local-settlement="' + label + '" transform="translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ')">' +
      '<circle r="43" fill="#263b3b" fill-opacity=".16" stroke="#e6d8b5" stroke-opacity=".72" stroke-width="2" stroke-dasharray="5 5"/>' +
      '<path d="M-38-5H38M-5-38V38M-28-28L28 28M28-28L-28 28" fill="none" stroke="#e7d5ad" stroke-opacity=".72" stroke-width="3"/>' +
      '<g fill="#806d50" stroke="#f0dfbb" stroke-width="1.6"><rect x="-26" y="-22" width="12" height="10"/><rect x="12" y="-23" width="13" height="11"/><rect x="-25" y="12" width="13" height="11"/><rect x="12" y="12" width="13" height="11"/></g>' +
      '<text x="0" y="-49" text-anchor="middle" fill="#fff0ce" stroke="#24363a" stroke-width="3" paint-order="stroke" font-size="15">' + label + '</text>' +
      '</g>';
  }).join('');
  return '<svg class="atlas-local-detail-overlay" data-atlas-local-detail-layer viewBox="0 0 1800 1200" preserveAspectRatio="none" aria-hidden="true"><g>' + groups + '</g></svg>';
}
