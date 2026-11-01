import { EmbedBuilder, MessageFlags } from 'discord.js';
import { containsSensitiveInformation } from './ai-agent/memory-extractor.js';

export const OWNER_ID = '1553794496234262641';
export const OWNER_PANEL_URL = 'https://pogaca-frieren.onrender.com/owner';

export function isOwner(userId) {
  return String(userId || '') === OWNER_ID;
}

export async function ownerOnly(interaction) {
  if (isOwner(interaction?.user?.id)) return true;
  const payload = { content: 'Bu komut yalnızca bot sahibine açıktır.', flags: MessageFlags.Ephemeral };
  if (interaction?.deferred || interaction?.replied) await interaction.followUp(payload).catch(() => {});
  else await interaction.reply(payload).catch(() => {});
  return false;
}

export async function initOwnerAdminSchema(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS owner_settings (
      setting_key TEXT PRIMARY KEY,
      setting_value JSONB NOT NULL,
      updated_by TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS owner_audit_logs (
      id BIGSERIAL PRIMARY KEY,
      actor_id TEXT NOT NULL,
      action TEXT NOT NULL,
      target TEXT,
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_owner_audit_recent ON owner_audit_logs(created_at DESC);
    CREATE TABLE IF NOT EXISTS owner_command_metrics (
      command_name TEXT NOT NULL,
      guild_id TEXT NOT NULL DEFAULT '',
      usage_count BIGINT NOT NULL DEFAULT 0,
      last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(command_name,guild_id)
    );
    CREATE TABLE IF NOT EXISTS owner_error_logs (
      id BIGSERIAL PRIMARY KEY,
      scope TEXT NOT NULL,
      error_type TEXT NOT NULL,
      error_message TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE owner_error_logs ADD COLUMN IF NOT EXISTS error_message TEXT NOT NULL DEFAULT '';
    CREATE INDEX IF NOT EXISTS idx_owner_errors_recent ON owner_error_logs(created_at DESC);
    CREATE TABLE IF NOT EXISTS owner_approval_requests (
      id BIGSERIAL PRIMARY KEY,
      requester_id TEXT NOT NULL,
      requester_tag TEXT NOT NULL DEFAULT 'unknown',
      request_type TEXT NOT NULL,
      title VARCHAR(160) NOT NULL,
      details TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
      reviewed_by TEXT,
      reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_owner_approval_pending ON owner_approval_requests(status,created_at DESC);
    CREATE TABLE IF NOT EXISTS owner_partner_links (
      id BIGSERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL UNIQUE,
      partner_name VARCHAR(80) NOT NULL,
      invite_url TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused')),
      created_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_owner_partner_status ON owner_partner_links(status,created_at DESC);
    CREATE TABLE IF NOT EXISTS owner_test_runs (
      id BIGSERIAL PRIMARY KEY,
      actor_id TEXT NOT NULL,
      target TEXT NOT NULL,
      status VARCHAR(40) NOT NULL,
      summary JSONB NOT NULL DEFAULT '{}'::jsonb,
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_owner_test_runs_recent ON owner_test_runs(created_at DESC);
    CREATE TABLE IF NOT EXISTS owner_guardian_incidents (
      id BIGSERIAL PRIMARY KEY,
      fingerprint CHAR(64) NOT NULL UNIQUE,
      system VARCHAR(40) NOT NULL CHECK (system IN ('frieren_neural','frieren_ai','pogaca_frieren','owner_panel','guardian')),
      code VARCHAR(80) NOT NULL,
      severity VARCHAR(10) NOT NULL CHECK (severity IN ('critical','high','medium','low')),
      status VARCHAR(24) NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_review','awaiting_approval','resolved','ignored')),
      title VARCHAR(160) NOT NULL,
      summary TEXT NOT NULL,
      evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
      occurrence_count INTEGER NOT NULL DEFAULT 1 CHECK (occurrence_count >= 1),
      review_attempts INTEGER NOT NULL DEFAULT 0 CHECK (review_attempts >= 0),
      last_review_at TIMESTAMPTZ,
      first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_owner_guardian_incidents_status ON owner_guardian_incidents(status,severity,last_seen DESC);
    CREATE TABLE IF NOT EXISTS owner_guardian_jobs (
      id BIGSERIAL PRIMARY KEY,
      incident_id BIGINT NOT NULL REFERENCES owner_guardian_incidents(id) ON DELETE RESTRICT,
      agent VARCHAR(40) NOT NULL CHECK (agent IN ('frieren_ai')),
      status VARCHAR(16) NOT NULL CHECK (status IN ('queued','running','completed','failed')),
      attempt INTEGER NOT NULL DEFAULT 1 CHECK (attempt >= 1),
      input JSONB NOT NULL DEFAULT '{}'::jsonb,
      result JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      started_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ,
      repair_dispatch_status VARCHAR(16) NOT NULL DEFAULT 'not_requested' CHECK (repair_dispatch_status IN ('not_requested','dispatching','dispatched','failed')),
      repair_dispatch_at TIMESTAMPTZ,
      repair_workflow_url TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_owner_guardian_jobs_recent ON owner_guardian_jobs(created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_owner_guardian_jobs_active
      ON owner_guardian_jobs(incident_id,agent) WHERE status IN ('queued','running');
    CREATE TABLE IF NOT EXISTS owner_guardian_monitor_state (
      monitor_key VARCHAR(80) PRIMARY KEY,
      last_seen_error_id BIGINT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

  `);
}

export async function auditOwnerAction(db, actorId, action, target = null, details = {}) {
  await db.query(
    'INSERT INTO owner_audit_logs(actor_id,action,target,details) VALUES($1,$2,$3,$4::jsonb)',
    [String(actorId), String(action).slice(0,80), target ? String(target).slice(0,180) : null, JSON.stringify(details)]
  );
}

export async function createApprovalRequest(db, { requesterId, requesterTag, requestType, title, details }) {
  const safeTitle = String(title || '').trim().slice(0, 160);
  const safeDetails = String(details || '').trim().slice(0, 1800);
  if (!safeTitle || !safeDetails || !['kod', 'teknik-bilgi'].includes(requestType)) throw new Error('INVALID_APPROVAL_REQUEST');
  if (/(?:discord(?:[ _-]?bot)?|groq|api)[ _-]?(?:token|key)|client_secret|password|parola|şifre/i.test(safeDetails)) throw new Error('POSSIBLE_SECRET_IN_REQUEST');
  const result = await db.query(
    'INSERT INTO owner_approval_requests(requester_id,requester_tag,request_type,title,details) VALUES($1,$2,$3,$4,$5) RETURNING id',
    [String(requesterId), String(requesterTag || 'unknown').slice(0,100), requestType, safeTitle, safeDetails]
  );
  return result.rows[0].id;
}

export async function recordCommandUsage(db, commandName, guildId = null) {
  await db.query(
    `INSERT INTO owner_command_metrics(command_name,guild_id,usage_count,last_used_at)
     VALUES($1,$2,1,NOW()) ON CONFLICT(command_name,guild_id)
     DO UPDATE SET usage_count=owner_command_metrics.usage_count+1,last_used_at=NOW()`,
    [String(commandName).slice(0,80), String(guildId || '')]
  );
}

export async function recordOwnerError(db, scope, errorType, errorMessage = '') {
  const message = String(errorMessage || '').trim().slice(0, 500);
  const safeMessage = message && !containsSensitiveInformation(message) ? message : message ? '[hassas hata ayrıntıları gizlendi]' : '';
  await db.query(
    `WITH inserted AS (
       INSERT INTO owner_error_logs(scope,error_type,error_message) VALUES($1,$2,$3) RETURNING id
     ), pruned AS (
       DELETE FROM owner_error_logs
       WHERE id NOT IN (SELECT id FROM owner_error_logs ORDER BY id DESC LIMIT 2000)
       RETURNING id
     )
     SELECT id FROM inserted`,
    [String(scope).slice(0,80), String(errorType || 'Error').slice(0,80), safeMessage]
  );
}

export async function getRecentOwnerActivity(db) {
  const result = await db.query(`
    SELECT
      COALESCE((SELECT json_agg(row_to_json(command_rows)) FROM (
        SELECT command_name,SUM(usage_count)::bigint AS usage_count,MAX(last_used_at) AS last_used_at
        FROM owner_command_metrics GROUP BY command_name ORDER BY SUM(usage_count) DESC LIMIT 8
      ) command_rows), '[]'::json) AS commands,
      COALESCE((SELECT json_agg(row_to_json(error_rows)) FROM (
        SELECT scope,error_type,created_at FROM owner_error_logs ORDER BY created_at DESC LIMIT 8
      ) error_rows), '[]'::json) AS errors,
      COALESCE((SELECT json_agg(row_to_json(audit_rows)) FROM (
        SELECT action,target,created_at FROM owner_audit_logs ORDER BY created_at DESC LIMIT 12
      ) audit_rows), '[]'::json) AS audit
  `);
  const row = result.rows?.[0] || {};
  return { commands: row.commands || [], errors: row.errors || [], audit: row.audit || [] };
}

export async function getMaintenanceState(db) {
  const result = await db.query("SELECT setting_value FROM owner_settings WHERE setting_key='maintenance'");
  return result.rows[0]?.setting_value?.enabled === true;
}

export async function setMaintenanceState(db, enabled, actorId) {
  const state = Boolean(enabled);
  await db.query(
    `WITH changed AS (
       INSERT INTO owner_settings(setting_key,setting_value,updated_by,updated_at)
       VALUES('maintenance',$1::jsonb,$2,NOW())
       ON CONFLICT(setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value,updated_by=EXCLUDED.updated_by,updated_at=NOW()
       RETURNING setting_key
     )
     INSERT INTO owner_audit_logs(actor_id,action,target,details)
     SELECT $2,'maintenance.update',NULL,$3::jsonb FROM changed`,
    [JSON.stringify({ enabled: state }), String(actorId), JSON.stringify({ enabled: state })]
  );
  return state;
}

export async function getOwnerOverview(client, db) {
  const result = await db.query(`
    SELECT
      1 AS ok,
      (SELECT COUNT(*)::int FROM frieren_chat_memories) AS memory_count,
      (SELECT COUNT(*)::int FROM owner_approval_requests WHERE status='pending') AS pending_count,
      (SELECT setting_value FROM owner_settings WHERE setting_key='maintenance' LIMIT 1) AS maintenance_value
  `);
  const row = result.rows?.[0] || {};
  const memoryBytes = process.memoryUsage();
  return {
    ready: Boolean(client?.isReady?.()),
    botName: String(client?.user?.tag || 'Bağlı değil'),
    guildCount: client?.guilds?.cache?.size || 0,
    userCount: client?.guilds?.cache?.reduce?.((total, guild) => total + (guild.memberCount || 0), 0) || 0,
    commandCount: client?.commands?.size || 0,
    ping: Number.isFinite(client?.ws?.ping) ? Math.round(client.ws.ping) : null,
    uptimeSeconds: Math.floor((client?.uptime || 0) / 1000),
    nodeVersion: process.version,
    platform: process.platform,
    rssBytes: memoryBytes.rss,
    heapUsedBytes: memoryBytes.heapUsed,
    cpuUsage: process.cpuUsage(),
    databaseReady: row.ok === 1,
    memoryCount: Number(row.memory_count || 0),
    pendingApprovals: Number(row.pending_count || 0),
    maintenance: row.maintenance_value?.enabled === true
  };
}

export async function listPendingApprovals(db, limit = 15) {
  const result = await db.query(
    "SELECT id,requester_id,requester_tag,request_type,title,details,created_at FROM owner_approval_requests WHERE status='pending' ORDER BY created_at ASC LIMIT $1",
    [Math.max(1, Math.min(Number(limit) || 15, 50))]
  );
  return result.rows || [];
}

export async function reviewApproval(db, id, decision, actorId) {
  if (!['approved','rejected'].includes(decision)) throw new Error('INVALID_APPROVAL_DECISION');
  const requestId = Number(id);
  if (!Number.isSafeInteger(requestId) || requestId <= 0) throw new Error('INVALID_APPROVAL_ID');
  const result = await db.query(
    `WITH changed AS (
       UPDATE owner_approval_requests SET status=$2,reviewed_by=$3,reviewed_at=NOW()
       WHERE id=$1 AND status='pending' RETURNING id,status,title
     ), logged AS (
       INSERT INTO owner_audit_logs(actor_id,action,target,details)
       SELECT $3,'approval.' || $2,$1::text,jsonb_build_object('title',title) FROM changed
       RETURNING id
     )
     SELECT changed.id,changed.status,changed.title FROM changed JOIN logged ON TRUE`,
    [requestId, decision, String(actorId)]
  );
  return result.rows?.[0] || null;
}

export async function listUserMemories(db, userId, guildId = null, limit = 20) {
  const result = await db.query(
    `SELECT id,guild_id,user_id,memory_key,memory_value,created_at,updated_at
     FROM frieren_chat_memories WHERE user_id=$1 AND ($2::text IS NULL OR guild_id=$2)
     ORDER BY updated_at DESC LIMIT $3`,
    [String(userId), guildId ? String(guildId) : null, Math.max(1, Math.min(Number(limit) || 20, 50))]
  );
  return result.rows || [];
}

export async function deleteUserMemory(db, memoryId, actorId) {
  const id = Number(memoryId);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('INVALID_MEMORY_ID');
  const result = await db.query(
    `WITH removed AS (
       DELETE FROM frieren_chat_memories WHERE id=$1
       RETURNING id,guild_id,user_id,memory_key
     ), logged AS (
       INSERT INTO owner_audit_logs(actor_id,action,target,details)
       SELECT $2,'memory.delete',$1::text,
         jsonb_build_object('guildId',guild_id,'userId',user_id,'key',memory_key)
       FROM removed RETURNING id
     )
     SELECT removed.id,removed.guild_id,removed.user_id,removed.memory_key
     FROM removed JOIN logged ON TRUE`,
    [id, String(actorId)]
  );
  return result.rows?.[0] || null;
}

export async function sendOwnerAnnouncement(client, db, { guildId, channelId, message, actorId }) {
  const text = String(message || '').trim();
  if (!guildId || !channelId || !text || text.length > 1800) throw new Error('INVALID_ANNOUNCEMENT');
  const guild = client.guilds.cache.get(String(guildId));
  if (!guild) throw new Error('GUILD_NOT_FOUND');
  const channel = await guild.channels.fetch(String(channelId));
  if (!channel?.isTextBased?.() || !channel?.send) throw new Error('CHANNEL_NOT_SENDABLE');
  if (String(channel.guildId || channel.guild?.id || '') !== String(guild.id)) throw new Error('CHANNEL_GUILD_MISMATCH');
  const me = guild.members.me;
  const requiredPermission = channel.isThread?.() ? 'SendMessagesInThreads' : 'SendMessages';
  if (!me || !channel.permissionsFor(me)?.has(requiredPermission)) throw new Error('MISSING_SEND_PERMISSION');
  const sent = await channel.send({ content: text, allowedMentions: { parse: [] } });
  await auditOwnerAction(db, actorId, 'announcement.send', guildId + '/' + channelId, {
    messageLength: text.length,
    messageId: sent.id
  });
  return { guildName: guild.name, channelName: channel.name, messageId: sent.id };
}


export async function listOwnerAuditLogs(db, { action = '', target = '', page = 1, limit = 20 } = {}) {
  const pageNumber = Number(page);
  if (!Number.isSafeInteger(pageNumber) || pageNumber < 1) throw new Error('INVALID_AUDIT_PAGE');
  const pageSize = Math.max(1, Math.min(Number(limit) || 20, 50));
  const filters = [];
  const params = [];
  const addFilter = (column, value) => {
    const term = String(value || '').trim().slice(0, 80).replace(/[%_]/g, '');
    if (!term) return;
    params.push('%' + term + '%');
    filters.push(column + ' ILIKE $' + params.length);
  };
  addFilter('action', action);
  addFilter("COALESCE(target,'')", target);
  params.push(pageSize);
  const limitParam = params.length;
  params.push((pageNumber - 1) * pageSize);
  const offsetParam = params.length;
  const where = filters.length ? 'WHERE ' + filters.join(' AND ') : '';
  const result = await db.query(
    'SELECT id,actor_id,action,target,details,created_at,COUNT(*) OVER()::int AS total_count ' +
    'FROM owner_audit_logs ' + where + ' ORDER BY id DESC LIMIT $' + limitParam + ' OFFSET $' + offsetParam,
    params
  );
  const rows = result.rows || [];
  return { rows: rows.map(({ total_count, ...row }) => row), page: pageNumber, limit: pageSize, total: Number(rows[0]?.total_count || 0) };
}

export async function listOwnerErrorLogs(db, { scope = '', page = 1, limit = 20 } = {}) {
  const pageNumber = Number(page);
  if (!Number.isSafeInteger(pageNumber) || pageNumber < 1) throw new Error('INVALID_ERROR_PAGE');
  const pageSize = Math.max(1, Math.min(Number(limit) || 20, 50));
  const params = [];
  const filter = String(scope || '').trim().slice(0, 80).replace(/[%_]/g, '');
  const where = filter ? (params.push('%' + filter + '%'), 'WHERE scope ILIKE $1') : '';
  params.push(pageSize);
  const limitParam = params.length;
  params.push((pageNumber - 1) * pageSize);
  const dollar = String.fromCharCode(36);
  const result = await db.query(
    'SELECT id,scope,error_type,error_message,created_at,COUNT(*) OVER()::int AS total_count FROM owner_error_logs ' +
    where + ' ORDER BY id DESC LIMIT ' + dollar + limitParam + ' OFFSET ' + dollar + params.length,
    params
  );
  const rows = result.rows || [];
  return { rows: rows.map(({ total_count, ...row }) => row), page: pageNumber, limit: pageSize, total: Number(rows[0]?.total_count || 0) };
}

export async function searchOwnerMemories(db, { userId = '', guildId = '', key = '', limit = 20 } = {}) {
  const filters = [];
  const params = [];
  const dollar = String.fromCharCode(36);
  const addExact = (column, value, errorCode) => {
    const term = String(value || '').trim();
    if (!term) return;
    if (!/^[0-9]{17,20}$/.test(term)) throw new Error(errorCode);
    params.push(term);
    filters.push(column + '=' + dollar + params.length);
  };
  addExact('user_id', userId, 'INVALID_MEMORY_USER');
  addExact('guild_id', guildId, 'INVALID_MEMORY_GUILD');
  const memoryKey = String(key || '').trim().slice(0, 60).replace(/[%_]/g, '');
  if (memoryKey) {
    params.push('%' + memoryKey + '%');
    filters.push('memory_key ILIKE ' + dollar + params.length);
  }
  const pageSize = Math.max(1, Math.min(Number(limit) || 20, 50));
  params.push(pageSize);
  const result = await db.query(
    'SELECT id,guild_id,user_id,memory_key,memory_value,created_at,updated_at FROM frieren_chat_memories ' +
    (filters.length ? 'WHERE ' + filters.join(' AND ') + ' ' : '') +
    'ORDER BY updated_at DESC,id DESC LIMIT ' + dollar + params.length,
    params
  );
  return result.rows || [];
}

export async function updateOwnerMemory(db, { id, value, actorId }) {
  const memoryId = Number(id);
  const memoryValue = String(value ?? '').trim();
  const actor = String(actorId || '');
  if (!Number.isSafeInteger(memoryId) || memoryId <= 0) throw new Error('INVALID_MEMORY_ID');
  if (!memoryValue || memoryValue.length > 1000) throw new Error('INVALID_MEMORY_VALUE');
  if (containsSensitiveInformation(memoryValue)) throw new Error('SENSITIVE_MEMORY_REJECTED');
  if (!/^[0-9]{17,20}$/.test(actor)) throw new Error('INVALID_MEMORY_ACTOR');
  const result = await db.query(
    `WITH changed AS (
       UPDATE frieren_chat_memories
       SET memory_value=$2,updated_at=NOW()
       WHERE id=$1
       RETURNING id,guild_id,user_id,memory_key
     ), logged AS (
       INSERT INTO owner_audit_logs(actor_id,action,target,details)
       SELECT $3,'memory.update',$1::text,
         jsonb_build_object('userId',user_id,'guildId',guild_id,'key',memory_key)
       FROM changed RETURNING id
     )
     SELECT changed.id,changed.guild_id,changed.user_id,changed.memory_key
     FROM changed JOIN logged ON TRUE`,
    [memoryId, memoryValue, actor]
  );
  return result.rows?.[0] || null;
}

export async function recordOwnerTestRun(db, { actorId, target, report } = {}) {
  const actor = String(actorId || '');
  const testTarget = String(target || '').trim().slice(0, 4000);
  if (!/^[0-9]{17,20}$/.test(actor) || !testTarget) throw new Error('INVALID_TEST_RUN');
  if (containsSensitiveInformation(testTarget)) throw new Error('SENSITIVE_TEST_TARGET_REJECTED');
  const summary = report?.summary && typeof report.summary === 'object' ? report.summary : {};
  const safeSummary = {
    total: Math.max(0, Number(summary.total ?? report?.total ?? 0) || 0),
    pass: Math.max(0, Number(summary.pass ?? report?.passed ?? 0) || 0),
    fail: Math.max(0, Number(summary.fail ?? report?.failed ?? 0) || 0),
    skipped: Math.max(0, Number(summary.skipped ?? 0) || 0)
  };
  const details = {
    status: String(report?.status || (safeSummary.fail > 0 ? 'FAIL' : safeSummary.total > 0 && safeSummary.pass === safeSummary.total ? 'PASS' : 'NOT_TESTED')).slice(0, 40),
    failedStages: Array.isArray(report?.failedStages) ? report.failedStages.slice(0, 20).map(value => String(value).slice(0, 120)) : [],
    testFiles: Array.isArray(report?.testFiles) ? report.testFiles.slice(0, 20).map(value => String(value).slice(0, 160)) : []
  };
  const result = await db.query(
    `WITH inserted AS (
       INSERT INTO owner_test_runs(actor_id,target,status,summary,details)
       VALUES($1,$2,$3,$4::jsonb,$5::jsonb) RETURNING id,created_at
     ), pruned AS (
       DELETE FROM owner_test_runs
       WHERE id NOT IN (SELECT id FROM owner_test_runs ORDER BY id DESC LIMIT 500)
       RETURNING id
     )
     SELECT id,created_at FROM inserted`,
    [actor, testTarget, details.status, JSON.stringify(safeSummary), JSON.stringify(details)]
  );
  return result.rows?.[0] || null;
}

export async function listOwnerTestRuns(db, { page = 1, limit = 20 } = {}) {
  const pageNumber = Number(page);
  if (!Number.isSafeInteger(pageNumber) || pageNumber < 1) throw new Error('INVALID_TEST_RUN_PAGE');
  const pageSize = Math.max(1, Math.min(Number(limit) || 20, 50));
  const result = await db.query(
    `SELECT id,target,status,summary,details,created_at,COUNT(*) OVER()::int AS total_count
     FROM owner_test_runs ORDER BY id DESC LIMIT $1 OFFSET $2`,
    [pageSize, (pageNumber - 1) * pageSize]
  );
  const rows = result.rows || [];
  return { rows: rows.map(({ total_count, ...row }) => row), page: pageNumber, limit: pageSize, total: Number(rows[0]?.total_count || 0) };
}

export function formatDuration(totalSeconds) {
  const value = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const days = Math.floor(value / 86400);
  const hours = Math.floor((value % 86400) / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = value % 60;
  return [days ? days + 'g' : '', hours ? hours + 'sa' : '', minutes ? minutes + 'dk' : '', seconds + 'sn'].filter(Boolean).join(' ');
}

export function createOwnerEmbed(title, description, color = 0xD5E2FA) {
  return new EmbedBuilder().setColor(color).setTitle(title).setDescription(description).setTimestamp();
}
