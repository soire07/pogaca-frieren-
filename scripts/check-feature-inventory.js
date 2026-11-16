import { access, readFile } from 'node:fs/promises';

const inventory = JSON.parse(await readFile(new URL('../feature-inventory.json', import.meta.url), 'utf8'));
const errors = [];
const ids = inventory.features.map(feature => feature.id);
const originalFeatures = inventory.features;

const normalizeFeatureName = value => String(value || '')
  .replace(/[ıİ]/g, 'i')
  .normalize('NFKD')
  .replace(/\p{M}+/gu, '')
  .toLocaleLowerCase('en')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const normalizationCases = [
  ['Büyü', 'Buyu'],
  ['Işık', 'Isik'],
  ['İksir', 'Iksir'],
  ['Çığlık', 'Ciglik'],
  ['Şövalye', 'Sovalye'],
  ['Gölge', 'Golge'],
  ['Üstat', 'Ustat'],
  ['Yağmur', 'Yagmur'],
];
for (const [turkish, ascii] of normalizationCases) {
  if (normalizeFeatureName(turkish) !== normalizeFeatureName(ascii)) {
    errors.push(`Türkçe Unicode normalizasyonu doğru çalışmıyor: ${turkish} → ${ascii}`);
  }
}

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
if (!Number.isInteger(inventory.targetFeatures) || inventory.targetFeatures !== originalFeatures.length) {
  errors.push('targetFeatures pozitif bir tam sayı olmalı.');
}
if (new Set(ids).size !== ids.length) errors.push('Özellik kimlikleri benzersiz olmalı.');
if (inventory.plannedFeatureCount !== 0 || originalFeatures.some(feature =>
  feature.status === 'planned' || String(feature.id || '').startsWith('ROADMAP-')
)) {
  errors.push('Aktif özellik envanterinde planlanan/backlog veya ROADMAP kaydı bulunmamalı.');
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

if (inventory.auditComplete !== originalFeatures.every(feature => feature.status === 'live_verified')) {
  errors.push('auditComplete yalnızca tüm özellikler canlı çalışma zamanında doğrulandığında true olabilir.');
}

if (errors.length) {
  console.error(errors.join('\\n'));
  process.exitCode = 1;
} else {
  const byStatus = Object.fromEntries(inventory.statuses.map(status => [
    status,
    inventory.features.filter(feature => feature.status === status).length
  ]));
  console.log(`Özellik envanteri geçerli: ${originalFeatures.length} aktif özellik; ${inventory.plannedFeatureCount} planlanan kayıt; toplam ${inventory.features.length}/${inventory.targetFeatures}. Durumlar: ${JSON.stringify(byStatus)}.`);
  if (!inventory.auditComplete) {
    console.log('Not: Envanterdeki özelliklerin canlı çalışma zamanı doğrulaması tamamlanmadığı için auditComplete=false.');
  }
}
