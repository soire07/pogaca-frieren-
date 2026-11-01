import { upsertGuardianIncident } from './store.js';

function systemForScope(scope) {
  const value = String(scope || '').toLocaleLowerCase('tr-TR');
  if (value.includes('neural')) return 'frieren_neural';
  if (value.includes('frieren-ai') || value.includes('ai-agent')) return 'frieren_ai';
  if (value.includes('guardian')) return 'guardian';
  if (value.includes('owner')) return 'owner_panel';
  return 'pogaca_frieren';
}

export async function scanNewOwnerErrors(db, lastSeenErrorId = 0, limit = 50, onProgress = async () => {}) {
  const result = await db.query(
    'SELECT id,scope,error_type,error_message,created_at FROM owner_error_logs WHERE id>$1 ORDER BY id ASC LIMIT $2',
    [Math.max(0, Number(lastSeenErrorId) || 0), Math.max(1, Math.min(Number(limit) || 50, 100))]
  );
  let nextId = Math.max(0, Number(lastSeenErrorId) || 0);
  let recorded = 0;
  for (const row of result.rows || []) {
    nextId = Math.max(nextId, Number(row.id) || 0);
    await upsertGuardianIncident(db, {
      system: systemForScope(row.scope),
      code: row.error_type,
      title: String(row.scope || 'Sistem') + ': ' + String(row.error_type || 'Error'),
      summary: row.error_message || row.error_type || 'Kayıtlı hata olayı',
      evidence: [{ message: 'Log ID ' + row.id + ' · ' + new Date(row.created_at).toISOString() }],
    });
    recorded += 1;
    await onProgress(nextId);
  }
  return { lastSeenErrorId: nextId, recorded };
}

export function startGuardianMonitor({
  db,
  client,
  intervalMs = Number(process.env.GUARDIAN_SCAN_INTERVAL_MS) || 300_000,
  setIntervalImpl = setInterval,
  clearIntervalImpl = clearInterval,
  onError = error => console.error('Neural Guardian monitor failed:', error?.message || error),
} = {}) {
  if (!db?.query) throw new Error('GUARDIAN_DATABASE_REQUIRED');
  let stopped = false;
  let running = false;
  let initialized = false;
  let discordFailureReported = false;
  const interval = Math.max(60_000, Math.min(Number(intervalMs) || 300_000, 1_800_000));

  const tick = async () => {
    if (stopped || running) return;
    running = true;
    try {
      if (!initialized) {
        await db.query(
          `INSERT INTO owner_guardian_monitor_state(monitor_key,last_seen_error_id)
           SELECT 'owner_error_logs',COALESCE(MAX(id),0) FROM owner_error_logs
           ON CONFLICT(monitor_key) DO NOTHING`
        );
        initialized = true;
      }
      const cursorResult = await db.query(
        "SELECT last_seen_error_id FROM owner_guardian_monitor_state WHERE monitor_key='owner_error_logs'"
      );
      const cursor = Number(cursorResult.rows?.[0]?.last_seen_error_id || 0);
      await scanNewOwnerErrors(db, cursor, 50, async nextId => {
        await db.query(
          `UPDATE owner_guardian_monitor_state SET last_seen_error_id=$1,updated_at=NOW()
           WHERE monitor_key='owner_error_logs' AND last_seen_error_id < $1`,
          [nextId]
        );
      });
      const ready = typeof client?.isReady === 'function' ? client.isReady() : null;
      if (ready === false && !discordFailureReported) {
        await upsertGuardianIncident(db, {
          system: 'pogaca_frieren',
          code: 'DISCORD_CLIENT_NOT_READY',
          title: 'Poğaça Discord bağlantısı hazır değil',
          summary: 'Discord istemcisi hazır durumdan çıktı veya bağlantı kuramadı.',
          severity: 'high',
        });
        discordFailureReported = true;
      } else if (ready === true) {
        discordFailureReported = false;
      }
    } catch (error) {
      onError(error);
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
