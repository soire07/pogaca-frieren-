import test from 'node:test';
import assert from 'node:assert/strict';
import {
  auditRoadmapCapabilities,
  normalizeCapabilityName,
  splitRoadmapAction
} from './roadmap-capability-audit.js';

test('roadmap action parsing keeps the capability separate from the requested operation', () => {
  assert.deepEqual(splitRoadmapAction('Preview personal home features'), {
    action: 'Preview', capability: 'personal home features'
  });
  assert.deepEqual(splitRoadmapAction('Unlock personal home features'), {
    action: 'Unlock', capability: 'personal home features'
  });
  assert.deepEqual(splitRoadmapAction('Earn milestones for personal home features'), {
    action: 'Earn milestones for', capability: 'personal home features'
  });
  assert.deepEqual(splitRoadmapAction('Review history for personal home features'), {
    action: 'Review history for', capability: 'personal home features'
  });
  assert.deepEqual(splitRoadmapAction('A unique boss invasion'), {
    action: 'Unclassified', capability: 'A unique boss invasion'
  });
});

test('Turkish diacritics normalize without merging distinct category scopes', () => {
  assert.equal(normalizeCapabilityName('Büyü Ustalığı'), normalizeCapabilityName('Buyu Ustaligi'));
  const report = auditRoadmapCapabilities({
    count: 3, plannedFeatureCount: 2,
    features: [
      { id: 'ROADMAP-1', category: 'Magic', name: 'Preview Büyü Ustalığı', status: 'planned' },
      { id: 'ROADMAP-2', category: 'Magic', name: 'Unlock Buyu Ustaligi', status: 'planned' }
    ]
  });
  assert.equal(report.capabilityCount, 1);
  assert.equal(report.repeatedCapabilityGroups, 1);
  assert.equal(report.repeatedVariantCount, 1);
  assert.deepEqual(report.errors, ['count ile toplam özellik kayıt sayısı eşleşmiyor.']);
});

test('full inventory normalizes compound action phrases into 325 capability groups', async () => {
  const { readFile } = await import('node:fs/promises');
  const inventory = JSON.parse(await readFile(new URL('../feature-inventory.json', import.meta.url), 'utf8'));
  const report = auditRoadmapCapabilities(inventory);
  assert.equal(report.roadmapCount, 1675);
  assert.equal(report.capabilityCount, 325);
  assert.equal(report.repeatedCapabilityGroups, 225);
  assert.equal(report.repeatedVariantCount, 1350);
  assert.deepEqual(report.errors, []);
});

test('same capability in different categories remains separate', () => {
  const report = auditRoadmapCapabilities({
    count: 2, plannedFeatureCount: 2,
    features: [
      { id: 'ROADMAP-1', category: 'Magic', name: 'Preview Spell mastery', status: 'planned' },
      { id: 'ROADMAP-2', category: 'Companions', name: 'Preview Spell mastery', status: 'planned' }
    ]
  });
  assert.equal(report.capabilityCount, 2);
  assert.equal(report.repeatedCapabilityGroups, 0);
  assert.deepEqual(report.errors, []);
});

test('invalid roadmap state and inconsistent inventory counters are reported', () => {
  const report = auditRoadmapCapabilities({
    count: 3, plannedFeatureCount: 4,
    features: [
      { id: 'ROADMAP-1', category: 'Housing', name: 'Preview home', status: 'implemented' },
      { id: 'ROADMAP-2', category: '', name: '', status: 'planned' }
    ]
  });
  assert.equal(report.errors.length, 4);
  assert.match(report.errors.join(' '), /planned olmalı/);
  assert.match(report.errors.join(' '), /name\/category eksik/);
  assert.match(report.errors.join(' '), /plannedFeatureCount/);
  assert.match(report.errors.join(' '), /count ile toplam/);
});
