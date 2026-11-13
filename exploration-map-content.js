import { EXPLORATION_REGION_CATALOG } from './exploration-regions.js';

const BOSS_JOURNAL_KEYS = Object.freeze({
  level_1: 'schattenwolf',
  level_10: 'ruinGuardian',
  level_20: 'northDemon',
  level_35: 'demonCommander',
  level_50: 'ausserstLord'
});

const BOSS_REGION_KEYS = Object.freeze({
  'Merkez Topraklar': 'merkez',
  'Büyük Orman Yolu': 'orman',
  'Kadim Harabeler': 'harabeler',
  'Kuzey Toprakları': 'kuzey',
  'Kuzey Topraklarına Giden Yol': 'kuzey',
  'Kuzey Yaylaları': 'yayla',
  'Äußerst Sınav Rotası': 'aus'
});

function normalizeItemList(value) {
  if (Array.isArray(value)) return value;
  return value === null || value === undefined || value === '' ? [] : [value];
}

function dungeonRegionKey(dungeon) {
  const level = Number(dungeon?.minLevel);
  if (!Number.isFinite(level)) return null;
  const region = [...EXPLORATION_REGION_CATALOG]
    .filter(item => Number(item.minLevel) <= level)
    .sort((a, b) => Number(b.minLevel) - Number(a.minLevel))[0];
  return region?.key || EXPLORATION_REGION_CATALOG[0]?.key || null;
}

function bossRegionKey(boss) {
  const explicit = BOSS_REGION_KEYS[String(boss?.region || '').trim()];
  if (explicit) return explicit;
  const key = String(boss?.key || '');
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

  const regions = EXPLORATION_REGION_CATALOG.map(region => {
    const visits = visitsByRegion.get(region.key) || 0;
    const discovered = visits > 0;
    const unlocked = playerLevel >= Number(region.minLevel);
    const regionBosses = (bosses || [])
      .filter(boss => bossRegionKey(boss) === region.key)
      .map(boss => {
        const journalKey = BOSS_JOURNAL_KEYS[String(boss.key || '')] || String(boss.journalKey || '');
        return {
          key: String(boss.key || ''),
          name: String(boss.name || 'Bölge bossu'),
          minLevel: Math.max(1, Number(boss.minLevel) || 1),
          journalKey,
          unlocked: playerLevel >= (Number(boss.minLevel) || 1),
          defeated: Boolean(journalKey && journalBossKeys.has(journalKey))
        };
      });

    const regionDungeons = (dungeons || []).filter(dungeon => dungeonRegionKey(dungeon) === region.key);
    const dungeon = regionDungeons
      .slice()
      .sort((a, b) => Number(b.minLevel || 0) - Number(a.minLevel || 0))[0] || null;
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
      const source = (bosses || []).find(item => String(item.key || '') === boss.key) || {};
      for (const item of normalizeItemList(source.loot)) addItem(item, 'boss', source.lootChance);
      addItem(source.craftingMaterial, 'boss_material', null);
    }
    if (dungeon) addItem(dungeon.loot, 'dungeon', dungeon.lootChance);

    const visitsToNextMastery = visits % 3;
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
      dungeon: dungeon ? {
        key: String(dungeon.key || ''),
        name: String(dungeon.name || 'Bölge zindanı'),
        minLevel: Math.max(1, Number(dungeon.minLevel) || 1),
        unlocked: playerLevel >= (Number(dungeon.minLevel) || 1),
        lootName: String(dungeon.loot || '')
      } : null,
      rareItems: [...rareItemsByName.values()].sort((a, b) => a.name.localeCompare(b.name, 'tr'))
    };
  });

  const allBosses = regions.flatMap(region => region.bosses);
  const allRareItems = regions.flatMap(region => region.rareItems);
  return {
    regions,
    summary: {
      discoveredRegions: regions.filter(region => region.discovered).length,
      totalRegions: regions.length,
      defeatedBosses: allBosses.filter(boss => boss.defeated).length,
      totalBosses: allBosses.length,
      ownedRareItems: allRareItems.filter(item => item.ownedQuantity > 0).length,
      totalRareItems: allRareItems.length,
      dungeonWins: Math.max(0, Number(dungeonWins) || 0)
    }
  };
}
