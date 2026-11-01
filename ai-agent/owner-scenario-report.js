export function buildOwnerScenarioReport(target, result = {}) {
  const output = String(result.stdout || '') + '\n' + String(result.stderr || '');
  const selectedLine = output.split('\n').find(line => line.startsWith('SEÇİLEN TEST DOSYALARI:')) || '';
  const testFiles = selectedLine
    ? selectedLine.slice('SEÇİLEN TEST DOSYALARI:'.length).split(';')
      .map(value => value.trim().split(' (')[0]).filter(Boolean).slice(0, 12)
    : [];
  const sumMetric = label => output.split('\n')
    .filter(line => line.startsWith('# ' + label + ' '))
    .reduce((total, line) => total + (Number(line.slice(('# ' + label + ' ').length)) || 0), 0);
  const summary = {
    total: sumMetric('tests'),
    pass: sumMetric('pass'),
    fail: sumMetric('fail'),
    skipped: sumMetric('skipped')
  };
  const memoryPrivacyTarget = /bellek|memory|gizlilik|privacy|postgres|veritabani|database/i.test(String(target || ''));
  const liveMemoryProof = output.includes('scripts/test-live-memory.js') && output.includes('CANLI POSTGRESQL TESTİ: BAŞARILI');
  const failedStages = [];
  if (!testFiles.length) failedStages.push('Hedefe uygun mevcut test dosyası bulunamadı.');
  if (result.code !== 0 && testFiles.length) failedStages.push('Seçilen test paketlerinden en az biri başarısız oldu veya tamamlanamadı.');
  if (memoryPrivacyTarget && !liveMemoryProof) failedStages.push('Canlı PostgreSQL bellek gizliliği kanıtı alınamadı.');
  const status = !testFiles.length ? 'NOT_TESTED'
    : result.code === 0 && !(memoryPrivacyTarget && !liveMemoryProof) ? 'PASS' : 'FAIL';
  return {
    target: String(target || '').trim().slice(0, 300),
    status,
    summary,
    testFiles,
    failedStages,
    checks: [{
      status,
      name: 'Hedefe özel testler',
      detail: summary.total
        ? summary.total + ' test; ' + summary.pass + ' başarılı; ' + summary.fail + ' başarısız; ' + summary.skipped + ' atlandı.'
        : 'Test çıktısında TAP sayacı bulunamadı.'
    }]
  };
}
