export function validateFeatureInventory(inventory) {
  const errors = [];
  if (!inventory || typeof inventory !== 'object' || Array.isArray(inventory)) {
    return ['Envanter bir JSON nesnesi olmalı.'];
  }
  const features = Array.isArray(inventory.features) ? inventory.features : [];
  const statuses = Array.isArray(inventory.statuses) ? inventory.statuses : [];
  if (!Array.isArray(inventory.features)) errors.push('features bir dizi olmalı.');
  if (!statuses.length) errors.push('statuses boş olmayan bir dizi olmalı.');
  if (!Number.isInteger(inventory.count) || inventory.count !== features.length) {
    errors.push(`count alanı (${inventory.count}) kayıt sayısıyla (${features.length}) eşleşmeli.`);
  }
  if (!Number.isInteger(inventory.targetFeatures) || inventory.targetFeatures < 1) {
    errors.push('targetFeatures pozitif bir tam sayı olmalı.');
  }
  if (typeof inventory.auditComplete !== 'boolean') errors.push('auditComplete boolean olmalı.');

  const ids = [];
  const normalizedNames = [];
  for (const [index, feature] of features.entries()) {
    if (!feature || typeof feature !== 'object' || Array.isArray(feature)) {
      errors.push(`Özellik kaydı ${index + 1} bir nesne olmalı.`);
      continue;
    }
    const id = String(feature.id || '').trim();
    const name = String(feature.name || '').trim();
    const category = String(feature.category || '').trim();
    if (!/^RPG-\d{3,}$/.test(id)) errors.push(`Geçersiz özellik kimliği: ${feature.id ?? '(boş)'}`);
    if (!name) errors.push(`Özellik adı boş: ${id || 'kayıt ' + (index + 1)}`);
    if (!category) errors.push(`Özellik kategorisi boş: ${id || 'kayıt ' + (index + 1)}`);
    ids.push(id);
    normalizedNames.push(name.toLocaleLowerCase('en-US'));
    if (!statuses.includes(feature.status)) {
      errors.push(`Geçersiz durum: ${id || '(kimlik yok)'} → ${feature.status}`);
    }
  }
  if (new Set(ids).size !== ids.length) errors.push('Özellik kimlikleri benzersiz olmalı.');
  if (new Set(normalizedNames).size !== normalizedNames.length) {
    errors.push('Özellik adları büyük/küçük harf ve kenar boşlukları normalize edildiğinde benzersiz olmalı.');
  }
  return errors;
}
