import { EXPLORATION_REGION_CATALOG } from './exploration-regions.js';
import { FRIEREN_WORLD_BOSS_LOCATIONS, FRIEREN_WORLD_DUNGEON_LOCATIONS } from './exploration-world-locations.js';

function bossJournalKey(boss) {
  const name = String(boss?.name || '');
  if (name.includes('Schattenwolf')) return 'schattenwolf';
  if (name.includes('Harabe Muhafızı')) return 'ruinGuardian';
  if (name.includes('Kuzey İblisi')) return 'northDemon';
  if (name.includes('Komutanı')) return 'demonCommander';
  if (name.includes('Äußerst') || name.includes('Außerst') || name.includes('Ausserst')) return 'ausserstLord';
  return '';
}

const BOSS_REGION_KEYS = Object.freeze({
  'Merkez Topraklar': 'merkez',
  'Merkez': 'merkez',
  'merkez': 'merkez',
  'Büyük Orman Yolu': 'orman',
  'Büyük Orman': 'orman',
  'Orman': 'orman',
  'orman': 'orman',
  'Kadim Harabeler': 'harabeler',
  'Harabeler': 'harabeler',
  'harabeler': 'harabeler',
  'Kuzey Toprakları': 'kuzey',
  'Kuzey': 'kuzey',
  'kuzey': 'kuzey',
  'Kuzey Topraklarına Giden Yol': 'kuzey',
  'Kuzey Yaylaları': 'yayla',
  'Yayla': 'yayla',
  'yayla': 'yayla',
  'Äußerst Sınav Rotası': 'aus',
  'Äußerst': 'aus',
  'aus': 'aus'
});

function normalizeItemList(value) {
  if (Array.isArray(value)) return value;
  return value === null || value === undefined || value === '' ? [] : [value];
}

function itemKey(item) {
  return String(item?.key || item?.id || '');
}

function dungeonRegionKey(dungeon) {
  const key = itemKey(dungeon);
  const configured = FRIEREN_WORLD_DUNGEON_LOCATIONS[key]?.regionKey;
  if (configured) return configured;
  const level = Number(dungeon?.minLevel);
  if (!Number.isFinite(level)) return null;
  const region = [...EXPLORATION_REGION_CATALOG]
    .filter(item => Number(item.minLevel) <= level)
    .sort((a, b) => Number(b.minLevel) - Number(a.minLevel))[0];
  return region?.key || EXPLORATION_REGION_CATALOG[0]?.key || null;
}

function bossRegionKey(boss) {
  const key = itemKey(boss);
  const regionKey = String(boss?.regionKey || '').trim();
  if (EXPLORATION_REGION_CATALOG.some(region => region.key === regionKey)) return regionKey;
  const configured = FRIEREN_WORLD_BOSS_LOCATIONS[key]?.regionKey;
  if (configured) return configured;
  const explicit = BOSS_REGION_KEYS[String(boss?.region || '').trim()];
  if (explicit) return explicit;
  const byTier = { level_1: 'merkez', level_10: 'harabeler', level_20: 'kuzey', level_35: 'yayla', level_50: 'aus' };
  return byTier[key] || null;
}

export function buildExplorationMapContent({
  level = 1,
  regionVisits = [],
  journalEntries = [],
  inventory = [],
  bosses = [],
  dungeons = [],
  dungeonWins = 0
} = {}) {
  const playerLevel = Number.isFinite(Number(level)) ? Number(level) : 1;
  const visitsByRegion = new Map((regionVisits || []).map(row => [
    String(row.region_key || ''),
    Math.max(0, Number(row.visits) || 0)
  ]));
  const journalBossKeys = new Set((journalEntries || [])
    .filter(row => row.collection_key === 'bosses')
    .map(row => String(row.entry_key || '')));
  const ownedItems = new Map((inventory || []).map(row => [
    String(row.item_key || ''),
    Math.max(0, Number(row.quantity) || 0)
  ]));

  const normalizedBosses = (bosses || []).map(boss => {
    const key = itemKey(boss);
    const location = FRIEREN_WORLD_BOSS_LOCATIONS[key] || null;
    return { ...boss, key, regionKey: bossRegionKey(boss), location };
  }).filter(boss => boss.regionKey);

  const normalizedDungeons = (dungeons || []).map(dungeon => {
    const key = itemKey(dungeon);
    return { ...dungeon, key, regionKey: dungeonRegionKey(dungeon), location: FRIEREN_WORLD_DUNGEON_LOCATIONS[key] || null };
  }).filter(dungeon => dungeon.regionKey);

  const regions = EXPLORATION_REGION_CATALOG.map(region => {
    const visits = visitsByRegion.get(region.key) || 0;
    const discovered = visits > 0;
    const unlocked = playerLevel >= Number(region.minLevel);
    const regionBosses = normalizedBosses
      .filter(boss => boss.regionKey === region.key)
      .map(boss => {
        const journalKey = bossJournalKey(boss);
        return {
          key: boss.key,
          name: String(boss.name || 'Bölge bossu'),
          minLevel: Math.max(1, Number(boss.minLevel) || 1),
          journalKey,
          location: boss.location,
          unlocked: playerLevel >= (Number(boss.minLevel) || 1),
          defeated: Boolean(journalKey && journalBossKeys.has(journalKey))
        };
      });

    const regionDungeons = normalizedDungeons
      .filter(dungeon => dungeon.regionKey === region.key)
      .sort((a, b) => Number(a.minLevel || 0) - Number(b.minLevel || 0));

    const rareItemsByName = new Map();
    const addItem = (name, source, chance = null) => {
      const itemName = String(name || '').trim();
      if (!itemName) return;
      const existing = rareItemsByName.get(itemName) || {
        name: itemName,
        ownedQuantity: ownedItems.get(itemName) || 0,
        sources: [],
        dropChances: []
      };
      if (!existing.sources.includes(source)) existing.sources.push(source);
      if (Number.isFinite(Number(chance)) && chance !== null) existing.dropChances.push(Number(chance));
      rareItemsByName.set(itemName, existing);
    };

    for (const boss of regionBosses) {
      const source = normalizedBosses.find(item => item.key === boss.key) || {};
      for (const item of normalizeItemList(source.loot)) addItem(item, 'boss', source.lootChance);
      addItem(source.craftingMaterial, 'boss_material', null);
    }
    for (const dungeon of regionDungeons) addItem(dungeon.loot, 'dungeon', dungeon.lootChance);

    const visitsToNextMastery = visits % 3;
    const mappedDungeons = regionDungeons.map(dungeon => ({
      key: dungeon.key,
      name: String(dungeon.name || 'Bölge zindanı'),
      minLevel: Math.max(1, Number(dungeon.minLevel) || 1),
      unlocked: playerLevel >= (Number(dungeon.minLevel) || 1),
      lootName: String(dungeon.loot || ''),
      location: dungeon.location
    }));

    return {
      region,
      visits,
      discovered,
      unlocked,
      state: discovered ? 'discovered' : unlocked ? 'open' : 'locked',
      masteryLevel: Math.floor(visits / 3),
      visitsToNextMastery,
      masteryProgressPercent: Math.round(visitsToNextMastery / 3 * 100),
      bosses: regionBosses,
      dungeons: mappedDungeons,
      dungeonWins: Math.max(0, Number(dungeonWins) || 0),
      // Keep the legacy singular field for existing consumers while exposing every dungeon.
      dungeon: mappedDungeons[0] || null,
      rareItems: [...rareItemsByName.values()].sort((a, b) => a.name.localeCompare(b.name, 'tr'))
    };
  });

  const allBosses = regions.flatMap(region => region.bosses);
  const allDungeons = regions.flatMap(region => region.dungeons);
  const allRareItems = regions.flatMap(region => region.rareItems);
  return {
    regions,
    summary: {
      discoveredRegions: regions.filter(region => region.discovered).length,
      totalRegions: regions.length,
      defeatedBosses: allBosses.filter(boss => boss.defeated).length,
      totalBosses: allBosses.length,
      totalDungeons: allDungeons.length,
      ownedRareItems: allRareItems.filter(item => item.ownedQuantity > 0).length,
      totalRareItems: allRareItems.length,
      dungeonWins: Math.max(0, Number(dungeonWins) || 0)
    }
  };
}
