import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initDatabase, pool, ensureUser } from '../database/db.js';
import { ensureAdventurerPlatformTables } from '../adventurer-platform.js';
import { ensurePlayerMarketTables } from '../player-market.js';
import {
  ensureAccountCenterSchema, createSupportTicket, replySupportTicketFromOwner,
  updateSupportTicketStatusFromOwner, exportSiteAccountData, deleteSiteAccount
} from '../account-center.js';

function assertIsolatedAuditDatabase() {
  const url = new URL(process.env.DATABASE_URL || '');
  if (!['localhost','127.0.0.1','::1'].includes(url.hostname) || url.pathname !== '/frieren_audit') {
    throw new Error('Account-center integration tests require isolated local frieren_audit PostgreSQL.');
  }
}
function makeIds(prefix, count) {
  const seed = BigInt(parseInt(randomUUID().replaceAll('-','').slice(0,8),16));
  return Array.from({length:count},(_,i)=>String(BigInt(prefix)+seed*100n+BigInt(i+1)).slice(0,17));
}

test('account export includes linked game and support data while excluding secrets; deletion removes portal data but preserves Discord RPG data', async () => {
  assertIsolatedAuditDatabase();
  await initDatabase();
  await ensureAdventurerPlatformTables(pool);
  await ensurePlayerMarketTables(pool);
  await ensureAccountCenterSchema(pool);

  const guildId='99000000000000130';
  const users=makeIds('74000000000000000',2);
  const [ownerUser,buyerUser]=users;
  const accountUuid=randomUUID();
  const accountId='site_'+accountUuid;
  let listingId,ticketId;
  try {
    for(const userId of users) await ensureUser(guildId,userId);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS frieren_site_accounts(
        id UUID PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        email_verified_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS site_profile_preferences(
        account_id UUID PRIMARY KEY,
        theme TEXT NOT NULL,
        profile_visibility TEXT NOT NULL,
        access_token_hash TEXT
      );
      CREATE TABLE IF NOT EXISTS owner_audit_records(
        account_id UUID NOT NULL,
        action TEXT NOT NULL
      );
    `);
    await pool.query(
      "INSERT INTO frieren_site_accounts(id,username,email,password_hash,email_verified_at) VALUES($1,$2,$3,'test-hash',NOW())",
      [accountUuid,'audit_'+accountUuid.slice(0,8),accountUuid.slice(0,8)+'@example.invalid']
    );
    await pool.query("INSERT INTO site_discord_links(account_id,guild_id,user_id) VALUES($1,$2,$3)",[accountUuid,guildId,ownerUser]);
    await pool.query("INSERT INTO site_profile_preferences(account_id,theme,profile_visibility,access_token_hash) VALUES($1,'night','public','must-not-export')",[accountUuid]);
    await pool.query("INSERT INTO owner_audit_records(account_id,action) VALUES($1,'account-created')",[accountUuid]);
    await pool.query("INSERT INTO users(guild_id,user_id,character_name,coins) VALUES($1,$2,'Exported Fern',1234) ON CONFLICT(guild_id,user_id) DO UPDATE SET character_name=EXCLUDED.character_name,coins=EXCLUDED.coins",[guildId,ownerUser]);
    await pool.query("INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,'export_relic',2)",[guildId,ownerUser]);
    await pool.query("INSERT INTO anime_character_collection(guild_id,user_id,character_name,anime,rarity,quantity) VALUES($1,$2,'Fern','Frieren','legendary',1)",[guildId,ownerUser]);
    await pool.query("INSERT INTO achievement_claims(guild_id,user_id,achievement_key) VALUES($1,$2,'export_test_achievement')",[guildId,ownerUser]);

    listingId=randomUUID();
    await pool.query("INSERT INTO player_market_listings(listing_id,guild_id,seller_id,item_key,quantity,price_coins) VALUES($1,$2,$3,'export_relic',1,250)",[listingId,guildId,ownerUser]);
    await pool.query("INSERT INTO player_market_offers(offer_id,listing_id,guild_id,buyer_id,offer_coins) VALUES($1,$2,$3,$4,200)",[randomUUID(),listingId,guildId,buyerUser]);

    const ticket=await createSupportTicket(pool,accountId,{category:'account',subject:'Dışa aktarma testi',message:'Hesap verilerimin dışa aktarım kapsamını doğrula.'});
    assert.equal(ticket.status,'created');
    ticketId=ticket.ticket.ticket_id;
    assert.equal((await replySupportTicketFromOwner(pool,ticketId,'1553794496234262641','Destek yanıtı kaydedildi.')).status,'replied');
    assert.equal((await updateSupportTicketStatusFromOwner(pool,ticketId,'1553794496234262641','in_progress')).status,'updated');

    const exported=await exportSiteAccountData(pool,accountId);
    assert.equal(exported.account.username.startsWith('audit_'),true);
    assert.equal(exported.linkedProfiles.length,1);
    assert.equal(exported.linkedProfiles[0].inventory.find(row=>row.item_key==='export_relic').quantity,2);
    assert.equal(exported.linkedProfiles[0].collections.find(row=>row.character_name==='Fern').quantity,1);
    assert.equal(exported.linkedProfiles[0].achievements.some(row=>row.achievement_key==='export_test_achievement'),true);
    assert.equal(exported.linkedProfiles[0].marketHistory.length,1);
    assert.equal(exported.linkedProfiles[0].marketOffers.length,1);
    assert.equal(exported.accountData.site_profile_preferences[0].theme,'night');
    assert.equal(Object.hasOwn(exported.accountData.site_profile_preferences[0],'access_token_hash'),false);
    assert.equal(exported.supportTickets.length,1);
    assert.equal(exported.supportTickets[0].replies.length,1);
    assert.equal(exported.supportTickets[0].statusHistory.length,3);
    assert.match(exported.deletionScope,/Discord-owned RPG profiles and guild game records remain intact/);

    assert.equal((await deleteSiteAccount(pool,accountId,'wrong confirmation')).status,'confirmation_required');
    assert.equal((await pool.query('SELECT 1 FROM frieren_site_accounts WHERE id=$1',[accountUuid])).rowCount,1);
    const deletion=await deleteSiteAccount(pool,accountId,'HESABIMI SIL');
    assert.equal(deletion.status,'deleted');
    assert.equal(deletion.discordGameDataPreserved,true);
    assert.equal((await pool.query('SELECT 1 FROM frieren_site_accounts WHERE id=$1',[accountUuid])).rowCount,0);
    assert.equal((await pool.query('SELECT 1 FROM site_discord_links WHERE account_id=$1',[accountUuid])).rowCount,0);
    assert.equal((await pool.query('SELECT 1 FROM site_profile_preferences WHERE account_id=$1',[accountUuid])).rowCount,0);
    assert.equal((await pool.query('SELECT 1 FROM frieren_support_tickets WHERE account_id=$1',[accountUuid])).rowCount,0);
    assert.equal((await pool.query('SELECT 1 FROM frieren_support_ticket_messages WHERE ticket_id=$1',[ticketId])).rowCount,0);
    assert.equal((await pool.query('SELECT 1 FROM frieren_support_ticket_events WHERE ticket_id=$1',[ticketId])).rowCount,0);
    assert.equal((await pool.query('SELECT 1 FROM owner_audit_records WHERE account_id=$1',[accountUuid])).rowCount,1);
    assert.equal((await pool.query('SELECT 1 FROM users WHERE guild_id=$1 AND user_id=$2',[guildId,ownerUser])).rowCount,1);
    assert.equal((await pool.query("SELECT 1 FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key='export_relic'",[guildId,ownerUser])).rowCount,1);
    assert.equal((await pool.query("SELECT 1 FROM anime_character_collection WHERE guild_id=$1 AND user_id=$2 AND character_name='Fern'",[guildId,ownerUser])).rowCount,1);
    assert.equal((await pool.query("SELECT 1 FROM achievement_claims WHERE guild_id=$1 AND user_id=$2 AND achievement_key='export_test_achievement'",[guildId,ownerUser])).rowCount,1);
    assert.equal((await pool.query('SELECT 1 FROM player_market_listings WHERE listing_id=$1',[listingId])).rowCount,1);
  } finally {
    await pool.query('DELETE FROM owner_audit_records WHERE account_id=$1',[accountUuid]);
    await pool.query('DELETE FROM frieren_support_tickets WHERE account_id=$1',[accountUuid]);
    await pool.query('DELETE FROM frieren_site_accounts WHERE id=$1',[accountUuid]);
    await pool.query('DELETE FROM site_profile_preferences WHERE account_id=$1',[accountUuid]);
    await pool.query('DELETE FROM users WHERE guild_id=$1 AND user_id=ANY($2::text[])',[guildId,users]);
  }
});

test.after(async()=>{await pool.end();});
