export function buildCommandEvidence({ responseCount = 0, behavioralChecks = [] } = {}) {
  const checks = Array.isArray(behavioralChecks) ? behavioralChecks : [];
  const failed = checks.filter(check => check?.passed !== true);
  if (checks.length > 0) {
    if (responseCount <= 0) {
      return {
        status: 'FAIL',
        expected: 'Komut yanıt üretmeli ve tüm davranış kontrollerini geçmeli.',
        actual: 'Davranış kontrolleri mevcut olsa da Discord yanıtı/etkisi kaydedilmedi.',
        comparison: 'FAIL: yanıt yolu tamamlanmadı',
        detail: 'Komut beklenen Discord yanıtını üretmedi.'
      };
    }
    return {
      status: failed.length === 0 ? 'PASS' : 'FAIL',
      expected: checks.map(check => check.expected).join('; '),
      actual: checks.map(check => check.actual).join('; '),
      comparison: failed.length === 0
        ? 'PASS: komuta özel veritabanı durum kontrollerinin tamamı geçti'
        : 'FAIL: ' + failed.map(check => check.name).join(', ') + ' doğrulanamadı',
      detail: failed.length === 0 ? null : 'Başarısız davranış kontrolleri: ' + failed.map(check => check.name).join(', ')
    };
  }
  if (responseCount > 0) {
    return {
      status: 'INCONCLUSIVE',
      expected: 'Komutun beklenen özellik etkileri doğrulanmalı.',
      actual: 'İşleyici ' + responseCount + ' yanıt/etki üretti; özellik etkisi doğrulanmadı.',
      comparison: 'INCONCLUSIVE: yanıt yolu çalıştı; davranış kanıtı yok',
      detail: 'Komut için davranışsal doğrulama henüz tanımlanmadı.'
    };
  }
  return {
    status: 'FAIL',
    expected: 'Komut en az bir yanıt üretmeli veya davranışsal sonucu doğrulanmalı.',
    actual: 'Yanıt/etki kaydedilmedi ve davranışsal kontrol bulunmuyor.',
    comparison: 'FAIL: yanıt veya doğrulanmış etki yok',
    detail: 'Komut yanıt/etki üretmedi.'
  };
}
