import { listPendingGuardianRepairDispatches, listGuardianRepairTrackingJobs } from './store.js';
import { classifyGuardianSeverity } from './core.js';
import { normalizeGuardianMonitorSecurityEvent, recordGuardianSecurityEvent } from './security-events.js';

function boundedInteger(value, fallback, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed === 0) return fallback;
  return Math.max(1, Math.min(Math.floor(parsed), maximum));
}


export async function scanNewOwnerErrors(db, lastSeenErrorId = 0, limit = 50, onProgress = async () => {}, onIncident = async () => {}, onIncidentError = async () => {}, recordSecurityEvent = recordGuardianSecurityEvent) {
  const result = await db.query(
    'SELECT id,scope,error_type,error_message,created_at FROM owner_error_logs WHERE id>$1 ORDER BY id ASC LIMIT $2',
    [Math.max(0, Number(lastSeenErrorId) || 0), boundedInteger(limit, 50, 100)]
  );
  let nextId = Math.max(0, Number(lastSeenErrorId) || 0);
  let recorded = 0;
  for (const row of result.rows || []) {
    nextId = Math.max(nextId, Number(row.id) || 0);
    const title = String(row.scope || 'Sistem') + ': ' + String(row.error_type || 'Error');
    const event = normalizeGuardianMonitorSecurityEvent({
      eventId: 'guardian-monitor-error-' + Number(row.id),
      source: 'frieren_guard_monitor',
      system: 'guardian',
      code: row.error_type,
      severity: classifyGuardianSeverity(title + ' ' + String(row.error_message || '')),
      title,
      summary: row.error_message || row.error_type || 'Kayıtlı hata olayı',
      observedAt: row.created_at,
      evidence: [{ message: 'owner_error_logs #' + row.id + ' · ' + new Date(row.created_at).toISOString() }],
    });
    const persisted = await recordSecurityEvent(db, event, { ipSource: 'guardian_monitor' });
    const incident = persisted?.incident || null;
    if (incident) {
      try {
        await onIncident(incident);
      } catch (error) {
        await onIncidentError(error, incident);
      }
    }
    recorded += 1;
    await onProgress(nextId);
  }
  return { lastSeenErrorId: nextId, recorded };
}

export async function scanPendingGuardianIncidents(db, onIncident = async () => {}, onIncidentError = async () => {}, limit = 10) {
  const safeLimit = boundedInteger(limit, 10, 25);
  const result = await db.query(
    `SELECT id,system,code,severity,status,title,summary,evidence,review_attempts,last_review_at
     FROM owner_guardian_incidents
     WHERE status='open' AND severity IN ('critical','high')
       AND COALESCE(review_attempts,0) < 3
       AND (last_review_at IS NULL OR last_review_at < NOW()-INTERVAL '15 minutes')
     ORDER BY CASE severity WHEN 'critical' THEN 0 ELSE 1 END,last_seen DESC
     LIMIT $1`,
    [safeLimit]
  );
  let attempted = 0;
  for (const incident of result.rows || []) {
    try {
      await onIncident(incident);
    } catch (error) {
      await onIncidentError(error, incident);
    }
    attempted += 1;
  }
  return { attempted };
}

export async function scanPendingGuardianRepairDispatches(db, onDispatch = async () => {}, limit = 5, onDispatchError = async () => {}) {
  const jobs = await listPendingGuardianRepairDispatches(db, limit);
  let attempted = 0;
  for (const job of jobs) {
    try {
      await onDispatch(job);
    } catch (error) {
      await onDispatchError(error, job);
    }
    attempted += 1;
  }
  return { attempted };
}

export async function scanDispatchedGuardianRepairTracking(db, onRefresh = async () => {}, limit = 3, onRefreshError = async () => {}) {
  const jobs = await listGuardianRepairTrackingJobs(db, limit);
  let attempted = 0;
  for (const job of jobs) {
    try {
      await onRefresh(job);
    } catch (error) {
      await onRefreshError(error, job);
    }
    attempted += 1;
  }
  return { attempted };
}

export function startGuardianMonitor({
  db,
  client,
  intervalMs = Number(process.env.GUARDIAN_SCAN_INTERVAL_MS) || 600_000,
  setIntervalImpl = setInterval,
  clearIntervalImpl = clearInterval,
  onIncident = async () => {},
  onRepairDispatch = async () => {},
  onRepairTracking = async () => {},
  recordSecurityEvent = recordGuardianSecurityEvent,
  onError = error => console.error('Neural Guardian monitor failed:', error?.message || error),
} = {}) {
  if (!db?.query) throw new Error('GUARDIAN_DATABASE_REQUIRED');
  let stopped = false;
  let running = false;
  let initialized = false;
  let discordReadyObserved = false;
  let discordFailureReported = false;
  const interval = Math.max(60_000, Math.min(Number(intervalMs) || 300_000, 1_800_000));

  const tick = async () => {
    if (stopped || running) return;
    running = true;
    try {
      if (!initialized) {
        await db.query(
          `INSERT INTO owner_guardian_monitor_state(monitor_key,last_seen_error_id)
           VALUES('owner_error_logs',0)
           ON CONFLICT(monitor_key) DO NOTHING`
        );
        initialized = true;
      }
      const cursorResult = await db.query(
        "SELECT last_seen_error_id FROM owner_guardian_monitor_state WHERE monitor_key='owner_error_logs'"
      );
      const cursor = Number(cursorResult.rows?.[0]?.last_seen_error_id || 0);
      try {
        await scanPendingGuardianIncidents(db, onIncident, onError, 10);
      } catch (error) {
        onError(error);
      }
      try {
        await scanPendingGuardianRepairDispatches(db, onRepairDispatch, 5, onError);
      } catch (error) {
        onError(error);
      }
      try {
        await scanDispatchedGuardianRepairTracking(db, onRepairTracking, 3, onError);
      } catch (error) {
        onError(error);
      }
      await scanNewOwnerErrors(db, cursor, 50, async nextId => {
        await db.query(
          `UPDATE owner_guardian_monitor_state SET last_seen_error_id=$1,updated_at=NOW()
           WHERE monitor_key='owner_error_logs' AND last_seen_error_id < $1`,
          [nextId]
        );
      }, onIncident, onError, recordSecurityEvent);
      await db.query(
        `UPDATE owner_guardian_monitor_state SET last_tick_at=NOW(),last_error=NULL,updated_at=NOW()
         WHERE monitor_key='owner_error_logs'`
      );
      const ready = typeof client?.isReady === 'function' ? client.isReady() : null;
      if (ready === true) discordReadyObserved = true;
      if (ready === false && discordReadyObserved && !discordFailureReported) {
        const observedAt = new Date().toISOString();
        const event = normalizeGuardianMonitorSecurityEvent({
          eventId: 'guardian-monitor-discord-' + Date.now(),
          source: 'frieren_guard_monitor',
          system: 'guardian',
          code: 'DISCORD_CLIENT_NOT_READY',
          severity: 'high',
          title: 'Poğaça Discord bağlantısı hazır değil',
          summary: 'Discord istemcisi hazır durumdan çıktı veya bağlantı kuramadı.',
          observedAt,
          evidence: [{ message: 'Discord client readiness monitor detected a disconnect.' }],
        });
        await recordSecurityEvent(db, event, { ipSource: 'guardian_monitor' });
        discordFailureReported = true;
      } else if (ready === true) {
        discordFailureReported = false;
      }
    } catch (error) {
      onError(error);
      await db.query(
        `UPDATE owner_guardian_monitor_state SET last_tick_at=NOW(),last_error=$1,updated_at=NOW()
         WHERE monitor_key='owner_error_logs'`,
        [String(error?.code || error?.name || 'MONITOR_FAILED').slice(0,80)]
      ).catch(() => {});
    } finally {
      running = false;
    }
  };

  const timer = setIntervalImpl(tick, interval);
  timer?.unref?.();
  void tick();
  return () => {
    stopped = true;
    clearIntervalImpl(timer);
  };
}
