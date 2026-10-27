export const RAID_BOSSES = [
  { id: 'north-general', name: '🌑 Kuzey Platosu İblis Generali', hp: 220, damage: 14, xp: 180, coins: 220, loot: 'İblis Mührü', weakness: 'spell', weaknessLabel: 'Büyü', special: 'mana-star' },
  { id: 'glass-wyrm', name: '🐉 Cam Pullar Ejderhası', hp: 255, damage: 12, xp: 205, coins: 245, loot: 'Ejderha Camı', weakness: 'attack', weaknessLabel: 'Fiziksel saldırı', special: 'shard-rain' },
  { id: 'fallen-mage', name: '🕯️ Düşmüş Büyücü Aura', hp: 195, damage: 17, xp: 230, coins: 260, loot: 'Auranın Mühürlü Asa Parçası', weakness: 'spell', weaknessLabel: 'Zoltraak', special: 'mana-curse' }
];

export function chooseRaidBoss(random = Math.random) {
  return RAID_BOSSES[Math.floor(random() * RAID_BOSSES.length)] || RAID_BOSSES[0];
}

export const COMBAT_SPELLS = {
  zoltraak: { label: 'Zoltraak', cost: 12, multiplier: 1.8, kind: 'damage' },
  heilen: { label: 'Heilen', cost: 18, heal: 26, kind: 'heal' },
  schild: { label: 'Mana Kalkanı', cost: 10, kind: 'shield', reduction: 0.55 }
};

export function applyRaidWeakness(damage, boss, action) {
  return boss?.weakness === action ? Math.round(damage * 1.3) : damage;
}

export function applyEquipmentSetBonus(items, bonus) {
  const legendaryCount = items.filter(item => item.rarity === 'Efsanevi').length;
  const epicCount = items.filter(item => item.rarity === 'Destansı').length;
  return {
    attack: bonus.attack + (legendaryCount >= 2 ? 4 : 0),
    defense: bonus.defense + (epicCount >= 2 ? 3 : 0),
    hp: bonus.hp + (legendaryCount >= 2 ? 25 : 0),
    mana: bonus.mana + (epicCount >= 2 ? 15 : 0),
    setText: legendaryCount >= 2 ? 'Efsanevi set: +4 saldırı, +25 HP' : epicCount >= 2 ? 'Destansı set: +3 savunma, +15 mana' : null
  };
}

export function dungeonChoiceOutcome(choice, floor) {
  if (choice === 'secret') return { label: 'Gizli geçit', coins: 20 + floor * 8, hp: -8, mana: 0, lootChance: 0.45, log: 'Gizli geçit: ek altın bulundu ancak dar geçit yaraladı.' };
  if (choice === 'shrine') return { label: 'Mana mabedi', coins: 0, hp: 12 + Math.floor(floor / 2), mana: 16 + floor * 2, lootChance: 0.08, log: 'Mana mabedi: yaşayan takım üyeleri HP ve mana yeniledi.' };
  return { label: 'Güvenli yol', coins: 10 + floor * 4, hp: 0, mana: 0, lootChance: 0.15, log: 'Güvenli yol: takım tuzaklardan kaçınarak erzak buldu.' };
}

export function dungeonEnemyStats(floor, averageLevel, partySize, difficulty = 'normal') {
  const multiplier = difficulty === 'nightmare' ? 1.35 : difficulty === 'easy' ? 0.8 : 1;
  return {
    hp: Math.round((105 + floor * 48) * (1 + averageLevel * 0.045) * (1 + Math.max(0, partySize - 2) * 0.12) * multiplier),
    damage: Math.max(5, Math.round((5 + floor * 3) * (1 + averageLevel * 0.02) * multiplier))
  };
}

export function progressionMilestone(level, bossWins, dungeonWins) {
  const rewards = [];
  if (level >= 10) rewards.push('Kıdemli Maceracı');
  if (level >= 25) rewards.push('Kıdemli Büyücü');
  if (bossWins >= 5) rewards.push('İblis Avcısı');
  if (dungeonWins >= 5) rewards.push('Zindan Kaşifi');
  if (bossWins >= 10 && dungeonWins >= 10) rewards.push('Kuzeyin Efsanesi');
  return [...new Set(rewards)];
}


// Sınıf pasifleri: tek yerde tanımlanır ve savaşlarda tutarlı biçimde uygulanır.
export const CHARACTER_CLASSES = {
  gezgin: { label: 'Gezgin', description: 'Dengeli başlangıç sınıfı.', attackMultiplier: 1, defenseMultiplier: 1, healingMultiplier: 1, manaCostMultiplier: 1 },
  buyucu: { label: 'Büyücü', description: 'Büyü hasarı ve mana disiplininde uzman.', attackMultiplier: 1.08, defenseMultiplier: 1, healingMultiplier: 1, manaCostMultiplier: 0.9 },
  muhafiz: { label: 'Muhafız', description: 'Savunması daha güçlü, dayanıklı savaşçı.', attackMultiplier: 1, defenseMultiplier: 1.12, healingMultiplier: 1, manaCostMultiplier: 1 },
  sifaci: { label: 'Şifacı', description: 'İyileştirme büyüleri daha etkili.', attackMultiplier: 1, defenseMultiplier: 1, healingMultiplier: 1.2 }
};

export function getCharacterClass(className) {
  const normalized = String(className || 'Gezgin').normalize('NFKD').replace(/[\\u0300-\\u036f]/g, '').toLocaleLowerCase('tr-TR');
  if (normalized.includes('buyucu')) return CHARACTER_CLASSES.buyucu;
  if (normalized.includes('muhafiz')) return CHARACTER_CLASSES.muhafiz;
  if (normalized.includes('sifaci')) return CHARACTER_CLASSES.sifaci;
  return CHARACTER_CLASSES.gezgin;
}

export function applyClassDamage(baseDamage, className) {
  const profile = getCharacterClass(className);
  return Math.floor(Number(baseDamage) * profile.attackMultiplier);
}

export function applyClassDefense(baseDefense, className) {
  const profile = getCharacterClass(className);
  return Math.floor(Number(baseDefense) * profile.defenseMultiplier);
}

export function applyClassHealing(baseHealing, className) {
  const profile = getCharacterClass(className);
  return Math.floor(Number(baseHealing) * profile.healingMultiplier);
}


export function characterClassGuide() {
  return Object.entries(CHARACTER_CLASSES).map(([key, profile]) => ({
    key,
    label: profile.label,
    description: profile.description,
    bonuses: [
      profile.attackMultiplier > 1 ? `Büyü hasarı +${Math.round((profile.attackMultiplier - 1) * 100)}%` : null,
      profile.defenseMultiplier > 1 ? `Savunma +${Math.round((profile.defenseMultiplier - 1) * 100)}%` : null,
      profile.healingMultiplier > 1 ? `İyileştirme +${Math.round((profile.healingMultiplier - 1) * 100)}%` : null,
      profile.manaCostMultiplier < 1 ? `Mana maliyeti -${Math.round((1 - profile.manaCostMultiplier) * 100)}%` : null
    ].filter(Boolean)
  }));
}

export function applyClassManaCost(baseCost, className) {
  const profile = getCharacterClass(className);
  return Math.max(1, Math.floor(Number(baseCost) * (profile.manaCostMultiplier ?? 1)));
}


// Persistent player-selected combat archetypes. Bonuses are derived, never written over base stats.
export const CHARACTER_BUILDS = {
  dengeli: { label: '⚖️ Dengeli', description: 'Her alanda istikrarlı; dezavantajı yok.', attack: 1, defense: 1, hp: 1, mana: 1 },
  avci: { label: '⚔️ Avcı', description: 'Yüksek saldırı; daha düşük savunma.', attack: 1.2, defense: 0.9, hp: 1, mana: 1 },
  muhafiz: { label: '🛡️ Muhafız', description: 'Yüksek dayanıklılık ve savunma; biraz daha düşük saldırı.', attack: 0.9, defense: 1.2, hp: 1.2, mana: 1 },
  buyucu: { label: '🔮 Büyücü', description: 'Daha fazla mana ve büyü gücü; daha düşük savunma.', attack: 1.1, defense: 0.9, hp: 1, mana: 1.25 }
};

export function getCharacterBuild(buildKey) {
  return CHARACTER_BUILDS[String(buildKey || 'dengeli').toLocaleLowerCase('tr-TR')] || CHARACTER_BUILDS.dengeli;
}

/**
 * Three clear boss phases based on remaining health.
 * Phase transitions are deterministic so they can be tested and explained to players.
 */
export function getBossPhase(currentHp, maximumHp) {
  const hp = Number(currentHp);
  const maxHp = Number(maximumHp);
  if (!Number.isFinite(hp) || !Number.isFinite(maxHp) || maxHp <= 0) return 1;
  const ratio = Math.max(0, Math.min(1, hp / maxHp));
  if (ratio <= 1 / 3) return 3;
  if (ratio <= 2 / 3) return 2;
  return 1;
}

export function calculateBossIncomingDamage(rawDamage, defense, phase = 1) {
  const raw = Number.isFinite(Number(rawDamage)) ? Math.max(0, Math.floor(Number(rawDamage))) : 0;
  const guard = Number.isFinite(Number(defense)) ? Math.max(0, Math.floor(Number(defense))) : 0;
  const mitigated = Math.max(1, raw - Math.floor(guard / 2));
  const multiplier = phase >= 3 ? 1.25 : phase === 2 ? 1.1 : 1;
  return Math.max(1, Math.round(mitigated * multiplier));
}

export function bossPhaseSpecialBonus(phase) {
  return phase >= 3 ? 8 : phase === 2 ? 4 : 0;
}


/** Mastery-10 awakenings: a distinct capstone perk for every combat spell. */
export function getSpellMasteryAwakening(spellKey, masteryLevel) {
  const level = Math.max(0, Math.min(10, Math.floor(Number(masteryLevel) || 0)));
  if (level < 10) return { damage: 0, freezeChance: 0, shieldReduction: 0, healing: 0, wallReduction: 0 };
  const perks = {
    zoltraak: { damage: 8 },
    alev_kuresi: { damage: 10 },
    buz_mizragi: { freezeChance: 0.1 },
    koruyucu_bariyer: { shieldReduction: 0.05 },
    sifa_isigi: { healing: 10 },
    yildirim_zinciri: { damage: 12 },
    tas_duvar: { wallReduction: 0.05 },
    mana_patlamasi: { damage: 15 }
  };
  return { damage: 0, freezeChance: 0, shieldReduction: 0, healing: 0, wallReduction: 0, ...(perks[spellKey] || {}) };
}
