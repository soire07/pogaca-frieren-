export function createConversationMemory({
  maxExchanges = 4,
  ttlMs = 30 * 60 * 1000,
  maxUsers = 100,
  now = () => Date.now(),
} = {}) {
  const historyByUser = new Map();
  const exchangeLimit = Math.max(1, Math.floor(Number(maxExchanges) || 4));
  const lifetime = Math.max(1, Number(ttlMs) || 30 * 60 * 1000);
  const userLimit = Math.max(1, Math.floor(Number(maxUsers) || 100));

  function pruneExpired() {
    const timestamp = now();
    for (const [userId, entry] of historyByUser) {
      if (timestamp - entry.updatedAt >= lifetime) historyByUser.delete(userId);
    }
    while (historyByUser.size > userLimit) {
      historyByUser.delete(historyByUser.keys().next().value);
    }
  }

  function getHistory(userId) {
    pruneExpired();
    const entry = historyByUser.get(String(userId));
    if (!entry) return [];
    entry.updatedAt = now();
    // Refresh insertion order so capacity eviction removes the least recently used user.
    historyByUser.delete(String(userId));
    historyByUser.set(String(userId), entry);
    return entry.messages.map(message => ({ ...message }));
  }

  function remember(userId, userMessage, assistantMessage) {
    if (userId === undefined || userId === null || String(userId).trim() === '') return;
    if (typeof userMessage !== 'string' || typeof assistantMessage !== 'string') return;
    const userContent = userMessage.trim().slice(0, 1500);
    const assistantContent = assistantMessage.trim().slice(0, 1900);
    if (!userContent || !assistantContent) return;

    pruneExpired();
    const key = String(userId);
    const entry = historyByUser.get(key) || { messages: [], updatedAt: now() };
    entry.messages.push(
      { role: 'user', content: userContent },
      { role: 'assistant', content: assistantContent },
    );
    entry.messages = entry.messages.slice(-exchangeLimit * 2);
    entry.updatedAt = now();
    historyByUser.delete(key);
    historyByUser.set(key, entry);
    pruneExpired();
  }

  function clear(userId) {
    return historyByUser.delete(String(userId));
  }

  return { getHistory, remember, clear };
}
