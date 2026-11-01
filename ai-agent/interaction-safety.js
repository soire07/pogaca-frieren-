export function isAuthorizedAdmin(userId, adminIds) {
  return typeof userId === 'string'
    && userId.length > 0
    && adminIds instanceof Set
    && adminIds.has(userId);
}

export function getTestLockKey(guildId, userId) {
  if (typeof guildId === 'string' && guildId.length > 0) return 'guild:' + guildId;
  if (typeof userId === 'string' && userId.length > 0) return 'user:' + userId;
  return 'unknown-interaction';
}

export async function sendPrivateError(interaction, content, onError = () => {}) {
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content });
    } else {
      await interaction.reply({ content, ephemeral: true });
    }
    return true;
  } catch (error) {
    try { onError(error); } catch {}
    return false;
  }
}

export function getPublicHealthStatus({
  discordReady = false,
  memoryDatabaseReady = false,
  modelConfigured = false,
} = {}) {
  // Readiness is used by the combined service health proxy and external monitor.
  return discordReady && memoryDatabaseReady && modelConfigured ? 200 : 503;
}

export function getPublicHealthPayload({
  discordReady = false,
  memoryDatabaseReady = false,
  modelConfigured = false,
  bridgeConfigured = false,
} = {}) {
  // Expose only dependency readiness, never tokens, URLs, or configuration values.
  const ready = Boolean(discordReady && memoryDatabaseReady && modelConfigured);
  return {
    status: ready ? 'ok' : 'not_ready',
    discordReady: Boolean(discordReady),
    memoryDatabaseReady: Boolean(memoryDatabaseReady),
    modelConfigured: Boolean(modelConfigured),
    bridgeConfigured: Boolean(bridgeConfigured),
  };
}

export function isPrivateHealthPath(path) {
  return path === '/health' || path === '/ready' || path === '/bridge-health';
}

export function getPublicLivenessPayload(readiness = {}) {
  const health = getPublicHealthPayload(readiness);
  return {
    status: 'alive',
    ready: health.status === 'ok',
    readiness: health,
  };
}

export async function checkBridgeReachability({ baseUrl, secret, fetchImpl = fetch, timeoutMs = 5_000 } = {}) {
  if (typeof baseUrl !== 'string' || !baseUrl.trim() || typeof secret !== 'string' || secret.length < 32) {
    return { reachable: false, commandCount: 0, reason: 'not_configured' };
  }
  const normalizedBaseUrl = baseUrl.trim().replace(/\/$/, '');
  try {
    const response = await fetchImpl(normalizedBaseUrl + '/internal/test-catalog', {
      method: 'GET',
      headers: { authorization: 'Bearer ' + secret, accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return { reachable: false, commandCount: 0, reason: 'http_' + response.status };
    const payload = await response.json();
    if (payload?.service !== 'pogaca-frieren' || !Array.isArray(payload.commands) || !Number.isInteger(payload.count) || payload.count !== payload.commands.length) {
      return { reachable: false, commandCount: 0, reason: 'invalid_response' };
    }
    return { reachable: true, commandCount: payload.count, reason: 'ok' };
  } catch {
    return { reachable: false, commandCount: 0, reason: 'request_failed' };
  }
}
