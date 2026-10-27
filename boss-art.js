const ART_ENV = {
  schattenwolf: 'POGACA_BOSS_ART_SCHATTENWOLF_URL',
  ruinGuardian: 'POGACA_BOSS_ART_RUIN_GUARDIAN_URL',
  northDemon: 'POGACA_BOSS_ART_NORTH_DEMON_URL',
  demonCommander: 'POGACA_BOSS_ART_DEMON_COMMANDER_URL',
  ausserstLord: 'POGACA_BOSS_ART_AUSSERST_LORD_URL',
  northGeneral: 'POGACA_RAID_ART_NORTH_GENERAL_URL',
  glassWyrm: 'POGACA_RAID_ART_GLASS_WYRM_URL',
  fallenMage: 'POGACA_RAID_ART_FALLEN_MAGE_URL',
  dungeonFinal: 'POGACA_DUNGEON_FINAL_BOSS_ART_URL'
};

/** Return only HTTPS image URLs; missing or malformed values simply disable the art slot. */
export function getBossArtUrl(key) {
  const envKey = ART_ENV[key];
  if (!envKey) return null;
  const value = String(process.env[envKey] || '').trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export const BOSS_ART_ENV_KEYS = ART_ENV;
