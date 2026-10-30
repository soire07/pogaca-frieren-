import { EmbedBuilder, MessageFlags } from 'discord.js';

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
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
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

export async function recordOwnerError(db, scope, errorType) {
  await db.query('INSERT INTO owner_error_logs(scope,error_type) VALUES($1,$2)', [String(scope).slice(0,80), String(errorType || 'Error').slice(0,80)]);
}

export async function getRecentOwnerActivity(db) {
  const [commands, errors, audit] = await Promise.all([
    db.query('SELECT command_name,SUM(usage_count)::bigint AS usage_count,MAX(last_used_at) AS last_used_at FROM owner_command_metrics GROUP BY command_name ORDER BY SUM(usage_count) DESC LIMIT 8'),
    db.query('SELECT scope,error_type,created_at FROM owner_error_logs ORDER BY created_at DESC LIMIT 8'),
    db.query('SELECT action,target,created_at FROM owner_audit_logs ORDER BY created_at DESC LIMIT 12')
  ]);
  return { commands: commands.rows || [], errors: errors.rows || [], audit: audit.rows || [] };
}

export async function getMaintenanceState(db) {
  const result = await db.query("SELECT setting_value FROM owner_settings WHERE setting_key='maintenance'");
  return result.rows[0]?.setting_value?.enabled === true;
}

export async function setMaintenanceState(db, enabled, actorId) {
  await db.query(
    `INSERT INTO owner_settings(setting_key,setting_value,updated_by,updated_at)
     VALUES('maintenance',$1::jsonb,$2,NOW())
     ON CONFLICT(setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value,updated_by=EXCLUDED.updated_by,updated_at=NOW()`,
    [JSON.stringify({ enabled: Boolean(enabled) }), String(actorId)]
  );
  await auditOwnerAction(db, actorId, 'maintenance.update', null, { enabled: Boolean(enabled) });
  return Boolean(enabled);
}

export async function getOwnerOverview(client, db) {
  const [dbCheck, memoryCount, pendingCount, settings] = await Promise.all([
    db.query('SELECT 1 AS ok'),
    db.query('SELECT COUNT(*)::int AS count FROM frieren_chat_memories'),
    db.query("SELECT COUNT(*)::int AS count FROM owner_approval_requests WHERE status='pending'"),
    db.query("SELECT setting_value FROM owner_settings WHERE setting_key='maintenance'")
  ]);
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
    databaseReady: dbCheck.rows?.[0]?.ok === 1,
    memoryCount: Number(memoryCount.rows?.[0]?.count || 0),
    pendingApprovals: Number(pendingCount.rows?.[0]?.count || 0),
    maintenance: settings.rows[0]?.setting_value?.enabled === true
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
  const result = await db.query(
    "UPDATE owner_approval_requests SET status=$2,reviewed_by=$3,reviewed_at=NOW() WHERE id=$1 AND status='pending' RETURNING id,status,title",
    [Number(id), decision, String(actorId)]
  );
  if (!result.rowCount) return null;
  await auditOwnerAction(db, actorId, 'approval.' + decision, String(id), { title: result.rows[0].title });
  return result.rows[0];
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
  const result = await db.query(
    'DELETE FROM frieren_chat_memories WHERE id=$1 RETURNING id,guild_id,user_id,memory_key',
    [Number(memoryId)]
  );
  if (!result.rowCount) return null;
  await auditOwnerAction(db, actorId, 'memory.delete', String(memoryId), {
    guildId: result.rows[0].guild_id,
    userId: result.rows[0].user_id,
    key: result.rows[0].memory_key
  });
  return result.rows[0];
}

export async function sendOwnerAnnouncement(client, db, { guildId, channelId, message, actorId }) {
  const text = String(message || '').trim();
  if (!guildId || !channelId || !text || text.length > 1800) throw new Error('INVALID_ANNOUNCEMENT');
  const guild = client.guilds.cache.get(String(guildId));
  if (!guild) throw new Error('GUILD_NOT_FOUND');
  const channel = await guild.channels.fetch(String(channelId));
  if (!channel?.isTextBased?.() || !channel?.send) throw new Error('CHANNEL_NOT_SENDABLE');
  const me = guild.members.me;
  if (!me || !channel.permissionsFor(me)?.has('SendMessages')) throw new Error('MISSING_SEND_PERMISSION');
  const sent = await channel.send({ content: text, allowedMentions: { parse: [] } });
  await auditOwnerAction(db, actorId, 'announcement.send', guildId + '/' + channelId, {
    messageLength: text.length,
    messageId: sent.id
  });
  return { guildName: guild.name, channelName: channel.name, messageId: sent.id };
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
