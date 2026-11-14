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
  const buildingLots = [
    [-29,-22],[-10,-28],[12,-24],[28,-7],[-27,8],[-7,13],[14,15]
  ];
  const groups = settlements.filter(place =>
    place && Number.isFinite(Number(place.x)) && Number.isFinite(Number(place.y)) &&
    typeof place.name === 'string'
  ).map(place => {
    const x = Number(place.x) * 18;
    const y = Number(place.y) * 12;
    const label = String(place.name).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    const seed = Array.from(String(place.key || place.name)).reduce((sum, char) => sum + char.charCodeAt(0), 0);
    const archetype = ['walled','market','hamlet'][(seed + String(place.key || place.name).length) % 3];
    const rotation = (seed % 7) * 5 - 15;
    const buildings = buildingLots.map(([bx, by], index) => {
      const width = 8 + ((seed + index * 3) % 4);
      const height = 7 + ((seed + index * 5) % 4);
      const roof = index % 2 ? '#9a7654' : '#80694f';
      return '<g class="atlas-local-building" transform="translate(' + bx + ' ' + by + ')">' +
        '<rect x="' + (-width/2) + '" y="' + (-height/2) + '" width="' + width + '" height="' + height + '" rx="1.2" fill="' + roof + '" stroke="#ead9b8" stroke-width="1.1"/>' +
        '<path d="M' + (-width/2) + ' 0L0 ' + (-height/2-3) + ' ' + (width/2) + ' 0" fill="none" stroke="#f0dfbd" stroke-opacity=".8" stroke-width="1.1"/>' +
        '<path d="M0 ' + (-height/2+1) + 'v' + (height-2) + '" stroke="#3d4b43" stroke-opacity=".55" stroke-width=".8"/>' +
        '</g>';
    }).join('');
    const enclosure = archetype === 'walled'
      ? '<path class="atlas-local-wall" d="M-39-8Q-36-35-8-39Q22-42 39-17Q45 10 24 34Q-8 46-34 23Z" fill="#b5a27d" fill-opacity=".12" stroke="#e5d2aa" stroke-width="2.8" stroke-dasharray="7 3"/><path d="M-3-40v7m34 16-6 4m-4 43-5-5m-48-2 6-5" stroke="#e9d7b3" stroke-width="3"/>'
      : archetype === 'market'
        ? '<g class="atlas-local-market"><path d="M-38-2Q-20-14 0-3T38-1" fill="none" stroke="#9a7951" stroke-width="8" stroke-linecap="round"/><path d="M-35-2Q-18-13 0-3T35-1" fill="none" stroke="#ead5a9" stroke-width="1.4" stroke-dasharray="3 4"/></g>'
        : '<path class="atlas-local-field-edge" d="M-39-13Q-23-39 2-35T39-9M-37 20Q-10 40 30 23" fill="none" stroke="#8a9b70" stroke-width="2" stroke-dasharray="3 5"/>';
    const gardens = '<g class="atlas-local-garden"><path d="M-35 27q9-8 18 0t18 0 18 0" fill="none" stroke="#78936c" stroke-width="5" stroke-linecap="round"/><path d="M-31 31h57" stroke="#d5c69a" stroke-width="1" stroke-dasharray="2 3"/></g>';
    const plaza = '<circle class="atlas-local-plaza" r="8" fill="#bca77c" fill-opacity=".8" stroke="#f0dfbc" stroke-width="1.5"/><circle r="2.3" fill="#687c67"/>';
    const streets = '<g class="atlas-local-street" fill="none" stroke-linecap="round"><path d="M-48 2Q-25-5-12 0T12 2 48-5" stroke="#6f6049" stroke-width="8"/><path d="M-4-45Q4-20 0-8T3 18 12 45" stroke="#6f6049" stroke-width="7"/><path d="M-48 2Q-25-5-12 0T12 2 48-5M-4-45Q4-20 0-8T3 18 12 45" stroke="#e7d7b4" stroke-width="1.5" stroke-dasharray="4 4"/></g>';
    const stalls = archetype === 'market'
      ? '<g fill="#a66f50" stroke="#f0d8ae" stroke-width="1"><path d="M-20-14l6-5 6 5Z"/><path d="M18 10l6-5 6 5Z"/></g>'
      : '';
    return '<g class="atlas-local-settlement-plan atlas-local-settlement-plan--' + archetype + '" data-atlas-local-settlement="' + label + '" transform="translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ')">' +
      '<title>' + label + ' — temsili yerleşim planı</title>' +
      '<circle r="51" fill="#263b3b" fill-opacity=".13" stroke="#e6d8b5" stroke-opacity=".45" stroke-width="1.4" stroke-dasharray="2 5"/>' +
      '<g transform="rotate(' + rotation + ')">' + enclosure + streets + buildings + gardens + stalls + plaza + '</g>' +
      '<text x="0" y="-57" text-anchor="middle" fill="#fff0ce" stroke="#24363a" stroke-width="3.5" paint-order="stroke" font-size="15">' + label + '</text>' +
      '</g>';
  }).join('');
  return '<svg class="atlas-local-detail-overlay" data-atlas-local-detail-layer viewBox="0 0 1800 1200" preserveAspectRatio="none" aria-hidden="true"><g>' + groups + '</g></svg>';
}
