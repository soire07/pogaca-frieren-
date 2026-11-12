import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const GUARDIAN_EVENT_URL = 'https://pogaca-frieren.onrender.com/internal/guardian/github-actions-event';
export const GUARDIAN_OIDC_AUDIENCE = 'frieren-guard-security';

export function buildDependencyAuditEvent(report, {
  runId = 'manual-run',
  sourceSha = '0'.repeat(40),
  now = new Date().toISOString(),
} = {}) {
  const counts = report?.metadata?.vulnerabilities;
  if (!counts || !['info', 'low', 'moderate', 'high', 'critical', 'total'].every(key => Number.isFinite(Number(counts[key])))) {
    throw new Error('NPM_AUDIT_REPORT_INVALID');
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(String(runId))) {
    throw new Error('GUARDIAN_RUN_ID_INVALID');
  }
  if (!/^[a-f0-9]{40}$/i.test(String(sourceSha))) throw new Error('GUARDIAN_SOURCE_SHA_INVALID');

  const total = Number(counts.total);
  const severity = Number(counts.critical) > 0 ? 'critical'
    : Number(counts.high) > 0 ? 'high'
      : Number(counts.moderate) > 0 ? 'medium'
        : total > 0 ? 'low' : 'low';
  const packages = Object.entries(report.vulnerabilities || {})
    .filter(([, item]) => Number(item?.severity === 'critical' ? 4
      : item?.severity === 'high' ? 3
        : item?.severity === 'moderate' ? 2
          : item?.severity === 'low' ? 1 : 0) > 0)
    .slice(0, 8)
    .map(([name, item]) => name + ' (' + String(item.severity || 'unknown') + ')');

  const eventType = total > 0 ? 'incident' : 'heartbeat';
  const code = total > 0 ? 'DEPENDENCY_AUDIT_FINDINGS' : 'DEPENDENCY_AUDIT_CLEAN';
  const summary = total > 0
    ? 'Production dependency audit found ' + total + ' vulnerability/vulnerabilities: '
      + Number(counts.critical) + ' critical, ' + Number(counts.high) + ' high, '
      + Number(counts.moderate) + ' moderate, ' + Number(counts.low) + ' low.'
    : 'Production dependency audit completed; no known vulnerabilities were reported.';
  return {
    eventId: 'github-actions-' + String(runId),
    source: 'frieren_guard',
    sourceSha: String(sourceSha),
    eventType,
    code,
    severity,
    title: total > 0 ? 'Production dependency audit found vulnerabilities' : 'Production dependency audit completed',
    summary,
    observedAt: new Date(now).toISOString(),
    evidence: [
      { message: 'Source: GitHub Actions · npm audit --omit=dev · commit ' + String(sourceSha) },
      { message: 'Counts: critical=' + Number(counts.critical) + ', high=' + Number(counts.high) + ', moderate=' + Number(counts.moderate) + ', low=' + Number(counts.low) },
      ...packages.map(name => ({ message: 'Affected package: ' + name })),
    ].slice(0, 8),
  };
}

export async function requestGithubOidcToken({
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  const requestUrl = String(env.ACTIONS_ID_TOKEN_REQUEST_URL || '');
  const requestToken = String(env.ACTIONS_ID_TOKEN_REQUEST_TOKEN || '');
  if (!requestUrl || !requestToken) throw new Error('GITHUB_ACTIONS_OIDC_UNAVAILABLE');
  const url = new URL(requestUrl);
  url.searchParams.set('audience', GUARDIAN_OIDC_AUDIENCE);
  const response = await fetchImpl(url.toString(), {
    headers: { Authorization: 'Bearer ' + requestToken, Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error('GITHUB_ACTIONS_OIDC_TOKEN_REQUEST_FAILED');
  const payload = await response.json();
  if (typeof payload?.value !== 'string' || payload.value.length < 100) throw new Error('GITHUB_ACTIONS_OIDC_TOKEN_INVALID');
  return payload.value;
}

export async function sendGithubGuardEvent(event, {
  env = process.env,
  fetchImpl = fetch,
  endpoint = GUARDIAN_EVENT_URL,
} = {}) {
  const token = await requestGithubOidcToken({ env, fetchImpl });
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(event),
    signal: AbortSignal.timeout(10_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !['recorded', 'duplicate'].includes(payload.status)) {
    throw new Error('GUARDIAN_EVENT_DELIVERY_FAILED_' + response.status);
  }
  return payload;
}

async function runCli() {
  const [mode, inputPath, outputPath] = process.argv.slice(2);
  if (mode === 'audit') {
    if (!inputPath || !outputPath) throw new Error('Usage: node guardian/github-guard-sender.js audit <npm-audit.json> <event.json>');
    const report = JSON.parse(await readFile(inputPath, 'utf8'));
    const event = buildDependencyAuditEvent(report, {
      runId: process.env.GITHUB_RUN_ID || 'manual-run-0001',
      sourceSha: process.env.GITHUB_SHA || '0'.repeat(40),
    });
    await writeFile(outputPath, JSON.stringify(event), { mode: 0o600 });
    if (process.env.GITHUB_OUTPUT) {
      await appendFile(process.env.GITHUB_OUTPUT, 'has_findings=' + (event.eventType === 'incident' ? 'true' : 'false') + '\n');
    }
    process.stdout.write('Dependency audit event prepared: ' + event.eventType + ', severity=' + event.severity + '\n');
    return;
  }
  if (mode === 'send') {
    if (!inputPath) throw new Error('Usage: node guardian/github-guard-sender.js send <event.json>');
    const event = JSON.parse(await readFile(inputPath, 'utf8'));
    const receipt = await sendGithubGuardEvent(event);
    process.stdout.write('Guardian receipt: ' + receipt.status + ' · ' + receipt.eventId + '\n');
    return;
  }
  throw new Error('Unknown mode. Use audit or send.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch(error => {
    process.stderr.write(String(error?.message || error) + '\n');
    process.exitCode = 1;
  });
}
