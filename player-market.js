import { randomUUID } from 'node:crypto';

const DISCORD_ID = /^\d{17,20}$/;
const MAX_ACTIVE_LISTINGS = 10;
const MAX_QUANTITY = 1000;
const MAX_PRICE = 1_000_000;

function validateIdentity(guildId, userId) {
  if (!DISCORD_ID.test(String(guildId || '')) || !DISCORD_ID.test(String(userId || ''))) {
    throw new Error('PLAYER_MARKET_ID_INVALID');
  }
}

function validateListing({ itemKey, quantity, priceCoins }) {
  const key = String(itemKey || '').trim();
  const qty = Number(quantity);
  const price = Number(priceCoins);
  if (!key || key.length > 120 || /[\u0000-\u001f\u007f]/.test(key)) throw new Error('PLAYER_MARKET_ITEM_INVALID');
  if (!Number.isSafeInteger(qty) || qty < 1 || qty > MAX_QUANTITY) throw new Error('PLAYER_MARKET_QUANTITY_INVALID');
  if (!Number.isSafeInteger(price) || price < 1 || price > MAX_PRICE) throw new Error('PLAYER_MARKET_PRICE_INVALID');
  return { itemKey: key, quantity: qty, priceCoins: price };
}

async function withTransaction(db, callback) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function ensurePlayerMarketTables(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS player_market_listings (
      listing_id UUID PRIMARY KEY,
      guild_id TEXT NOT NULL,
      seller_id TEXT NOT NULL,
      buyer_id TEXT,
      item_key VARCHAR(120) NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 1000),
      price_coins INTEGER NOT NULL CHECK (price_coins BETWEEN 1 AND 1000000),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','sold','cancelled')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at TIMESTAMPTZ,
      FOREIGN KEY (guild_id,seller_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS player_market_active_idx
      ON player_market_listings(guild_id,price_coins,created_at,listing_id) WHERE status='active';
    CREATE INDEX IF NOT EXISTS player_market_history_idx
      ON player_market_listings(guild_id,seller_id,created_at DESC);
    CREATE INDEX IF NOT EXISTS player_market_buyer_history_idx
      ON player_market_listings(guild_id,buyer_id,created_at DESC) WHERE buyer_id IS NOT NULL;
  `);
}

export async function createPlayerMarketListing(db, input) {
  const guildId = String(input?.guildId || '');
  const sellerId = String(input?.sellerId || '');
  validateIdentity(guildId, sellerId);
  const { itemKey, quantity, priceCoins } = validateListing(input || {});
  return withTransaction(db, async client => {
    const seller = await client.query(
      'SELECT user_id FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE',
      [guildId, sellerId]
    );
    if (!seller.rowCount) return { status: 'seller_missing' };
    const active = await client.query(
      "SELECT COUNT(*)::int AS count FROM player_market_listings WHERE guild_id=$1 AND seller_id=$2 AND status='active'",
      [guildId, sellerId]
    );
    if (Number(active.rows[0]?.count || 0) >= MAX_ACTIVE_LISTINGS) return { status: 'listing_limit' };
    const equipped = await client.query(
      'SELECT 1 FROM user_equipment WHERE guild_id=$1 AND user_id=$2 AND item_key=$3 LIMIT 1',
      [guildId, sellerId, itemKey]
    );
    if (equipped.rowCount) return { status: 'equipped_item' };
    const inventory = await client.query(
      'SELECT quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key=$3 FOR UPDATE',
      [guildId, sellerId, itemKey]
    );
    if (!inventory.rowCount || Number(inventory.rows[0].quantity) < quantity) return { status: 'insufficient_items' };
    const remaining = Number(inventory.rows[0].quantity) - quantity;
    if (remaining === 0) {
      await client.query('DELETE FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key=$3', [guildId, sellerId, itemKey]);
    } else {
      await client.query('UPDATE inventory SET quantity=$4 WHERE guild_id=$1 AND user_id=$2 AND item_key=$3', [guildId, sellerId, itemKey, remaining]);
    }
    const listingId = randomUUID();
    const inserted = await client.query(
      `INSERT INTO player_market_listings(listing_id,guild_id,seller_id,item_key,quantity,price_coins)
       VALUES($1,$2,$3,$4,$5,$6)
       RETURNING listing_id,guild_id,seller_id,item_key,quantity,price_coins,status,created_at`,
      [listingId, guildId, sellerId, itemKey, quantity, priceCoins]
    );
    return { status: 'listed', listing: inserted.rows[0] };
  });
}

export async function listPlayerMarketListings(db, guildId, limit = 15, filters = {}) {
  if (!DISCORD_ID.test(String(guildId || ''))) throw new Error('PLAYER_MARKET_GUILD_INVALID');
  const count = Math.max(1, Math.min(30, Number(limit) || 15));
  const params = [guildId], clauses = ["guild_id=$1", "status='active'"];
  const query = String(filters.query || '').trim().slice(0, 60);
  if (query) { params.push(query); clauses.push('POSITION(LOWER(

export async function buyPlayerMarketListing(db, { guildId, buyerId, listingId }) {
  validateIdentity(guildId, buyerId);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(listingId || ''))) {
    throw new Error('PLAYER_MARKET_LISTING_ID_INVALID');
  }
  return withTransaction(db, async client => {
    const selected = await client.query(
      "SELECT listing_id,seller_id,item_key,quantity,price_coins FROM player_market_listings WHERE listing_id=$1 AND guild_id=$2 AND status='active' FOR UPDATE",
      [listingId, guildId]
    );
    if (!selected.rowCount) return { status: 'unavailable' };
    const listing = selected.rows[0];
    if (listing.seller_id === buyerId) return { status: 'self_purchase' };
    const userIds = [String(listing.seller_id), buyerId].sort();
    const locked = await client.query(
      'SELECT user_id FROM users WHERE guild_id=$1 AND user_id=ANY($2::text[]) ORDER BY user_id FOR UPDATE',
      [guildId, userIds]
    );
    if (locked.rowCount !== 2) return { status: 'unavailable' };
    const debit = await client.query(
      'UPDATE users SET coins=coins-$3 WHERE guild_id=$1 AND user_id=$2 AND coins >= $3 RETURNING coins',
      [guildId, buyerId, listing.price_coins]
    );
    if (!debit.rowCount) return { status: 'insufficient_funds' };
    await client.query(
      'UPDATE users SET coins=coins+$3 WHERE guild_id=$1 AND user_id=$2',
      [guildId, listing.seller_id, listing.price_coins]
    );
    await client.query(
      `INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,$3,$4)
       ON CONFLICT(guild_id,user_id,item_key) DO UPDATE SET quantity=inventory.quantity+EXCLUDED.quantity`,
      [guildId, buyerId, listing.item_key, listing.quantity]
    );
    await client.query(
      "UPDATE player_market_listings SET status='sold',buyer_id=$2,resolved_at=NOW() WHERE listing_id=$1",
      [listingId, buyerId]
    );
    return {
      status: 'purchased',
      itemKey: listing.item_key,
      quantity: Number(listing.quantity),
      priceCoins: Number(listing.price_coins),
      buyerBalance: Number(debit.rows[0].coins)
    };
  });
}

export async function cancelPlayerMarketListing(db, { guildId, sellerId, listingId }) {
  validateIdentity(guildId, sellerId);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(listingId || ''))) {
    throw new Error('PLAYER_MARKET_LISTING_ID_INVALID');
  }
  return withTransaction(db, async client => {
    const selected = await client.query(
      "SELECT listing_id,seller_id,item_key,quantity FROM player_market_listings WHERE listing_id=$1 AND guild_id=$2 AND status='active' FOR UPDATE",
      [listingId, guildId]
    );
    if (!selected.rowCount) return { status: 'unavailable' };
    const listing = selected.rows[0];
    if (listing.seller_id !== sellerId) return { status: 'not_owner' };
    const seller = await client.query(
      'SELECT user_id FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE',
      [guildId, sellerId]
    );
    if (!seller.rowCount) return { status: 'unavailable' };
    await client.query(
      `INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,$3,$4)
       ON CONFLICT(guild_id,user_id,item_key) DO UPDATE SET quantity=inventory.quantity+EXCLUDED.quantity`,
      [guildId, sellerId, listing.item_key, listing.quantity]
    );
    await client.query(
      "UPDATE player_market_listings SET status='cancelled',resolved_at=NOW() WHERE listing_id=$1",
      [listingId]
    );
    return { status: 'cancelled', itemKey: listing.item_key, quantity: Number(listing.quantity) };
  });
}

export async function getPlayerMarketHistory(db, guildId, userId, limit = 10) {
  validateIdentity(guildId, userId);
  const count = Math.max(1, Math.min(30, Number(limit) || 10));
  const result = await db.query(
    `SELECT listing_id,seller_id,buyer_id,item_key,quantity,price_coins,status,created_at,resolved_at
     FROM player_market_listings
     WHERE guild_id=$1 AND (seller_id=$2 OR buyer_id=$2)
     ORDER BY COALESCE(resolved_at,created_at) DESC,listing_id DESC
     LIMIT $3`,
    [guildId, userId, count]
  );
  return result.rows;
}
 + params.length + ') IN LOWER(item_key)) > 0'); }
  const parsePrice = value => {
    if (value === '' || value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= MAX_PRICE ? parsed : null;
  };
  const minPrice = parsePrice(filters.minPrice), maxPrice = parsePrice(filters.maxPrice);
  if (minPrice !== null) { params.push(minPrice); clauses.push('price_coins >= 

export async function buyPlayerMarketListing(db, { guildId, buyerId, listingId }) {
  validateIdentity(guildId, buyerId);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(listingId || ''))) {
    throw new Error('PLAYER_MARKET_LISTING_ID_INVALID');
  }
  return withTransaction(db, async client => {
    const selected = await client.query(
      "SELECT listing_id,seller_id,item_key,quantity,price_coins FROM player_market_listings WHERE listing_id=$1 AND guild_id=$2 AND status='active' FOR UPDATE",
      [listingId, guildId]
    );
    if (!selected.rowCount) return { status: 'unavailable' };
    const listing = selected.rows[0];
    if (listing.seller_id === buyerId) return { status: 'self_purchase' };
    const userIds = [String(listing.seller_id), buyerId].sort();
    const locked = await client.query(
      'SELECT user_id FROM users WHERE guild_id=$1 AND user_id=ANY($2::text[]) ORDER BY user_id FOR UPDATE',
      [guildId, userIds]
    );
    if (locked.rowCount !== 2) return { status: 'unavailable' };
    const debit = await client.query(
      'UPDATE users SET coins=coins-$3 WHERE guild_id=$1 AND user_id=$2 AND coins >= $3 RETURNING coins',
      [guildId, buyerId, listing.price_coins]
    );
    if (!debit.rowCount) return { status: 'insufficient_funds' };
    await client.query(
      'UPDATE users SET coins=coins+$3 WHERE guild_id=$1 AND user_id=$2',
      [guildId, listing.seller_id, listing.price_coins]
    );
    await client.query(
      `INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,$3,$4)
       ON CONFLICT(guild_id,user_id,item_key) DO UPDATE SET quantity=inventory.quantity+EXCLUDED.quantity`,
      [guildId, buyerId, listing.item_key, listing.quantity]
    );
    await client.query(
      "UPDATE player_market_listings SET status='sold',buyer_id=$2,resolved_at=NOW() WHERE listing_id=$1",
      [listingId, buyerId]
    );
    return {
      status: 'purchased',
      itemKey: listing.item_key,
      quantity: Number(listing.quantity),
      priceCoins: Number(listing.price_coins),
      buyerBalance: Number(debit.rows[0].coins)
    };
  });
}

export async function cancelPlayerMarketListing(db, { guildId, sellerId, listingId }) {
  validateIdentity(guildId, sellerId);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(listingId || ''))) {
    throw new Error('PLAYER_MARKET_LISTING_ID_INVALID');
  }
  return withTransaction(db, async client => {
    const selected = await client.query(
      "SELECT listing_id,seller_id,item_key,quantity FROM player_market_listings WHERE listing_id=$1 AND guild_id=$2 AND status='active' FOR UPDATE",
      [listingId, guildId]
    );
    if (!selected.rowCount) return { status: 'unavailable' };
    const listing = selected.rows[0];
    if (listing.seller_id !== sellerId) return { status: 'not_owner' };
    const seller = await client.query(
      'SELECT user_id FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE',
      [guildId, sellerId]
    );
    if (!seller.rowCount) return { status: 'unavailable' };
    await client.query(
      `INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,$3,$4)
       ON CONFLICT(guild_id,user_id,item_key) DO UPDATE SET quantity=inventory.quantity+EXCLUDED.quantity`,
      [guildId, sellerId, listing.item_key, listing.quantity]
    );
    await client.query(
      "UPDATE player_market_listings SET status='cancelled',resolved_at=NOW() WHERE listing_id=$1",
      [listingId]
    );
    return { status: 'cancelled', itemKey: listing.item_key, quantity: Number(listing.quantity) };
  });
}

export async function getPlayerMarketHistory(db, guildId, userId, limit = 10) {
  validateIdentity(guildId, userId);
  const count = Math.max(1, Math.min(30, Number(limit) || 10));
  const result = await db.query(
    `SELECT listing_id,seller_id,buyer_id,item_key,quantity,price_coins,status,created_at,resolved_at
     FROM player_market_listings
     WHERE guild_id=$1 AND (seller_id=$2 OR buyer_id=$2)
     ORDER BY COALESCE(resolved_at,created_at) DESC,listing_id DESC
     LIMIT $3`,
    [guildId, userId, count]
  );
  return result.rows;
}
 + params.length); }
  if (maxPrice !== null) { params.push(maxPrice); clauses.push('price_coins <= 

export async function buyPlayerMarketListing(db, { guildId, buyerId, listingId }) {
  validateIdentity(guildId, buyerId);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(listingId || ''))) {
    throw new Error('PLAYER_MARKET_LISTING_ID_INVALID');
  }
  return withTransaction(db, async client => {
    const selected = await client.query(
      "SELECT listing_id,seller_id,item_key,quantity,price_coins FROM player_market_listings WHERE listing_id=$1 AND guild_id=$2 AND status='active' FOR UPDATE",
      [listingId, guildId]
    );
    if (!selected.rowCount) return { status: 'unavailable' };
    const listing = selected.rows[0];
    if (listing.seller_id === buyerId) return { status: 'self_purchase' };
    const userIds = [String(listing.seller_id), buyerId].sort();
    const locked = await client.query(
      'SELECT user_id FROM users WHERE guild_id=$1 AND user_id=ANY($2::text[]) ORDER BY user_id FOR UPDATE',
      [guildId, userIds]
    );
    if (locked.rowCount !== 2) return { status: 'unavailable' };
    const debit = await client.query(
      'UPDATE users SET coins=coins-$3 WHERE guild_id=$1 AND user_id=$2 AND coins >= $3 RETURNING coins',
      [guildId, buyerId, listing.price_coins]
    );
    if (!debit.rowCount) return { status: 'insufficient_funds' };
    await client.query(
      'UPDATE users SET coins=coins+$3 WHERE guild_id=$1 AND user_id=$2',
      [guildId, listing.seller_id, listing.price_coins]
    );
    await client.query(
      `INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,$3,$4)
       ON CONFLICT(guild_id,user_id,item_key) DO UPDATE SET quantity=inventory.quantity+EXCLUDED.quantity`,
      [guildId, buyerId, listing.item_key, listing.quantity]
    );
    await client.query(
      "UPDATE player_market_listings SET status='sold',buyer_id=$2,resolved_at=NOW() WHERE listing_id=$1",
      [listingId, buyerId]
    );
    return {
      status: 'purchased',
      itemKey: listing.item_key,
      quantity: Number(listing.quantity),
      priceCoins: Number(listing.price_coins),
      buyerBalance: Number(debit.rows[0].coins)
    };
  });
}

export async function cancelPlayerMarketListing(db, { guildId, sellerId, listingId }) {
  validateIdentity(guildId, sellerId);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(listingId || ''))) {
    throw new Error('PLAYER_MARKET_LISTING_ID_INVALID');
  }
  return withTransaction(db, async client => {
    const selected = await client.query(
      "SELECT listing_id,seller_id,item_key,quantity FROM player_market_listings WHERE listing_id=$1 AND guild_id=$2 AND status='active' FOR UPDATE",
      [listingId, guildId]
    );
    if (!selected.rowCount) return { status: 'unavailable' };
    const listing = selected.rows[0];
    if (listing.seller_id !== sellerId) return { status: 'not_owner' };
    const seller = await client.query(
      'SELECT user_id FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE',
      [guildId, sellerId]
    );
    if (!seller.rowCount) return { status: 'unavailable' };
    await client.query(
      `INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,$3,$4)
       ON CONFLICT(guild_id,user_id,item_key) DO UPDATE SET quantity=inventory.quantity+EXCLUDED.quantity`,
      [guildId, sellerId, listing.item_key, listing.quantity]
    );
    await client.query(
      "UPDATE player_market_listings SET status='cancelled',resolved_at=NOW() WHERE listing_id=$1",
      [listingId]
    );
    return { status: 'cancelled', itemKey: listing.item_key, quantity: Number(listing.quantity) };
  });
}

export async function getPlayerMarketHistory(db, guildId, userId, limit = 10) {
  validateIdentity(guildId, userId);
  const count = Math.max(1, Math.min(30, Number(limit) || 10));
  const result = await db.query(
    `SELECT listing_id,seller_id,buyer_id,item_key,quantity,price_coins,status,created_at,resolved_at
     FROM player_market_listings
     WHERE guild_id=$1 AND (seller_id=$2 OR buyer_id=$2)
     ORDER BY COALESCE(resolved_at,created_at) DESC,listing_id DESC
     LIMIT $3`,
    [guildId, userId, count]
  );
  return result.rows;
}
 + params.length); }
  const sort = ['price_desc','newest'].includes(filters.sort) ? filters.sort : 'price_asc';
  const order = sort === 'price_desc' ? 'price_coins DESC,created_at DESC,listing_id DESC'
    : sort === 'newest' ? 'created_at DESC,listing_id DESC' : 'price_coins ASC,created_at ASC,listing_id ASC';
  params.push(count);
  const result = await db.query('SELECT listing_id,seller_id,item_key,quantity,price_coins,created_at FROM player_market_listings WHERE ' +
    clauses.join(' AND ') + ' ORDER BY ' + order + ' LIMIT 

export async function buyPlayerMarketListing(db, { guildId, buyerId, listingId }) {
  validateIdentity(guildId, buyerId);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(listingId || ''))) {
    throw new Error('PLAYER_MARKET_LISTING_ID_INVALID');
  }
  return withTransaction(db, async client => {
    const selected = await client.query(
      "SELECT listing_id,seller_id,item_key,quantity,price_coins FROM player_market_listings WHERE listing_id=$1 AND guild_id=$2 AND status='active' FOR UPDATE",
      [listingId, guildId]
    );
    if (!selected.rowCount) return { status: 'unavailable' };
    const listing = selected.rows[0];
    if (listing.seller_id === buyerId) return { status: 'self_purchase' };
    const userIds = [String(listing.seller_id), buyerId].sort();
    const locked = await client.query(
      'SELECT user_id FROM users WHERE guild_id=$1 AND user_id=ANY($2::text[]) ORDER BY user_id FOR UPDATE',
      [guildId, userIds]
    );
    if (locked.rowCount !== 2) return { status: 'unavailable' };
    const debit = await client.query(
      'UPDATE users SET coins=coins-$3 WHERE guild_id=$1 AND user_id=$2 AND coins >= $3 RETURNING coins',
      [guildId, buyerId, listing.price_coins]
    );
    if (!debit.rowCount) return { status: 'insufficient_funds' };
    await client.query(
      'UPDATE users SET coins=coins+$3 WHERE guild_id=$1 AND user_id=$2',
      [guildId, listing.seller_id, listing.price_coins]
    );
    await client.query(
      `INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,$3,$4)
       ON CONFLICT(guild_id,user_id,item_key) DO UPDATE SET quantity=inventory.quantity+EXCLUDED.quantity`,
      [guildId, buyerId, listing.item_key, listing.quantity]
    );
    await client.query(
      "UPDATE player_market_listings SET status='sold',buyer_id=$2,resolved_at=NOW() WHERE listing_id=$1",
      [listingId, buyerId]
    );
    return {
      status: 'purchased',
      itemKey: listing.item_key,
      quantity: Number(listing.quantity),
      priceCoins: Number(listing.price_coins),
      buyerBalance: Number(debit.rows[0].coins)
    };
  });
}

export async function cancelPlayerMarketListing(db, { guildId, sellerId, listingId }) {
  validateIdentity(guildId, sellerId);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(listingId || ''))) {
    throw new Error('PLAYER_MARKET_LISTING_ID_INVALID');
  }
  return withTransaction(db, async client => {
    const selected = await client.query(
      "SELECT listing_id,seller_id,item_key,quantity FROM player_market_listings WHERE listing_id=$1 AND guild_id=$2 AND status='active' FOR UPDATE",
      [listingId, guildId]
    );
    if (!selected.rowCount) return { status: 'unavailable' };
    const listing = selected.rows[0];
    if (listing.seller_id !== sellerId) return { status: 'not_owner' };
    const seller = await client.query(
      'SELECT user_id FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE',
      [guildId, sellerId]
    );
    if (!seller.rowCount) return { status: 'unavailable' };
    await client.query(
      `INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,$3,$4)
       ON CONFLICT(guild_id,user_id,item_key) DO UPDATE SET quantity=inventory.quantity+EXCLUDED.quantity`,
      [guildId, sellerId, listing.item_key, listing.quantity]
    );
    await client.query(
      "UPDATE player_market_listings SET status='cancelled',resolved_at=NOW() WHERE listing_id=$1",
      [listingId]
    );
    return { status: 'cancelled', itemKey: listing.item_key, quantity: Number(listing.quantity) };
  });
}

export async function getPlayerMarketHistory(db, guildId, userId, limit = 10) {
  validateIdentity(guildId, userId);
  const count = Math.max(1, Math.min(30, Number(limit) || 10));
  const result = await db.query(
    `SELECT listing_id,seller_id,buyer_id,item_key,quantity,price_coins,status,created_at,resolved_at
     FROM player_market_listings
     WHERE guild_id=$1 AND (seller_id=$2 OR buyer_id=$2)
     ORDER BY COALESCE(resolved_at,created_at) DESC,listing_id DESC
     LIMIT $3`,
    [guildId, userId, count]
  );
  return result.rows;
}
 + params.length, params);
  return result.rows;
}

export async function buyPlayerMarketListing(db, { guildId, buyerId, listingId }) {
  validateIdentity(guildId, buyerId);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(listingId || ''))) {
    throw new Error('PLAYER_MARKET_LISTING_ID_INVALID');
  }
  return withTransaction(db, async client => {
    const selected = await client.query(
      "SELECT listing_id,seller_id,item_key,quantity,price_coins FROM player_market_listings WHERE listing_id=$1 AND guild_id=$2 AND status='active' FOR UPDATE",
      [listingId, guildId]
    );
    if (!selected.rowCount) return { status: 'unavailable' };
    const listing = selected.rows[0];
    if (listing.seller_id === buyerId) return { status: 'self_purchase' };
    const userIds = [String(listing.seller_id), buyerId].sort();
    const locked = await client.query(
      'SELECT user_id FROM users WHERE guild_id=$1 AND user_id=ANY($2::text[]) ORDER BY user_id FOR UPDATE',
      [guildId, userIds]
    );
    if (locked.rowCount !== 2) return { status: 'unavailable' };
    const debit = await client.query(
      'UPDATE users SET coins=coins-$3 WHERE guild_id=$1 AND user_id=$2 AND coins >= $3 RETURNING coins',
      [guildId, buyerId, listing.price_coins]
    );
    if (!debit.rowCount) return { status: 'insufficient_funds' };
    await client.query(
      'UPDATE users SET coins=coins+$3 WHERE guild_id=$1 AND user_id=$2',
      [guildId, listing.seller_id, listing.price_coins]
    );
    await client.query(
      `INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,$3,$4)
       ON CONFLICT(guild_id,user_id,item_key) DO UPDATE SET quantity=inventory.quantity+EXCLUDED.quantity`,
      [guildId, buyerId, listing.item_key, listing.quantity]
    );
    await client.query(
      "UPDATE player_market_listings SET status='sold',buyer_id=$2,resolved_at=NOW() WHERE listing_id=$1",
      [listingId, buyerId]
    );
    return {
      status: 'purchased',
      itemKey: listing.item_key,
      quantity: Number(listing.quantity),
      priceCoins: Number(listing.price_coins),
      buyerBalance: Number(debit.rows[0].coins)
    };
  });
}

export async function cancelPlayerMarketListing(db, { guildId, sellerId, listingId }) {
  validateIdentity(guildId, sellerId);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(listingId || ''))) {
    throw new Error('PLAYER_MARKET_LISTING_ID_INVALID');
  }
  return withTransaction(db, async client => {
    const selected = await client.query(
      "SELECT listing_id,seller_id,item_key,quantity FROM player_market_listings WHERE listing_id=$1 AND guild_id=$2 AND status='active' FOR UPDATE",
      [listingId, guildId]
    );
    if (!selected.rowCount) return { status: 'unavailable' };
    const listing = selected.rows[0];
    if (listing.seller_id !== sellerId) return { status: 'not_owner' };
    const seller = await client.query(
      'SELECT user_id FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE',
      [guildId, sellerId]
    );
    if (!seller.rowCount) return { status: 'unavailable' };
    await client.query(
      `INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,$3,$4)
       ON CONFLICT(guild_id,user_id,item_key) DO UPDATE SET quantity=inventory.quantity+EXCLUDED.quantity`,
      [guildId, sellerId, listing.item_key, listing.quantity]
    );
    await client.query(
      "UPDATE player_market_listings SET status='cancelled',resolved_at=NOW() WHERE listing_id=$1",
      [listingId]
    );
    return { status: 'cancelled', itemKey: listing.item_key, quantity: Number(listing.quantity) };
  });
}

export async function getPlayerMarketHistory(db, guildId, userId, limit = 10) {
  validateIdentity(guildId, userId);
  const count = Math.max(1, Math.min(30, Number(limit) || 10));
  const result = await db.query(
    `SELECT listing_id,seller_id,buyer_id,item_key,quantity,price_coins,status,created_at,resolved_at
     FROM player_market_listings
     WHERE guild_id=$1 AND (seller_id=$2 OR buyer_id=$2)
     ORDER BY COALESCE(resolved_at,created_at) DESC,listing_id DESC
     LIMIT $3`,
    [guildId, userId, count]
  );
  return result.rows;
}
