export function shouldSkipFallbackResponse(response) {
  return Boolean(response?.headersSent || response?.writableEnded);
}
