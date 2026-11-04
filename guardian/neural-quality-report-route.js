import { createHash } from 'node:crypto';
import { verifyGithubActionsOidcToken } from './github-oidc.js';
import { validateNeuralQualityReport, evaluateNeuralCiEvidence, extractGuardianBearerToken } from './core.js';

const MAX_BYTES = 1_048_576;

export async function handleNeuralQualityReportRequest(req, {
  fetchImpl = fetch,
  saveReport,
  verifyToken = verifyGithubActionsOidcToken,
} = {}) {
  if (req.method !== 'POST' || req.url !== '/internal/neural-quality-report') {
    return { status: 404, payload: { error: 'not_found' } };
  }
  let claims;
  try {
    claims = await verifyToken(extractGuardianBearerToken(req.headers?.authorization), { fetchImpl });
  } catch {
    return { status: 401, payload: { error: 'unauthorized' } };
  }
  if (!String(req.headers?.['content-type'] || '').toLowerCase().startsWith('application/json')) {
    return { status: 415, payload: { error: 'application_json_required' } };
  }
  if (typeof saveReport !== 'function') return { status: 503, payload: { error: 'storage_unavailable' } };

  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > MAX_BYTES) return { status: 413, payload: { error: 'payload_too_large' } };
      chunks.push(bytes);
    }
    let report;
    try { report = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { return { status: 400, payload: { error: 'invalid_report_json' } }; }
    const validation = validateNeuralQualityReport(report);
    if (!validation.valid) return { status: 422, payload: { error: 'invalid_report', reasons: validation.reasons } };
    const sha = String(report.source_commit_sha || '');
    if (!/^[a-f0-9]{40}$/i.test(sha) || sha !== claims.sha) {
      return { status: 401, payload: { error: 'oidc_commit_mismatch' } };
    }
    const githubToken = String(req.headers?.['x-github-token'] || '');
    let evidence = { verified: false, status: 'unverified', reason: 'GITHUB_ACTIONS_TOKEN_MISSING' };
    if (githubToken.length >= 32) {
      try {
        const result = await fetchImpl(
          'https://api.github.com/repos/soire07/pogaca-frieren-/actions/runs?head_sha=' + encodeURIComponent(sha) + '&status=completed&per_page=100',
          { headers: { Authorization: 'Bearer ' + githubToken, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, signal: AbortSignal.timeout(8000) },
        );
        if (result.ok) evidence = evaluateNeuralCiEvidence({ sourceCommitSha: sha, workflowRuns: (await result.json()).workflow_runs });
        else evidence = { verified: false, status: 'unverified', reason: 'GITHUB_ACTIONS_API_UNAVAILABLE' };
      } catch { evidence = { verified: false, status: 'unverified', reason: 'GITHUB_ACTIONS_API_UNAVAILABLE' }; }
    }
    if (report.evolution_plan?.gates?.ci_passed === true && !evidence.verified) {
      return { status: 422, payload: { error: 'evolution_plan_ci_evidence_unverified' } };
    }
    report.ci_evidence = evidence;
    const blockers = Array.isArray(report.blocking_reasons) ? report.blocking_reasons.filter(x => x !== 'NEURAL_CI_EVIDENCE_NOT_VERIFIED') : [];
    if (!evidence.verified) {
      blockers.push('NEURAL_CI_EVIDENCE_NOT_VERIFIED');
      if (report.decision === 'READY FOR STAGED TEST') report.decision = 'NOT READY';
    }
    report.blocking_reasons = [...new Set(blockers)];
    const reportSha256 = createHash('sha256').update(JSON.stringify(report)).digest('hex');
    const saved = await saveReport({ report, reportSha256 });
    if (!saved?.report_sha256) throw new Error('REPORT_STORAGE_FAILED');
    return { status: 202, payload: { status: 'stored', reportSha256: saved.report_sha256, artifactSha256: saved.artifact_sha256, decision: saved.decision } };
  } catch {
    return { status: 500, payload: { error: 'guardian_report_storage_failed' } };
  }
}
