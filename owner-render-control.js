const SNOWFLAKE = /^\d{17,20}$/;
const OWNER = '1553794496234262641';
const API_BASE = 'https://api.render.com/v1';

export const RENDER_BOT_SERVICES = Object.freeze({
  pogaca: Object.freeze({
    key: 'pogaca',
    name: 'Poğaça Frieren',
    id: process.env.RENDER_POGACA_SERVICE_ID || process.env.RENDER_SERVICE_ID || process.env.RENDER_METRICS_SERVICE_ID || 'srv-dbf4vdvavr4c73cr6s00',
    url: process.env.RENDER_POGACA_URL || 'https://pogaca-frieren.onrender.com',
    healthPath: process.env.RENDER_POGACA_HEALTH_PATH || '/health',
    dashboardUrl: 'https://dashboard.render.com/web/' + (process.env.RENDER_POGACA_SERVICE_ID || process.env.RENDER_SERVICE_ID || 'srv-dbf4vdvavr4c73cr6s00'),
    canSuspend: false,
    allowedActions: Object.freeze(['restart'])
  }),
  frieren_ai: Object.freeze({
    key: 'frieren_ai',
    name: 'Frieren AI',
    id: process.env.RENDER_FRIEREN_AI_SERVICE_ID || 'srv-dbgrl2ff3r2c73agqamg',
    url: process.env.RENDER_FRIEREN_AI_URL || 'https://frieren-ai-agent.onrender.com',
    healthPath: process.env.RENDER_FRIEREN_AI_HEALTH_PATH || '/ai-health',
    dashboardUrl: 'https://dashboard.render.com/web/' + (process.env.RENDER_FRIEREN_AI_SERVICE_ID || 'srv-dbgrl2ff3r2c73agqamg'),
    canSuspend: true,
    allowedActions: Object.freeze(['restart', 'suspend', 'resume'])
  })
});

function safeErrorCode(error) {
  const message = String(error?.message || 'unknown_error');
  if (/^RENDER_[A-Z0-9_]+$/.test(message)) return message;
  if (message.includes('AbortError') || message.includes('TimeoutError')) return 'RENDER_REQUEST_TIMEOUT';
  return 'RENDER_REQUEST_FAILED';
}

async function readHealth(service, fetchImpl) {
  try {
    const response = await fetchImpl(service.url.replace(/\/$/, '') + service.healthPath, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5000)
    });
    return { health: response.ok ? 'healthy' : 'unhealthy', healthStatus: response.status };
  } catch {
    return { health: 'unavailable', healthStatus: null };
  }
}

export async function getRenderBotServiceStatuses({
  fetchImpl = globalThis.fetch,
  apiKey = process.env.RENDER_API_KEY
} = {}) {
  const token = String(apiKey || '').trim();
  const results = await Promise.all(Object.entries(RENDER_BOT_SERVICES).map(async ([key, service]) => {
    let details = null;
    let serviceApiError = null;
    if (token) {
      try {
        const response = await fetchImpl(API_BASE + '/services/' + encodeURIComponent(service.id), {
          method: 'GET',
          headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
          signal: AbortSignal.timeout(5000)
        });
        if (!response.ok) throw new Error('RENDER_API_HTTP_' + response.status);
        details = await response.json();
        if (!details || details.id !== service.id) throw new Error('RENDER_SERVICE_ID_MISMATCH');
      } catch (error) {
        serviceApiError = safeErrorCode(error);
      }
    }

    const suspended = details?.suspended === 'suspended';
    const healthResult = suspended ? { health: 'suspended', healthStatus: null } : await readHealth(service, fetchImpl);
    const status = suspended ? 'suspended' : healthResult.health === 'healthy' ? 'running'
      : healthResult.health === 'unhealthy' ? 'unhealthy' : 'unknown';
    return {
      key,
      name: service.name,
      id: service.id,
      url: details?.serviceDetails?.url || service.url,
      dashboardUrl: details?.dashboardUrl || service.dashboardUrl,
      plan: details?.serviceDetails?.plan || null,
      suspended: details ? suspended : null,
      suspenders: Array.isArray(details?.suspenders) ? details.suspenders : [],
      status,
      health: healthResult.health,
      healthStatus: healthResult.healthStatus,
      apiError: serviceApiError,
      updatedAt: details?.updatedAt || null,
      canSuspend: service.canSuspend,
      allowedActions: service.allowedActions
    };
  }));
  const services = Object.fromEntries(results.map(service => [service.key, service]));
  const apiError = results.find(service => service.apiError)?.apiError || null;
  return { apiConfigured: Boolean(token), apiError, services };
}

async function updateActionAudit(client, auditId, details) {
  await client.query(
    `UPDATE owner_audit_logs
     SET details=COALESCE(details,'{}'::jsonb) || $2::jsonb
     WHERE id=$1`,
    [auditId, JSON.stringify(details)]
  );
}

export async function executeRenderServiceAction(db, input = {}, {
  apiKey = process.env.RENDER_API_KEY,
  fetchImpl = globalThis.fetch
} = {}) {
  const serviceKey = String(input.serviceKey || '');
  const action = String(input.action || '');
  const service = RENDER_BOT_SERVICES[serviceKey];
  if (!service || !service.allowedActions.includes(action)) throw new Error('RENDER_ACTION_NOT_ALLOWED');
  if (!(input.confirm === true || input.confirm === 'yes')) throw new Error('RENDER_ACTION_CONFIRM_REQUIRED');
  const reason = String(input.reason || '').trim();
  const actorId = String(input.actorId || OWNER).trim();
  if (!SNOWFLAKE.test(actorId) || reason.length < 3 || reason.length > 200) throw new Error('INVALID_RENDER_ACTION');
  const token = String(apiKey || '').trim();
  if (!token) throw new Error('RENDER_API_NOT_CONFIGURED');

  const client = await db.connect();
  let auditId = null;
  let actionAccepted = false;
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))', [service.id, 'render-control']);
    const recent = await client.query(
      `SELECT id FROM owner_audit_logs
       WHERE action='render.service.action' AND target=$1
         AND created_at > NOW() - INTERVAL '90 seconds'
       LIMIT 1`,
      [service.id]
    );
    if (recent.rowCount) throw new Error('RENDER_ACTION_COOLDOWN');
    const audit = await client.query(
      `INSERT INTO owner_audit_logs(actor_id,action,target,details)
       VALUES($1,'render.service.action',$2,$3::jsonb)
       RETURNING id`,
      [actorId, service.id, JSON.stringify({
        serviceKey, serviceName: service.name, action, reason, result: 'pending'
      })]
    );
    auditId = audit.rows?.[0]?.id;
    if (!auditId) throw new Error('RENDER_ACTION_AUDIT_FAILED');
    await client.query('COMMIT');

    const response = await fetchImpl(API_BASE + '/services/' + encodeURIComponent(service.id) + '/' + action, {
      method: 'POST',
      headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error('RENDER_API_HTTP_' + response.status);
    actionAccepted = true;
    let auditPending = false;
    try {
      await updateActionAudit(client, auditId, { result: 'accepted', httpStatus: response.status });
    } catch {
      auditPending = true;
    }
    return { accepted: true, auditPending, serviceKey, action, httpStatus: response.status };
  } catch (error) {
    if (!auditId) {
      await client.query('ROLLBACK').catch(() => {});
    } else if (!actionAccepted) {
      await updateActionAudit(client, auditId, {
        result: 'failed',
        errorCode: safeErrorCode(error),
        httpStatus: /^RENDER_API_HTTP_\d+$/.test(String(error?.message || '')) ? Number(String(error.message).split('_').at(-1)) : null
      }).catch(() => {});
    }
    throw error;
  } finally {
    client.release();
  }
}
