/**
 * Return only the hostname from a database connection string.
 * Never log or return credentials, database names, or query parameters.
 */
export function safeDatabaseHostname(connectionString) {
  if (typeof connectionString !== 'string' || !connectionString.trim()) return null;
  try {
    const parsed = new URL(connectionString);
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) return null;
    return parsed.hostname || null;
  } catch {
    return null;
  }
}


/**
 * Make node-postgres' current legacy SSL aliases explicit.
 * pg-connection-string currently interprets prefer/require/verify-ca as verify-full.
 * Writing verify-full avoids the deprecation warning and preserves certificate validation.
 */
export function normalizePostgresConnectionString(connectionString) {
  if (typeof connectionString !== 'string' || !connectionString.trim()) return connectionString;
  try {
    const parsed = new URL(connectionString);
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) return connectionString;
    const sslMode = parsed.searchParams.get('sslmode')?.toLowerCase();
    if (!['prefer', 'require', 'verify-ca'].includes(sslMode)) return connectionString;
    parsed.searchParams.set('sslmode', 'verify-full');
    return parsed.toString();
  } catch {
    return connectionString;
  }
}
