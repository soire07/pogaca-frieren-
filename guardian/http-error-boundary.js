export function withHttpErrorBoundary(handler, { onError = async () => {} } = {}) {
  if (typeof handler !== 'function') throw new TypeError('HTTP_HANDLER_REQUIRED');

  return function guardedHttpRequest(req, res) {
    return Promise.resolve()
      .then(() => handler(req, res))
      .catch(async error => {
        try {
          await onError(error, req, res);
        } catch {
          // Error reporting must never cause a second unhandled rejection.
        }

        if (res?.writableEnded || res?.destroyed) return;
        if (res?.headersSent) {
          // The response has already started; never attempt to write a second status/header set.
          res.end();
          return;
        }

        res.writeHead(500, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        res.end(JSON.stringify({ error: 'internal_server_error' }));
      });
  };
}
