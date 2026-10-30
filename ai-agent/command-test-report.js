export function formatCommandTestResult(item = {}) {
  const status = String(item.status || 'UNKNOWN');
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⏸️';
  const lines = [
    icon + ' **/' + String(item.command || 'unknown') + '** — ' + status,
    item.expected ? 'Beklenen: ' + String(item.expected).slice(0, 220) : '',
    item.actual ? 'Gerçek: ' + String(item.actual).slice(0, 260) : '',
  ].filter(Boolean);
  for (const check of Array.isArray(item.behavioralChecks) ? item.behavioralChecks : []) {
    lines.push(
      (check.passed === true ? '  ✓ ' : '  ✗ ')
      + String(check.name || 'Davranış kontrolü')
      + ' | Beklenen: ' + String(check.expected || '—').slice(0, 100)
      + ' | Gerçek: ' + String(check.actual || '—').slice(0, 120)
    );
  }
  if (item.evidenceType) lines.push('Kanıt: ' + String(item.evidenceType).slice(0, 100));
  if (item.error) lines.push('Hata: ' + String(item.error).slice(0, 180));
  return lines.join('\n');
}
