import { randomUUID } from 'node:crypto';

const ACCOUNT_ID = /^site_([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;
const CATEGORIES = new Set(['technical','bug','account','gameplay','other']);
const SENSITIVE_TABLE = /(?:auth|session|credential|token|secret|owner|support|oauth|audit|log)/i;
const SENSITIVE_COLUMN = /password|secret|token|credential|session|api.?key|private.?key|hash/i;

async function withAccountTransaction(db, operation) {
  if (typeof db.connect !== 'function') return operation(db);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

function accountUuid(value) {
  const match = ACCOUNT_ID.exec(String(value || ''));
  if (!match) throw new Error('SITE_ACCOUNT_ID_INVALID');
  return match[1];
}

export function normalizeSupportTicketInput({ category, subject, message } = {}) {
  const selectedCategory = String(category || '').trim().toLowerCase();
  const cleanSubject = String(subject || '').trim();
  const cleanMessage = String(message || '').trim();
  if (!CATEGORIES.has(selectedCategory)) throw new Error('SUPPORT_TICKET_CATEGORY_INVALID');
  if (cleanSubject.length < 3 || cleanSubject.length > 160 || /[\u0000-\u001f\u007f]/.test(cleanSubject)) {
    throw new Error('SUPPORT_TICKET_SUBJECT_INVALID');
  }
  if (cleanMessage.length < 10 || cleanMessage.length > 5000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(cleanMessage)) {
    throw new Error('SUPPORT_TICKET_MESSAGE_INVALID');
  }
  return { category: selectedCategory, subject: cleanSubject, message: cleanMessage };
}

export async function ensureAccountCenterSchema(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS frieren_support_tickets (
      ticket_id UUID PRIMARY KEY,
      account_id UUID NOT NULL,
      category VARCHAR(24) NOT NULL CHECK (category IN ('technical','bug','account','gameplay','other')),
      subject VARCHAR(160) NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','closed')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS frieren_support_tickets_account_idx
      ON frieren_support_tickets(account_id,created_at DESC);
    CREATE TABLE IF NOT EXISTS frieren_support_ticket_messages (
      message_id UUID PRIMARY KEY,
      ticket_id UUID NOT NULL REFERENCES frieren_support_tickets(ticket_id) ON DELETE CASCADE,
      author_type TEXT NOT NULL CHECK(author_type IN ('account','support')),
      author_id TEXT NOT NULL,
      message TEXT NOT NULL CHECK(length(message) BETWEEN 1 AND 5000),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS frieren_support_ticket_messages_idx
      ON frieren_support_ticket_messages(ticket_id,created_at,message_id);
    CREATE TABLE IF NOT EXISTS frieren_support_ticket_events (
      event_id UUID PRIMARY KEY,
      ticket_id UUID NOT NULL REFERENCES frieren_support_tickets(ticket_id) ON DELETE CASCADE,
      actor_type TEXT NOT NULL CHECK(actor_type IN ('account','support')),
      actor_id TEXT NOT NULL,
      previous_status TEXT,
      new_status TEXT NOT NULL CHECK(new_status IN ('open','in_progress','closed')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS frieren_support_ticket_events_idx
      ON frieren_support_ticket_events(ticket_id,created_at,event_id);
  `);
}

export async function createSupportTicket(db, accountId, input) {
  const id = accountUuid(accountId);
  const normalized = normalizeSupportTicketInput(input);
  return withAccountTransaction(db, async client => {
    await client.query('SELECT id FROM frieren_site_accounts WHERE id=$1 FOR UPDATE', [id]);
    const count = await client.query(
      'SELECT COUNT(*)::int AS count FROM frieren_support_tickets WHERE account_id=$1 AND created_at>=NOW()-INTERVAL \'24 hours\'',
      [id]
    );
    if (Number(count.rows[0]?.count || 0) >= 5) return { status: 'daily_limit' };
    const ticketId = randomUUID();
    const result = await client.query(
      `INSERT INTO frieren_support_tickets(ticket_id,account_id,category,subject,message)
       VALUES($1,$2,$3,$4,$5)
       RETURNING ticket_id,account_id,category,subject,status,created_at,updated_at`,
      [ticketId, id, normalized.category, normalized.subject, normalized.message]
    );
    await client.query(
      "INSERT INTO frieren_support_ticket_events(event_id,ticket_id,actor_type,actor_id,previous_status,new_status) VALUES($1,$2,'account',$3,NULL,'open')",
      [randomUUID(),ticketId,id]
    );
    return { status: 'created', ticket: result.rows[0] };
  });
}

export async function listSupportTickets(db, accountId, limit = 20) {
  const id = accountUuid(accountId);
  const result = await db.query(
    `SELECT ticket_id,category,subject,status,created_at,updated_at
     FROM frieren_support_tickets WHERE account_id=$1
     ORDER BY created_at DESC,ticket_id LIMIT $2`,
    [id, Math.max(1, Math.min(50, Number(limit) || 20))]
  );
  return result.rows;
}

export async function listSupportTicketMessages(db, accountId, ticketId) {
  const id = accountUuid(accountId);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(ticketId || ''))) {
    throw new Error('SUPPORT_TICKET_ID_INVALID');
  }
  const ticket = await db.query('SELECT ticket_id,message,status FROM frieren_support_tickets WHERE ticket_id=$1 AND account_id=$2', [ticketId,id]);
  if (!ticket.rowCount) return { status:'not_found', messages:[] };
  const messages = await db.query(
    'SELECT message_id,author_type,author_id,message,created_at FROM frieren_support_ticket_messages WHERE ticket_id=$1 ORDER BY created_at,message_id',
    [ticketId]
  );
  const events = await db.query(
    'SELECT actor_type,previous_status,new_status,created_at FROM frieren_support_ticket_events WHERE ticket_id=$1 ORDER BY created_at,event_id',
    [ticketId]
  );
  return { status:'ok', ticket:ticket.rows[0], messages:messages.rows, events:events.rows };
}

export async function replySupportTicket(db, accountId, ticketId, message) {
  const id = accountUuid(accountId);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(ticketId || ''))) throw new Error('SUPPORT_TICKET_ID_INVALID');
  const clean = String(message || '').trim();
  if (!clean || clean.length > 5000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(clean)) {
    throw new Error('SUPPORT_TICKET_REPLY_INVALID');
  }
  return withAccountTransaction(db, async client => {
    const ticket = await client.query(
      "SELECT ticket_id,status FROM frieren_support_tickets WHERE ticket_id=$1 AND account_id=$2 FOR UPDATE",
      [ticketId,id]
    );
    if (!ticket.rowCount) return { status:'not_found' };
    if (ticket.rows[0].status === 'closed') return { status:'closed' };
    const inserted = await client.query(
      "INSERT INTO frieren_support_ticket_messages(message_id,ticket_id,author_type,author_id,message) VALUES($1,$2,'account',$3,$4) RETURNING message_id,author_type,message,created_at",
      [randomUUID(),ticketId,id,clean]
    );
    await client.query('UPDATE frieren_support_tickets SET updated_at=NOW() WHERE ticket_id=$1 AND account_id=$2',[ticketId,id]);
    await client.query(
      "INSERT INTO frieren_support_ticket_events(event_id,ticket_id,actor_type,actor_id,previous_status,new_status) VALUES($1,$2,'account',$3,$4,$4)",
      [randomUUID(),ticketId,id,ticket.rows[0].status]
    );
    return { status:'replied', message:inserted.rows[0] };
  });
}

export async function updateSupportTicketStatus(db, accountId, ticketId, nextStatus, actorType='support') {
  const id = accountUuid(accountId);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(ticketId || ''))) throw new Error('SUPPORT_TICKET_ID_INVALID');
  if (actorType !== 'support' || !['open','in_progress','closed'].includes(nextStatus)) throw new Error('SUPPORT_TICKET_STATUS_INVALID');
  return withAccountTransaction(db, async client => {
    const current = await client.query('SELECT ticket_id,status FROM frieren_support_tickets WHERE ticket_id=$1 AND account_id=$2 FOR UPDATE',[ticketId,id]);
    if (!current.rowCount) return { status:'not_found' };
    const updated = await client.query(
      'UPDATE frieren_support_tickets SET status=$3,updated_at=NOW() WHERE ticket_id=$1 AND account_id=$2 RETURNING ticket_id,status',
      [ticketId,id,nextStatus]
    );
    await client.query(
      "INSERT INTO frieren_support_ticket_events(event_id,ticket_id,actor_type,actor_id,previous_status,new_status) VALUES($1,$2,'support','support',$3,$4)",
      [randomUUID(),ticketId,current.rows[0].status,nextStatus]
    );
    return { status:'updated', ticket:updated.rows[0] };
  });
}

export async function listSupportTicketsForOwner(db, limit=50) {
  return (await db.query(
    'SELECT ticket_id,account_id,category,subject,message,status,created_at,updated_at FROM frieren_support_tickets ORDER BY CASE status WHEN \'open\' THEN 0 WHEN \'in_progress\' THEN 1 ELSE 2 END,updated_at DESC,ticket_id LIMIT $1',
    [Math.max(1,Math.min(100,Number(limit)||50))]
  )).rows;
}

export async function getSupportTicketForOwner(db, ticketId) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(ticketId||''))) throw new Error('SUPPORT_TICKET_ID_INVALID');
  const ticket=await db.query('SELECT ticket_id,account_id,category,subject,message,status,created_at,updated_at FROM frieren_support_tickets WHERE ticket_id=$1',[ticketId]);
  if(!ticket.rowCount)return null;
  const [messages,events]=await Promise.all([
    db.query('SELECT author_type,author_id,message,created_at FROM frieren_support_ticket_messages WHERE ticket_id=$1 ORDER BY created_at,message_id',[ticketId]),
    db.query('SELECT actor_type,previous_status,new_status,created_at FROM frieren_support_ticket_events WHERE ticket_id=$1 ORDER BY created_at,event_id',[ticketId])
  ]);
  return {...ticket.rows[0],replies:messages.rows,statusHistory:events.rows};
}

export async function replySupportTicketFromOwner(db,ticketId,ownerId,message) {
  if(String(ownerId)!=='1553794496234262641')throw new Error('SUPPORT_TICKET_OWNER_REQUIRED');
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(ticketId||'')))throw new Error('SUPPORT_TICKET_ID_INVALID');
  const clean=String(message||'').trim();
  if(!clean||clean.length>5000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(clean))throw new Error('SUPPORT_TICKET_REPLY_INVALID');
  return withAccountTransaction(db, async client => {
    const ticket=await client.query('SELECT ticket_id,status FROM frieren_support_tickets WHERE ticket_id=$1 FOR UPDATE',[ticketId]);
    if(!ticket.rowCount)return{status:'not_found'};
    if(ticket.rows[0].status==='closed')return{status:'closed'};
    const inserted=await client.query(
      "INSERT INTO frieren_support_ticket_messages(message_id,ticket_id,author_type,author_id,message) VALUES($1,$2,'support',$3,$4) RETURNING message_id,author_type,message,created_at",
      [randomUUID(),ticketId,String(ownerId),clean]
    );
    await client.query('UPDATE frieren_support_tickets SET updated_at=NOW() WHERE ticket_id=$1',[ticketId]);
    await client.query(
      "INSERT INTO frieren_support_ticket_events(event_id,ticket_id,actor_type,actor_id,previous_status,new_status) VALUES($1,$2,'support',$3,$4,$4)",
      [randomUUID(),ticketId,String(ownerId),ticket.rows[0].status]
    );
    return{status:'replied',message:inserted.rows[0]};
  });
}

export async function updateSupportTicketStatusFromOwner(db,ticketId,ownerId,nextStatus) {
  if(String(ownerId)!=='1553794496234262641')throw new Error('SUPPORT_TICKET_OWNER_REQUIRED');
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(ticketId||'')))throw new Error('SUPPORT_TICKET_ID_INVALID');
  if(!['open','in_progress','closed'].includes(nextStatus))throw new Error('SUPPORT_TICKET_STATUS_INVALID');
  return withAccountTransaction(db, async client => {
    const current=await client.query('SELECT ticket_id,status FROM frieren_support_tickets WHERE ticket_id=$1 FOR UPDATE',[ticketId]);
    if(!current.rowCount)return{status:'not_found'};
    const updated=await client.query('UPDATE frieren_support_tickets SET status=$2,updated_at=NOW() WHERE ticket_id=$1 RETURNING ticket_id,status',[ticketId,nextStatus]);
    await client.query(
      "INSERT INTO frieren_support_ticket_events(event_id,ticket_id,actor_type,actor_id,previous_status,new_status) VALUES($1,$2,'support',$3,$4,$5)",
      [randomUUID(),ticketId,String(ownerId),current.rows[0].status,nextStatus]
    );
    return{status:'updated',ticket:updated.rows[0]};
  });
}

export async function exportSiteAccountData(db, accountId) {
  const id = accountUuid(accountId);
  const accountResult = await db.query(
    'SELECT id,username,email,email_verified_at,created_at FROM frieren_site_accounts WHERE id=$1',
    [id]
  );
  if (!accountResult.rowCount) return null;
  const links = await db.query(
    `SELECT l.guild_id,l.user_id,u.character_name,u.class_name,u.level,u.xp,u.coins,u.hp,u.max_hp,u.mana,u.max_mana,l.linked_at
     FROM site_discord_links l JOIN users u ON u.guild_id=l.guild_id AND u.user_id=l.user_id
     WHERE l.account_id=$1 ORDER BY l.guild_id`,
    [id]
  );
  const linkedProfiles = await Promise.all(links.rows.map(async profile => {
    const [inventory, collections, achievements, marketHistory, marketOffers, tableColumns] = await Promise.all([
      db.query('SELECT item_key,quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 ORDER BY item_key', [profile.guild_id, profile.user_id]),
      db.query('SELECT character_name,anime,rarity,quantity,first_obtained_at,last_obtained_at FROM anime_character_collection WHERE guild_id=$1 AND user_id=$2 ORDER BY character_name', [profile.guild_id, profile.user_id]),
      db.query('SELECT achievement_key,display_slot,claimed_at FROM achievement_claims WHERE guild_id=$1 AND user_id=$2 ORDER BY claimed_at', [profile.guild_id, profile.user_id]),
      db.query('SELECT listing_id,item_key,quantity,price_coins,status,created_at,resolved_at FROM player_market_listings WHERE guild_id=$1 AND (seller_id=$2 OR buyer_id=$2) ORDER BY created_at DESC', [profile.guild_id, profile.user_id]),
      db.query('SELECT o.offer_id,o.listing_id,o.buyer_id,o.offer_coins,o.status,o.created_at,o.resolved_at,l.seller_id,l.item_key FROM player_market_offers o JOIN player_market_listings l ON l.listing_id=o.listing_id AND l.guild_id=o.guild_id WHERE o.guild_id=$1 AND (o.buyer_id=$2 OR l.seller_id=$2) ORDER BY o.created_at DESC', [profile.guild_id, profile.user_id]),
      db.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema=current_schema() AND column_name IN ('guild_id','user_id') ORDER BY table_name,ordinal_position")
    ]);
    const columnsByTable = new Map();
    for (const column of tableColumns.rows || []) {
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(String(column.table_name||'')) || SENSITIVE_TABLE.test(column.table_name)) continue;
      if (!columnsByTable.has(column.table_name)) columnsByTable.set(column.table_name, []);
      columnsByTable.get(column.table_name).push(column.column_name);
    }
    const gameData = {};
    for (const [table, columns] of columnsByTable) {
      if (!columns.includes('user_id')) continue;
      const metadata = await db.query(
        'SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=$1 ORDER BY ordinal_position',
        [table]
      );
      const selected = (metadata.rows || []).map(row => row.column_name)
        .filter(name => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name) && !SENSITIVE_COLUMN.test(name));
      if (!selected.includes('user_id')) continue;
      const projection = selected.map(name => '"' + name + '"').join(',');
      const rows = columns.includes('guild_id')
        ? await db.query('SELECT ' + projection + ' FROM "' + table + '" WHERE guild_id=$1 AND user_id=$2', [profile.guild_id, profile.user_id])
        : await db.query('SELECT ' + projection + ' FROM "' + table + '" WHERE user_id=$1', [profile.user_id]);
      gameData[table] = rows.rows;
    }
    return { ...profile, inventory: inventory.rows, collections: collections.rows, achievements: achievements.rows, marketHistory: marketHistory.rows, marketOffers: marketOffers.rows, gameData };
  }));
  const accountTableColumns = await db.query("SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema=current_schema() AND column_name='account_id' ORDER BY table_name,ordinal_position");
  const accountColumnsByTable = new Map();
  const accountIdTypes = new Map();
  for (const column of accountTableColumns.rows || []) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(String(column.table_name||'')) || SENSITIVE_TABLE.test(column.table_name)) continue;
    if (!accountColumnsByTable.has(column.table_name)) accountColumnsByTable.set(column.table_name, []);
    accountColumnsByTable.get(column.table_name).push(column.column_name);
    if (column.column_name === 'account_id') accountIdTypes.set(column.table_name, column.data_type);
  }
  const accountData = {};
  for (const [table, columns] of accountColumnsByTable) {
    if (!columns.includes('account_id') || columns.includes('user_id')) continue;
    const metadata = await db.query('SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=$1 ORDER BY ordinal_position',[table]);
    const selected = (metadata.rows || []).map(row => row.column_name).filter(name => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name) && !SENSITIVE_COLUMN.test(name));
    if (!selected.includes('account_id')) continue;
    const projection = selected.map(name => '"' + name + '"').join(',');
    const accountType = accountIdTypes.get(table);
    const rows = accountType === 'uuid'
      ? await db.query('SELECT ' + projection + ' FROM "' + table + '" WHERE account_id=$1',[id])
      : await db.query('SELECT ' + projection + ' FROM "' + table + '" WHERE account_id IN ($1,$2)',[accountId,id]);
    accountData[table] = rows.rows;
  }
  const ticketsResult = await db.query(
    'SELECT ticket_id,category,subject,message,status,created_at,updated_at FROM frieren_support_tickets WHERE account_id=$1 ORDER BY created_at,ticket_id',
    [id]
  );
  const tickets = await Promise.all(ticketsResult.rows.map(async ticket => {
    const [messages, events] = await Promise.all([
      db.query('SELECT author_type,author_id,message,created_at FROM frieren_support_ticket_messages WHERE ticket_id=$1 ORDER BY created_at,message_id',[ticket.ticket_id]),
      db.query('SELECT actor_type,previous_status,new_status,created_at FROM frieren_support_ticket_events WHERE ticket_id=$1 ORDER BY created_at,event_id',[ticket.ticket_id])
    ]);
    return { ...ticket, replies:messages.rows, statusHistory:events.rows };
  }));
  return {
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    account: accountResult.rows[0],
    accountData,
    linkedProfiles,
    supportTickets: tickets,
    deletionScope: 'Deleting the site account removes this portal identity and its Discord links. Discord-owned RPG profiles and guild game records remain intact.'
  };
}

export async function deleteSiteAccount(db, accountId, confirmation) {
  if (confirmation !== 'HESABIMI SIL') return { status: 'confirmation_required' };
  const id = accountUuid(accountId);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const account = await client.query('SELECT id FROM frieren_site_accounts WHERE id=$1 FOR UPDATE', [id]);
    if (!account.rowCount) {
      await client.query('ROLLBACK');
      return { status: 'not_found' };
    }
    const accountTables = await client.query("SELECT table_name,data_type FROM information_schema.columns WHERE table_schema=current_schema() AND column_name='account_id'");
    for (const table of accountTables.rows || []) {
      const name = String(table.table_name || '');
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name) || SENSITIVE_TABLE.test(name)) continue;
      if (table.data_type === 'uuid') {
        await client.query('DELETE FROM "' + name + '" WHERE account_id=$1',[id]);
      } else {
        await client.query('DELETE FROM "' + name + '" WHERE account_id IN ($1,$2)',[accountId,id]);
      }
    }
    await client.query('DELETE FROM frieren_support_tickets WHERE account_id=$1', [id]);
    await client.query('DELETE FROM site_discord_links WHERE account_id=$1', [id]);
    await client.query('DELETE FROM frieren_site_accounts WHERE id=$1', [id]);
    await client.query('COMMIT');
    return { status: 'deleted', discordGameDataPreserved: true };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
