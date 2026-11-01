import { readFile } from 'node:fs/promises';
import { validateFeatureInventory } from '../feature-inventory-validation.js';

const inventory = JSON.parse(await readFile(new URL('../feature-inventory.json', import.meta.url), 'utf8'));
const errors = validateFeatureInventory(inventory);

if (errors.length) {
  console.error(errors.join('\n'));
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
  const ids = new Set(inventory.features.map(feature => Number(feature.id.slice(4))));
  const gaps = [];
  for (let id = 1; id <= Math.max(...ids); id++) if (!ids.has(id)) gaps.push('RPG-' + String(id).padStart(3, '0'));
  if (gaps.length) console.log('Uzlaştırılmamış kimlik boşlukları (otomatik doldurulmadı): ' + gaps.join(', '));
}
