import { createServer } from 'node:http';
import { handleOwnerDashboardRequest } from '../owner-dashboard.js';
import { handlePublicSiteRequest } from '../public-site.js';

const port = Number(process.env.PORT || 4173);
const db = {
  async query() {
    return { rows: [], rowCount: 0 };
  }
};
const client = {
  guilds: { cache: new Map() },
  commands: { size: 0 },
  isReady: () => true
};

const server = createServer(async (req, res) => {
  try {
    if (await handleOwnerDashboardRequest(req, res, { client, db })) return;
    if (await handlePublicSiteRequest(req, res, { client, db })) return;
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end('Not found');
  } catch (error) {
    console.error('Public-site smoke request failed:', error?.stack || error);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end('Smoke server request failed');
  }
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write('Isolated public-site smoke server listening on 127.0.0.1:' + port + '\n');
});
