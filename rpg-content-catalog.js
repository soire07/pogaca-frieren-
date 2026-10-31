import { getBossArtUrl } from './boss-art.js';
import { RAID_BOSSES } from './rpg-mechanics.js';

export const DEFAULT_DUNGEON_TIERS = Object.freeze([
  { key: 'level_1', minLevel: 1, name: '🌾 Merkez Topraklar Mahzeni', hp: 160, damage: 8, xp: 45, coins: 55, level: 1, lootChance: 0.10, loot: 'Eski Mahzen Anahtarı' },
  { key: 'level_5', minLevel: 5, name: '🌲 Büyük Orman Zindanı', hp: 260, damage: 13, xp: 75, coins: 90, level: 5, lootChance: 0.14, loot: 'Orman Kristali' },
  { key: 'level_15', minLevel: 15, name: '🗿 Kadim Harabe Zindanı', hp: 420, damage: 20, xp: 110, coins: 130, level: 15, lootChance: 0.18, loot: 'Kadim Rün Parçası' },
  { key: 'level_30', minLevel: 30, name: '🌑 Kuzeyin Mühürlü Mahzeni', hp: 620, damage: 28, xp: 150, coins: 180, level: 30, lootChance: 0.22, loot: 'Kuzey Mührü' }
].map(item => Object.freeze(item)));

export const DEFAULT_SOLO_BOSSES = Object.freeze([
  { key: 'level_1', minLevel: 1, name: '🐺 Schattenwolf', region: 'Merkez Topraklar', maxHp: 120, minDamage: 7, maxDamage: 12, coinMin: 90, coinMax: 130, xpMin: 55, xpMax: 85, lootChance: 0.2, loot: ['🐺 Schattenwolfzahn'], craftingMaterial: '🥐 Büyülü Poğaça Kutusu', artUrl: getBossArtUrl('schattenwolf'), special: 'Rudelstoß', specialType: 'heavy' },
  { key: 'level_10', minLevel: 10, name: '🗿 Kadim Harabe Muhafızı', region: 'Kadim Harabeler', maxHp: 210, minDamage: 10, maxDamage: 16, coinMin: 150, coinMax: 210, xpMin: 95, xpMax: 140, lootChance: 0.3, loot: ['🗿 Muhafız Rünü'], craftingMaterial: '📖 Yasak Büyü Kitabı', artUrl: getBossArtUrl('ruinGuardian'), special: 'Kadim Sarsıntı', specialType: 'heavy' },
  { key: 'level_20', minLevel: 20, name: '👹 Kuzey İblisi', region: 'Kuzey Toprakları', maxHp: 330, minDamage: 13, maxDamage: 20, coinMin: 230, coinMax: 320, xpMin: 150, xpMax: 210, lootChance: 0.35, loot: ['🩸 Kuzey İblisinin Kalbi'], craftingMaterial: '🐉 Ejderha Pulu', artUrl: getBossArtUrl('northDemon'), special: 'Mana Kemiren Lanet', specialType: 'drain' },
  { key: 'level_35', minLevel: 35, name: '🩸 Büyük İblis Komutanı', region: 'Kuzey Yaylaları', maxHp: 470, minDamage: 16, maxDamage: 24, coinMin: 340, coinMax: 470, xpMin: 220, xpMax: 310, lootChance: 0.45, loot: ['🩸 İblis Komutanının Kanı'], craftingMaterial: '🌙 Efsunlu Elf Yadigârı', artUrl: getBossArtUrl('demonCommander'), special: 'Komutanın Hiddeti', specialType: 'heavy' },
  { key: 'level_50', minLevel: 50, name: '👑 Äußerst Sınavının İblis Efendisi', region: 'Äußerst Sınav Rotası', maxHp: 650, minDamage: 20, maxDamage: 29, coinMin: 500, coinMax: 700, xpMin: 330, xpMax: 460, lootChance: 0.55, loot: ['🩸 İblis Komutanının Kanı', '🗿 Muhafız Rünü', '🩸 Kuzey İblisinin Kalbi'], craftingMaterial: '👑 Himmel’in Efsanevi Yadigârı', artUrl: getBossArtUrl('ausserstLord'), special: 'Äußerst Büyü Patlaması', specialType: 'arcane' }
].map(item => Object.freeze(item)));

export const DEFAULT_RAID_BOSSES = Object.freeze(RAID_BOSSES.map(boss => Object.freeze({ ...boss, key: boss.id })));

export const RPG_CONTENT_CATALOGS = Object.freeze({
  dungeon: DEFAULT_DUNGEON_TIERS,
  solo_boss: DEFAULT_SOLO_BOSSES,
  raid_boss: DEFAULT_RAID_BOSSES
});

export function selectDungeonForLevel(level, tiers = DEFAULT_DUNGEON_TIERS) {
  const available = [...(tiers || [])].filter(tier => Number.isFinite(Number(tier.minLevel)));
  const unlocked = available.filter(tier => Number(level) >= Number(tier.minLevel))
    .sort((a, b) => Number(a.minLevel) - Number(b.minLevel));
  return unlocked.at(-1) || null;
}
