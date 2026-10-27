/**
 * Shared gameplay-depth systems for Poğaça Frieren.
 * These helpers are deterministic and side-effect free so command handlers can
 * consume them without duplicating balance rules.
 */

export const REGION_PROFILES = {
  forest: { key: 'forest', name: 'Kuzey Ormanı', threat: 1, material: '🌿 Büyülü Ot', rareFindBonus: 0.02, recommendedLevel: 1 },
  ruins: { key: 'ruins', name: 'Kadim Harabeler', threat: 2, material: '💎 Mana Kristali', rareFindBonus: 0.03, recommendedLevel: 8 },
  mountains: { key: 'mountains', name: 'Kuzey Dağları', threat: 3, material: '🐉 Ejderha Pulu', rareFindBonus: 0.04, recommendedLevel: 18 },
  wasteland: { key: 'wasteland', name: 'İblis Çoraklığı', threat: 4, material: '📖 Yasak Büyü Kitabı', rareFindBonus: 0.05, recommendedLevel: 30 },
  sanctuary: { key: 'sanctuary', name: 'Kadim Elf Sığınağı', threat: 5, material: '🌙 Efsunlu Elf Yadigârı', rareFindBonus: 0.06, recommendedLevel: 40 },
  bakery: { key: 'bakery', name: 'Büyülü Fırın Yolu', threat: 1, material: '🥐 Büyülü Poğaça Kutusu', rareFindBonus: 0.01, recommendedLevel: 1 }
};

export function getRegionProfile(regionKey) {
  return REGION_PROFILES[String(regionKey || '').toLowerCase()] || null;
}

export function getRegionThreat(regionKey, playerLevel = 1, masteryVisits = 0) {
  const region = getRegionProfile(regionKey);
  if (!region) return null;
  const level = Math.max(1, Math.floor(Number(playerLevel) || 1));
  const visits = Math.max(0, Math.floor(Number(masteryVisits) || 0));
  const levelGap = Math.max(0, region.recommendedLevel - level);
  const masteryDiscount = Math.min(2, Math.floor(visits / 5));
  const effectiveThreat = Math.max(1, region.threat + Math.ceil(levelGap / 10) - masteryDiscount);
  return {
    ...region,
    effectiveThreat,
    levelGap,
    masteryDiscount,
    suggestedPower: Math.max(1, region.recommendedLevel),
    warning: levelGap >= 15 ? 'Bölge seviyenin oldukça üzerinde; dikkatli ilerle.' : levelGap >= 7 ? 'Bu bölge için biraz daha güçlenmen önerilir.' : null
  };
}

export const BOSS_BEHAVIOR_PROFILES = {
  schattenwolf: { key: 'schattenwolf', style: 'ambush', label: 'Pusu Avcısı', tell: 'Kurt pençelerini yere bastırıp saldırı öncesi çömeliyor.', counter: 'Savunma veya kalkan kullanmak darbeyi azaltır.', specialBonus: 2 },
  ruinGuardian: { key: 'ruinGuardian', style: 'armor_break', label: 'Rün Kırıcısı', tell: 'Muhafızın rünleri çatlayarak parlamaya başlıyor.', counter: 'Aşama değişmeden önce güçlü saldırı kullan.', specialBonus: 3 },
  northDemon: { key: 'northDemon', style: 'mana_drain', label: 'Mana Avcısı', tell: 'İblis çevresindeki manayı kendine çekiyor.', counter: 'Mana tüketen büyüler yerine fiziksel saldırı seç.', specialBonus: 3 },
  demonCommander: { key: 'demonCommander', style: 'area_burst', label: 'Alan Yıkıcısı', tell: 'Zemin kırmızı mühürlerle kaplanıyor.', counter: 'Saldırıdan önce iyileş veya savunma güçlendir.', specialBonus: 4 },
  ausserstLord: { key: 'ausserstLord', style: 'adaptive', label: 'Uyarlanan Hükümdar', tell: 'Hükümdar önceki saldırı tarzını gözlemliyor.', counter: 'Arka arkaya aynı hamleyi kullanmaktan kaçın.', specialBonus: 5 },
  'north-general': { key: 'north-general', style: 'mana_star', label: 'Mana Yıldızı', tell: 'Gökyüzünde bir mana yıldızı beliriyor.', counter: 'İşaretli saldırıdan önce kalkan veya savunma seç.', specialBonus: 4 },
  'glass-wyrm': { key: 'glass-wyrm', style: 'shard_rain', label: 'Kristal Fırtınası', tell: 'Ejderhanın cam pulları titreşip havalanıyor.', counter: 'Kristal yağmuru öncesinde savunma artır.', specialBonus: 4 },
  'fallen-mage': { key: 'fallen-mage', style: 'mana_curse', label: 'Mana Laneti', tell: 'Büyücü elindeki mührü karartıyor.', counter: 'Özel saldırıdan önce mana rezervini gözden geçir.', specialBonus: 5 },
  dungeonFinal: { key: 'dungeonFinal', style: 'phase_shift', label: 'Zindan Hükümdarı', tell: 'Son patronun mührü yeni bir aşamaya geçiyor.', counter: 'Aşama değişiminde kaynaklarını ve savunmanı dengeli kullan.', specialBonus: 6 }
};

export function getBossBehaviorProfile(bossKey) {
  return BOSS_BEHAVIOR_PROFILES[String(bossKey || '')] || null;
}

export function getBossTelegraph(bossKey, phase = 1) {
  const profile = getBossBehaviorProfile(bossKey);
  if (!profile) return null;
  const safePhase = Math.max(1, Math.min(3, Math.floor(Number(phase) || 1)));
  return {
    ...profile,
    phase: safePhase,
    warning: safePhase === 1 ? profile.tell : safePhase === 2 ? `⚠️ ${profile.tell}` : `🔴 Son aşama: ${profile.tell}`,
    counter: profile.counter,
    specialBonus: profile.specialBonus + (safePhase - 1) * 2
  };
}

const ROLE_PROFILES = {
  'Gezgin': 'flex',
  'Savaşçı': 'frontline',
  'Muhafız': 'frontline',
  'Büyücü': 'caster',
  'Şifacı': 'support',
  'Okçu': 'ranged',
  'Hırsız': 'striker',
  'Avcı': 'striker'
};

export function getPartyRoleSynergy(classNames = []) {
  const roles = classNames.map(name => ROLE_PROFILES[String(name || '')] || 'flex');
  const uniqueRoles = new Set(roles);
  const hasFrontline = roles.includes('frontline');
  const hasSupport = roles.includes('support');
  const hasCaster = roles.includes('caster');
  const hasDamage = roles.some(role => role === 'striker' || role === 'ranged');
  const diversity = uniqueRoles.size;
  const synergy = Math.min(0.18, Math.max(0, diversity - 1) * 0.04 + (hasFrontline && hasSupport ? 0.04 : 0) + (hasCaster && hasDamage ? 0.02 : 0));
  return {
    roles,
    diversity,
    synergy,
    attackMultiplier: 1 + synergy,
    defenseMultiplier: 1 + (hasFrontline && hasSupport ? 0.08 : 0),
    healingMultiplier: 1 + (hasSupport && hasCaster ? 0.08 : 0),
    summary: synergy > 0 ? `Takım sinerjisi: +${Math.round(synergy * 100)}% saldırı` : 'Takım rolleri henüz ek sinerji oluşturmuyor.'
  };
}

export const CRAFTING_TIERS = [
  { tier: 1, label: 'Gezgin', requiredLevel: 1, materials: ['🌿 Büyülü Ot', '🥐 Büyülü Poğaça Kutusu'], outputRarity: 'Yaygın' },
  { tier: 2, label: 'Macera', requiredLevel: 8, materials: ['💎 Mana Kristali', '📖 Yasak Büyü Kitabı'], outputRarity: 'Nadir' },
  { tier: 3, label: 'İblis Avcısı', requiredLevel: 20, materials: ['🐉 Ejderha Pulu', '💎 Mana Kristali'], outputRarity: 'Destansı' },
  { tier: 4, label: 'Efsane', requiredLevel: 35, materials: ['🌙 Efsunlu Elf Yadigârı', '🐉 Ejderha Pulu'], outputRarity: 'Efsanevi' },
  { tier: 5, label: 'Himmel Mirası', requiredLevel: 50, materials: ['👑 Himmel’in Efsanevi Yadigârı', '🌙 Efsunlu Elf Yadigârı'], outputRarity: 'Efsanevi' }
];

export function getCraftingProgress(playerLevel, knownMaterials = []) {
  const level = Math.max(1, Math.floor(Number(playerLevel) || 1));
  const owned = new Set(knownMaterials);
  return CRAFTING_TIERS.map(tier => {
    const levelUnlocked = level >= tier.requiredLevel;
    const missingMaterials = tier.materials.filter(material => !owned.has(material));
    return {
      ...tier,
      unlocked: levelUnlocked,
      ready: levelUnlocked && missingMaterials.length === 0,
      missingMaterials: levelUnlocked ? missingMaterials : [...tier.materials],
      status: !levelUnlocked ? 'level_locked' : missingMaterials.length ? 'materials_missing' : 'ready'
    };
  });
}

export const JOURNAL_COLLECTIONS = {
  discoveries: { label: 'Keşifler', reward: { coins: 250, xp: 150 }, keys: ['ancient-elf-sanctuary', 'wandering-bakery', 'forest-grimoire', 'ruined-chamber', 'forgotten-grimoire', 'demon-tracks', 'old-passage', 'northern-storm', 'ancient-mana-vein', 'north-gate-clash', 'exam-ruins', 'sealed-archive'] },
  bosses: { label: 'Boss avı', reward: { coins: 400, xp: 250 }, keys: ['schattenwolf', 'ruinGuardian', 'northDemon', 'demonCommander', 'ausserstLord'] },
  spells: { label: 'Büyü arşivi', reward: { coins: 200, xp: 200 }, keys: ['alev_kuresi', 'buz_mizragi', 'koruyucu_bariyer', 'sifa_isigi', 'yildirim_zinciri', 'tas_duvar', 'mana_patlamasi'] },
  relics: { label: 'Yadigâr koleksiyonu', reward: { coins: 500, xp: 300 }, keys: ['Büyülü Poğaça Kutusu', 'Yasak Büyü Kitabı', 'Ejderha Pulu', 'Efsunlu Elf Yadigârı', 'Himmel’in Efsanevi Yadigârı'] }
};

export function getJournalCollectionProgress(collectionKey, discoveredKeys = []) {
  const collection = JOURNAL_COLLECTIONS[collectionKey];
  if (!collection) return null;
  const owned = new Set(discoveredKeys);
  const found = collection.keys.filter(key => owned.has(key));
  return {
    key: collectionKey,
    label: collection.label,
    total: collection.keys.length,
    found: found.length,
    remaining: collection.keys.length - found.length,
    complete: found.length === collection.keys.length,
    progress: collection.keys.length ? found.length / collection.keys.length : 1,
    reward: { ...collection.reward },
    foundKeys: found
  };
}
