export function extractFailureLocations(output) {
  const text = String(output ?? '');
  const found = new Map();
  const patterns = [
    /(?:^|\s|\()((?:ai-agent|scripts|database)\/[\w./-]+\.js):(\d+):(\d+)/gm,
    /((?:ai-agent|scripts|database)\/[\w./-]+\.js):(\d+):(\d+)/gm
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const file = match[1].replace(/[),]+$/, '');
      const line = Number(match[2]);
      const column = Number(match[3]);
      const key = file + ':' + line + ':' + column;
      if (!found.has(key)) found.set(key, { file, line, column });
    }
  }
  return [...found.values()];
}

function check(name, result) {
  if (!result || result.applicable === false) return { name, status: 'NOT_RUN', detail: 'Kontrol uygulanmadı.' };
  if (result.timedOut) return { name, status: 'TIMEOUT', detail: 'Kontrol zaman aşımına uğradı.' };
  if (result.code === 0) return { name, status: 'PASS', detail: 'Kontrol başarılı.' };
  if (result.code === null || result.code === undefined) return { name, status: 'ERROR', detail: 'Kontrol başlatılamadı veya sonuç alınamadı.' };
  return { name, status: 'FAIL', detail: 'Kontrol başarısız (çıkış kodu: ' + result.code + ').' };
}

export function buildTestDiagnostics({ syntax, audit, suite, targeted, liveRpg } = {}) {
  const checks = [
    check('AI sözdizimi', syntax),
    check('Komut sözleşmeleri', audit),
    check('Genel test paketi', suite),
    check('Hedefli testler', targeted),
    check('Canlı RPG sağlık kontrolü', liveRpg ? { code: liveRpg.ok ? 0 : 1 } : null)
  ];
  const outputs = [syntax, audit, suite, targeted].filter(Boolean)
    .flatMap(result => [result.stdout, result.stderr].filter(Boolean));
  const locations = extractFailureLocations(outputs.join('\n'));
  const failedStages = checks.filter(item => ['FAIL', 'ERROR', 'TIMEOUT'].includes(item.status)).map(item => item.name);
  return {
    overall: failedStages.length ? 'FAIL' : checks.every(item => item.status === 'PASS' || item.status === 'NOT_RUN') ? 'PASS' : 'INCOMPLETE',
    checks,
    failedStages,
    locations
  };
}
