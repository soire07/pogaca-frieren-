/** Persistent, idempotent collection tracking for the adventure journal. */
export async function recordJournalEntry(db, guildId, userId, collectionKey, entryKey) {
  if (!guildId || !userId || !collectionKey || !entryKey) return false;
  const result = await db.query(
    `INSERT INTO adventure_journal_entries(guild_id,user_id,collection_key,entry_key)
     VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
    [guildId, userId, collectionKey, entryKey]
  );
  return result.rowCount > 0;
}

export async function claimJournalCollection(db, guildId, userId, collectionKey, reward) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const claim = await client.query(
      `INSERT INTO adventure_journal_collection_claims(guild_id,user_id,collection_key)
       VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING collection_key`,
      [guildId, userId, collectionKey]
    );
    if (!claim.rowCount) {
      await client.query('ROLLBACK');
      return false;
    }
    await client.query(
      `UPDATE users
       SET coins=coins+$3,
           xp=xp+$4,
           stat_points=stat_points+GREATEST(0,(FLOOR(SQRT((xp+$4)::numeric / 100))::int + 1)-level),
           level=FLOOR(SQRT((xp+$4)::numeric / 100))::int + 1
       WHERE guild_id=$1 AND user_id=$2`,
      [guildId, userId, reward.coins, reward.xp]
    );
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function getJournalEntries(db, guildId, userId) {
  const { rows } = await db.query(
    `SELECT collection_key,entry_key FROM adventure_journal_entries
     WHERE guild_id=$1 AND user_id=$2 ORDER BY collection_key,entry_key`,
    [guildId, userId]
  );
  return rows;
}

export async function getClaimedJournalCollections(db, guildId, userId) {
  const { rows } = await db.query(
    `SELECT collection_key FROM adventure_journal_collection_claims
     WHERE guild_id=$1 AND user_id=$2`,
    [guildId, userId]
  );
  return new Set(rows.map(row => row.collection_key));
}
