import { spawn } from 'node:child_process';
import { isMemoryPrivacyTarget } from '../ai-agent/test-report-guards.js';

function redactSecrets(value, env = process.env) {
  let output = String(value || '');
  for (const [key, secret] of Object.entries(env)) {
    if (/TOKEN|KEY|SECRET|PASSWORD|DATABASE_URL|CONNECTION_STRING/i.test(key)
        && typeof secret === 'string' && secret.length >= 8) {
      output = output.split(secret).join('[REDACTED]');
    }
  }
  return output;
}

export function buildTargetedTestPlan(target) {
  const normalizedTarget = String(target || '').normalize('NFKD')
    .replace(/[\\u0300-\\u036f]/g, '').toLocaleLowerCase('tr-TR');
  const memoryPrivacyCoverage = isMemoryPrivacyTarget(target);
  const commandInteractionCoverage = normalizedTarget.includes('command interaction coverage')
    || normalizedTarget.includes('interaction command coverage')
    || normalizedTarget.includes('komut etkilesim kapsam');
  const broadGroups = [
    /sava[sş]|combat|boss|hasar|damage|savunma|defense|rpg|karakter|character|ekipman|equipment|kesif|explor/,
    /gorev|quest|odul|reward|ilerleme|progress|seviye|level|tecrube|experience|xp/,
    /discord|komut|command|etkilesim|interaction|slash|buton|button|izin|permission/
  ];
  const broadRegression = broadGroups.filter(pattern => pattern.test(normalizedTarget)).length >= 2;
  const broadTestFiles = [
    'scripts/test-boss-combat.js',
    'scripts/check-gameplay-integrity.js',
    'scripts/test-discord-scenarios.js',
    'scripts/test-command-interaction-coverage.js'
  ];
  const testArgs = memoryPrivacyCoverage
    ? ['scripts/test-request.js', String(target)]
    : broadRegression
      ? ['--test', ...broadTestFiles]
      : commandInteractionCoverage
        ? ['--test', 'scripts/test-command-interaction-coverage.js']
        : ['scripts/test-request.js', String(target)];
  const directSuiteNotice = memoryPrivacyCoverage
    ? ''
    : broadRegression
      ? 'SEÇİLEN TEST DOSYALARI: ' + broadTestFiles.join('; ') + ' (mevcut testler; doğrudan çok alanlı paket)'
      : commandInteractionCoverage
        ? 'SEÇİLEN TEST DOSYALARI: scripts/test-command-interaction-coverage.js (doğrudan çalıştırıldı)'
        : '';
  return { testArgs, directSuiteNotice, memoryPrivacyCoverage, commandInteractionCoverage, broadRegression };
}

export function runTargetedTests(target, {
  rootDir = process.cwd(),
  timeoutMs = Math.max(30_000, Math.min(Number(process.env.FRIEREN_TEST_TIMEOUT_MS) || 240_000, 300_000)),
  env = process.env,
  spawnImpl = spawn,
} = {}) {
  if (typeof target !== 'string' || !target.trim() || target.length > 4_000) {
    return Promise.reject(new Error('INVALID_TARGETED_TEST_TARGET'));
  }
  const plan = buildTargetedTestPlan(target);
  return new Promise(resolve => {
    const child = spawnImpl(process.execPath, plan.testArgs, {
      cwd: rootDir, shell: false, windowsHide: true,
      env: { ...env, CI: 'true' }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let selectionNotice = '';
    let selectionScanBuffer = '';
    let settled = false;
    const finish = (code, error = '', timedOut = false) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const directNotice = plan.directSuiteNotice ? plan.directSuiteNotice + '\\n' : '';
      const safeStdout = redactSecrets(stdout, env);
      const safeStderr = redactSecrets(stderr + error, env);
      const matcherNotice = selectionNotice && !safeStdout.includes('SEÇİLEN TEST DOSYALARI:')
        ? selectionNotice + '\\n' : '';
      const diagnosticOutput = plan.commandInteractionCoverage && safeStderr.trim()
        ? '\\n=== HEDEFLİ TEST TANILAMALARI ===\\n' + safeStderr.trim() : '';
      resolve({
        applicable: true, code, timedOut,
        stdout: (directNotice + matcherNotice + safeStdout + diagnosticOutput).slice(-20_000),
        stderr: plan.commandInteractionCoverage ? '' : safeStderr.slice(-4_000),
        note: '',
      });
    };
    child.stdout?.on('data', chunk => {
      const chunkText = chunk.toString();
      selectionScanBuffer = (selectionScanBuffer + chunkText).slice(-2_000);
      if (!selectionNotice) {
        const match = selectionScanBuffer.match(/SEÇİLEN TEST DOSYALARI:[^\\r\\n]*/);
        if (match) selectionNotice = match[0];
      }
      stdout = (stdout + chunkText).slice(-10_000);
    });
    child.stderr?.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-4_000); });
    child.on('error', error => finish(null, error.message));
    child.on('close', code => finish(code));
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      finish(null, 'İstek bazlı test zaman aşımına uğradı.', true);
    }, timeoutMs);
  });
}
