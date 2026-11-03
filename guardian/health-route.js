export async function handleHealthRequest(req, res, { client, db } = {}) {
  if (req?.method !== 'GET' || req?.url !== '/health') return false;

  const discordReady = Boolean(client?.isReady?.());
  let databaseReady = false;
  try {
    if (typeof db?.query !== 'function') throw new TypeError('DATABASE_QUERY_UNAVAILABLE');
    await db.query('SELECT 1');
    databaseReady = true;
  } catch {
    databaseReady = false;
  }

  const checks = {
    discord: discordReady ? 'ok' : 'not_ready',
    database: databaseReady ? 'ok' : 'error',
  };
  const ready = discordReady && databaseReady;
  res.writeHead(ready ? 200 : 503, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify({
    status: ready ? 'ok' : 'not_ready',
    service: 'pogaca-frieren',
    checks,
  }));
  return true;
}
