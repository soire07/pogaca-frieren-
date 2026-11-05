import { readFile } from 'node:fs/promises';

const ACTIONS = Object.freeze([
  'Earn milestones for', 'Review history for',
  'Preview', 'Unlock', 'Track', 'Compare', 'Customize',
  'Generate', 'Set', 'Build', 'Save', 'Create', 'Replay', 'Filter', 'Share',
  'Follow', 'Nominate', 'Collect', 'Assign', 'Name', 'Place', 'Visit',
  'Connect', 'View', 'Export', 'Configure', 'Manage', 'Upgrade', 'Claim',
  'Complete', 'Participate'
]);

export function normalizeCapabilityName(value) {
  return String(value || '')
    .replace(/[ıİ]/g, 'i')
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLocaleLowerCase('en')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function splitRoadmapAction(name) {
  const value = String(name || '').trim();
  const match = ACTIONS.find(action => new RegExp('^' + action + '\\s+', 'i').test(value));
  return {
    action: match || 'Unclassified',
    capability: match ? value.replace(new RegExp('^' + match + '\\s+', 'i'), '').trim() : value
  };
}

export function auditRoadmapCapabilities(inventory) {
  const errors = [];
  const features = Array.isArray(inventory?.features) ? inventory.features : [];
  const roadmap = features.filter(feature => String(feature.id || '').startsWith('ROADMAP-'));
  const groups = new Map();
  const actionCounts = {};
  const categoryGroups = {};

  for (const feature of roadmap) {
    if (!feature.name || !feature.category) {
      errors.push('Roadmap kaydında name/category eksik: ' + (feature.id || 'unknown'));
      continue;
    }
    if (feature.status !== 'planned') {
      errors.push('Roadmap kaydı planned olmalı: ' + feature.id);
    }
    const split = splitRoadmapAction(feature.name);
    const normalized = normalizeCapabilityName(split.capability);
    if (!normalized) {
      errors.push('Boş yetenek adı: ' + feature.id);
      continue;
    }
    const key = feature.category + '|' + normalized;
    const group = groups.get(key) || {
      category: feature.category,
      capability: split.capability,
      ids: [],
      actions: {}
    };
    group.ids.push(feature.id);
    group.actions[split.action] = (group.actions[split.action] || 0) + 1;
    groups.set(key, group);
    actionCounts[split.action] = (actionCounts[split.action] || 0) + 1;
    categoryGroups[feature.category] = categoryGroups[feature.category] || new Set();
    categoryGroups[feature.category].add(normalized);
  }

  const capabilities = [...groups.values()].sort((a, b) =>
    a.category.localeCompare(b.category) || a.capability.localeCompare(b.capability)
  );
  const repeated = capabilities
    .filter(group => group.ids.length > 1)
    .map(group => ({ ...group, count: group.ids.length }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));

  if (inventory?.plannedFeatureCount !== roadmap.length) {
    errors.push('plannedFeatureCount ile ROADMAP kayıt sayısı eşleşmiyor.');
  }
  if (inventory?.count !== features.length) {
    errors.push('count ile toplam özellik kayıt sayısı eşleşmiyor.');
  }

  return {
    errors,
    roadmapCount: roadmap.length,
    capabilityCount: capabilities.length,
    repeatedCapabilityGroups: repeated.length,
    repeatedVariantCount: repeated.reduce((sum, group) => sum + group.count - 1, 0),
    actionCounts,
    categoryCapabilityCounts: Object.fromEntries(
      Object.entries(categoryGroups).map(([category, values]) => [category, values.size])
    ),
    repeated,
    capabilities
  };
}

async function main() {
  const inventory = JSON.parse(await readFile(new URL('../feature-inventory.json', import.meta.url), 'utf8'));
  const report = auditRoadmapCapabilities(inventory);
  if (report.errors.length) {
    console.error(report.errors.join('\\n'));
    process.exitCode = 1;
    return;
  }
  console.log('Roadmap capability audit: ' + report.roadmapCount + ' planned records represent '
    + report.capabilityCount + ' normalized category/capability groups; '
    + report.repeatedCapabilityGroups + ' groups contain repeated action variants ('
    + report.repeatedVariantCount + ' extra records).');
  console.log('Action distribution: ' + JSON.stringify(report.actionCounts));
  console.log('Capability groups by category: ' + JSON.stringify(report.categoryCapabilityCounts));
  console.log('Repeated variants are audit findings, not automatically deletable duplicates.');
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) await main();
