/**
 * Production PostgreSQL transaction for accepting or declining a character trade.
 * Shared by the Discord interaction handler and the isolated PostgreSQL integration tests.
 */
export async function resolveTradeOffer(dbPool, { guildId, offerId, acceptingUserId, action = 'trade_accept' }) {
  if (!guildId || !offerId || !acceptingUserId || !['trade_accept', 'trade_decline'].includes(action)) {
    return { status: 'invalid_request' };
  }

  const db = await dbPool.connect();
  try {
    await db.query('BEGIN');
    const snapshotResult = await db.query(
      'SELECT from_user_id,to_user_id FROM trade_offers WHERE offer_id=$1 AND guild_id=$2',
      [offerId, guildId]
    );
    const snapshot = snapshotResult.rows[0];
    if (!snapshot) {
      await db.query('ROLLBACK');
      return { status: 'not_found' };
    }
    if (acceptingUserId !== snapshot.to_user_id) {
      await db.query('ROLLBACK');
      return { status: 'forbidden' };
    }

    if (action === 'trade_accept') {
      const playerLocks = await db.query(
        'SELECT user_id FROM users WHERE guild_id=$1 AND user_id=ANY($2::text[]) ORDER BY user_id FOR UPDATE',
        [guildId, [snapshot.from_user_id, snapshot.to_user_id].sort()]
      );
      if (playerLocks.rowCount !== 2) {
        await db.query('ROLLBACK');
        return { status: 'participants_missing' };
      }
    }

    const offerResult = await db.query(
      'SELECT * FROM trade_offers WHERE offer_id=$1 AND guild_id=$2 FOR UPDATE',
      [offerId, guildId]
    );
    const offer = offerResult.rows[0];
    if (!offer) {
      await db.query('ROLLBACK');
      return { status: 'not_found' };
    }
    if (acceptingUserId !== offer.to_user_id) {
      await db.query('ROLLBACK');
      return { status: 'forbidden' };
    }
    if (offer.status !== 'pending') {
      await db.query('ROLLBACK');
      return { status: 'already_resolved', offer };
    }
    if (new Date(offer.expires_at).getTime() <= Date.now()) {
      await db.query("UPDATE trade_offers SET status='expired',resolved_at=NOW() WHERE offer_id=$1", [offerId]);
      await db.query('COMMIT');
      return { status: 'expired', offer };
    }
    if (action === 'trade_decline') {
      await db.query("UPDATE trade_offers SET status='declined',resolved_at=NOW() WHERE offer_id=$1", [offerId]);
      await db.query('COMMIT');
      return { status: 'declined', offer };
    }

    const found = await db.query(
      `SELECT character_name, quantity FROM anime_character_collection
       WHERE guild_id=$1 AND user_id=$2 AND character_name=$3 FOR UPDATE`,
      [guildId, offer.from_user_id, offer.character_name]
    );
    const reservedResult = await db.query(
      `SELECT COALESCE(SUM(amount),0)::int AS amount FROM trade_offers
       WHERE guild_id=$1 AND from_user_id=$2 AND character_name=$3 AND status='pending'
         AND expires_at>NOW() AND offer_id<>$4`,
      [guildId, offer.from_user_id, found.rows[0]?.character_name ?? offer.character_name, offerId]
    );
    const reservedForOthers = Number(reservedResult.rows[0].amount);
    if (!found.rowCount || Number(found.rows[0].quantity) - Number(offer.amount) < reservedForOthers + 1) {
      await db.query("UPDATE trade_offers SET status='invalid',resolved_at=NOW() WHERE offer_id=$1", [offerId]);
      await db.query('COMMIT');
      return { status: 'invalid_inventory', offer };
    }

    const character = await db.query(
      `SELECT anime, rarity, emoji, color, description, traits, image
       FROM anime_character_collection WHERE guild_id=$1 AND user_id=$2 AND character_name=$3`,
      [guildId, offer.from_user_id, found.rows[0].character_name]
    );
    const c = character.rows[0];
    if (!c) throw new Error('Trade character metadata is missing');
    await db.query(
      'UPDATE anime_character_collection SET quantity=quantity-$4,last_obtained_at=NOW() WHERE guild_id=$1 AND user_id=$2 AND character_name=$3',
      [guildId, offer.from_user_id, found.rows[0].character_name, Number(offer.amount)]
    );
    await db.query(
      `INSERT INTO anime_character_collection
       (guild_id,user_id,character_name,anime,rarity,emoji,color,description,traits,image,quantity)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT(guild_id,user_id,character_name) DO UPDATE SET
       quantity=anime_character_collection.quantity+EXCLUDED.quantity,last_obtained_at=NOW()`,
      [guildId, offer.to_user_id, found.rows[0].character_name, c.anime, c.rarity, c.emoji, c.color, c.description, c.traits, c.image, Number(offer.amount)]
    );
    await db.query("UPDATE trade_offers SET status='accepted',resolved_at=NOW() WHERE offer_id=$1", [offerId]);
    await db.query('COMMIT');
    return { status: 'accepted', offer, characterName: found.rows[0].character_name };
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    db.release();
  }
}
