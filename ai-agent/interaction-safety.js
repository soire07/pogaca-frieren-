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

export function getPublicHealthStatus({ discordReady = false } = {}) {
  return discordReady ? 200 : 503;
}

export function getPublicHealthPayload({ discordReady = false } = {}) {
  // Expose only readiness, never tokens, configuration, or database details.
  return { status: 'ok', discordReady: Boolean(discordReady) };
}
