import {
  createGuardianReviewJob,
  finishGuardianReviewJob,
  reserveGuardianRepairDispatch,
  finishGuardianRepairDispatch,
  getGuardianProposalFingerprint,
} from './store.js';
import { redactGuardianText } from './core.js';

export { getGuardianProposalFingerprint };

const REPAIR_BRANCH = 'guardian-isolated-repair-test';
const REPAIR_WORKFLOW = 'frieren-ai-self-repair.yml';
const REPOSITORY = 'soire07/pogaca-frieren-';

export function classifyGuardianPullRequestChecks(response) {
  if (!response?.ok || !response.payload || !Array.isArray(response.payload.check_runs)) return 'unknown';
  const runs = response.payload.check_runs;
  const total = Number(response.payload.total_count);
  if (!Number.isSafeInteger(total) || total < runs.length) return 'unknown';
  if (total > runs.length || runs.some(item => item.status !== 'completed')) return 'pending';
  if (!runs.length) return 'unknown';
  if (runs.some(item => !['success', 'skipped', 'neutral'].includes(item.conclusion))) {
    return runs.some(item => ['cancelled', 'timed_out'].includes(item.conclusion)) ? 'cancelled' : 'failure';
  }
  return 'success';
}

export function classifyGuardianWorkflowConclusion(conclusion) {
  const value = String(conclusion || '').toLowerCase();
  if (value === 'success') return 'success';
  if (['failure', 'cancelled', 'timed_out', 'action_required', 'startup_failure'].includes(value)) {
    return value === 'cancelled' || value === 'timed_out' ? 'cancelled' : 'failure';
  }
  return 'unknown';
}

function safeErrorCode(error) {
  return String(error?.message || 'GUARDIAN_AUTOMATION_FAILED')
    .replace(/[^a-z0-9_.:-]/gi, '_')
    .slice(0, 100);
}

async function assertGithubWorkflowDispatched(response) {
  if (response.status === 204) return;
  const payload = await response.json().catch(() => ({}));
  const detail = redactGuardianText(payload?.message || payload?.error || 'UNKNOWN_GITHUB_ERROR', 80);
  throw new Error('GUARDIAN_GITHUB_DISPATCH_HTTP_' + response.status + '_' + (detail || 'UNKNOWN_GITHUB_ERROR'));
}

function safeList(value, maxItems = 4, maxChars = 120) {
  return Array.isArray(value)
    ? value.slice(0, maxItems).map(item => redactGuardianText(item, maxChars)).filter(Boolean)
    : [];
}

export function buildGuardianRepairTask(incident = {}, review = {}) {
  const incidentId = Number.isSafeInteger(Number(incident.id)) ? Number(incident.id) : 0;
  const lines = [
    'Guardian incident #' + incidentId + ' · ' + redactGuardianText(incident.system, 40) + ' · ' + redactGuardianText(incident.code, 70),
    'Başlık: ' + redactGuardianText(incident.title, 90),
    'Kök neden: ' + redactGuardianText(review.rootCause, 180),
    'Çözüm: ' + redactGuardianText(review.suggestedFix, 180),
    'İlgili dosyalar: ' + safeList(review.affectedFiles, 5, 100).join(', '),
    'Test planı: ' + safeList(review.tests, 3, 100).join('; '),
    'Görev: Kaynak kodu ve testleri incele; var olan testi tekrarlama. Kök nedeni en fazla dört izinli mevcut JavaScript dosyasında düzelt.',
    'Çıktı yalnızca diff --git ile başlayan unified diff olmalı. Bağlam yetersizse yalnızca REPAIR_CONTEXT_INSUFFICIENT yaz. npm run check başarılı olmadan PR açma; merge/deploy yapma.',
  ];
  return lines.join('\n').slice(0, 1000);
}

function isRepairableProposal(review) {
  return review?.status === 'proposal_only'
    && ['medium', 'high'].includes(review.confidence)
    && typeof review.proposedPatch === 'string'
    && review.proposedPatch.trim().length > 0
    && Array.isArray(review.affectedFiles)
    && review.affectedFiles.length > 0
    && Array.isArray(review.tests)
    && review.tests.length > 0;
}

async function persistDispatchedState(store, db, jobId, workflowUrl) {
  const saved = await store.finishGuardianRepairDispatch(db, {
    jobId,
    status: 'dispatched',
    workflowUrl,
  });
  return saved === true;
}

function getReviewEndpoint(env) {
  const base = String(env.FRIEREN_AI_PUBLIC_URL || 'https://pogaca-frieren-kltd.onrender.com').trim();
  const parsed = new URL(base);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new Error('INVALID_FRIEREN_AI_PUBLIC_URL');
  }
  return new URL('/internal/guardian-review', parsed).toString();
}

export async function processGuardianIncident({
  db,
  incident,
  env = process.env,
  fetchImpl = globalThis.fetch,
  store = {
    createGuardianReviewJob,
    finishGuardianReviewJob,
    reserveGuardianRepairDispatch,
    finishGuardianRepairDispatch,
  },
  actorId = 'guardian-auto',
} = {}) {
  if (!db || !incident || !Number.isSafeInteger(Number(incident.id)) || Number(incident.id) <= 0) {
    throw new Error('INVALID_GUARDIAN_AUTOMATION_INPUT');
  }
  if (!['critical', 'high'].includes(String(incident.severity || '').toLowerCase())) {
    return { status: 'below_threshold' };
  }

  let emergencyState;
  try {
    emergencyState = await db.query(
      "SELECT setting_value FROM owner_settings WHERE setting_key='guardian_emergency_stop' LIMIT 1"
    );
  } catch {
    return { status: 'blocked', reason: 'EMERGENCY_STOP_STATE_UNAVAILABLE' };
  }
  if (emergencyState.rows?.[0]?.setting_value?.enabled === true) {
    return { status: 'emergency_stop' };
  }

  const bridgeSecret = String(env.FRIEREN_AI_BRIDGE_SECRET || env.FRIEREN_BRIDGE_SECRET || '').trim();
  if (bridgeSecret.length < 32) return { status: 'not_configured', reason: 'GUARDIAN_BRIDGE_NOT_CONFIGURED' };

  let job;
  try {
    job = await store.createGuardianReviewJob(db, {
      incidentId: Number(incident.id),
      actorId,
    });
  } catch (error) {
    const reason = safeErrorCode(error);
    if (['GUARDIAN_REVIEW_COOLDOWN', 'GUARDIAN_REVIEW_ATTEMPTS_EXHAUSTED', 'GUARDIAN_INCIDENT_NOT_REVIEWABLE'].includes(reason)) {
      return { status: 'review_skipped', reason };
    }
    throw error;
  }
  if (job?.reused || job?.status === 'running') {
    return { status: 'already_running', jobId: Number(job.id) || null };
  }
  if (!job?.id) return { status: 'review_skipped', reason: 'GUARDIAN_REVIEW_JOB_NOT_CREATED' };

  let review;
  try {
    const response = await fetchImpl(getReviewEndpoint(env), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + bridgeSecret,
      },
      body: JSON.stringify({
        incident: {
          system: incident.system,
          code: incident.code,
          title: incident.title,
          summary: incident.summary,
          evidence: incident.evidence,
        },
      }),
      signal: AbortSignal.timeout(60_000),
    });
    review = await response.json().catch(() => ({}));
    if (!response.ok) {
      const responseError = redactGuardianText(review?.error || review?.message || 'UNKNOWN_AI_ERROR', 80);
      throw new Error('GUARDIAN_AI_HTTP_' + response.status + '_' + responseError);
    }
    await store.finishGuardianReviewJob(db, {
      jobId: job.id,
      status: 'completed',
      result: review,
    });
  } catch (error) {
    const reason = safeErrorCode(error);
    await store.finishGuardianReviewJob(db, {
      jobId: job.id,
      status: 'failed',
      error: reason,
    }).catch(() => {});
    return { status: 'review_failed', jobId: Number(job.id), reason };
  }

  if (!isRepairableProposal(review)) {
    return { status: 'reviewed_only', jobId: Number(job.id) };
  }

  return { status: 'proposal_ready', jobId: Number(job.id), approvalRequired: true };
}


export async function processPendingGuardianRepairDispatch({
  db,
  job,
  incident,
  env = process.env,
  fetchImpl = globalThis.fetch,
  store = { reserveGuardianRepairDispatch, finishGuardianRepairDispatch },
  actorId = 'guardian-auto',
} = {}) {
  if (!db || !job || !Number.isSafeInteger(Number(job.id)) || Number(job.id) <= 0
      || !incident || !Number.isSafeInteger(Number(incident.id)) || Number(incident.id) <= 0) {
    throw new Error('INVALID_GUARDIAN_DISPATCH_RETRY_INPUT');
  }
  if (!['critical', 'high'].includes(String(incident.severity || '').toLowerCase())) {
    return { status: 'below_threshold' };
  }
  let emergencyState;
  try {
    emergencyState = await db.query(
      "SELECT setting_value FROM owner_settings WHERE setting_key='guardian_emergency_stop' LIMIT 1"
    );
  } catch {
    return { status: 'blocked', reason: 'EMERGENCY_STOP_STATE_UNAVAILABLE' };
  }
  if (emergencyState.rows?.[0]?.setting_value?.enabled === true) {
    return { status: 'emergency_stop' };
  }
  const review = job.result && typeof job.result === 'object' ? job.result : {};
  if (!isRepairableProposal(review)) return { status: 'retry_skipped', reason: 'SAVED_PROPOSAL_NOT_REPAIRABLE' };
  const approvalFingerprint = getGuardianProposalFingerprint(review);
  if (!job.repair_approved_by || job.repair_approval_fingerprint !== approvalFingerprint) {
    return { status: 'approval_required', jobId: Number(job.id) };
  }
  const githubToken = String(env.FRIEREN_GITHUB_TOKEN || '').trim();
  if (githubToken.length < 32) return { status: 'not_configured', reason: 'GUARDIAN_GITHUB_TOKEN_NOT_CONFIGURED' };

  const reserved = await store.reserveGuardianRepairDispatch(db, job.id, approvalFingerprint);
  if (!reserved) return { status: 'dispatch_not_reserved', jobId: Number(job.id) };
  const workflowUrl = 'https://github.com/' + REPOSITORY + '/actions/workflows/' + REPAIR_WORKFLOW;
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: 'Bearer ' + githubToken,
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
  const runsUrl = 'https://api.github.com/repos/' + REPOSITORY + '/actions/workflows/' + REPAIR_WORKFLOW
    + '/runs?branch=' + encodeURIComponent(REPAIR_BRANCH) + '&event=workflow_dispatch&per_page=100';

  try {
    const existingResponse = await fetchImpl(runsUrl, {
      method: 'GET', headers, signal: AbortSignal.timeout(12_000),
    });
    if (!existingResponse.ok) {
      await store.finishGuardianRepairDispatch(db, { jobId: job.id, status: 'failed' }).catch(() => {});
      return { status: 'reconciliation_unavailable', jobId: Number(job.id), reason: 'GITHUB_RUN_LIST_HTTP_' + existingResponse.status };
    }
    const existingData = await existingResponse.json().catch(() => ({}));
    const listedRuns = Array.isArray(existingData.workflow_runs) ? existingData.workflow_runs : [];
    const totalRuns = Number(existingData.total_count);
    if (Number.isSafeInteger(totalRuns) && totalRuns > listedRuns.length) {
      await store.finishGuardianRepairDispatch(db, { jobId: job.id, status: 'failed' }).catch(() => {});
      return {
        status: 'reconciliation_incomplete',
        jobId: Number(job.id),
        reason: 'GITHUB_RUN_LIST_TRUNCATED',
        listed: listedRuns.length,
        total: totalRuns,
      };
    }
    const marker = new RegExp('(?:^|[^A-Za-z0-9])Guardian #' + Number(incident.id) + '(?!\\d)', 'i');
    const existingRun = listedRuns
      .find(run => marker.test(String(run.display_title || run.name || run.run_name || '')));
    if (existingRun) {
      const terminalFailure = existingRun.status === 'completed'
        && ['failure', 'cancelled', 'timed_out', 'action_required', 'startup_failure'].includes(existingRun.conclusion);
      if (terminalFailure) {
        const branchName = 'ai-repair/guardian-' + Number(incident.id);
        const query = new URLSearchParams({ state: 'all', head: 'soire07:' + branchName, base: REPAIR_BRANCH });
        const prResponse = await fetchImpl('https://api.github.com/repos/' + REPOSITORY + '/pulls?' + query.toString(), {
          method: 'GET', headers, signal: AbortSignal.timeout(12_000),
        });
        if (!prResponse.ok) {
          await store.finishGuardianRepairDispatch(db, { jobId: job.id, status: 'failed' }).catch(() => {});
          return { status: 'reconciliation_unavailable', jobId: Number(job.id), reason: 'GITHUB_PR_LIST_HTTP_' + prResponse.status };
        }
        const prs = await prResponse.json().catch(() => []);
        if (Array.isArray(prs) && prs.some(pr => pr.head?.ref === branchName)) {
          const existingUrl = String(existingRun.html_url || workflowUrl);
          const persisted = await persistDispatchedState(store, db, job.id, existingUrl);
          return { status: persisted ? 'already_dispatched' : 'dispatch_state_unconfirmed', jobId: Number(job.id), workflowUrl: existingUrl };
        }
        // Terminal failure with no PR is eligible for the bounded retry below.
      } else {
        const existingUrl = String(existingRun.html_url || workflowUrl);
        const persisted = await persistDispatchedState(store, db, job.id, existingUrl);
        return { status: persisted ? 'already_dispatched' : 'dispatch_state_unconfirmed', jobId: Number(job.id), workflowUrl: existingUrl };
      }
    }

    const latestEmergencyState = await db.query(
      "SELECT setting_value FROM owner_settings WHERE setting_key='guardian_emergency_stop' LIMIT 1"
    );
    if (latestEmergencyState.rows?.[0]?.setting_value?.enabled === true) {
      await store.finishGuardianRepairDispatch(db, { jobId: job.id, status: 'failed' });
      return { status: 'emergency_stop' };
    }

    const response = await fetchImpl(
      'https://api.github.com/repos/' + REPOSITORY + '/actions/workflows/' + REPAIR_WORKFLOW + '/dispatches',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ref: REPAIR_BRANCH,
          inputs: {
            task: buildGuardianRepairTask(incident, review),
            mode: 'repair',
            base_branch: REPAIR_BRANCH,
            incident_id: String(incident.id),
          },
        }),
        signal: AbortSignal.timeout(12_000),
      }
    );
    await assertGithubWorkflowDispatched(response);
    const persisted = await persistDispatchedState(store, db, job.id, workflowUrl);
    if (!persisted) {
      return { status: 'dispatch_state_unconfirmed', jobId: Number(job.id), workflowUrl };
    }
    await db.query(
      'INSERT INTO owner_audit_logs(actor_id,action,target,details) VALUES($1,$2,$3,$4::jsonb)',
      [actorId, 'guardian.repair.workflow_redispatched', String(incident.id), JSON.stringify({ jobId: job.id, workflow: REPAIR_WORKFLOW, baseBranch: REPAIR_BRANCH })]
    ).catch(() => {});
    return { status: 'dispatched', jobId: Number(job.id), workflowUrl };
  } catch (error) {
    const reason = safeErrorCode(error);
    await store.finishGuardianRepairDispatch(db, { jobId: job.id, status: 'failed' }).catch(() => {});
    return { status: 'dispatch_failed', jobId: Number(job.id), reason };
  }
}
