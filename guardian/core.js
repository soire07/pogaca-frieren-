import { createHash } from 'node:crypto';

export const GUARDIAN_SYSTEMS = Object.freeze([
  'frieren_neural',
  'frieren_ai',
  'pogaca_frieren',
  'owner_panel',
  'guardian',
]);

export const GUARDIAN_INCIDENT_STATUSES = Object.freeze([
  'open',
  'in_review',
  'awaiting_approval',
  'resolved',
  'ignored',
]);

const SECRET_PATTERNS = [
  /(authorization\s*:\s*bearer\s+)[A-Za-z0-9._~+\/-]+/gi,
  /\b(DISCORD_TOKEN|GROQ_API_KEY|OPENAI_API_KEY|FRIEREN_API_TOKEN|FRIEREN_BRIDGE_SECRET|DATABASE_URL|PASSWORD|CLIENT_SECRET)\s*[:=]\s*["'`]?[^\s,'"`]+/gi,
  /postgres(?:ql)?:\/\/[^\s"'<>]+/gi,
];

export function redactGuardianText(value, maxLength = 1600) {
  let text = String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ').trim();
  for (const pattern of SECRET_PATTERNS) text = text.replace(pattern, '$1[REDACTED]');
  return text.slice(0, Math.max(0, maxLength));
}

export function classifyGuardianSeverity(value) {
  const text = String(value ?? '').toLocaleLowerCase('tr-TR');
  if (/data loss|veri kayb|veritabanı bozul|database corruption|security breach|güvenlik aç|secret leak|token leak|bakiye kayb|çift ödül|duplicate reward|unauthorized access/.test(text)) return 'critical';
  if (/uncaught|exception|crash|çök|unavailable|unhealthy|http 5\d\d|timeout|zaman aş|failed|başarısız|connection refused/.test(text)) return 'high';
  if (/latency|gecikme|slow|yavaş|memory|bellek|cpu|performans|rate limit/.test(text)) return 'medium';
  return 'low';
}

function normalizeFingerprintPart(value) {
  return String(value ?? '')
    .toLocaleLowerCase('tr-TR')
    .replace(/\b\d{17,20}\b/g, '#id')
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, '#uuid')
    .replace(/\b\d+\b/g, '#')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeEvidence(items) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 8).map(item => {
    const entry = item && typeof item === 'object' ? item : { message: item };
    const file = String(entry.file || entry.path || '');
    const safeFile = file && !file.startsWith('/') && !file.split(/[\\/]/).includes('..')
      ? redactGuardianText(file, 180) : '';
    if (file && !safeFile) return null;
    const line = Number(entry.line);
    return {
      ...(safeFile ? { file: safeFile } : {}),
      ...(Number.isSafeInteger(line) && line > 0 ? { line } : {}),
      message: redactGuardianText(entry.message || entry.excerpt || entry.status || '', 500),
    };
  }).filter(item => item && (item.message || item.file));
}

export function createGuardianIncident(input = {}) {
  const system = GUARDIAN_SYSTEMS.includes(input.system) ? input.system : 'owner_panel';
  const codeCandidate = String(input.code || input.errorType || 'UNKNOWN').trim();
  const code = /^[A-Z0-9_.:-]{1,80}$/i.test(codeCandidate) ? codeCandidate.toUpperCase() : 'UNKNOWN';
  const title = redactGuardianText(input.title || code, 160) || code;
  const summary = redactGuardianText(input.summary || input.message || title, 1600) || title;
  const severity = ['critical', 'high', 'medium', 'low'].includes(input.severity)
    ? input.severity : classifyGuardianSeverity(title + ' ' + summary);
  const evidence = sanitizeEvidence(input.evidence);
  const fingerprintSource = [
    system,
    code,
    normalizeFingerprintPart(title),
    normalizeFingerprintPart(summary),
  ].join('\n');
  const fingerprint = createHash('sha256').update(fingerprintSource).digest('hex');
  return { system, code, title, summary, severity, evidence, fingerprint };
}

export function canRequestGuardianReview({
  attempts = 0,
  lastReviewAt = null,
  activeJob = false,
  now = Date.now(),
  cooldownMs = 15 * 60 * 1000,
  maxAttempts = 3,
} = {}) {
  if (activeJob) return { allowed: false, reason: 'REVIEW_ALREADY_RUNNING' };
  if (Number(attempts) >= maxAttempts) return { allowed: false, reason: 'REVIEW_ATTEMPT_LIMIT' };
  if (lastReviewAt) {
    const timestamp = new Date(lastReviewAt).getTime();
    if (Number.isFinite(timestamp) && now - timestamp < cooldownMs) {
      return { allowed: false, reason: 'REVIEW_COOLDOWN' };
    }
  }
  return { allowed: true, reason: null };
}

export function evaluateGuardianApprovalGate({
  testsPassed = false,
  securityPassed = false,
  dataIntegrityPassed = false,
  ownerApproved = false,
  deploymentApproved = false,
} = {}) {
  const checksPassed = testsPassed === true && securityPassed === true && dataIntegrityPassed === true;
  const canMerge = checksPassed && ownerApproved === true;
  return {
    checksPassed,
    canMerge,
    canDeploy: canMerge && deploymentApproved === true,
    reason: !checksPassed ? 'REQUIRED_CHECKS_NOT_PASSED'
      : !ownerApproved ? 'OWNER_APPROVAL_REQUIRED'
        : !deploymentApproved ? 'DEPLOYMENT_APPROVAL_REQUIRED' : null,
  };
}
