import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RENDER_BOT_SERVICES,
  resolveRenderBotServices,
  getRenderBotServiceStatuses,
  executeRenderServiceAction
} from '../owner-render-control.js';

const actorId = '1553794496234262641';
const configuredServices = Object.freeze({
  pogaca: Object.freeze({ ...RENDER_BOT_SERVICES.pogaca }),
  neural: Object.freeze({
    ...RENDER_BOT_SERVICES.neural,
    id: 'srv-neural-test',
    url: 'https://frieren-neural.test',
    dashboardUrl: 'https://dashboard.render.com/web/srv-neural-test'
  })
});

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

test('only Poğaça and the single central Neural service are exposed to Render controls', () => {
  assert.deepEqual(Object.keys(resolveRenderBotServices({})), ['pogaca', 'neural']);
  const services = resolveRenderBotServices({});
  assert.equal(services.neural.id, null);
  assert.equal(services.neural.url, '');
  assert.deepEqual(services.neural.allowedActions, ['restart']);
  assert.equal(services.neural.canSuspend, false);
});

test('public health checks work without a Render API key and validate Neural readiness', async () => {
  const requested = [];
  const status = await getRenderBotServiceStatuses({
    services: configuredServices,
    apiKey: '',
    fetchImpl: async url => {
      requested.push(String(url));
      const neural = String(url).includes('frieren-neural.test');
      return { ok: true, status: 200, json: async () => ({ status: neural ? 'ready' : 'ok' }) };
    }
  });
  assert.equal(status.apiConfigured, false);
  assert.equal(status.services.pogaca.health, 'healthy');
  assert.equal(status.services.neural.health, 'healthy');
  assert.equal(status.services.neural.url, 'https://frieren-neural.test');
  assert.equal(status.services.neural.id, 'srv-neural-test');
  assert.equal(requested.length, 2);
  assert.ok(requested.every(url => !url.includes('/v1/services/')));
});

test('Render API service lookup is deferred before Neural health check when separate account credentials exist', async () => {
  const requested = [];
  let releaseApi;
  const gate = new Promise(resolve => { releaseApi = resolve; });
  const pending = getRenderBotServiceStatuses({
    services: configuredServices,
    apiKey: 'test-token',
    fetchImpl: async url => {
      const target = String(url);
      requested.push(target);
      if (target.includes('/v1/services/')) {
        await gate;
        const neural = target.includes(configuredServices.neural.id);
        return { ok: true, status: 200, json: async () => ({
          id: neural ? configuredServices.neural.id : RENDER_BOT_SERVICES.pogaca.id,
          suspended: 'not_suspended', suspenders: [], serviceDetails: { plan: 'free', url: neural ? 'https://frieren-neural.test' : 'https://pogaca-frieren.onrender.com' }
        }) };
      }
      return { ok: true, status: 200, json: async () => ({ status: 'ready' }) };
    }
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requested.length, 3);
  releaseApi();
  const status = await pending;
  assert.equal(requested.length, 4);
  assert.equal(status.services.neural.healthPayload.status, 'ready');
});

test('a suspended Neural service is not health-pinged or automatically resumed', async () => {
  const requested = [];
  const status = await getRenderBotServiceStatuses({
    services: configuredServices,
    apiKey: 'test-token',
    fetchImpl: async url => {
      requested.push(String(url));
      if (String(url).includes('/v1/services/')) {
        const neural = String(url).includes(configuredServices.neural.id);
        return { ok: true, status: 200, json: async () => ({
          id: neural ? configuredServices.neural.id : RENDER_BOT_SERVICES.pogaca.id,
          suspended: neural ? 'suspended' : 'not_suspended',
          suspenders: neural ? ['user'] : [],
          serviceDetails: { plan: 'free' }
        }) };
      }
      return { ok: true, status: 200, json: async () => ({ status: 'ok' }) };
    }
  });
  assert.equal(status.services.neural.status, 'suspended');
  assert.deepEqual(status.services.neural.allowedActions, []);
  assert.equal(requested.some(url => url.includes('frieren-neural.test/health')), false);
});

test('production Poğaça and Neural services cannot be suspended from the Owner Panel', async () => {
  const { db } = makeDb();
  for (const serviceKey of ['pogaca', 'neural', 'frieren_ai']) {
    await assert.rejects(executeRenderServiceAction(db, {
      serviceKey, action: 'suspend', actorId, reason: 'Test', confirm: true
    }, { apiKey: 'test-token', services: configuredServices, fetchImpl: async () => { throw new Error('must not fetch'); } }), /RENDER_ACTION_NOT_ALLOWED/);
  }
});

test('Neural restart uses its separate server-side Render key and writes an audit record', async () => {
  const oldNeural = process.env.RENDER_FRIEREN_NEURAL_API_KEY;
  const oldPogaca = process.env.RENDER_POGACA_API_KEY;
  process.env.RENDER_FRIEREN_NEURAL_API_KEY = 'neural-account-key';
  process.env.RENDER_POGACA_API_KEY = 'pogaca-account-key';
  const { db, calls } = makeDb();
  let request;
  try {
    const result = await executeRenderServiceAction(db, {
      serviceKey: 'neural', action: 'restart', actorId,
      reason: 'Neural servisinde takılma giderilecek', confirm: true
    }, {
      services: configuredServices,
      fetchImpl: async (url, options) => {
        request = { url: String(url), options };
        return { ok: true, status: 202, json: async () => ({}) };
      }
    });
    assert.equal(result.accepted, true);
    assert.equal(result.serviceKey, 'neural');
    assert.equal(request.options.headers.Authorization, 'Bearer neural-account-key');
    assert.ok(request.url.endsWith('/v1/services/srv-neural-test/restart'));
    assert.ok(calls.some(call => call.sql.includes('INSERT INTO owner_audit_logs')));
    assert.ok(calls.some(call => call.sql.includes('UPDATE owner_audit_logs')));
    assert.ok(calls.some(call => call.sql === 'COMMIT'));
  } finally {
    if (oldNeural === undefined) delete process.env.RENDER_FRIEREN_NEURAL_API_KEY;
    else process.env.RENDER_FRIEREN_NEURAL_API_KEY = oldNeural;
    if (oldPogaca === undefined) delete process.env.RENDER_POGACA_API_KEY;
    else process.env.RENDER_POGACA_API_KEY = oldPogaca;
  }
});

test('Render cooldown prevents repeated restart requests', async () => {
  const { db } = makeDb({ recentRows: [{ id: 41 }] });
  let fetched = false;
  await assert.rejects(executeRenderServiceAction(db, {
    serviceKey: 'neural', action: 'restart', actorId,
    reason: 'Test', confirm: true
  }, {
    apiKey: 'server-only-token',
    services: configuredServices,
    fetchImpl: async () => { fetched = true; return { ok: true, status: 202, json: async () => ({}) }; }
  }), /RENDER_ACTION_COOLDOWN/);
  assert.equal(fetched, false);
});

test('Render actions fail closed when the API key is missing', async () => {
  const { db } = makeDb();
  await assert.rejects(executeRenderServiceAction(db, {
    serviceKey: 'neural', action: 'restart', actorId,
    reason: 'Başlat', confirm: true
  }, { apiKey: '', services: configuredServices, fetchImpl: async () => { throw new Error('must not fetch'); } }), /RENDER_API_NOT_CONFIGURED/);
});

test('Render API failures are audited without exposing response bodies', async () => {
  const { db, calls } = makeDb();
  await assert.rejects(executeRenderServiceAction(db, {
    serviceKey: 'neural', action: 'restart', actorId,
    reason: 'Test', confirm: true
  }, {
    apiKey: 'server-only-token',
    services: configuredServices,
    fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ secret: 'never surface' }) })
  }), /RENDER_API_HTTP_401/);
  const update = calls.find(call => call.sql.includes('UPDATE owner_audit_logs'));
  assert.ok(update);
  assert.match(update.params[1], /"result":"failed"/);
  assert.doesNotMatch(update.params[1], /never surface/);
});

test('separate Render accounts retain separate Poğaça and Neural API keys', async () => {
  const oldPogaca = process.env.RENDER_POGACA_API_KEY;
  const oldNeural = process.env.RENDER_FRIEREN_NEURAL_API_KEY;
  process.env.RENDER_POGACA_API_KEY = 'primary-account-key';
  process.env.RENDER_FRIEREN_NEURAL_API_KEY = 'neural-account-key';
  const auth = [];
  try {
    const status = await getRenderBotServiceStatuses({
      services: configuredServices,
      fetchImpl: async (url, options) => {
        const target = String(url);
        if (target.includes('/v1/services/')) {
          auth.push({ target, authorization: options.headers.Authorization });
          const neural = target.includes(configuredServices.neural.id);
          return { ok: true, status: 200, json: async () => ({
            id: neural ? configuredServices.neural.id : RENDER_BOT_SERVICES.pogaca.id,
            suspended: 'not_suspended', suspenders: [], serviceDetails: { plan: 'free' }
          }) };
        }
        return { ok: true, status: 200, json: async () => ({ status: 'ready' }) };
      }
    });
    assert.equal(status.apiConfigured, true);
    assert.equal(status.services.pogaca.apiConfigured, true);
    assert.equal(status.services.neural.apiConfigured, true);
    assert.deepEqual(auth.map(item => item.authorization).sort(), ['Bearer neural-account-key', 'Bearer primary-account-key']);
  } finally {
    if (oldPogaca === undefined) delete process.env.RENDER_POGACA_API_KEY;
    else process.env.RENDER_POGACA_API_KEY = oldPogaca;
    if (oldNeural === undefined) delete process.env.RENDER_FRIEREN_NEURAL_API_KEY;
    else process.env.RENDER_FRIEREN_NEURAL_API_KEY = oldNeural;
  }
});
