function sendHealthResponse(res, ready, checks, { liveness = false, head = false } = {}) {
  const healthy = liveness || ready;
  res.writeHead(healthy ? 200 : 503, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(head ? undefined : JSON.stringify({
    status: liveness ? 'alive' : ready ? 'ok' : 'not_ready',
    service: 'pogaca-frieren',
    checks,
  }));
}

export async function handleHealthRequest(req, res, { client, db } = {}) {
  const method = String(req?.method || '').toUpperCase();
  const pathname = String(req?.url || '').split('?')[0].replace(/\/+$/, '') || '/';
  if (!['GET', 'HEAD'].includes(method) || !['/health', '/ready'].includes(pathname)) return false;

  const head = method === 'HEAD';
  const discordReady = Boolean(client?.isReady?.());
  if (pathname === '/health') {
    // Liveness must not wake Neon on every Render health probe.
    // GET and HEAD are both supported for HTTP monitor compatibility.
    // Database readiness is checked separately by GET /ready.
    sendHealthResponse(res, discordReady, {
      discord: discordReady ? 'ok' : 'not_ready',
      database: 'not_checked',
    }, { liveness: true, head });
    return true;
  }

  let databaseReady = false;
  try {
    if (typeof db?.query !== 'function') throw new TypeError('DATABASE_QUERY_UNAVAILABLE');
    await db.query('SELECT 1');
    databaseReady = true;
  } catch {
    databaseReady = false;
  }

  sendHealthResponse(res, discordReady && databaseReady, {
    discord: discordReady ? 'ok' : 'not_ready',
    database: databaseReady ? 'ok' : 'error',
  }, { head });
  return true;
}
