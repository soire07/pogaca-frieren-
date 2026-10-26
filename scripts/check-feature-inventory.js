import { readFile } from 'node:fs/promises';

const inventory = JSON.parse(await readFile(new URL('../feature-inventory.json', import.meta.url), 'utf8'));
const errors = [];
const ids = inventory.features.map(feature => feature.id);
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
