import { access, readFile } from 'node:fs/promises';

const inventory = JSON.parse(await readFile(new URL('../feature-inventory.json', import.meta.url), 'utf8'));
const errors = [];
const ids = inventory.features.map(feature => feature.id);
const originalFeatures = inventory.features.filter(feature => !feature.id.startsWith('ROADMAP-'));
const roadmapFeatures = inventory.features.filter(feature => feature.id.startsWith('ROADMAP-'));

const normalizeFeatureName = value => String(value || '')
  .normalize('NFKD')
  .replace(/[\\u0300-\\u036f]/g, '')
  .toLocaleLowerCase('en')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();
const names = new Map();
for (const feature of inventory.features) {
  const normalized = normalizeFeatureName(feature.name);
  if (!normalized) continue;
  const matches = names.get(normalized) || [];
  matches.push(feature.id);
  names.set(normalized, matches);
}
for (const [name, matches] of names) {
  if (matches.length > 1) {
    errors.push(`Yinelenen özellik adı (normalleştirilmiş): ${matches.join(', ')} → ${name}`);
  }
}

if (inventory.count !== inventory.features.length) {
  errors.push(`count alanı (${inventory.count}) kayıt sayısıyla (${inventory.features.length}) eşleşmeli.`);
}
if (!Number.isInteger(inventory.targetFeatures) || inventory.targetFeatures < 1) {
  errors.push('targetFeatures pozitif bir tam sayı olmalı.');
}
if (new Set(ids).size !== ids.length) errors.push('Özellik kimlikleri benzersiz olmalı.');
if (inventory.plannedFeatureCount !== roadmapFeatures.length) {
  errors.push(`plannedFeatureCount (${inventory.plannedFeatureCount}) planlanan kayıt sayısıyla (${roadmapFeatures.length}) eşleşmeli.`);
}
if (inventory.originalFeatureEvidenceLinkedCount !== originalFeatures.filter(feature => feature.testEvidence).length) {
  errors.push('originalFeatureEvidenceLinkedCount, kanıt bağlantısı bulunan özgün özellik sayısıyla eşleşmeli.');
}

for (const feature of inventory.features) {
  if (!feature.id || !feature.name || !feature.category) {
    errors.push('Her özellik id, name ve category alanlarına sahip olmalı.');
  }
  if (!inventory.statuses.includes(feature.status)) {
    errors.push(`Geçersiz durum: ${feature.id} → ${feature.status}`);
  }
}

for (const feature of originalFeatures) {
  const evidence = feature.testEvidence;
  if (!evidence || !Array.isArray(evidence.tests) || evidence.tests.length === 0 || !evidence.scope?.trim()) {
    errors.push(`Özgün özellik için test kanıtı veya kapsam açıklaması eksik: ${feature.id}`);
    continue;
  }
  for (const testPath of evidence.tests) {
    if (typeof testPath !== 'string' || !testPath.startsWith('scripts/') || testPath.includes('..')) {
      errors.push(`Güvenli olmayan test kanıtı yolu: ${feature.id} → ${testPath}`);
      continue;
    }
    try {
      await access(new URL(`../${testPath}`, import.meta.url));
    } catch {
      errors.push(`Test kanıtı dosyası bulunamadı: ${feature.id} → ${testPath}`);
    }
  }
}

for (const feature of roadmapFeatures) {
  if (feature.status !== 'planned') {
    errors.push(`Yeni yol haritası özelliği planned olmalı: ${feature.id} → ${feature.status}`);
  }
  if (feature.testEvidence) {
    errors.push(`Henüz uygulanmamış yol haritası özelliğine test kanıtı yazılamaz: ${feature.id}`);
  }
}

if (inventory.auditComplete !== (roadmapFeatures.length === 0 && originalFeatures.every(feature => feature.testEvidence))) {
  errors.push('auditComplete, özgün özellik kanıtları ve uygulanmamış yol haritası kayıtlarıyla tutarlı olmalı.');
}

if (errors.length) {
  console.error(errors.join('\\n'));
  process.exitCode = 1;
} else {
  const byStatus = Object.fromEntries(inventory.statuses.map(status => [
    status,
    inventory.features.filter(feature => feature.status === status).length
  ]));
  console.log(`Özellik envanteri geçerli: ${originalFeatures.length} özgün özellik kanıt bağlantılı; ${roadmapFeatures.length} yeni özellik planned; toplam ${inventory.features.length}/${inventory.targetFeatures}. Durumlar: ${JSON.stringify(byStatus)}.`);
  if (!inventory.auditComplete) {
    console.log('Not: Özgün özelliklerin kanıt bağlantıları mevcut; yol haritasındaki planned özellikler henüz uygulanmadığı için tam denetim tamamlanmadı.');
  }
}
