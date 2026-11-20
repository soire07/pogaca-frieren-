/**
 * Creates the scheduled anime-news delivery worker used by Frieren Notify.
 * Feed parsing, persistence and digest rendering remain injected capabilities;
 * this worker owns only delivery, permission checks, retry and overlap control.
 */
export function createAnimeNewsDigestWorker({
  db,
  permissionFlags,
  pollFeed,
  claimDigests,
  translateItems,
  buildEmbeds,
  markSent,
  releaseClaim,
  disableChannel,
  logger = console
} = {}) {
  const required = { db, permissionFlags, pollFeed, claimDigests, translateItems, buildEmbeds, markSent, releaseClaim, disableChannel };
  for (const [name, value] of Object.entries(required)) {
    if (value == null) throw new TypeError('NOTIFY_DEPENDENCY_REQUIRED:' + name);
  }
  let running = false;

  return async function processAnimeNewsDigests(client) {
    if (running || !client?.isReady?.()) return;
    running = true;
    try {
      try {
        const feedResult = await pollFeed(db);
        for (const failure of feedResult.failures || []) {
          logger.warn('Haberci kuş kaynağı güncellenemedi:', failure.source, failure.error);
        }
      } catch (error) {
        logger.warn('Haberci kuş RSS güncellemesi başarısız:', error?.message || error);
      }

      // One global feed poll; every configured guild receives an independent digest.
      const due = await claimDigests(db, 100);
      for (const digest of due) {
        try {
          const channel = await client.channels.fetch(digest.channel_id);
          if (String(channel?.guildId || '') !== String(digest.guild_id)) {
            throw new Error('NEWS_BIRD_TARGET_CHANNEL_GUILD_MISMATCH');
          }
          if (!channel?.isTextBased?.() || typeof channel.send !== 'function') {
            throw new Error('NEWS_BIRD_TARGET_CHANNEL_NOT_SENDABLE');
          }
          const permissions = channel.permissionsFor(client.user);
          if (!permissions?.has([
            permissionFlags.ViewChannel,
            permissionFlags.SendMessages,
            permissionFlags.EmbedLinks
          ])) {
            throw new Error('NEWS_BIRD_TARGET_CHANNEL_PERMISSIONS_MISSING');
          }

          const items = Array.isArray(digest.items) ? digest.items : [];
          const translatedItems = await translateItems(db, items);
          const embeds = buildEmbeds(translatedItems);
          if (embeds.length) {
            await channel.send({ embeds, allowedMentions: { parse: [] } });
          }
          await markSent(db, digest.guild_id);
        } catch (error) {
          if ([10003, 10008].includes(Number(error?.code))) {
            await disableChannel(db, digest.guild_id).catch(() => {});
          }
          await releaseClaim(db, digest.guild_id).catch(() => false);
          logger.error(
            'Haberci kuş sunucu kanalına teslim edilemedi:',
            'guild=' + digest.guild_id,
            'channel=' + digest.channel_id,
            error?.message || error
          );
        }
      }
    } catch (error) {
      logger.error('Haberci kuş taraması başarısız:', error?.message || error);
    } finally {
      running = false;
    }
  };
}
