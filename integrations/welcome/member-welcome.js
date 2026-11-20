const DEFAULT_WELCOME_MESSAGE = 'Hoş geldin {user}! {server} sunucusuna katıldın.';

/**
 * Creates the member-join handler used by the Welcome capability.
 * Dependencies are injected so this boundary can move into Frieren Welcome
 * without importing Poğaça's RPG runtime or opening its database itself.
 */
export function createGuildMemberWelcomeHandler({ db, recordError, logger = console } = {}) {
  if (!db || typeof db.query !== 'function') throw new TypeError('WELCOME_DATABASE_REQUIRED');
  if (typeof recordError !== 'function') throw new TypeError('WELCOME_ERROR_RECORDER_REQUIRED');

  return async function handleGuildMemberWelcome(member) {
    try {
      const result = await db.query(
        'SELECT welcome_channel_id,welcome_message FROM guild_settings WHERE guild_id=$1',
        [member.guild.id]
      );
      const settings = result.rows?.[0];
      if (!settings?.welcome_channel_id) return;

      const channel = await member.guild.channels.fetch(String(settings.welcome_channel_id)).catch(() => null);
      if (!channel?.isTextBased?.() || typeof channel.send !== 'function') return;
      const me = member.guild.members.me;
      if (!me || !channel.permissionsFor(me)?.has('SendMessages')) return;

      const message = String(settings.welcome_message || DEFAULT_WELCOME_MESSAGE)
        .replaceAll('{user}', '<@' + member.id + '>')
        .replaceAll('{server}', member.guild.name)
        .slice(0, 300);
      await channel.send({
        content: message,
        allowedMentions: { parse: [], users: [member.id] }
      });
    } catch (error) {
      logger.error('Guild member welcome handler failed:', error?.message || error);
      await recordError('guild-member-join', error?.name || 'Error', error?.message || '').catch(() => {});
    }
  };
}
