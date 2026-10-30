const normalize = value => String(value ?? '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('tr-TR');

export function isMemoryPrivacyTarget(target) {
  return /bellek|memory|postgres|gizlilik|privacy|veritabani|database|hassas veri|log sizintisi/.test(normalize(target));
}

export function hasLiveMemoryPrivacyProof(target, output) {
  if (!isMemoryPrivacyTarget(target)) return true;
  const report = String(output ?? '');
  return /scripts\/test-live-memory\.js/i.test(report)
    && /CANLI POSTGRESQL TESTİ:\s*BAŞARILI/i.test(report);
}

export function liveMemoryPrivacySummarySuffix(isMemoryPrivacyTarget) {
  return isMemoryPrivacyTarget
    ? '\nCanlı PostgreSQL bellek gizliliği: BAŞARILI — scripts/test-live-memory.js çıktısı doğrulandı.'
    : '';
}

export function isTargetedTestFailure(targeted) {
  return Boolean(targeted?.applicable) && targeted.code !== 0;
}
