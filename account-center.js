import { randomUUID } from 'node:crypto';

const ACCOUNT_ID = /^site_([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;
const CATEGORIES = new Set(['technical','bug','account','gameplay','other']);

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
  `);
}

export async function createSupportTicket(db, accountId, input) {
  const id = accountUuid(accountId);
  const normalized = normalizeSupportTicketInput(input);
  const count = await db.query(
    'SELECT COUNT(*)::int AS count FROM frieren_support_tickets WHERE account_id=$1 AND created_at>=NOW()-INTERVAL \'24 hours\'',
    [id]
  );
  if (Number(count.rows[0]?.count || 0) >= 5) return { status: 'daily_limit' };
  const result = await db.query(
    `INSERT INTO frieren_support_tickets(ticket_id,account_id,category,subject,message)
     VALUES($1,$2,$3,$4,$5)
     RETURNING ticket_id,account_id,category,subject,status,created_at,updated_at`,
    [randomUUID(), id, normalized.category, normalized.subject, normalized.message]
  );
  return { status: 'created', ticket: result.rows[0] };
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
    const [inventory, collections, achievements, marketHistory] = await Promise.all([
      db.query('SELECT item_key,quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 ORDER BY item_key', [profile.guild_id, profile.user_id]),
      db.query('SELECT character_name,anime,rarity,quantity,first_obtained_at,last_obtained_at FROM anime_character_collection WHERE guild_id=$1 AND user_id=$2 ORDER BY character_name', [profile.guild_id, profile.user_id]),
      db.query('SELECT achievement_key,display_slot,claimed_at FROM achievement_claims WHERE guild_id=$1 AND user_id=$2 ORDER BY claimed_at', [profile.guild_id, profile.user_id]),
      db.query('SELECT listing_id,item_key,quantity,price_coins,status,created_at,resolved_at FROM player_market_listings WHERE guild_id=$1 AND (seller_id=$2 OR buyer_id=$2) ORDER BY created_at DESC LIMIT 100', [profile.guild_id, profile.user_id])
    ]);
    return { ...profile, inventory: inventory.rows, collections: collections.rows, achievements: achievements.rows, marketHistory: marketHistory.rows };
  }));
  const tickets = await listSupportTickets(db, accountId, 50);
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    account: accountResult.rows[0],
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
