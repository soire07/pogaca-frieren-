import { readFile } from 'node:fs/promises';
import { inspectFeatureInventory } from '../feature-inventory-validator.js';

const inventory = JSON.parse(await readFile(new URL('../feature-inventory.json', import.meta.url), 'utf8'));
const result = inspectFeatureInventory(inventory);

if (result.errors.length) {
  console.error(result.errors.join(String.fromCharCode(10)));
  process.exitCode = 1;
} else {
  console.log(
    'Özellik envanteri geçerli: ' + result.featureCount +
    ' kayıt; hedef ' + inventory.targetFeatures +
    '; durumlar: ' + JSON.stringify(result.byStatus) + '.'
  );
  if (result.missingRpgIds.length) {
    console.log(
      'Uyarı: Eksik RPG kimlikleri: ' +
      result.missingRpgIds.map(number => 'RPG-' + String(number).padStart(3, '0')).join(', ') +
      '. Bu kimlikler otomatik doldurulmadı.'
    );
  }
  if (!result.auditComplete) {
    console.log('Not: Envanter kanıt denetimi tamamlanmadı; kayıtlar canlı doğrulanmış sayılmaz.');
  }
}
