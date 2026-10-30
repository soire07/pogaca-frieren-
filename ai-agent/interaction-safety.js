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
