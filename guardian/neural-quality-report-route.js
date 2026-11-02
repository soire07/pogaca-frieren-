import { createHash } from 'node:crypto';
import { verifyGithubActionsOidcToken } from './github-oidc.js';
import {
  validateNeuralQualityReport,
  evaluateNeuralCiEvidence,
  extractGuardianBearerToken,
} from './core.js';

const MAX_REPORT_BYTES = 1_048_576;

function response(status, payload) {
  return { status, payload };
}

export async function handleNeuralQualityReportRequest(req, {
  env = process.env,
  fetchImpl = fetch,
  saveReport,
  logger = () => {},
  verifyOidcToken = verifyGithubActionsOidcToken,
} = {}) {
  if (req.method !== 'POST' || req.url !== '/internal/neural-quality-report') {
    return response(404, { error: 'not_found' });
  }

  const oidcToken = extractGuardianBearerToken(req.headers?.authorization);
  let oidcClaims;
  try {
    oidcClaims = await verifyOidcToken(oidcToken, { fetchImpl });
  } catch {
    return response(401, { error: 'unauthorized' });
  }
  if (!String(req.headers?.['content-type'] || '').toLowerCase().startsWith('application/json')) {
    return response(415, { error: 'application_json_required' });
  }
  if (typeof saveReport !== 'function') return response(503, { error: 'storage_unavailable' });

  try {
    const chunks = [];
    let byteLength = 0;
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      byteLength += buffer.length;
      if (byteLength > MAX_REPORT_BYTES) return response(413, { error: 'payload_too_large' });
      chunks.push(buffer);
    }

    let report;
    try {
      report = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      return response(400, { error: 'invalid_quality_report_payload' });
    }

    const validation = validateNeuralQualityReport(report);
    if (!validation.valid) return response(422, { error: 'invalid_quality_report', reasons: validation.reasons });

    const sourceCommitSha = String(report.source_commit_sha || '');
    if (!/^[a-f0-9]{40}$/i.test(sourceCommitSha) || sourceCommitSha !== oidcClaims.sha) {
      return response(401, { error: 'oidc_commit_mismatch' });
    }
    let ciEvidence = evaluateNeuralCiEvidence({ sourceCommitSha });
    const githubToken = String(req.headers?.['x-github-token'] || '').trim();
    if (/^[a-f0-9]{40}$/i.test(sourceCommitSha) && githubToken.length >= 32) {
      try {
        const ciResponse = await fetchImpl(
          'https://api.github.com/repos/soire07/pogaca-frieren-/actions/runs?head_sha='
            + encodeURIComponent(sourceCommitSha) + '&status=completed&per_page=100',
          {
            headers: {
              Authorization: 'Bearer ' + githubToken,
              Accept: 'application/vnd.github+json',
              'X-GitHub-Api-Version': '2022-11-28',
            },
            signal: AbortSignal.timeout(8000),
          },
        );
        if (ciResponse.ok) {
          const ciPayload = await ciResponse.json();
          ciEvidence = evaluateNeuralCiEvidence({
            sourceCommitSha,
            workflowRuns: ciPayload.workflow_runs,
          });
        } else {
          ciEvidence = { verified: false, status: 'unverified', reason: 'GITHUB_ACTIONS_API_UNAVAILABLE' };
        }
      } catch {
        ciEvidence = { verified: false, status: 'unverified', reason: 'GITHUB_ACTIONS_API_UNAVAILABLE' };
      }
    } else if (/^[a-f0-9]{40}$/i.test(sourceCommitSha)) {
      ciEvidence = { verified: false, status: 'unverified', reason: 'GITHUB_ACTIONS_TOKEN_MISSING' };
    }

    report.ci_evidence = ciEvidence;
    const blockers = Array.isArray(report.blocking_reasons)
      ? report.blocking_reasons.filter(reason => reason !== 'NEURAL_CI_EVIDENCE_NOT_VERIFIED') : [];
    if (ciEvidence.verified !== true) {
      blockers.push('NEURAL_CI_EVIDENCE_NOT_VERIFIED');
      if (report.decision === 'READY FOR STAGED TEST') report.decision = 'NOT READY';
    }
    report.blocking_reasons = [...new Set(blockers)];
    const reportSha256 = createHash('sha256').update(JSON.stringify(report)).digest('hex');
    let saved;
    try {
      saved = await saveReport({ report, reportSha256 });
      if (!saved?.report_sha256) throw new Error('GUARDIAN_REPORT_STORAGE_FAILED');
    } catch (error) {
      logger('Neural quality report storage failed:', error?.message || 'unknown error');
      return response(500, { error: 'guardian_report_storage_failed' });
    }
    return response(202, {
      status: 'stored',
      reportSha256: saved.report_sha256,
      artifactSha256: saved.artifact_sha256,
      decision: saved.decision,
    });
  } catch (error) {
    logger('Neural quality report ingestion failed:', error?.message || 'unknown error');
    return response(400, { error: 'invalid_quality_report_payload' });
  }
}
