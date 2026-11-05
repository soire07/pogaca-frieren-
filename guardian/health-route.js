function sendHealthResponse(res, ready, checks) {
  res.writeHead(ready ? 200 : 503, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify({
    status: ready ? 'ok' : 'not_ready',
    service: 'pogaca-frieren',
    checks,
  }));
}

export async function handleHealthRequest(req, res, { client, db } = {}) {
  if (req?.method !== 'GET' || !['/health', '/ready'].includes(req?.url)) return false;

  const discordReady = Boolean(client?.isReady?.());
  if (req.url === '/health') {
    // Liveness must not wake Neon on every Render health probe.
    // Database readiness is checked separately by GET /ready.
    sendHealthResponse(res, discordReady, {
      discord: discordReady ? 'ok' : 'not_ready',
      database: 'not_checked',
    });
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
  });
  return true;
}
