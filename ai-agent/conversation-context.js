const DEFAULT_MAX_MESSAGES = 8;
const DEFAULT_MAX_TOTAL_CHARS = 4_800;
const MAX_MESSAGE_CHARS = 1_200;

/**
 * Keeps a bounded, chronological suffix of the current user's conversation.
 * Only plain user/assistant text is allowed into the model message list.
 */
export function prepareConversationHistory(history, options = {}) {
  if (!Array.isArray(history)) return [];

  const requestedMessages = Number(options.maxMessages);
  const requestedChars = Number(options.maxTotalChars);
  const maxMessages = Number.isInteger(requestedMessages) && requestedMessages > 0
    ? Math.min(requestedMessages, 12)
    : DEFAULT_MAX_MESSAGES;
  const maxTotalChars = Number.isFinite(requestedChars) && requestedChars > 0
    ? Math.min(Math.floor(requestedChars), 12_000)
    : DEFAULT_MAX_TOTAL_CHARS;

  const validMessages = history
    .filter(message => message && ['user', 'assistant'].includes(message.role)
      && typeof message.content === 'string')
    .map(message => ({
      role: message.role,
      content: message.content.trim().slice(-MAX_MESSAGE_CHARS),
    }))
    .filter(message => message.content.length > 0)
    .slice(-maxMessages);

  const selected = [];
  let usedChars = 0;
  for (let index = validMessages.length - 1; index >= 0; index -= 1) {
    const message = validMessages[index];
    const remaining = maxTotalChars - usedChars;
    if (remaining <= 0) break;
    if (message.content.length > remaining) {
      if (selected.length === 0) {
        selected.push({ ...message, content: message.content.slice(-remaining) });
      }
      break;
    }
    selected.push(message);
    usedChars += message.content.length;
  }

  return selected.reverse();
}
