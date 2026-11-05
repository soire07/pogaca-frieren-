import { randomUUID } from 'node:crypto';
import { equipmentItems } from './equipment-data.js';
import { FISH_CATALOG } from './fishing.js';
import { CREATURE_CATALOG } from './creatures.js';

const DISCORD_ID = /^\d{17,20}$/;
const MAX_ACTIVE_LISTINGS = 10;
const MAX_ACTIVE_OFFERS = 20;
const MAX_QUANTITY = 1000;
const MAX_PRICE = 1_000_000;

const MARKET_CATEGORY_KEYS = Object.freeze({
  equipment: equipmentItems.map(item => item.id),
  fishing: FISH_CATALOG.map(item => item.key),
  creatures: CREATURE_CATALOG.map(item => item.key)
});
const MARKET_CATEGORY_KEYS_ALL = [...new Set(Object.values(MARKET_CATEGORY_KEYS).flat())];

export function normalizePlayerMarketCategory(value) {
  return ['equipment', 'fishing', 'creatures', 'other'].includes(String(value || ''))
    ? String(value) : 'all';
}

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
    CREATE TABLE IF NOT EXISTS player_market_offers (
      offer_id UUID PRIMARY KEY,
      listing_id UUID NOT NULL REFERENCES player_market_listings(listing_id) ON DELETE CASCADE,
      guild_id TEXT NOT NULL,
      buyer_id TEXT NOT NULL,
      offer_coins INTEGER NOT NULL CHECK (offer_coins BETWEEN 1 AND 1000000),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','cancelled')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at TIMESTAMPTZ,
      FOREIGN KEY (guild_id,buyer_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS player_market_offer_pending_unique_idx
      ON player_market_offers(listing_id,buyer_id) WHERE status='pending';
    CREATE INDEX IF NOT EXISTS player_market_offer_listing_idx
      ON player_market_offers(guild_id,listing_id,status,created_at DESC);
    CREATE INDEX IF NOT EXISTS player_market_offer_buyer_idx
      ON player_market_offers(guild_id,buyer_id,created_at DESC);
    CREATE TABLE IF NOT EXISTS player_market_price_alerts (
      alert_id UUID PRIMARY KEY,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      item_key VARCHAR(120) NOT NULL,
      target_price INTEGER NOT NULL CHECK (target_price BETWEEN 1 AND 1000000),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','notified','cancelled')),
      claimed_at TIMESTAMPTZ,
      notified_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      FOREIGN KEY (guild_id,user_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS player_market_price_alert_unique_idx
      ON player_market_price_alerts(guild_id,user_id,LOWER(item_key),target_price);
    CREATE INDEX IF NOT EXISTS player_market_price_alert_due_idx
      ON player_market_price_alerts(status,claimed_at,created_at) WHERE status='active';
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
  if (query) { params.push(query); clauses.push(`POSITION(LOWER($${params.length}) IN LOWER(item_key)) > 0`); }
  const parsePrice = value => {
    if (value === '' || value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= MAX_PRICE ? parsed : null;
  };
  const minPrice = parsePrice(filters.minPrice), maxPrice = parsePrice(filters.maxPrice);
  const category = normalizePlayerMarketCategory(filters.category);
  if (category === 'other') {
    params.push(MARKET_CATEGORY_KEYS_ALL);
    clauses.push('NOT (item_key = ANY(
  if (minPrice !== null) { params.push(minPrice); clauses.push(`price_coins >= $${params.length}`); }
  if (maxPrice !== null) { params.push(maxPrice); clauses.push(`price_coins <= $${params.length}`); }
  const sort = ['price_desc','newest'].includes(filters.sort) ? filters.sort : 'price_asc';
  const order = sort === 'price_desc' ? 'price_coins DESC,created_at DESC,listing_id DESC'
    : sort === 'newest' ? 'created_at DESC,listing_id DESC' : 'price_coins ASC,created_at ASC,listing_id ASC';
  params.push(count);
  const result = await db.query('SELECT listing_id,seller_id,item_key,quantity,price_coins,created_at FROM player_market_listings WHERE ' +
    clauses.join(' AND ') + ' ORDER BY ' + order + ' LIMIT $' + params.length, params);
  return result.rows;
}

function validateOffer({ listingId, offerCoins }) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(listingId || ''))) {
    throw new Error('PLAYER_MARKET_LISTING_ID_INVALID');
  }
  const amount = Number(offerCoins);
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > MAX_PRICE) throw new Error('PLAYER_MARKET_OFFER_INVALID');
  return amount;
}

export async function createPlayerMarketOffer(db, { guildId, buyerId, listingId, offerCoins }) {
  validateIdentity(guildId, buyerId);
  const amount = validateOffer({ listingId, offerCoins });
  return withTransaction(db, async client => {
    const selected = await client.query(
      "SELECT listing_id,seller_id,status FROM player_market_listings WHERE listing_id=$1 AND guild_id=$2 FOR UPDATE",
      [listingId, guildId]
    );
    if (!selected.rowCount || selected.rows[0].status !== 'active') return { status: 'unavailable' };
    if (selected.rows[0].seller_id === buyerId) return { status: 'self_offer' };
    const buyer = await client.query('SELECT user_id FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE', [guildId, buyerId]);
    if (!buyer.rowCount) return { status: 'buyer_missing' };
    const existing = await client.query(
      "SELECT offer_id FROM player_market_offers WHERE listing_id=$1 AND buyer_id=$2 AND status='pending'",
      [listingId, buyerId]
    );
    if (existing.rowCount) return { status: 'already_offered', offerId: existing.rows[0].offer_id };
    const activeOffers = await client.query(
      "SELECT COUNT(*)::int AS count FROM player_market_offers WHERE guild_id=$1 AND buyer_id=$2 AND status='pending'",
      [guildId, buyerId]
    );
    if (Number(activeOffers.rows[0]?.count || 0) >= MAX_ACTIVE_OFFERS) return { status: 'offer_limit' };
    const inserted = await client.query(
      "INSERT INTO player_market_offers(offer_id,listing_id,guild_id,buyer_id,offer_coins) VALUES($1,$2,$3,$4,$5) RETURNING offer_id,listing_id,buyer_id,offer_coins,status,created_at",
      [randomUUID(), listingId, guildId, buyerId, amount]
    );
    return { status: 'offer_created', offer: inserted.rows[0] };
  });
}

export async function listPlayerMarketOffers(db, { guildId, actorId, listingId }) {
  validateIdentity(guildId, actorId);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(listingId || ''))) {
    throw new Error('PLAYER_MARKET_LISTING_ID_INVALID');
  }
  const listing = await db.query(
    'SELECT seller_id FROM player_market_listings WHERE listing_id=$1 AND guild_id=$2',
    [listingId, guildId]
  );
  if (!listing.rowCount) return { status: 'unavailable', offers: [] };
  const isSeller = listing.rows[0].seller_id === actorId;
  const result = await db.query(
    'SELECT offer_id,buyer_id,offer_coins,status,created_at,resolved_at FROM player_market_offers WHERE guild_id=$1 AND listing_id=$2 ' +
    (isSeller ? '' : 'AND buyer_id=$3 ') +
    'ORDER BY created_at DESC,offer_id DESC LIMIT 30',
    isSeller ? [guildId, listingId] : [guildId, listingId, actorId]
  );
  if (!isSeller && !result.rowCount) return { status: 'forbidden', offers: [] };
  return { status: 'listed', isSeller, offers: result.rows };
}

export async function resolvePlayerMarketOffer(db, { guildId, sellerId, offerId, decision }) {
  validateIdentity(guildId, sellerId);
  if (!['accept', 'reject'].includes(decision)) return { status: 'invalid_decision' };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(offerId || ''))) {
    throw new Error('PLAYER_MARKET_OFFER_ID_INVALID');
  }
  return withTransaction(db, async client => {
    const reference = await client.query(
      'SELECT listing_id FROM player_market_offers WHERE offer_id=$1 AND guild_id=$2',
      [offerId, guildId]
    );
    if (!reference.rowCount) return { status: 'unavailable' };
    const listingResult = await client.query(
      'SELECT listing_id,seller_id,item_key,quantity,status FROM player_market_listings WHERE listing_id=$1 AND guild_id=$2 FOR UPDATE',
      [reference.rows[0].listing_id, guildId]
    );
    if (!listingResult.rowCount || listingResult.rows[0].status !== 'active') return { status: 'unavailable' };
    const listing = listingResult.rows[0];
    if (listing.seller_id !== sellerId) return { status: 'not_owner' };
    const selected = await client.query(
      "SELECT offer_id,buyer_id,offer_coins,status FROM player_market_offers WHERE offer_id=$1 AND guild_id=$2 AND listing_id=$3 FOR UPDATE",
      [offerId, guildId, listing.listing_id]
    );
    if (!selected.rowCount || selected.rows[0].status !== 'pending') return { status: 'unavailable' };
    const offer = selected.rows[0];
    if (decision === 'reject') {
      await client.query("UPDATE player_market_offers SET status='rejected',resolved_at=NOW() WHERE offer_id=$1", [offerId]);
      return { status: 'rejected', offerCoins: Number(offer.offer_coins) };
    }
    const userIds = [String(sellerId), String(offer.buyer_id)].sort();
    const locked = await client.query(
      'SELECT user_id FROM users WHERE guild_id=$1 AND user_id=ANY($2::text[]) ORDER BY user_id FOR UPDATE',
      [guildId, userIds]
    );
    if (locked.rowCount !== 2) return { status: 'unavailable' };
    const debit = await client.query(
      'UPDATE users SET coins=coins-$3 WHERE guild_id=$1 AND user_id=$2 AND coins >= $3 RETURNING coins',
      [guildId, offer.buyer_id, offer.offer_coins]
    );
    if (!debit.rowCount) return { status: 'insufficient_funds', required: Number(offer.offer_coins) };
    await client.query('UPDATE users SET coins=coins+$3 WHERE guild_id=$1 AND user_id=$2', [guildId, sellerId, offer.offer_coins]);
    await client.query(
      'INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,$3,$4) ON CONFLICT(guild_id,user_id,item_key) DO UPDATE SET quantity=inventory.quantity+EXCLUDED.quantity',
      [guildId, offer.buyer_id, listing.item_key, listing.quantity]
    );
    await client.query(
      "UPDATE player_market_listings SET status='sold',buyer_id=$2,resolved_at=NOW() WHERE listing_id=$1",
      [listing.listing_id, offer.buyer_id]
    );
    await client.query("UPDATE player_market_offers SET status='accepted',resolved_at=NOW() WHERE offer_id=$1", [offerId]);
    await client.query(
      "UPDATE player_market_offers SET status='rejected',resolved_at=NOW() WHERE listing_id=$1 AND status='pending' AND offer_id<>$2",
      [listing.listing_id, offerId]
    );
    return { status: 'accepted', itemKey: listing.item_key, quantity: Number(listing.quantity), offerCoins: Number(offer.offer_coins), buyerBalance: Number(debit.rows[0].coins) };
  });
}

export async function cancelPlayerMarketOffer(db, { guildId, buyerId, offerId }) {
  validateIdentity(guildId, buyerId);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(offerId || ''))) {
    throw new Error('PLAYER_MARKET_OFFER_ID_INVALID');
  }
  return withTransaction(db, async client => {
    const reference = await client.query('SELECT listing_id FROM player_market_offers WHERE offer_id=$1 AND guild_id=$2', [offerId, guildId]);
    if (!reference.rowCount) return { status: 'unavailable' };
    const listing = await client.query('SELECT listing_id FROM player_market_listings WHERE listing_id=$1 AND guild_id=$2 FOR UPDATE', [reference.rows[0].listing_id, guildId]);
    if (!listing.rowCount) return { status: 'unavailable' };
    const selected = await client.query('SELECT buyer_id,status FROM player_market_offers WHERE offer_id=$1 AND guild_id=$2 AND listing_id=$3 FOR UPDATE', [offerId, guildId, listing.rows[0].listing_id]);
    if (!selected.rowCount || selected.rows[0].status !== 'pending') return { status: 'unavailable' };
    if (selected.rows[0].buyer_id !== buyerId) return { status: 'not_owner' };
    await client.query("UPDATE player_market_offers SET status='cancelled',resolved_at=NOW() WHERE offer_id=$1", [offerId]);
    return { status: 'cancelled' };
  });
}

export async function getPlayerMarketOffers(db, guildId, userId, limit = 20) {
  validateIdentity(guildId, userId);
  const count = Math.max(1, Math.min(50, Number(limit) || 20));
  const result = await db.query(
    'SELECT o.offer_id,o.listing_id,o.buyer_id,o.offer_coins,o.status,o.created_at,o.resolved_at,l.seller_id,l.item_key,l.quantity,l.price_coins,l.status AS listing_status ' +
    'FROM player_market_offers o JOIN player_market_listings l ON l.listing_id=o.listing_id AND l.guild_id=o.guild_id ' +
    'WHERE o.guild_id=$1 AND (o.buyer_id=$2 OR l.seller_id=$2) ORDER BY o.created_at DESC,o.offer_id DESC LIMIT $3',
    [guildId, userId, count]
  );
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
    await client.query("UPDATE player_market_offers SET status='rejected',resolved_at=NOW() WHERE listing_id=$1 AND status='pending'", [listingId]);
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
    await client.query("UPDATE player_market_offers SET status='rejected',resolved_at=NOW() WHERE listing_id=$1 AND status='pending'", [listingId]);
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


export function normalizePlayerMarketPriceAlertInput({ itemKey, targetPrice } = {}) {
  const key = String(itemKey || '').trim();
  const price = Number(targetPrice);
  if (!key || key.length > 120 || /[\u0000-\u001f\u007f]/.test(key)) {
    throw new Error('PLAYER_MARKET_ALERT_ITEM_INVALID');
  }
  if (!Number.isSafeInteger(price) || price < 1 || price > MAX_PRICE) {
    throw new Error('PLAYER_MARKET_ALERT_PRICE_INVALID');
  }
  return { itemKey: key, targetPrice: price };
}

export async function createPlayerMarketPriceAlert(db, { guildId, userId, itemKey, targetPrice }) {
  validateIdentity(guildId, userId);
  const normalized = normalizePlayerMarketPriceAlertInput({ itemKey, targetPrice });
  return withTransaction(db, async client => {
    const user = await client.query(
      'SELECT user_id FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE',
      [guildId, userId]
    );
    if (!user.rowCount) return { status: 'player_missing' };
    const existing = await client.query(
      `SELECT alert_id,status FROM player_market_price_alerts
       WHERE guild_id=$1 AND user_id=$2 AND LOWER(item_key)=LOWER($3) AND target_price=$4
       FOR UPDATE`,
      [guildId, userId, normalized.itemKey, normalized.targetPrice]
    );
    if (existing.rowCount) {
      const result = await client.query(
        `UPDATE player_market_price_alerts SET status='active',claimed_at=NULL,notified_at=NULL
         WHERE alert_id=$1 RETURNING alert_id,item_key,target_price,status,created_at`,
        [existing.rows[0].alert_id]
      );
      return { status: 'created', alert: result.rows[0], reactivated: true };
    }
    const count = await client.query(
      "SELECT COUNT(*)::int AS count FROM player_market_price_alerts WHERE guild_id=$1 AND user_id=$2 AND status='active'",
      [guildId, userId]
    );
    if (Number(count.rows[0]?.count || 0) >= 10) return { status: 'alert_limit' };
    const result = await client.query(
      `INSERT INTO player_market_price_alerts(alert_id,guild_id,user_id,item_key,target_price)
       VALUES($1,$2,$3,$4,$5)
       RETURNING alert_id,item_key,target_price,status,created_at`,
      [randomUUID(), guildId, userId, normalized.itemKey, normalized.targetPrice]
    );
    return { status: 'created', alert: result.rows[0], reactivated: false };
  });
}

export async function listPlayerMarketPriceAlerts(db, guildId, userId, limit = 10) {
  validateIdentity(guildId, userId);
  const result = await db.query(
    `SELECT alert_id,item_key,target_price,status,created_at,notified_at
     FROM player_market_price_alerts
     WHERE guild_id=$1 AND user_id=$2 AND status<>'cancelled'
     ORDER BY created_at DESC,alert_id LIMIT $3`,
    [guildId, userId, Math.max(1, Math.min(10, Number(limit) || 10))]
  );
  return result.rows;
}

export async function cancelPlayerMarketPriceAlert(db, { guildId, userId, alertId }) {
  validateIdentity(guildId, userId);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(alertId || ''))) {
    throw new Error('PLAYER_MARKET_ALERT_ID_INVALID');
  }
  const result = await db.query(
    `UPDATE player_market_price_alerts SET status='cancelled',claimed_at=NULL
     WHERE alert_id=$1 AND guild_id=$2 AND user_id=$3 AND status<>'cancelled'
     RETURNING alert_id`,
    [alertId, guildId, userId]
  );
  return { status: result.rowCount ? 'cancelled' : 'unavailable' };
}

export async function claimDuePlayerMarketPriceAlerts(db, limit = 20) {
  const batchSize = Math.max(1, Math.min(100, Number(limit) || 20));
  const result = await db.query(
    `WITH due AS (
       SELECT a.alert_id
       FROM player_market_price_alerts a
       WHERE a.status='active'
         AND (a.claimed_at IS NULL OR a.claimed_at <= NOW()-INTERVAL '2 minutes')
         AND EXISTS (
           SELECT 1 FROM player_market_listings l
           WHERE l.guild_id=a.guild_id AND l.status='active'
             AND LOWER(l.item_key)=LOWER(a.item_key) AND l.price_coins<=a.target_price
         )
       ORDER BY a.created_at,a.alert_id
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     ), claimed AS (
       UPDATE player_market_price_alerts a SET claimed_at=NOW()
       FROM due WHERE a.alert_id=due.alert_id
       RETURNING a.alert_id,a.guild_id,a.user_id,a.item_key,a.target_price,a.claimed_at
     )
     SELECT c.alert_id,c.guild_id,c.user_id,c.item_key,c.target_price,c.claimed_at,
       l.listing_id,l.price_coins,l.quantity,l.seller_id
     FROM claimed c
     CROSS JOIN LATERAL (
       SELECT listing_id,price_coins,quantity,seller_id
       FROM player_market_listings
       WHERE guild_id=c.guild_id AND status='active'
         AND LOWER(item_key)=LOWER(c.item_key) AND price_coins<=c.target_price
       ORDER BY price_coins,created_at,listing_id LIMIT 1
     ) l`,
    [batchSize]
  );
  return result.rows;
}

export async function markPlayerMarketPriceAlertNotified(db, alertId, claimedAt) {
  const result = await db.query(
    `UPDATE player_market_price_alerts
     SET status='notified',notified_at=NOW(),claimed_at=NULL
     WHERE alert_id=$1 AND claimed_at=$2 AND status='active'
     RETURNING alert_id`,
    [alertId, claimedAt]
  );
  return result.rowCount === 1;
}

export async function releasePlayerMarketPriceAlertClaim(db, alertId, claimedAt) {
  const result = await db.query(
    `UPDATE player_market_price_alerts SET claimed_at=NULL
     WHERE alert_id=$1 AND claimed_at=$2 AND status='active'
     RETURNING alert_id`,
    [alertId, claimedAt]
  );
  return result.rowCount === 1;
}
 + params.length + '::text[]))');
  } else if (category !== 'all') {
    params.push(MARKET_CATEGORY_KEYS[category]);
    clauses.push('item_key = ANY(
  if (minPrice !== null) { params.push(minPrice); clauses.push(`price_coins >= $${params.length}`); }
  if (maxPrice !== null) { params.push(maxPrice); clauses.push(`price_coins <= $${params.length}`); }
  const sort = ['price_desc','newest'].includes(filters.sort) ? filters.sort : 'price_asc';
  const order = sort === 'price_desc' ? 'price_coins DESC,created_at DESC,listing_id DESC'
    : sort === 'newest' ? 'created_at DESC,listing_id DESC' : 'price_coins ASC,created_at ASC,listing_id ASC';
  params.push(count);
  const result = await db.query('SELECT listing_id,seller_id,item_key,quantity,price_coins,created_at FROM player_market_listings WHERE ' +
    clauses.join(' AND ') + ' ORDER BY ' + order + ' LIMIT $' + params.length, params);
  return result.rows;
}

function validateOffer({ listingId, offerCoins }) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(listingId || ''))) {
    throw new Error('PLAYER_MARKET_LISTING_ID_INVALID');
  }
  const amount = Number(offerCoins);
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > MAX_PRICE) throw new Error('PLAYER_MARKET_OFFER_INVALID');
  return amount;
}

export async function createPlayerMarketOffer(db, { guildId, buyerId, listingId, offerCoins }) {
  validateIdentity(guildId, buyerId);
  const amount = validateOffer({ listingId, offerCoins });
  return withTransaction(db, async client => {
    const selected = await client.query(
      "SELECT listing_id,seller_id,status FROM player_market_listings WHERE listing_id=$1 AND guild_id=$2 FOR UPDATE",
      [listingId, guildId]
    );
    if (!selected.rowCount || selected.rows[0].status !== 'active') return { status: 'unavailable' };
    if (selected.rows[0].seller_id === buyerId) return { status: 'self_offer' };
    const buyer = await client.query('SELECT user_id FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE', [guildId, buyerId]);
    if (!buyer.rowCount) return { status: 'buyer_missing' };
    const existing = await client.query(
      "SELECT offer_id FROM player_market_offers WHERE listing_id=$1 AND buyer_id=$2 AND status='pending'",
      [listingId, buyerId]
    );
    if (existing.rowCount) return { status: 'already_offered', offerId: existing.rows[0].offer_id };
    const activeOffers = await client.query(
      "SELECT COUNT(*)::int AS count FROM player_market_offers WHERE guild_id=$1 AND buyer_id=$2 AND status='pending'",
      [guildId, buyerId]
    );
    if (Number(activeOffers.rows[0]?.count || 0) >= MAX_ACTIVE_OFFERS) return { status: 'offer_limit' };
    const inserted = await client.query(
      "INSERT INTO player_market_offers(offer_id,listing_id,guild_id,buyer_id,offer_coins) VALUES($1,$2,$3,$4,$5) RETURNING offer_id,listing_id,buyer_id,offer_coins,status,created_at",
      [randomUUID(), listingId, guildId, buyerId, amount]
    );
    return { status: 'offer_created', offer: inserted.rows[0] };
  });
}

export async function listPlayerMarketOffers(db, { guildId, actorId, listingId }) {
  validateIdentity(guildId, actorId);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(listingId || ''))) {
    throw new Error('PLAYER_MARKET_LISTING_ID_INVALID');
  }
  const listing = await db.query(
    'SELECT seller_id FROM player_market_listings WHERE listing_id=$1 AND guild_id=$2',
    [listingId, guildId]
  );
  if (!listing.rowCount) return { status: 'unavailable', offers: [] };
  const isSeller = listing.rows[0].seller_id === actorId;
  const result = await db.query(
    'SELECT offer_id,buyer_id,offer_coins,status,created_at,resolved_at FROM player_market_offers WHERE guild_id=$1 AND listing_id=$2 ' +
    (isSeller ? '' : 'AND buyer_id=$3 ') +
    'ORDER BY created_at DESC,offer_id DESC LIMIT 30',
    isSeller ? [guildId, listingId] : [guildId, listingId, actorId]
  );
  if (!isSeller && !result.rowCount) return { status: 'forbidden', offers: [] };
  return { status: 'listed', isSeller, offers: result.rows };
}

export async function resolvePlayerMarketOffer(db, { guildId, sellerId, offerId, decision }) {
  validateIdentity(guildId, sellerId);
  if (!['accept', 'reject'].includes(decision)) return { status: 'invalid_decision' };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(offerId || ''))) {
    throw new Error('PLAYER_MARKET_OFFER_ID_INVALID');
  }
  return withTransaction(db, async client => {
    const reference = await client.query(
      'SELECT listing_id FROM player_market_offers WHERE offer_id=$1 AND guild_id=$2',
      [offerId, guildId]
    );
    if (!reference.rowCount) return { status: 'unavailable' };
    const listingResult = await client.query(
      'SELECT listing_id,seller_id,item_key,quantity,status FROM player_market_listings WHERE listing_id=$1 AND guild_id=$2 FOR UPDATE',
      [reference.rows[0].listing_id, guildId]
    );
    if (!listingResult.rowCount || listingResult.rows[0].status !== 'active') return { status: 'unavailable' };
    const listing = listingResult.rows[0];
    if (listing.seller_id !== sellerId) return { status: 'not_owner' };
    const selected = await client.query(
      "SELECT offer_id,buyer_id,offer_coins,status FROM player_market_offers WHERE offer_id=$1 AND guild_id=$2 AND listing_id=$3 FOR UPDATE",
      [offerId, guildId, listing.listing_id]
    );
    if (!selected.rowCount || selected.rows[0].status !== 'pending') return { status: 'unavailable' };
    const offer = selected.rows[0];
    if (decision === 'reject') {
      await client.query("UPDATE player_market_offers SET status='rejected',resolved_at=NOW() WHERE offer_id=$1", [offerId]);
      return { status: 'rejected', offerCoins: Number(offer.offer_coins) };
    }
    const userIds = [String(sellerId), String(offer.buyer_id)].sort();
    const locked = await client.query(
      'SELECT user_id FROM users WHERE guild_id=$1 AND user_id=ANY($2::text[]) ORDER BY user_id FOR UPDATE',
      [guildId, userIds]
    );
    if (locked.rowCount !== 2) return { status: 'unavailable' };
    const debit = await client.query(
      'UPDATE users SET coins=coins-$3 WHERE guild_id=$1 AND user_id=$2 AND coins >= $3 RETURNING coins',
      [guildId, offer.buyer_id, offer.offer_coins]
    );
    if (!debit.rowCount) return { status: 'insufficient_funds', required: Number(offer.offer_coins) };
    await client.query('UPDATE users SET coins=coins+$3 WHERE guild_id=$1 AND user_id=$2', [guildId, sellerId, offer.offer_coins]);
    await client.query(
      'INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,$3,$4) ON CONFLICT(guild_id,user_id,item_key) DO UPDATE SET quantity=inventory.quantity+EXCLUDED.quantity',
      [guildId, offer.buyer_id, listing.item_key, listing.quantity]
    );
    await client.query(
      "UPDATE player_market_listings SET status='sold',buyer_id=$2,resolved_at=NOW() WHERE listing_id=$1",
      [listing.listing_id, offer.buyer_id]
    );
    await client.query("UPDATE player_market_offers SET status='accepted',resolved_at=NOW() WHERE offer_id=$1", [offerId]);
    await client.query(
      "UPDATE player_market_offers SET status='rejected',resolved_at=NOW() WHERE listing_id=$1 AND status='pending' AND offer_id<>$2",
      [listing.listing_id, offerId]
    );
    return { status: 'accepted', itemKey: listing.item_key, quantity: Number(listing.quantity), offerCoins: Number(offer.offer_coins), buyerBalance: Number(debit.rows[0].coins) };
  });
}

export async function cancelPlayerMarketOffer(db, { guildId, buyerId, offerId }) {
  validateIdentity(guildId, buyerId);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(offerId || ''))) {
    throw new Error('PLAYER_MARKET_OFFER_ID_INVALID');
  }
  return withTransaction(db, async client => {
    const reference = await client.query('SELECT listing_id FROM player_market_offers WHERE offer_id=$1 AND guild_id=$2', [offerId, guildId]);
    if (!reference.rowCount) return { status: 'unavailable' };
    const listing = await client.query('SELECT listing_id FROM player_market_listings WHERE listing_id=$1 AND guild_id=$2 FOR UPDATE', [reference.rows[0].listing_id, guildId]);
    if (!listing.rowCount) return { status: 'unavailable' };
    const selected = await client.query('SELECT buyer_id,status FROM player_market_offers WHERE offer_id=$1 AND guild_id=$2 AND listing_id=$3 FOR UPDATE', [offerId, guildId, listing.rows[0].listing_id]);
    if (!selected.rowCount || selected.rows[0].status !== 'pending') return { status: 'unavailable' };
    if (selected.rows[0].buyer_id !== buyerId) return { status: 'not_owner' };
    await client.query("UPDATE player_market_offers SET status='cancelled',resolved_at=NOW() WHERE offer_id=$1", [offerId]);
    return { status: 'cancelled' };
  });
}

export async function getPlayerMarketOffers(db, guildId, userId, limit = 20) {
  validateIdentity(guildId, userId);
  const count = Math.max(1, Math.min(50, Number(limit) || 20));
  const result = await db.query(
    'SELECT o.offer_id,o.listing_id,o.buyer_id,o.offer_coins,o.status,o.created_at,o.resolved_at,l.seller_id,l.item_key,l.quantity,l.price_coins,l.status AS listing_status ' +
    'FROM player_market_offers o JOIN player_market_listings l ON l.listing_id=o.listing_id AND l.guild_id=o.guild_id ' +
    'WHERE o.guild_id=$1 AND (o.buyer_id=$2 OR l.seller_id=$2) ORDER BY o.created_at DESC,o.offer_id DESC LIMIT $3',
    [guildId, userId, count]
  );
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
    await client.query("UPDATE player_market_offers SET status='rejected',resolved_at=NOW() WHERE listing_id=$1 AND status='pending'", [listingId]);
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
    await client.query("UPDATE player_market_offers SET status='rejected',resolved_at=NOW() WHERE listing_id=$1 AND status='pending'", [listingId]);
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


export function normalizePlayerMarketPriceAlertInput({ itemKey, targetPrice } = {}) {
  const key = String(itemKey || '').trim();
  const price = Number(targetPrice);
  if (!key || key.length > 120 || /[\u0000-\u001f\u007f]/.test(key)) {
    throw new Error('PLAYER_MARKET_ALERT_ITEM_INVALID');
  }
  if (!Number.isSafeInteger(price) || price < 1 || price > MAX_PRICE) {
    throw new Error('PLAYER_MARKET_ALERT_PRICE_INVALID');
  }
  return { itemKey: key, targetPrice: price };
}

export async function createPlayerMarketPriceAlert(db, { guildId, userId, itemKey, targetPrice }) {
  validateIdentity(guildId, userId);
  const normalized = normalizePlayerMarketPriceAlertInput({ itemKey, targetPrice });
  return withTransaction(db, async client => {
    const user = await client.query(
      'SELECT user_id FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE',
      [guildId, userId]
    );
    if (!user.rowCount) return { status: 'player_missing' };
    const existing = await client.query(
      `SELECT alert_id,status FROM player_market_price_alerts
       WHERE guild_id=$1 AND user_id=$2 AND LOWER(item_key)=LOWER($3) AND target_price=$4
       FOR UPDATE`,
      [guildId, userId, normalized.itemKey, normalized.targetPrice]
    );
    if (existing.rowCount) {
      const result = await client.query(
        `UPDATE player_market_price_alerts SET status='active',claimed_at=NULL,notified_at=NULL
         WHERE alert_id=$1 RETURNING alert_id,item_key,target_price,status,created_at`,
        [existing.rows[0].alert_id]
      );
      return { status: 'created', alert: result.rows[0], reactivated: true };
    }
    const count = await client.query(
      "SELECT COUNT(*)::int AS count FROM player_market_price_alerts WHERE guild_id=$1 AND user_id=$2 AND status='active'",
      [guildId, userId]
    );
    if (Number(count.rows[0]?.count || 0) >= 10) return { status: 'alert_limit' };
    const result = await client.query(
      `INSERT INTO player_market_price_alerts(alert_id,guild_id,user_id,item_key,target_price)
       VALUES($1,$2,$3,$4,$5)
       RETURNING alert_id,item_key,target_price,status,created_at`,
      [randomUUID(), guildId, userId, normalized.itemKey, normalized.targetPrice]
    );
    return { status: 'created', alert: result.rows[0], reactivated: false };
  });
}

export async function listPlayerMarketPriceAlerts(db, guildId, userId, limit = 10) {
  validateIdentity(guildId, userId);
  const result = await db.query(
    `SELECT alert_id,item_key,target_price,status,created_at,notified_at
     FROM player_market_price_alerts
     WHERE guild_id=$1 AND user_id=$2 AND status<>'cancelled'
     ORDER BY created_at DESC,alert_id LIMIT $3`,
    [guildId, userId, Math.max(1, Math.min(10, Number(limit) || 10))]
  );
  return result.rows;
}

export async function cancelPlayerMarketPriceAlert(db, { guildId, userId, alertId }) {
  validateIdentity(guildId, userId);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(alertId || ''))) {
    throw new Error('PLAYER_MARKET_ALERT_ID_INVALID');
  }
  const result = await db.query(
    `UPDATE player_market_price_alerts SET status='cancelled',claimed_at=NULL
     WHERE alert_id=$1 AND guild_id=$2 AND user_id=$3 AND status<>'cancelled'
     RETURNING alert_id`,
    [alertId, guildId, userId]
  );
  return { status: result.rowCount ? 'cancelled' : 'unavailable' };
}

export async function claimDuePlayerMarketPriceAlerts(db, limit = 20) {
  const batchSize = Math.max(1, Math.min(100, Number(limit) || 20));
  const result = await db.query(
    `WITH due AS (
       SELECT a.alert_id
       FROM player_market_price_alerts a
       WHERE a.status='active'
         AND (a.claimed_at IS NULL OR a.claimed_at <= NOW()-INTERVAL '2 minutes')
         AND EXISTS (
           SELECT 1 FROM player_market_listings l
           WHERE l.guild_id=a.guild_id AND l.status='active'
             AND LOWER(l.item_key)=LOWER(a.item_key) AND l.price_coins<=a.target_price
         )
       ORDER BY a.created_at,a.alert_id
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     ), claimed AS (
       UPDATE player_market_price_alerts a SET claimed_at=NOW()
       FROM due WHERE a.alert_id=due.alert_id
       RETURNING a.alert_id,a.guild_id,a.user_id,a.item_key,a.target_price,a.claimed_at
     )
     SELECT c.alert_id,c.guild_id,c.user_id,c.item_key,c.target_price,c.claimed_at,
       l.listing_id,l.price_coins,l.quantity,l.seller_id
     FROM claimed c
     CROSS JOIN LATERAL (
       SELECT listing_id,price_coins,quantity,seller_id
       FROM player_market_listings
       WHERE guild_id=c.guild_id AND status='active'
         AND LOWER(item_key)=LOWER(c.item_key) AND price_coins<=c.target_price
       ORDER BY price_coins,created_at,listing_id LIMIT 1
     ) l`,
    [batchSize]
  );
  return result.rows;
}

export async function markPlayerMarketPriceAlertNotified(db, alertId, claimedAt) {
  const result = await db.query(
    `UPDATE player_market_price_alerts
     SET status='notified',notified_at=NOW(),claimed_at=NULL
     WHERE alert_id=$1 AND claimed_at=$2 AND status='active'
     RETURNING alert_id`,
    [alertId, claimedAt]
  );
  return result.rowCount === 1;
}

export async function releasePlayerMarketPriceAlertClaim(db, alertId, claimedAt) {
  const result = await db.query(
    `UPDATE player_market_price_alerts SET claimed_at=NULL
     WHERE alert_id=$1 AND claimed_at=$2 AND status='active'
     RETURNING alert_id`,
    [alertId, claimedAt]
  );
  return result.rowCount === 1;
}
 + params.length + '::text[])');
  }
  if (minPrice !== null) { params.push(minPrice); clauses.push(`price_coins >= $${params.length}`); }
  if (maxPrice !== null) { params.push(maxPrice); clauses.push(`price_coins <= $${params.length}`); }
  const sort = ['price_desc','newest'].includes(filters.sort) ? filters.sort : 'price_asc';
  const order = sort === 'price_desc' ? 'price_coins DESC,created_at DESC,listing_id DESC'
    : sort === 'newest' ? 'created_at DESC,listing_id DESC' : 'price_coins ASC,created_at ASC,listing_id ASC';
  params.push(count);
  const result = await db.query('SELECT listing_id,seller_id,item_key,quantity,price_coins,created_at FROM player_market_listings WHERE ' +
    clauses.join(' AND ') + ' ORDER BY ' + order + ' LIMIT $' + params.length, params);
  return result.rows;
}

function validateOffer({ listingId, offerCoins }) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(listingId || ''))) {
    throw new Error('PLAYER_MARKET_LISTING_ID_INVALID');
  }
  const amount = Number(offerCoins);
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > MAX_PRICE) throw new Error('PLAYER_MARKET_OFFER_INVALID');
  return amount;
}

export async function createPlayerMarketOffer(db, { guildId, buyerId, listingId, offerCoins }) {
  validateIdentity(guildId, buyerId);
  const amount = validateOffer({ listingId, offerCoins });
  return withTransaction(db, async client => {
    const selected = await client.query(
      "SELECT listing_id,seller_id,status FROM player_market_listings WHERE listing_id=$1 AND guild_id=$2 FOR UPDATE",
      [listingId, guildId]
    );
    if (!selected.rowCount || selected.rows[0].status !== 'active') return { status: 'unavailable' };
    if (selected.rows[0].seller_id === buyerId) return { status: 'self_offer' };
    const buyer = await client.query('SELECT user_id FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE', [guildId, buyerId]);
    if (!buyer.rowCount) return { status: 'buyer_missing' };
    const existing = await client.query(
      "SELECT offer_id FROM player_market_offers WHERE listing_id=$1 AND buyer_id=$2 AND status='pending'",
      [listingId, buyerId]
    );
    if (existing.rowCount) return { status: 'already_offered', offerId: existing.rows[0].offer_id };
    const activeOffers = await client.query(
      "SELECT COUNT(*)::int AS count FROM player_market_offers WHERE guild_id=$1 AND buyer_id=$2 AND status='pending'",
      [guildId, buyerId]
    );
    if (Number(activeOffers.rows[0]?.count || 0) >= MAX_ACTIVE_OFFERS) return { status: 'offer_limit' };
    const inserted = await client.query(
      "INSERT INTO player_market_offers(offer_id,listing_id,guild_id,buyer_id,offer_coins) VALUES($1,$2,$3,$4,$5) RETURNING offer_id,listing_id,buyer_id,offer_coins,status,created_at",
      [randomUUID(), listingId, guildId, buyerId, amount]
    );
    return { status: 'offer_created', offer: inserted.rows[0] };
  });
}

export async function listPlayerMarketOffers(db, { guildId, actorId, listingId }) {
  validateIdentity(guildId, actorId);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(listingId || ''))) {
    throw new Error('PLAYER_MARKET_LISTING_ID_INVALID');
  }
  const listing = await db.query(
    'SELECT seller_id FROM player_market_listings WHERE listing_id=$1 AND guild_id=$2',
    [listingId, guildId]
  );
  if (!listing.rowCount) return { status: 'unavailable', offers: [] };
  const isSeller = listing.rows[0].seller_id === actorId;
  const result = await db.query(
    'SELECT offer_id,buyer_id,offer_coins,status,created_at,resolved_at FROM player_market_offers WHERE guild_id=$1 AND listing_id=$2 ' +
    (isSeller ? '' : 'AND buyer_id=$3 ') +
    'ORDER BY created_at DESC,offer_id DESC LIMIT 30',
    isSeller ? [guildId, listingId] : [guildId, listingId, actorId]
  );
  if (!isSeller && !result.rowCount) return { status: 'forbidden', offers: [] };
  return { status: 'listed', isSeller, offers: result.rows };
}

export async function resolvePlayerMarketOffer(db, { guildId, sellerId, offerId, decision }) {
  validateIdentity(guildId, sellerId);
  if (!['accept', 'reject'].includes(decision)) return { status: 'invalid_decision' };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(offerId || ''))) {
    throw new Error('PLAYER_MARKET_OFFER_ID_INVALID');
  }
  return withTransaction(db, async client => {
    const reference = await client.query(
      'SELECT listing_id FROM player_market_offers WHERE offer_id=$1 AND guild_id=$2',
      [offerId, guildId]
    );
    if (!reference.rowCount) return { status: 'unavailable' };
    const listingResult = await client.query(
      'SELECT listing_id,seller_id,item_key,quantity,status FROM player_market_listings WHERE listing_id=$1 AND guild_id=$2 FOR UPDATE',
      [reference.rows[0].listing_id, guildId]
    );
    if (!listingResult.rowCount || listingResult.rows[0].status !== 'active') return { status: 'unavailable' };
    const listing = listingResult.rows[0];
    if (listing.seller_id !== sellerId) return { status: 'not_owner' };
    const selected = await client.query(
      "SELECT offer_id,buyer_id,offer_coins,status FROM player_market_offers WHERE offer_id=$1 AND guild_id=$2 AND listing_id=$3 FOR UPDATE",
      [offerId, guildId, listing.listing_id]
    );
    if (!selected.rowCount || selected.rows[0].status !== 'pending') return { status: 'unavailable' };
    const offer = selected.rows[0];
    if (decision === 'reject') {
      await client.query("UPDATE player_market_offers SET status='rejected',resolved_at=NOW() WHERE offer_id=$1", [offerId]);
      return { status: 'rejected', offerCoins: Number(offer.offer_coins) };
    }
    const userIds = [String(sellerId), String(offer.buyer_id)].sort();
    const locked = await client.query(
      'SELECT user_id FROM users WHERE guild_id=$1 AND user_id=ANY($2::text[]) ORDER BY user_id FOR UPDATE',
      [guildId, userIds]
    );
    if (locked.rowCount !== 2) return { status: 'unavailable' };
    const debit = await client.query(
      'UPDATE users SET coins=coins-$3 WHERE guild_id=$1 AND user_id=$2 AND coins >= $3 RETURNING coins',
      [guildId, offer.buyer_id, offer.offer_coins]
    );
    if (!debit.rowCount) return { status: 'insufficient_funds', required: Number(offer.offer_coins) };
    await client.query('UPDATE users SET coins=coins+$3 WHERE guild_id=$1 AND user_id=$2', [guildId, sellerId, offer.offer_coins]);
    await client.query(
      'INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,$3,$4) ON CONFLICT(guild_id,user_id,item_key) DO UPDATE SET quantity=inventory.quantity+EXCLUDED.quantity',
      [guildId, offer.buyer_id, listing.item_key, listing.quantity]
    );
    await client.query(
      "UPDATE player_market_listings SET status='sold',buyer_id=$2,resolved_at=NOW() WHERE listing_id=$1",
      [listing.listing_id, offer.buyer_id]
    );
    await client.query("UPDATE player_market_offers SET status='accepted',resolved_at=NOW() WHERE offer_id=$1", [offerId]);
    await client.query(
      "UPDATE player_market_offers SET status='rejected',resolved_at=NOW() WHERE listing_id=$1 AND status='pending' AND offer_id<>$2",
      [listing.listing_id, offerId]
    );
    return { status: 'accepted', itemKey: listing.item_key, quantity: Number(listing.quantity), offerCoins: Number(offer.offer_coins), buyerBalance: Number(debit.rows[0].coins) };
  });
}

export async function cancelPlayerMarketOffer(db, { guildId, buyerId, offerId }) {
  validateIdentity(guildId, buyerId);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(offerId || ''))) {
    throw new Error('PLAYER_MARKET_OFFER_ID_INVALID');
  }
  return withTransaction(db, async client => {
    const reference = await client.query('SELECT listing_id FROM player_market_offers WHERE offer_id=$1 AND guild_id=$2', [offerId, guildId]);
    if (!reference.rowCount) return { status: 'unavailable' };
    const listing = await client.query('SELECT listing_id FROM player_market_listings WHERE listing_id=$1 AND guild_id=$2 FOR UPDATE', [reference.rows[0].listing_id, guildId]);
    if (!listing.rowCount) return { status: 'unavailable' };
    const selected = await client.query('SELECT buyer_id,status FROM player_market_offers WHERE offer_id=$1 AND guild_id=$2 AND listing_id=$3 FOR UPDATE', [offerId, guildId, listing.rows[0].listing_id]);
    if (!selected.rowCount || selected.rows[0].status !== 'pending') return { status: 'unavailable' };
    if (selected.rows[0].buyer_id !== buyerId) return { status: 'not_owner' };
    await client.query("UPDATE player_market_offers SET status='cancelled',resolved_at=NOW() WHERE offer_id=$1", [offerId]);
    return { status: 'cancelled' };
  });
}

export async function getPlayerMarketOffers(db, guildId, userId, limit = 20) {
  validateIdentity(guildId, userId);
  const count = Math.max(1, Math.min(50, Number(limit) || 20));
  const result = await db.query(
    'SELECT o.offer_id,o.listing_id,o.buyer_id,o.offer_coins,o.status,o.created_at,o.resolved_at,l.seller_id,l.item_key,l.quantity,l.price_coins,l.status AS listing_status ' +
    'FROM player_market_offers o JOIN player_market_listings l ON l.listing_id=o.listing_id AND l.guild_id=o.guild_id ' +
    'WHERE o.guild_id=$1 AND (o.buyer_id=$2 OR l.seller_id=$2) ORDER BY o.created_at DESC,o.offer_id DESC LIMIT $3',
    [guildId, userId, count]
  );
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
    await client.query("UPDATE player_market_offers SET status='rejected',resolved_at=NOW() WHERE listing_id=$1 AND status='pending'", [listingId]);
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
    await client.query("UPDATE player_market_offers SET status='rejected',resolved_at=NOW() WHERE listing_id=$1 AND status='pending'", [listingId]);
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


export function normalizePlayerMarketPriceAlertInput({ itemKey, targetPrice } = {}) {
  const key = String(itemKey || '').trim();
  const price = Number(targetPrice);
  if (!key || key.length > 120 || /[\u0000-\u001f\u007f]/.test(key)) {
    throw new Error('PLAYER_MARKET_ALERT_ITEM_INVALID');
  }
  if (!Number.isSafeInteger(price) || price < 1 || price > MAX_PRICE) {
    throw new Error('PLAYER_MARKET_ALERT_PRICE_INVALID');
  }
  return { itemKey: key, targetPrice: price };
}

export async function createPlayerMarketPriceAlert(db, { guildId, userId, itemKey, targetPrice }) {
  validateIdentity(guildId, userId);
  const normalized = normalizePlayerMarketPriceAlertInput({ itemKey, targetPrice });
  return withTransaction(db, async client => {
    const user = await client.query(
      'SELECT user_id FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE',
      [guildId, userId]
    );
    if (!user.rowCount) return { status: 'player_missing' };
    const existing = await client.query(
      `SELECT alert_id,status FROM player_market_price_alerts
       WHERE guild_id=$1 AND user_id=$2 AND LOWER(item_key)=LOWER($3) AND target_price=$4
       FOR UPDATE`,
      [guildId, userId, normalized.itemKey, normalized.targetPrice]
    );
    if (existing.rowCount) {
      const result = await client.query(
        `UPDATE player_market_price_alerts SET status='active',claimed_at=NULL,notified_at=NULL
         WHERE alert_id=$1 RETURNING alert_id,item_key,target_price,status,created_at`,
        [existing.rows[0].alert_id]
      );
      return { status: 'created', alert: result.rows[0], reactivated: true };
    }
    const count = await client.query(
      "SELECT COUNT(*)::int AS count FROM player_market_price_alerts WHERE guild_id=$1 AND user_id=$2 AND status='active'",
      [guildId, userId]
    );
    if (Number(count.rows[0]?.count || 0) >= 10) return { status: 'alert_limit' };
    const result = await client.query(
      `INSERT INTO player_market_price_alerts(alert_id,guild_id,user_id,item_key,target_price)
       VALUES($1,$2,$3,$4,$5)
       RETURNING alert_id,item_key,target_price,status,created_at`,
      [randomUUID(), guildId, userId, normalized.itemKey, normalized.targetPrice]
    );
    return { status: 'created', alert: result.rows[0], reactivated: false };
  });
}

export async function listPlayerMarketPriceAlerts(db, guildId, userId, limit = 10) {
  validateIdentity(guildId, userId);
  const result = await db.query(
    `SELECT alert_id,item_key,target_price,status,created_at,notified_at
     FROM player_market_price_alerts
     WHERE guild_id=$1 AND user_id=$2 AND status<>'cancelled'
     ORDER BY created_at DESC,alert_id LIMIT $3`,
    [guildId, userId, Math.max(1, Math.min(10, Number(limit) || 10))]
  );
  return result.rows;
}

export async function cancelPlayerMarketPriceAlert(db, { guildId, userId, alertId }) {
  validateIdentity(guildId, userId);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(alertId || ''))) {
    throw new Error('PLAYER_MARKET_ALERT_ID_INVALID');
  }
  const result = await db.query(
    `UPDATE player_market_price_alerts SET status='cancelled',claimed_at=NULL
     WHERE alert_id=$1 AND guild_id=$2 AND user_id=$3 AND status<>'cancelled'
     RETURNING alert_id`,
    [alertId, guildId, userId]
  );
  return { status: result.rowCount ? 'cancelled' : 'unavailable' };
}

export async function claimDuePlayerMarketPriceAlerts(db, limit = 20) {
  const batchSize = Math.max(1, Math.min(100, Number(limit) || 20));
  const result = await db.query(
    `WITH due AS (
       SELECT a.alert_id
       FROM player_market_price_alerts a
       WHERE a.status='active'
         AND (a.claimed_at IS NULL OR a.claimed_at <= NOW()-INTERVAL '2 minutes')
         AND EXISTS (
           SELECT 1 FROM player_market_listings l
           WHERE l.guild_id=a.guild_id AND l.status='active'
             AND LOWER(l.item_key)=LOWER(a.item_key) AND l.price_coins<=a.target_price
         )
       ORDER BY a.created_at,a.alert_id
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     ), claimed AS (
       UPDATE player_market_price_alerts a SET claimed_at=NOW()
       FROM due WHERE a.alert_id=due.alert_id
       RETURNING a.alert_id,a.guild_id,a.user_id,a.item_key,a.target_price,a.claimed_at
     )
     SELECT c.alert_id,c.guild_id,c.user_id,c.item_key,c.target_price,c.claimed_at,
       l.listing_id,l.price_coins,l.quantity,l.seller_id
     FROM claimed c
     CROSS JOIN LATERAL (
       SELECT listing_id,price_coins,quantity,seller_id
       FROM player_market_listings
       WHERE guild_id=c.guild_id AND status='active'
         AND LOWER(item_key)=LOWER(c.item_key) AND price_coins<=c.target_price
       ORDER BY price_coins,created_at,listing_id LIMIT 1
     ) l`,
    [batchSize]
  );
  return result.rows;
}

export async function markPlayerMarketPriceAlertNotified(db, alertId, claimedAt) {
  const result = await db.query(
    `UPDATE player_market_price_alerts
     SET status='notified',notified_at=NOW(),claimed_at=NULL
     WHERE alert_id=$1 AND claimed_at=$2 AND status='active'
     RETURNING alert_id`,
    [alertId, claimedAt]
  );
  return result.rowCount === 1;
}

export async function releasePlayerMarketPriceAlertClaim(db, alertId, claimedAt) {
  const result = await db.query(
    `UPDATE player_market_price_alerts SET claimed_at=NULL
     WHERE alert_id=$1 AND claimed_at=$2 AND status='active'
     RETURNING alert_id`,
    [alertId, claimedAt]
  );
  return result.rowCount === 1;
}
