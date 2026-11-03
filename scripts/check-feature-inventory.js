import { readFile } from 'node:fs/promises';

const inventory = JSON.parse(await readFile(new URL('../feature-inventory.json', import.meta.url), 'utf8'));
const errors = [];
const ids = inventory.features.map(feature => feature.id);
if (inventory.count !== inventory.features.length) {
  errors.push(`count alanı (${inventory.count}) kayıt sayısıyla (${inventory.features.length}) eşleşmeli.`);
}
if (!Number.isInteger(inventory.targetFeatures) || inventory.targetFeatures < 1) {
  errors.push('targetFeatures pozitif bir tam sayı olmalı.');
}
if (new Set(ids).size !== ids.length) errors.push('Özellik kimlikleri benzersiz olmalı.');
for (const feature of inventory.features) {
  if (!feature.id || !feature.name || !feature.category) {
    errors.push('Her özellik id, name ve category alanlarına sahip olmalı.');
  }
  if (!inventory.statuses.includes(feature.status)) {
    errors.push(`Geçersiz durum: ${feature.id} → ${feature.status}`);
  }
  if (!['verified_by_automated_test','mapped_needs_review'].includes(feature.status)) {
    errors.push(`Özellik test izlenebilirliğine alınmamış: ${feature.id} → ${feature.status}`);
  }
  if (feature.status === 'verified_by_automated_test') {
    if (!Array.isArray(feature.verificationEvidence) || feature.verificationEvidence.length === 0) {
      errors.push(`Doğrulanmış özellikte test kanıtı eksik: ${feature.id}`);
    }
    if (!/^[a-f0-9]{40}$/i.test(String(feature.verifiedAtCommit || '')) || !Number.isInteger(feature.verificationRunId)) {
      errors.push(`Doğrulanmış özellikte CI commit/run bilgisi eksik: ${feature.id}`);
    }
    for (const evidence of feature.verificationEvidence || []) {
      if (!evidence.file || !['unit_test','postgres_integration','isolated_command_audit'].includes(evidence.type)) {
        errors.push(`Geçersiz kanıt tanımı: ${feature.id}`);
        continue;
      }
      try {
        const source = await readFile(new URL('../' + evidence.file, import.meta.url), 'utf8');
        if (evidence.type === 'isolated_command_audit') {
          if (!evidence.command || !(source.includes("commandName === '" + evidence.command + "'") || source.includes("'" + evidence.command + "'") || source.includes('"' + evidence.command + '"'))) {
            errors.push('Komut kanıtı bulunamadı: ' + feature.id + ' → ' + evidence.command);
          }
          if (!Array.isArray(evidence.checks) || evidence.checks.length === 0) {
            errors.push('Komut kanıtında davranış kontrolleri eksik: ' + feature.id);
          } else {
            for (const check of evidence.checks) {
              if (typeof check !== 'string' || !check.trim() || !source.includes(check)) {
                errors.push('Komut davranış kanıtı bulunamadı: ' + feature.id + ' → ' + check);
              }
            }
          }
        } else if (!evidence.test || !source.includes(evidence.test)) {
          errors.push(`Test kanıtı bulunamadı: ${feature.id} → ${evidence.test}`);
        }
      } catch {
        errors.push(`Kanıt dosyası okunamadı: ${feature.id} → ${evidence.file}`);
      }
    }
  } else if (feature.status === 'mapped_needs_review') {
    const evidence = feature.candidateEvidence;
    if (evidence?.type !== 'test_candidate' || !evidence.file || !evidence.test || !Number.isFinite(evidence.matchScore) || evidence.matchScore < 0.18 || evidence.reviewRequired !== true) {
      errors.push(`Aday test eşlemesi eksik veya geçersiz: ${feature.id}`);
    } else {
      try {
        const source = await readFile(new URL('../' + evidence.file, import.meta.url), 'utf8');
        if (!source.includes(evidence.test)) errors.push(`Aday test başlığı dosyada bulunamadı: ${feature.id} → ${evidence.test}`);
      } catch {
        errors.push(`Aday test dosyası okunamadı: ${feature.id} → ${evidence.file}`);
      }
    }
  }
}
if (inventory.auditComplete && inventory.features.some(feature => feature.status !== 'verified_by_automated_test')) {
  errors.push('auditComplete yalnızca 325 özelliğin tamamı doğrulandığında true olabilir.');
}
if (errors.length) {
  console.error(errors.join('\\n'));
  process.exitCode = 1;
} else {
  const byStatus = Object.fromEntries(inventory.statuses.map(status => [
    status,
    inventory.features.filter(feature => feature.status === status).length
  ]));
  console.log(`Özellik envanteri geçerli: ${inventory.features.length} kayıtlı özellik; hedef ${inventory.targetFeatures}. Durumlar: ${JSON.stringify(byStatus)}.`);
  if (!inventory.auditComplete) {
    console.log('Not: İlk envanter henüz tüm eski özellikleri kapsamıyor; bu sayı toplam tamamlanma sayısı değildir.');
  }
}
