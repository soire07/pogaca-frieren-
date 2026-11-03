const FEATURE_ID = /^(?:RPG|SRV|FUN|SOC)-\d{3}$/;

function normalizeFeatureName(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, ' ')
    .trim();
}

export function inspectFeatureInventory(inventory) {
  const errors = [];
  const features = Array.isArray(inventory?.features) ? inventory.features : [];
  const statuses = Array.isArray(inventory?.statuses) ? inventory.statuses : [];
  const ids = new Set();
  const names = new Set();
  const rpgNumbers = [];
  const byStatus = Object.fromEntries(statuses.map(status => [status, 0]));

  if (!inventory || typeof inventory !== 'object' || Array.isArray(inventory)) {
    errors.push('inventory must be an object');
  }
  if (!Array.isArray(inventory?.features)) errors.push('features must be an array');
  if (!Array.isArray(inventory?.statuses) || !statuses.length) errors.push('statuses must be a non-empty array');
  if (new Set(statuses).size !== statuses.length) errors.push('duplicate status definitions are not allowed');
  if (inventory?.count !== features.length) {
    errors.push('count does not match the number of feature records');
  }
  if (!Number.isInteger(inventory?.targetFeatures) || inventory.targetFeatures < 1) {
    errors.push('targetFeatures must be a positive integer');
  }
  if (typeof inventory?.auditComplete !== 'boolean') {
    errors.push('auditComplete must be a boolean');
  }

  for (const [index, feature] of features.entries()) {
    if (!feature || typeof feature !== 'object' || Array.isArray(feature)) {
      errors.push('feature at index ' + index + ' must be an object');
      continue;
    }
    const id = String(feature.id ?? '');
    const name = normalizeFeatureName(feature.name);
    const category = String(feature.category ?? '').trim();

    if (!FEATURE_ID.test(id)) errors.push('invalid feature ID: ' + (id || '(empty)'));
    if (id && ids.has(id)) errors.push('duplicate feature ID: ' + id);
    if (id) ids.add(id);
    if (!id || !name || !category) errors.push('feature at index ' + index + ' is missing id, name, or category');
    if (name && names.has(name)) errors.push('duplicate normalized feature name: ' + name);
    if (name) names.add(name);

    if (!statuses.includes(feature.status)) {
      errors.push('invalid status for ' + (id || 'feature at index ' + index) + ': ' + String(feature.status));
    } else {
      byStatus[feature.status] = (byStatus[feature.status] || 0) + 1;
    }

    const match = id.match(/^RPG-(\d{3})$/);
    if (match) rpgNumbers.push(Number(match[1]));
  }

  const maxRpgNumber = Math.max(0, ...rpgNumbers);
  const presentRpgNumbers = new Set(rpgNumbers);
  const missingRpgIds = [];
  for (let number = 1; number <= maxRpgNumber; number++) {
    if (!presentRpgNumbers.has(number)) missingRpgIds.push(number);
  }

  return {
    errors,
    featureCount: features.length,
    byStatus,
    auditComplete: inventory?.auditComplete === true,
    missingRpgIds
  };
}
