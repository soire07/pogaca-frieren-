import {
  createGuardianReviewJob,
  finishGuardianReviewJob,
  reserveGuardianRepairDispatch,
  finishGuardianRepairDispatch,
} from './store.js';
import { redactGuardianText } from './core.js';

const REPAIR_BRANCH = 'feat/guardian-autonomous-repair-v2';
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

function safeList(value, maxItems = 4) {
  return Array.isArray(value)
    ? value.slice(0, maxItems).map(item => redactGuardianText(item, 180)).filter(Boolean)
    : [];
}

export function buildGuardianRepairTask(incident = {}, review = {}) {
  const incidentId = Number.isSafeInteger(Number(incident.id)) ? Number(incident.id) : 0;
  const lines = [
    'Guardian incident #' + incidentId + ' · ' + redactGuardianText(incident.system, 40) + ' · ' + redactGuardianText(incident.code, 80),
    'Başlık: ' + redactGuardianText(incident.title, 120),
    'Frieren AI kök neden: ' + redactGuardianText(review.rootCause, 220),
    'Önerilen çözüm: ' + redactGuardianText(review.suggestedFix, 220),
    'İlgili dosyalar: ' + safeList(review.affectedFiles, 5).join(', '),
    'Test planı: ' + safeList(review.tests, 4).join('; '),
    'Riskler: ' + safeList(review.risks, 3).join('; '),
    'Frieren AI yama önerisi: ' + redactGuardianText(review.proposedPatch, 300),
    'Önce mevcut kodu ve mevcut testleri incele. Aynı test zaten varsa tekrar ekleme. Öneriyi körlemesine uygulama; en fazla dört izinli JavaScript dosyasında minimal düzeltme hazırla. npm run check başarılı olmadan PR açma. Birleştirme veya dağıtım yapma.',
  ];
  return lines.join('\n').slice(0, 1200);
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

function getReviewEndpoint(env) {
  const base = String(env.FRIEREN_AI_PUBLIC_URL || 'https://frieren-ai-agent.onrender.com').trim();
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
    if (!response.ok) throw new Error('GUARDIAN_AI_HTTP_' + response.status);
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

  const githubToken = String(env.FRIEREN_GITHUB_TOKEN || '').trim();
  if (githubToken.length < 32) {
    return { status: 'reviewed_only', jobId: Number(job.id), reason: 'GUARDIAN_GITHUB_TOKEN_NOT_CONFIGURED' };
  }

  const reserved = await store.reserveGuardianRepairDispatch(db, job.id);
  if (!reserved) return { status: 'dispatch_not_reserved', jobId: Number(job.id) };

  const workflowUrl = 'https://github.com/' + REPOSITORY + '/actions/workflows/' + REPAIR_WORKFLOW;
  try {
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
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: 'Bearer ' + githubToken,
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ref: REPAIR_BRANCH,
          inputs: {
            task: buildGuardianRepairTask(incident, review),
            base_branch: REPAIR_BRANCH,
            incident_id: String(incident.id),
          },
        }),
        signal: AbortSignal.timeout(12_000),
      }
    );
    if (response.status !== 204) throw new Error('GUARDIAN_GITHUB_DISPATCH_HTTP_' + response.status);
    await store.finishGuardianRepairDispatch(db, {
      jobId: job.id,
      status: 'dispatched',
      workflowUrl,
    });
    await db.query(
      'INSERT INTO owner_audit_logs(actor_id,action,target,details) VALUES($1,$2,$3,$4::jsonb)',
      [actorId, 'guardian.repair.workflow_dispatched', String(incident.id), JSON.stringify({ jobId: job.id, workflow: REPAIR_WORKFLOW, baseBranch: REPAIR_BRANCH })]
    ).catch(() => {});
    return { status: 'dispatched', jobId: Number(job.id), workflowUrl };
  } catch (error) {
    const reason = safeErrorCode(error);
    await store.finishGuardianRepairDispatch(db, {
      jobId: job.id,
      status: 'failed',
    }).catch(() => {});
    return { status: 'dispatch_failed', jobId: Number(job.id), reason };
  }
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
  const githubToken = String(env.FRIEREN_GITHUB_TOKEN || '').trim();
  if (githubToken.length < 32) return { status: 'not_configured', reason: 'GUARDIAN_GITHUB_TOKEN_NOT_CONFIGURED' };

  const reserved = await store.reserveGuardianRepairDispatch(db, job.id);
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
    const marker = new RegExp('(?:^|[^A-Za-z0-9])Guardian #' + Number(incident.id) + '(?!\\d)', 'i');
    const existingRun = (Array.isArray(existingData.workflow_runs) ? existingData.workflow_runs : [])
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
          await store.finishGuardianRepairDispatch(db, { jobId: job.id, status: 'dispatched', workflowUrl: existingUrl });
          return { status: 'already_dispatched', jobId: Number(job.id), workflowUrl: existingUrl };
        }
        // Terminal failure with no PR is eligible for the bounded retry below.
      } else {
        const existingUrl = String(existingRun.html_url || workflowUrl);
        await store.finishGuardianRepairDispatch(db, { jobId: job.id, status: 'dispatched', workflowUrl: existingUrl });
        return { status: 'already_dispatched', jobId: Number(job.id), workflowUrl: existingUrl };
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
            base_branch: REPAIR_BRANCH,
            incident_id: String(incident.id),
          },
        }),
        signal: AbortSignal.timeout(12_000),
      }
    );
    if (response.status !== 204) throw new Error('GUARDIAN_GITHUB_DISPATCH_HTTP_' + response.status);
    await store.finishGuardianRepairDispatch(db, { jobId: job.id, status: 'dispatched', workflowUrl });
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
