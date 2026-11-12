const ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export function assertIsolatedAuditDatabase(databaseUrl = process.env.DATABASE_URL) {
  let url;
  try {
    url = new URL(String(databaseUrl || ''));
  } catch {
    throw new Error('ISOLATED_AUDIT_DATABASE_REQUIRED');
  }

  const database = decodeURIComponent(url.pathname.replace(/^\\/+/, ''));
  const username = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  const valid = ['postgres:', 'postgresql:'].includes(url.protocol)
    && ALLOWED_HOSTS.has(url.hostname.toLowerCase())
    && url.port === '5432'
    && username === 'postgres'
    && password === 'postgres'
    && database === 'frieren_audit';

  if (!valid) throw new Error('ISOLATED_AUDIT_DATABASE_REQUIRED');
  return true;
}
