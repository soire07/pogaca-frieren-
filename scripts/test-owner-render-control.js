import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RENDER_BOT_SERVICES,
  getRenderBotServiceStatuses,
  executeRenderServiceAction
} from '../owner-render-control.js';

const actorId = '1553794496234262641';

function makeDb({ recentRows = [], failAudit = false } = {}) {
  const calls = [];
  const client = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('SELECT id FROM owner_audit_logs')) return { rows: recentRows, rowCount: recentRows.length };
      if (sql.includes('INSERT INTO owner_audit_logs')) {
        if (failAudit) throw new Error('audit unavailable');
        return { rows: [{ id: 42 }] };
      }
      return { rows: [] };
    },
    release() { calls.push({ sql: 'RELEASE' }); }
  };
  return { db: { connect: async () => client }, calls };
}

test('Render status can use public health endpoints without exposing or requiring an API key', async () => {
  const requested = [];
  const status = await getRenderBotServiceStatuses({
    apiKey: '',
    fetchImpl: async url => {
      requested.push(String(url));
      return { ok: true, status: 200, json: async () => ({ status: 'ok' }) };
    }
  });
  assert.equal(status.apiConfigured, false);
  assert.equal(status.services.pogaca.health, 'healthy');
  assert.equal(status.services.frieren_ai.health, 'healthy');
  assert.equal(status.services.frieren_ai.url, 'https://pogaca-frieren-kltd.onrender.com');
  assert.equal(status.services.frieren_ai.id, 'srv-dbj192flk1mc73805ia0');
  assert.equal(requested.length, 2);
  assert.ok(requested.every(url => !url.includes('/v1/services/')));
});

test('Render status reads suspension state and does not health-ping a suspended AI service', async () => {
  const requested = [];
  const status = await getRenderBotServiceStatuses({
    apiKey: 'test-token',
    fetchImpl: async (url, options) => {
      requested.push({ url: String(url), options });
      if (String(url).includes('/v1/services/')) {
        const ai = String(url).includes(RENDER_BOT_SERVICES.frieren_ai.id);
        return { ok: true, status: 200, json: async () => ({
          id: ai ? RENDER_BOT_SERVICES.frieren_ai.id : RENDER_BOT_SERVICES.pogaca.id,
          suspended: ai ? 'suspended' : 'not_suspended',
          suspenders: ai ? ['user'] : [],
          dashboardUrl: 'https://dashboard.render.com/web/test',
          serviceDetails: { plan: 'free' }
        }) };
      }
      return { ok: true, status: 200, json: async () => ({ status: 'ok' }) };
    }
  });
  assert.equal(status.apiConfigured, true);
  assert.equal(status.services.frieren_ai.status, 'suspended');
  assert.deepEqual(status.services.frieren_ai.suspenders, ['user']);
  assert.equal(status.services.pogaca.health, 'healthy');
  assert.equal(requested.filter(item => item.url.includes('frieren-ai-agent.onrender.com')).length, 0);
});

test('main Poğaça service cannot be suspended from its own control panel', async () => {
  const { db } = makeDb();
  await assert.rejects(executeRenderServiceAction(db, {
    serviceKey: 'pogaca', action: 'suspend', actorId,
    reason: 'Test', confirm: true
  }, { apiKey: 'test-token', fetchImpl: async () => { throw new Error('must not fetch'); } }), /RENDER_ACTION_NOT_ALLOWED/);
});

test('Render service actions require an explicit confirmation and a reason', async () => {
  const { db } = makeDb();
  await assert.rejects(executeRenderServiceAction(db, {
    serviceKey: 'frieren_ai', action: 'resume', actorId,
    reason: 'Başlat', confirm: false
  }, { apiKey: 'test-token', fetchImpl: async () => { throw new Error('must not fetch'); } }), /RENDER_ACTION_CONFIRM_REQUIRED/);
  await assert.rejects(executeRenderServiceAction(db, {
    serviceKey: 'frieren_ai', action: 'resume', actorId,
    reason: '', confirm: true
  }, { apiKey: 'test-token', fetchImpl: async () => { throw new Error('must not fetch'); } }), /INVALID_RENDER_ACTION/);
});

test('Render restart uses the server-side token, audit record and service-specific endpoint', async () => {
  const { db, calls } = makeDb();
  let request;
  const result = await executeRenderServiceAction(db, {
    serviceKey: 'pogaca', action: 'restart', actorId,
    reason: 'Discord bağlantısı yenilenecek', confirm: true
  }, {
    apiKey: 'server-only-token',
    fetchImpl: async (url, options) => {
      request = { url: String(url), options };
      return { ok: true, status: 200, json: async () => ({ message: 'Service restarted' }) };
    }
  });
  assert.equal(result.accepted, true);
  assert.equal(result.httpStatus, 200);
  assert.ok(request.url.endsWith('/v1/services/' + RENDER_BOT_SERVICES.pogaca.id + '/restart'));
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers.Authorization, 'Bearer server-only-token');
  assert.ok(calls.some(call => call.sql.includes('pg_advisory_xact_lock')));
  assert.ok(calls.some(call => call.sql.includes('INSERT INTO owner_audit_logs')));
  assert.ok(calls.some(call => call.sql.includes('UPDATE owner_audit_logs')));
  assert.ok(calls.some(call => call.sql === 'COMMIT'));
});

test('Render AI resume uses the resume endpoint and is independently controllable', async () => {
  const { db } = makeDb();
  let requestUrl = '';
  const result = await executeRenderServiceAction(db, {
    serviceKey: 'frieren_ai', action: 'resume', actorId,
    reason: 'AI testlerini çalıştıracağım', confirm: true
  }, {
    apiKey: 'server-only-token',
    fetchImpl: async url => {
      requestUrl = String(url);
      return { ok: true, status: 202, json: async () => ({ message: 'Service resumed' }) };
    }
  });
  assert.equal(result.accepted, true);
  assert.equal(result.httpStatus, 202);
  assert.ok(requestUrl.endsWith('/v1/services/' + RENDER_BOT_SERVICES.frieren_ai.id + '/resume'));
});

test('Render API cooldown prevents repeated actions on the same service', async () => {
  const { db, calls } = makeDb({ recentRows: [{ id: 41 }] });
  let fetched = false;
  await assert.rejects(executeRenderServiceAction(db, {
    serviceKey: 'frieren_ai', action: 'suspend', actorId,
    reason: 'Test', confirm: true
  }, {
    apiKey: 'server-only-token',
    fetchImpl: async () => { fetched = true; return { ok: true, status: 202, json: async () => ({}) }; }
  }), /RENDER_ACTION_COOLDOWN/);
  assert.equal(fetched, false);
  assert.ok(calls.some(call => call.sql === 'ROLLBACK'));
});

test('Render API failures are written to the audit record without exposing response bodies', async () => {
  const { db, calls } = makeDb();
  await assert.rejects(executeRenderServiceAction(db, {
    serviceKey: 'frieren_ai', action: 'suspend', actorId,
    reason: 'Test', confirm: true
  }, {
    apiKey: 'server-only-token',
    fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ secret: 'never surface' }) })
  }), /RENDER_API_HTTP_401/);
  const update = calls.find(call => call.sql.includes('UPDATE owner_audit_logs'));
  assert.ok(update);
  assert.match(update.params[1], /"result":"failed"/);
  assert.doesNotMatch(update.params[1], /never surface/);
});

test('Render actions fail closed when the API key is missing', async () => {
  let connected = false;
  await assert.rejects(executeRenderServiceAction({ connect: async () => { connected = true; } }, {
    serviceKey: 'frieren_ai', action: 'resume', actorId,
    reason: 'Başlat', confirm: true
  }, { apiKey: '', fetchImpl: async () => { throw new Error('must not fetch'); } }), /RENDER_API_NOT_CONFIGURED/);
  assert.equal(connected, false);
});


test('separate Render accounts use separate API keys and the migrated Frieren AI endpoint', async () => {
  const oldMain = process.env.RENDER_POGACA_API_KEY;
  const oldLegacy = process.env.RENDER_API_KEY;
  const oldAi = process.env.RENDER_FRIEREN_AI_API_KEY;
  process.env.RENDER_POGACA_API_KEY = 'primary-account-key';
  delete process.env.RENDER_API_KEY;
  process.env.RENDER_FRIEREN_AI_API_KEY = 'frieren-account-key';
  const auth = [];
  try {
    const status = await getRenderBotServiceStatuses({
      fetchImpl: async (url, options) => {
        const target = String(url);
        if (target.includes('/v1/services/')) {
          auth.push({ target, authorization: options.headers.Authorization });
          const ai = target.includes(RENDER_BOT_SERVICES.frieren_ai.id);
          return { ok: true, status: 200, json: async () => ({
            id: ai ? RENDER_BOT_SERVICES.frieren_ai.id : RENDER_BOT_SERVICES.pogaca.id,
            suspended: 'not_suspended', suspenders: [], serviceDetails: { plan: 'free' }
          }) };
        }
        return { ok: true, status: 200, json: async () => ({ status: 'ok' }) };
      }
    });
    assert.equal(status.apiConfigured, true);
    assert.equal(status.services.pogaca.apiConfigured, true);
    assert.equal(status.services.frieren_ai.apiConfigured, true);
    assert.deepEqual(auth.map(x => x.authorization).sort(), ['Bearer frieren-account-key', 'Bearer primary-account-key']);
    assert.ok(auth.some(x => x.target.endsWith('/' + RENDER_BOT_SERVICES.frieren_ai.id)));
  } finally {
    if (oldMain === undefined) delete process.env.RENDER_POGACA_API_KEY; else process.env.RENDER_POGACA_API_KEY = oldMain;
    if (oldLegacy === undefined) delete process.env.RENDER_API_KEY; else process.env.RENDER_API_KEY = oldLegacy;
    if (oldAi === undefined) delete process.env.RENDER_FRIEREN_AI_API_KEY; else process.env.RENDER_FRIEREN_AI_API_KEY = oldAi;
  }
});

test('Frieren AI actions use only the new account API key', async () => {
  const oldAi = process.env.RENDER_FRIEREN_AI_API_KEY;
  const oldMain = process.env.RENDER_POGACA_API_KEY;
  process.env.RENDER_FRIEREN_AI_API_KEY = 'frieren-account-key';
  process.env.RENDER_POGACA_API_KEY = 'primary-account-key';
  let authorization = '';
  try {
    const { db } = makeDb();
    await executeRenderServiceAction(db, {
      serviceKey: 'frieren_ai', action: 'restart', actorId,
      reason: 'Yeni AI servisini yeniden başlatma testi', confirm: true
    }, {
      fetchImpl: async (_url, options) => {
        authorization = options.headers.Authorization;
        return { ok: true, status: 202, json: async () => ({}) };
      }
    });
    assert.equal(authorization, 'Bearer frieren-account-key');
  } finally {
    if (oldAi === undefined) delete process.env.RENDER_FRIEREN_AI_API_KEY; else process.env.RENDER_FRIEREN_AI_API_KEY = oldAi;
    if (oldMain === undefined) delete process.env.RENDER_POGACA_API_KEY; else process.env.RENDER_POGACA_API_KEY = oldMain;
  }
});
