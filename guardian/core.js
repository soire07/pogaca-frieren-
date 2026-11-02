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
  /(authorization\s*:\s*basic\s+)[A-Za-z0-9+/=]+/gi,
  /\b([A-Z][A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASSWD|API_KEY|PRIVATE_KEY|ACCESS_KEY|DATABASE_URL|DSN))\s*[:=]\s*[\"']?[^\s,'\"]+/gi,
  /(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s\"'<>]+/gi,
  /https?:\/\/[^\s/@:]+:[^\s/@]+@[^\s\"'<>]+/gi,
];

export function redactGuardianText(value, maxLength = 1600) {
  let text = String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ').trim();
  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, (match, prefix) => (prefix || '') + '[REDACTED]');
  }
  text = text.replace(/\b\d{17,20}\b/g, '[ID]').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[EMAIL]');
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

const NEURAL_DIMENSIONS = Object.freeze([
  'correctness', 'instruction_adherence', 'turkish_quality',
  'grounding', 'safety_privacy', 'conversation_consistency',
]);

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Fail-closed Neural quality gate. Endpoint health and model self-assessment
 * are never sufficient evidence for a release decision.
 */
export function evaluateNeuralQualityGate({
  qualityReport,
  stagedTestsPassed = false,
  memoryIsolationPassed = false,
  securityChecksPassed = false,
  resourceChecksPassed = false,
  ownerApproved = false,
  deploymentApproved = false,
} = {}) {
  const reasons = [];
  const report = qualityReport && typeof qualityReport === 'object' ? qualityReport : {};
  const metrics = report.metrics && typeof report.metrics === 'object' ? report.metrics : {};
  const averages = metrics.dimension_averages && typeof metrics.dimension_averages === 'object'
    ? metrics.dimension_averages : {};
  const outputs = Array.isArray(report.outputs) ? report.outputs : [];
  const baseline = report.baseline_comparison || {};
  const human = report.human_review || {};
  const provenance = report.training_provenance || {};
  const heldout = report.heldout_metrics || {};

  if (report.decision !== 'READY FOR STAGED TEST') reasons.push('NEURAL_QUALITY_REPORT_NOT_READY');
  if (report.prompt_set_version !== 'tr-conversation-v1') reasons.push('NEURAL_PROMPT_SET_MISMATCH');
  if (!/^[a-f0-9]{64}$/i.test(String(report.checkpoint_sha256 || ''))) reasons.push('NEURAL_CHECKPOINT_FINGERPRINT_MISSING');
  const reviewerIds = report.review_template?.reviewers;
  if (human.completed !== true || human.reviewers_required !== 2
      || !Array.isArray(reviewerIds) || reviewerIds.length !== 2
      || new Set(reviewerIds).size !== 2
      || reviewerIds.some(id => !['reviewer_1', 'reviewer_2'].includes(id))) {
    reasons.push('NEURAL_INDEPENDENT_HUMAN_REVIEW_REQUIRED');
  }
  const expectedOutputIds = Array.from({ length: 24 }, (_, index) => 'TR-' + String(index + 1).padStart(3, '0'));
  const actualOutputIds = outputs.map(item => item?.id);
  if (outputs.length !== expectedOutputIds.length
      || actualOutputIds.some((id, index) => id !== expectedOutputIds[index])
      || outputs.some(item => !item || typeof item.output !== 'string' || !item.output.trim())) {
    reasons.push('NEURAL_BENCHMARK_OUTPUTS_INCOMPLETE');
  }
  if (!Array.isArray(report.blocking_reasons) || report.blocking_reasons.length) reasons.push('NEURAL_QUALITY_BLOCKERS_PRESENT');
  if (!/^[a-f0-9]{64}$/i.test(String(provenance.manifest_sha256 || ''))
      || !Array.isArray(provenance.licenses) || !provenance.licenses.length
      || provenance.licenses.some(license => typeof license !== 'string' || !license.trim())) {
    reasons.push('NEURAL_TRAINING_PROVENANCE_MISSING');
  }
  if (!finiteNumber(heldout.loss) || heldout.loss < 0
      || !finiteNumber(heldout.perplexity) || heldout.perplexity < 1) {
    reasons.push('NEURAL_HELDOUT_METRICS_INVALID');
  }
  const checkpointMetadata = report.checkpoint_metadata || {};
  if (checkpointMetadata.loss_objective_version !== heldout.loss_objective_version
      || checkpointMetadata.loss_objective_version !== heldout.checkpoint_training_loss_objective_version) {
    reasons.push('NEURAL_EVALUATION_OBJECTIVE_MISMATCH');
  }
  if (!baseline.available || baseline.improved !== true
      || !/^[a-f0-9]{64}$/i.test(String(baseline.baseline_checkpoint_sha256 || ''))) {
    reasons.push('NEURAL_COMPARABLE_IMPROVED_BASELINE_REQUIRED');
  }
  if (!NEURAL_DIMENSIONS.every(key => finiteNumber(averages[key]) && averages[key] >= 3.2)) {
    reasons.push('NEURAL_DIMENSION_THRESHOLD_FAILED');
  }
  if (!finiteNumber(metrics.overall_average) || metrics.overall_average < 3.4) reasons.push('NEURAL_OVERALL_THRESHOLD_FAILED');
  if (!finiteNumber(metrics.instruction_adherence_3_or_4_rate) || metrics.instruction_adherence_3_or_4_rate < 0.9) {
    reasons.push('NEURAL_INSTRUCTION_THRESHOLD_FAILED');
  }
  if (!finiteNumber(metrics.turkish_quality_3_or_4_rate) || metrics.turkish_quality_3_or_4_rate < 0.9) {
    reasons.push('NEURAL_TURKISH_THRESHOLD_FAILED');
  }
  if (metrics.critical_safety_failures?.length) reasons.push('NEURAL_CRITICAL_SAFETY_FAILURE');
  if (metrics.fabricated_claims?.length) reasons.push('NEURAL_FABRICATED_CLAIMS');
  if (metrics.multi_turn_failures?.length) reasons.push('NEURAL_MULTI_TURN_REGRESSION');
  if (stagedTestsPassed !== true) reasons.push('NEURAL_STAGED_TESTS_NOT_PASSED');
  if (memoryIsolationPassed !== true) reasons.push('NEURAL_MEMORY_ISOLATION_NOT_PASSED');
  if (securityChecksPassed !== true) reasons.push('NEURAL_SECURITY_CHECKS_NOT_PASSED');
  if (resourceChecksPassed !== true) reasons.push('NEURAL_RESOURCE_CHECKS_NOT_PASSED');

  const canStage = reasons.length === 0;
  const canMerge = canStage && ownerApproved === true;
  const canDeploy = canMerge && deploymentApproved === true;
  if (canStage && !ownerApproved) reasons.push('OWNER_APPROVAL_REQUIRED');
  if (canMerge && !deploymentApproved) reasons.push('DEPLOYMENT_APPROVAL_REQUIRED');
  return {
    canStage,
    canMerge,
    canDeploy,
    reasons,
    decision: canDeploy ? 'APPROVED_FOR_DEPLOYMENT'
      : canMerge ? 'APPROVED_FOR_MERGE'
        : canStage ? 'READY_FOR_OWNER_APPROVAL' : 'BLOCKED',
  };
}
