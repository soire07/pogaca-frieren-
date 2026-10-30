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
