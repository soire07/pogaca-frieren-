import { createGuardianIncident, canRequestGuardianReview } from './core.js';

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
       evidence=EXCLUDED.evidence,
       occurrence_count=owner_guardian_incidents.occurrence_count+1,
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
  const active = await db.query(
    `SELECT * FROM owner_guardian_jobs
     WHERE incident_id=$1 AND agent='frieren_ai' AND status IN ('queued','running')
     ORDER BY id DESC LIMIT 1`,
    [id]
  );
  if (active.rows?.[0]) return { ...active.rows[0], reused: true };

  const incidentResult = await db.query(
    `SELECT id,review_attempts,last_review_at,status
     FROM owner_guardian_incidents WHERE id=$1 LIMIT 1`,
    [id]
  );
  const incident = incidentResult.rows?.[0];
  if (!incident || ['resolved','ignored'].includes(incident.status)) throw new Error('GUARDIAN_INCIDENT_NOT_REVIEWABLE');
  const eligibility = canRequestGuardianReview({
    attempts: incident.review_attempts,
    lastReviewAt: incident.last_review_at,
  });
  if (!eligibility.allowed) throw new Error(eligibility.reason);

  const updated = await db.query(
    `UPDATE owner_guardian_incidents
     SET review_attempts=review_attempts+1,last_review_at=NOW(),status='in_review',updated_at=NOW()
     WHERE id=$1 AND status NOT IN ('resolved','ignored')
       AND review_attempts < 3
       AND (last_review_at IS NULL OR last_review_at < NOW()-INTERVAL '15 minutes')
     RETURNING id`,
    [id]
  );
  if (!updated.rowCount) throw new Error('GUARDIAN_REVIEW_COOLDOWN');

  const inserted = await db.query(
    `INSERT INTO owner_guardian_jobs(incident_id,agent,status,attempt,input,created_by,created_at)
     VALUES($1,'frieren_ai','queued',1,jsonb_build_object('incidentId',$1),$2,NOW())
     ON CONFLICT (incident_id,agent) WHERE status IN ('queued','running') DO NOTHING
     RETURNING *`,
    [id, String(actorId)]
  );
  if (inserted.rows?.[0]) return inserted.rows[0];

  const existing = await db.query(
    `SELECT * FROM owner_guardian_jobs
     WHERE incident_id=$1 AND agent='frieren_ai' AND status IN ('queued','running')
     ORDER BY id DESC LIMIT 1`,
    [id]
  );
  if (existing.rows?.[0]) return { ...existing.rows[0], reused: true };
  throw new Error('GUARDIAN_REVIEW_QUEUE_FAILED');
}

export async function finishGuardianReviewJob(db, { jobId, status, result, error }) {
  const id = Number(jobId);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('INVALID_GUARDIAN_JOB_ID');
  if (!['completed', 'failed'].includes(status)) throw new Error('INVALID_GUARDIAN_JOB_STATUS');
  const safeResult = status === 'completed' ? result : { error: String(error || 'REVIEW_FAILED').slice(0, 180) };
  const updated = await db.query(
    `UPDATE owner_guardian_jobs SET status=$2,result=$3::jsonb,finished_at=NOW()
     WHERE id=$1 AND status IN ('queued','running') RETURNING incident_id`,
    [id, status, JSON.stringify(safeResult || {})]
  );
  const incidentId = updated.rows?.[0]?.incident_id;
  if (incidentId) {
    await db.query(
      `UPDATE owner_guardian_incidents SET status=$2,updated_at=NOW()
       WHERE id=$1 AND status='in_review'`,
      [incidentId, status === 'completed' ? 'awaiting_approval' : 'open']
    );
  }
  return Boolean(incidentId);
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

export async function listGuardianJobs(db, limit = 20) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100));
  const result = await db.query(
    'SELECT j.*,i.system,i.severity,i.title AS incident_title FROM owner_guardian_jobs j JOIN owner_guardian_incidents i ON i.id=j.incident_id ORDER BY j.id DESC LIMIT $1',
    [safeLimit]
  );
  return result.rows || [];
}
