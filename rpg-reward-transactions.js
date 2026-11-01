import { recordJournalEntry } from './gameplay-journal.js';

async function rollback(db) {
  await db.query('ROLLBACK').catch(() => {});
}

export async function claimSoloBossReward(dbPool, {
  guildId, userId, battleId, hp, mana, coins, xp, bonusLoot, craftingMaterial, journalBossKey, spellUsed
}) {
  const db = await dbPool.connect();
  try {
    await db.query('BEGIN');
    const claim = await db.query(
      `UPDATE users SET hp=$3, mana=$4, coins=coins+$5, xp=xp+$6, last_boss_battle_id=$7,
        boss_defeats=boss_defeats+1, last_boss_win_at=NOW(),
        stat_points=stat_points+GREATEST(0,(FLOOR(SQRT((xp+$6)::numeric / 100))::int + 1)-level),
        level=FLOOR(SQRT((xp+$6)::numeric / 100))::int + 1
       WHERE guild_id=$1 AND user_id=$2 AND last_boss_battle_id IS DISTINCT FROM $7
       RETURNING user_id`,
      [guildId, userId, hp, mana, coins, xp, battleId]
    );
    if (claim.rowCount !== 1) {
      await db.query('ROLLBACK');
      return { status: 'already_claimed' };
    }

    if (journalBossKey) await recordJournalEntry(db, guildId, userId, 'bosses', journalBossKey);
    let mastery = null;
    if (spellUsed) {
      const result = await db.query(
        `INSERT INTO spell_mastery (guild_id,user_id,spell_key,casts,mastery_level,updated_at)
         VALUES ($1,$2,$3,1,0,NOW())
         ON CONFLICT (guild_id,user_id,spell_key) DO UPDATE
         SET casts=spell_mastery.casts+1,
             mastery_level=LEAST(10,FLOOR((spell_mastery.casts+1)/10.0)::int),
             updated_at=NOW()
         RETURNING casts,mastery_level`,
        [guildId, userId, spellUsed]
      );
      mastery = result.rows[0];
    }

    for (const itemKey of ['💎 Mana Kristali', bonusLoot, craftingMaterial].filter(Boolean)) {
      await db.query(
        `INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,$3,1)
         ON CONFLICT(guild_id,user_id,item_key) DO UPDATE SET quantity=inventory.quantity+1`,
        [guildId, userId, itemKey]
      );
    }
    await db.query('COMMIT');
    return { status: 'claimed', mastery };
  } catch (error) {
    await rollback(db);
    throw error;
  } finally {
    db.release();
  }
}

export async function settleRaidRewards(dbPool, {
  guildId, encounterId, ids, fighters, persistedHpNow, persistedManaNow,
  win, xpReward, coinReward, loot, spellCasts
}) {
  const db = await dbPool.connect();
  try {
    await db.query('BEGIN');
    const lockedRows = await db.query(
      'SELECT user_id,last_boss_at,xp,level FROM users WHERE guild_id=$1 AND user_id=ANY($2::text[]) ORDER BY user_id FOR UPDATE',
      [guildId, ids]
    );
    const active = await db.query(
      "SELECT user_id FROM active_rpg_encounters WHERE guild_id=$1 AND user_id=ANY($2::text[]) AND encounter_id=$3 AND encounter_type='raid' AND expires_at > NOW() FOR UPDATE",
      [guildId, ids, encounterId]
    );
    if (active.rowCount !== ids.length) {
      await db.query('ROLLBACK');
      return { status: 'reservation_missing' };
    }
    const concurrent = lockedRows.rows.find(p => p.last_boss_at && Date.now() - new Date(p.last_boss_at).getTime() < 45 * 60_000);
    if (concurrent) {
      const minutes = Math.ceil((45 * 60_000 - (Date.now() - new Date(concurrent.last_boss_at).getTime())) / 60_000);
      await db.query('ROLLBACK');
      return { status: 'cooldown', userId: concurrent.user_id, minutes };
    }

    const masteryResults = [];
    for (const [userId, casts] of spellCasts) {
      const result = await db.query(
        `INSERT INTO spell_mastery (guild_id,user_id,spell_key,casts,mastery_level,updated_at)
         VALUES ($1,$2,'zoltraak',$3::integer,LEAST(10,FLOOR($3::numeric/10.0)::int),NOW())
         ON CONFLICT (guild_id,user_id,spell_key) DO UPDATE
         SET casts=spell_mastery.casts+EXCLUDED.casts,
             mastery_level=LEAST(10,FLOOR((spell_mastery.casts+EXCLUDED.casts)/10.0)::int),
             updated_at=NOW()
         RETURNING casts,mastery_level`,
        [guildId, userId, casts]
      );
      masteryResults.push({ userId, ...result.rows[0] });
    }

    const progress = new Map(lockedRows.rows.map(row => [row.user_id, row]));
    for (let i = 0; i < fighters.length; i++) {
      const fighter = fighters[i];
      const current = progress.get(fighter.userId);
      if (!current) throw new Error(`Raid participant missing: ${fighter.userId}`);
      const newXp = Number(current.xp) + xpReward;
      const newLevel = Math.floor(Math.sqrt(newXp / 100)) + 1;
      await db.query(
        `UPDATE users SET hp=$3,xp=$4,level=$5,coins=coins+$6,
         stat_points=stat_points+$7,boss_defeats=boss_defeats+$8,last_boss_at=NOW(),mana=$9
         WHERE guild_id=$1 AND user_id=$2`,
        [guildId, fighter.userId, persistedHpNow[i], newXp, newLevel,
          coinReward, Math.max(0, newLevel - Number(current.level)), win ? 1 : 0, persistedManaNow[i]]
      );
      if (loot) await db.query(
        `INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,$3,1)
         ON CONFLICT(guild_id,user_id,item_key) DO UPDATE SET quantity=inventory.quantity+1`,
        [guildId, fighter.userId, loot]
      );
    }
    await db.query('DELETE FROM active_rpg_encounters WHERE guild_id=$1 AND encounter_id=$2', [guildId, encounterId]);
    await db.query('COMMIT');
    return { status: 'settled', masteryResults };
  } catch (error) {
    await rollback(db);
    throw error;
  } finally {
    db.release();
  }
}

export async function settleDungeonRewards(dbPool, {
  guildId, encounterId, ids, players, persistedHpNow, persistedManaNow,
  victory, totalXp, totalCoins, chestRewards, loot, craftingLoot, spellCasts, journalUserId
}) {
  const db = await dbPool.connect();
  try {
    await db.query('BEGIN');
    const lockedRows = await db.query(
      'SELECT user_id,last_dungeon_at,xp,level FROM users WHERE guild_id=$1 AND user_id=ANY($2::text[]) ORDER BY user_id FOR UPDATE',
      [guildId, ids]
    );
    const active = await db.query(
      "SELECT user_id FROM active_rpg_encounters WHERE guild_id=$1 AND user_id=ANY($2::text[]) AND encounter_id=$3 AND encounter_type='dungeon' AND expires_at > NOW() FOR UPDATE",
      [guildId, ids, encounterId]
    );
    if (active.rowCount !== ids.length) {
      await db.query('ROLLBACK');
      return { status: 'reservation_missing' };
    }
    const concurrent = lockedRows.rows.find(p => p.last_dungeon_at && Date.now() - new Date(p.last_dungeon_at).getTime() < 30 * 60_000);
    if (concurrent) {
      const minutes = Math.ceil((30 * 60_000 - (Date.now() - new Date(concurrent.last_dungeon_at).getTime())) / 60_000);
      await db.query('ROLLBACK');
      return { status: 'cooldown', userId: concurrent.user_id, minutes };
    }

    if (victory) await recordJournalEntry(db, guildId, journalUserId, 'discoveries', 'ancient-elf-sanctuary');
    const masteryResults = [];
    for (const [userId, casts] of spellCasts) {
      const result = await db.query(
        `INSERT INTO spell_mastery (guild_id,user_id,spell_key,casts,mastery_level,updated_at)
         VALUES ($1,$2,'zoltraak',$3,LEAST(10,FLOOR($3/10.0)::int),NOW())
         ON CONFLICT (guild_id,user_id,spell_key) DO UPDATE
         SET casts=spell_mastery.casts+EXCLUDED.casts,
             mastery_level=LEAST(10,FLOOR((spell_mastery.casts+EXCLUDED.casts)/10.0)::int),
             updated_at=NOW()
         RETURNING casts,mastery_level`,
        [guildId, userId, casts]
      );
      masteryResults.push({ userId, ...result.rows[0] });
    }

    const progress = new Map(lockedRows.rows.map(row => [row.user_id, row]));
    for (let i = 0; i < players.length; i++) {
      const player = players[i];
      const current = progress.get(player.user_id);
      if (!current) throw new Error(`Dungeon participant missing: ${player.user_id}`);
      const newXp = Number(current.xp) + totalXp;
      const newLevel = Math.floor(Math.sqrt(newXp / 100)) + 1;
      await db.query(
        `UPDATE users SET hp=$3, xp=$4, level=$5, coins=coins+$6,
           stat_points=stat_points+$7, dungeon_wins=dungeon_wins+$8,
           dungeon_runs=dungeon_runs+1, last_dungeon_at=NOW(), mana=$9
         WHERE guild_id=$1 AND user_id=$2`,
        [guildId, player.user_id, persistedHpNow[i], newXp, newLevel, totalCoins,
          Math.max(0, newLevel - Number(current.level)), victory ? 1 : 0, persistedManaNow[i]]
      );
      for (const itemKey of [...chestRewards, ...(loot ? [loot] : []), ...(craftingLoot ? [craftingLoot] : [])]) {
        await db.query(
          `INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,$3,1)
           ON CONFLICT(guild_id,user_id,item_key) DO UPDATE SET quantity=inventory.quantity+1`,
          [guildId, player.user_id, itemKey]
        );
      }
    }
    await db.query('DELETE FROM active_rpg_encounters WHERE guild_id=$1 AND encounter_id=$2', [guildId, encounterId]);
    await db.query('COMMIT');
    return { status: 'settled', masteryResults };
  } catch (error) {
    await rollback(db);
    throw error;
  } finally {
    db.release();
  }
}
