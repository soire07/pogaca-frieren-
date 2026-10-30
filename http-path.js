export function getRequestPathname(requestUrl) {
  return new URL(requestUrl, 'http://localhost').pathname;
}
