import { createGuardianIncident } from './core.js';

export async function upsertGuardianIncident(db, input) {
  const incident = createGuardianIncident(input);
  const result = await db.query(
    `INSERT INTO owner_guardian_incidents
       (fingerprint,system,code,severity,status,title,summary,evidence,occurrence_count,first_seen,last_seen,created_at,updated_at)
     VALUES($1,$2,$3,$4,'open',$5,$6,$7::jsonb,1,NOW(),NOW(),NOW(),NOW())
     ON CONFLICT(fingerprint) DO UPDATE SET
       severity=CASE
         WHEN EXCLUDED.severity='critical' THEN 'critical'
         WHEN EXCLUDED.severity='high' AND owner_guardian_incidents.severity <> 'critical' THEN 'high'
         WHEN EXCLUDED.severity='medium' AND owner_guardian_incidents.severity='low' THEN 'medium'
         ELSE owner_guardian_incidents.severity
       END,
       status=CASE WHEN owner_guardian_incidents.status='resolved' THEN 'open' ELSE owner_guardian_incidents.status END,
       summary=EXCLUDED.summary,
       occurrence_count=owner_guardian_incidents.occurrence_count + CASE
         WHEN EXCLUDED.evidence <> '[]'::jsonb
           AND owner_guardian_incidents.evidence @> EXCLUDED.evidence THEN 0
         ELSE 1
       END,
       evidence=CASE
         WHEN EXCLUDED.evidence <> '[]'::jsonb
           AND owner_guardian_incidents.evidence @> EXCLUDED.evidence
         THEN owner_guardian_incidents.evidence
         ELSE (
           SELECT COALESCE(jsonb_agg(item ORDER BY ordinal), '[]'::jsonb)
           FROM (
             SELECT value AS item, ordinality AS ordinal
             FROM jsonb_array_elements(
               COALESCE(owner_guardian_incidents.evidence, '[]'::jsonb) || EXCLUDED.evidence
             ) WITH ORDINALITY
             ORDER BY ordinality DESC
             LIMIT 8
           ) recent_evidence
         )
       END,
       last_seen=NOW(),
       updated_at=NOW()
     RETURNING *`,
    [incident.fingerprint, incident.system, incident.code, incident.severity, incident.title, incident.summary, JSON.stringify(incident.evidence)]
  );
  return result.rows?.[0] || null;
}

export async function getGuardianIncident(db, id) {
  const numericId = Number(id);
  if (!Number.isSafeInteger(numericId) || numericId <= 0) throw new Error('INVALID_GUARDIAN_INCIDENT_ID');
  const result = await db.query('SELECT * FROM owner_guardian_incidents WHERE id=$1 LIMIT 1', [numericId]);
  return result.rows?.[0] || null;
}

export async function listGuardianIncidents(db, limit = 30) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 30, 100));
  const result = await db.query(
    'SELECT * FROM owner_guardian_incidents ORDER BY CASE severity WHEN \'critical\' THEN 0 WHEN \'high\' THEN 1 WHEN \'medium\' THEN 2 ELSE 3 END, last_seen DESC LIMIT $1',
    [safeLimit]
  );
  return result.rows || [];
}

export async function createGuardianReviewJob(db, { incidentId, actorId }) {
  const id = Number(incidentId);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('INVALID_GUARDIAN_INCIDENT_ID');

  // Recover abandoned synchronous review requests after the AI endpoint's 60s timeout.
  // A stale job must not permanently block the incident from being reviewed again.
  await db.query(
    `WITH stale AS (
       UPDATE owner_guardian_jobs
       SET status='failed',result=jsonb_build_object('error','GUARDIAN_REVIEW_STALE_JOB_RECOVERED'),finished_at=NOW()
       WHERE incident_id=$1 AND agent='frieren_ai' AND status IN ('queued','running')
         AND COALESCE(started_at,created_at) < NOW()-INTERVAL '5 minutes'
       RETURNING incident_id
     ), reopened AS (
       UPDATE owner_guardian_incidents i SET status='open',updated_at=NOW()
       FROM stale s WHERE i.id=s.incident_id AND i.status='in_review'
       RETURNING i.id
     )
     SELECT incident_id FROM stale`,
    [id]
  );

  const active = await db.query(
    `SELECT * FROM owner_guardian_jobs
     WHERE incident_id=$1 AND agent='frieren_ai' AND status IN ('queued','running')
     ORDER BY id DESC LIMIT 1`,
    [id]
  );
  if (active.rows?.[0]) return { ...active.rows[0], reused: true };

  // Reserve the incident and create its job in one statement. If the insert fails,
  // PostgreSQL rolls back the attempt counter and in_review transition as well.
  const inserted = await db.query(
    `WITH reserved AS (
       UPDATE owner_guardian_incidents
       SET review_attempts=review_attempts+1,last_review_at=NOW(),status='in_review',updated_at=NOW()
       WHERE id=$1 AND status NOT IN ('resolved','ignored')
         AND review_attempts < 3
         AND (last_review_at IS NULL OR last_review_at < NOW()-INTERVAL '15 minutes')
       RETURNING id
     )
     INSERT INTO owner_guardian_jobs(incident_id,agent,status,attempt,input,created_by,created_at)
     SELECT id,'frieren_ai','queued',1,jsonb_build_object('incidentId',id),$2,NOW()
     FROM reserved
     ON CONFLICT (incident_id,agent) WHERE status IN ('queued','running') DO NOTHING
     RETURNING *`,
    [id, String(actorId)]
  );
  if (inserted.rows?.[0]) return inserted.rows[0];

  // A concurrent request may have won the reservation. Reuse its active job
  // rather than incrementing attempts or reporting a false queue failure.
  const concurrent = await db.query(
    `SELECT * FROM owner_guardian_jobs
     WHERE incident_id=$1 AND agent='frieren_ai' AND status IN ('queued','running')
     ORDER BY id DESC LIMIT 1`,
    [id]
  );
  if (concurrent.rows?.[0]) return { ...concurrent.rows[0], reused: true };

  const incident = await db.query(
    'SELECT id,status,review_attempts,last_review_at FROM owner_guardian_incidents WHERE id=$1 LIMIT 1',
    [id]
  );
  const row = incident.rows?.[0];
  if (!row || ['resolved','ignored'].includes(row.status)) throw new Error('GUARDIAN_INCIDENT_NOT_REVIEWABLE');
  if (Number(row.review_attempts) >= 3) throw new Error('GUARDIAN_REVIEW_ATTEMPTS_EXHAUSTED');
  throw new Error('GUARDIAN_REVIEW_COOLDOWN');
}

export async function finishGuardianReviewJob(db, { jobId, status, result, error }) {
  const id = Number(jobId);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('INVALID_GUARDIAN_JOB_ID');
  if (!['completed', 'failed'].includes(status)) throw new Error('INVALID_GUARDIAN_JOB_STATUS');
  const safeResult = status === 'completed' ? result : { error: String(error || 'REVIEW_FAILED').slice(0, 180) };
  // Job completion and incident transition must commit or roll back together.
  const updated = await db.query(
    `WITH changed AS (
       UPDATE owner_guardian_jobs SET status=$2,result=$3::jsonb,finished_at=NOW()
       WHERE id=$1 AND status IN ('queued','running') RETURNING incident_id
     ), incident_update AS (
       UPDATE owner_guardian_incidents i
       SET status=$4,updated_at=NOW()
       FROM changed c
       WHERE i.id=c.incident_id AND i.status='in_review'
       RETURNING i.id
     )
     SELECT incident_id FROM changed`,
    [id, status, JSON.stringify(safeResult || {}), status === 'completed' ? 'awaiting_approval' : 'open']
  );
  return Boolean(updated.rows?.[0]?.incident_id);
}

export async function resolveGuardianIncident(db, { incidentId, actorId }) {
  const id = Number(incidentId);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('INVALID_GUARDIAN_INCIDENT_ID');
  const result = await db.query(
    `WITH changed AS (
       UPDATE owner_guardian_incidents SET status='resolved',updated_at=NOW()
       WHERE id=$1 AND status NOT IN ('resolved','ignored') RETURNING id,fingerprint
     ), logged AS (
       INSERT INTO owner_audit_logs(actor_id,action,target,details)
       SELECT $2,'guardian.incident.resolve',id::text,jsonb_build_object('fingerprint',fingerprint) FROM changed
       RETURNING id
     )
     SELECT changed.id FROM changed JOIN logged ON TRUE`,
    [id, String(actorId)]
  );
  return result.rows?.[0] || null;
}

export async function getLatestGuardianJob(db, incidentId) {
  const id = Number(incidentId);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('INVALID_GUARDIAN_INCIDENT_ID');
  const result = await db.query(
    'SELECT * FROM owner_guardian_jobs WHERE incident_id=$1 AND agent=\'frieren_ai\' ORDER BY id DESC LIMIT 1',
    [id]
  );
  return result.rows?.[0] || null;
}

export async function reserveGuardianRepairDispatch(db, jobId) {
  const id = Number(jobId);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('INVALID_GUARDIAN_JOB_ID');
  const result = await db.query(
    `UPDATE owner_guardian_jobs SET repair_dispatch_status='dispatching',repair_dispatch_at=NOW()
     WHERE id=$1 AND status='completed' AND repair_dispatch_status IN ('not_requested','failed')
     RETURNING *`,
    [id]
  );
  return result.rows?.[0] || null;
}

export async function finishGuardianRepairDispatch(db, { jobId, status, workflowUrl = null }) {
  const id = Number(jobId);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('INVALID_GUARDIAN_JOB_ID');
  if (!['dispatched','failed'].includes(status)) throw new Error('INVALID_GUARDIAN_DISPATCH_STATUS');
  const result = await db.query(
    `UPDATE owner_guardian_jobs SET repair_dispatch_status=$2,repair_workflow_url=$3
     WHERE id=$1 AND repair_dispatch_status='dispatching' RETURNING id`,
    [id, status, status === 'dispatched' ? workflowUrl : null]
  );
  return Boolean(result.rows?.[0]);
}

export async function updateGuardianRepairStatus(db, { jobId, runId = null, runUrl = null, runStatus = null, runConclusion = null, prNumber = null, prUrl = null, prState = null, checksStatus = 'unknown' }) {
  const id = Number(jobId);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('INVALID_GUARDIAN_JOB_ID');
  const allowedChecks = ['unknown','pending','success','failure','cancelled'];
  if (!allowedChecks.includes(checksStatus)) throw new Error('INVALID_GUARDIAN_CHECK_STATUS');
  const result = await db.query(
    `UPDATE owner_guardian_jobs SET
       repair_run_id=$2,repair_run_url=$3,repair_run_status=$4,repair_run_conclusion=$5,
       repair_pr_number=$6,repair_pr_url=$7,repair_pr_state=$8,repair_checks_status=$9
     WHERE id=$1 AND repair_dispatch_status='dispatched' RETURNING id`,
    [id, runId, runUrl, runStatus, runConclusion, prNumber, prUrl, prState, checksStatus]
  );
  return Boolean(result.rows?.[0]);
}

export async function getGuardianMonitorState(db) {
  const result = await db.query(
    "SELECT monitor_key,last_seen_error_id,last_tick_at,last_error,updated_at FROM owner_guardian_monitor_state WHERE monitor_key='owner_error_logs' LIMIT 1"
  );
  return result.rows?.[0] || null;
}

export async function listGuardianJobs(db, limit = 20) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100));
  const result = await db.query(
    'SELECT j.*,i.system,i.severity,i.title AS incident_title FROM owner_guardian_jobs j JOIN owner_guardian_incidents i ON i.id=j.incident_id ORDER BY j.id DESC LIMIT $1',
    [safeLimit]
  );
  return result.rows || [];
}


export async function saveGuardianQualityReport(db, { report, reportSha256 }) {
  if (!/^[a-f0-9]{64}$/i.test(String(reportSha256 || ''))) throw new Error('INVALID_GUARDIAN_REPORT_FINGERPRINT');
  const result = await db.query(
    `INSERT INTO owner_guardian_quality_reports
       (report_sha256,artifact_sha256,model_backend,decision,report,blocking_reasons,submitted_at)
     VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,NOW())
     ON CONFLICT(report_sha256) DO UPDATE SET
       report=EXCLUDED.report,blocking_reasons=EXCLUDED.blocking_reasons,submitted_at=NOW()
     RETURNING id,report_sha256,artifact_sha256,decision,submitted_at`,
    [reportSha256, String(report.artifact_sha256 || ''), report.model_backend, report.decision,
      JSON.stringify(report), JSON.stringify(Array.isArray(report.blocking_reasons) ? report.blocking_reasons : [])]
  );
  await db.query(`DELETE FROM owner_guardian_quality_reports
    WHERE id NOT IN (SELECT id FROM owner_guardian_quality_reports ORDER BY submitted_at DESC,id DESC LIMIT 50)`);
  return result.rows?.[0] || null;
}

export async function getLatestGuardianQualityReport(db) {
  const result = await db.query(
    'SELECT id,report_sha256,artifact_sha256,model_backend,decision,report,blocking_reasons,submitted_at FROM owner_guardian_quality_reports ORDER BY submitted_at DESC,id DESC LIMIT 1'
  );
  return result.rows?.[0] || null;
}
