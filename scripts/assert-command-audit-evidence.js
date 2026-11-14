import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const report = JSON.parse(await readFile('command-audit-report.json', 'utf8'));
const requiredCommands = ['haberleri-ayarla', 'haberleri-kapat', 'site', 'raidbossbilgi'];
const results = new Map((report.results || []).map(result => [result.command, result]));
const failures = requiredCommands.flatMap(command => {
  const result = results.get(command);
  return result?.status === 'PASS'
    ? []
    : [command + ': expected PASS, received ' + (result?.status || 'MISSING') +
      (result?.detail ? ' (' + result.detail + ')' : '')];
});

assert.deepEqual(failures, [], 'Missing isolated command behavior evidence:\n' + failures.join('\n'));
console.log('Required command behavior evidence: ' + requiredCommands.length + '/' + requiredCommands.length + ' PASS.');
