import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initDatabase, pool, ensureUser } from '../database/db.js';
import { ensureAdventurerPlatformTables, ensureActiveArenaSeason } from '../adventurer-platform.js';
import { ensureArenaTables } from '../arena-queue.js';
import { ensurePlayerMarketTables } from '../player-market.js';
import { ensureSocialPlatformTables } from '../social-platform.js';
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
  await ensureArenaTables(pool);
  await ensureAdventurerPlatformTables(pool);
  await ensurePlayerMarketTables(pool);
  await ensureSocialPlatformTables(pool);
  await ensureAccountCenterSchema(pool);

  const guildId=makeIds('99000000000000000',1)[0];
  const users=makeIds('74000000000000000',2);
  const [ownerUser,buyerUser]=users;
  const accountUuid=randomUUID();
  const accountId='site_'+accountUuid;
  let listingId,ticketId,noteId,matchId,eventId,seasonId;
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
      CREATE TABLE IF NOT EXISTS site_profile_preference_details(
        detail_id UUID PRIMARY KEY,
        preference_id UUID NOT NULL REFERENCES site_profile_preferences(account_id) ON DELETE CASCADE,
        detail TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS account_export_fk_player_notes(
        note_id UUID PRIMARY KEY,
        guild_id TEXT NOT NULL,
        player_ref TEXT NOT NULL,
        note TEXT NOT NULL,
        FOREIGN KEY(guild_id,player_ref) REFERENCES users(guild_id,user_id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS account_export_fk_note_revisions(
        revision_id UUID PRIMARY KEY,
        note_id UUID NOT NULL REFERENCES account_export_fk_player_notes(note_id) ON DELETE CASCADE,
        body TEXT NOT NULL
      );
    `);
    await pool.query(
      "INSERT INTO frieren_site_accounts(id,username,email,password_hash,email_verified_at) VALUES($1,$2,$3,'test-hash',NOW())",
      [accountUuid,'audit_'+accountUuid.slice(0,8),accountUuid.slice(0,8)+'@example.invalid']
    );
    await pool.query("INSERT INTO site_discord_links(account_id,guild_id,user_id) VALUES($1,$2,$3)",[accountUuid,guildId,ownerUser]);
    await pool.query("INSERT INTO site_profile_preferences(account_id,theme,profile_visibility,access_token_hash) VALUES($1,'night','public','must-not-export')",[accountUuid]);
    await pool.query("INSERT INTO site_profile_preference_details(detail_id,preference_id,detail) VALUES($1,$2,'linked account preference detail')",[randomUUID(),accountUuid]);
    await pool.query("INSERT INTO owner_audit_records(account_id,action) VALUES($1,'account-created')",[accountUuid]);
    await pool.query("INSERT INTO users(guild_id,user_id,character_name,coins) VALUES($1,$2,'Exported Fern',1234) ON CONFLICT(guild_id,user_id) DO UPDATE SET character_name=EXCLUDED.character_name,coins=EXCLUDED.coins",[guildId,ownerUser]);
    await pool.query("INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,'export_relic',2)",[guildId,ownerUser]);
    await pool.query("INSERT INTO anime_character_collection(guild_id,user_id,character_name,anime,rarity,quantity) VALUES($1,$2,'Fern','Frieren','legendary',1)",[guildId,ownerUser]);
    await pool.query("INSERT INTO achievement_claims(guild_id,user_id,achievement_key) VALUES($1,$2,'export_test_achievement')",[guildId,ownerUser]);
    noteId=randomUUID();
    await pool.query("INSERT INTO account_export_fk_player_notes(note_id,guild_id,player_ref,note) VALUES($1,$2,$3,'user-linked note')",[noteId,guildId,ownerUser]);
    await pool.query("INSERT INTO account_export_fk_note_revisions(revision_id,note_id,body) VALUES($1,$2,'linked note revision')",[randomUUID(),noteId]);

    const season=await ensureActiveArenaSeason(pool,guildId);
    seasonId=season.season_id;
    matchId=randomUUID();
    await pool.query("INSERT INTO arena_matches(match_id,guild_id,status,state) VALUES($1,$2,'finished',$3::jsonb)",[matchId,guildId,JSON.stringify({status:'finished',winner:'A'})]);
    await pool.query("INSERT INTO arena_match_players(match_id,guild_id,user_id,team,slot,status) VALUES($1,$2,$3,'A',0,'finished'),($1,$2,$4,'B',0,'finished')",[matchId,guildId,ownerUser,buyerUser]);
    await pool.query("INSERT INTO arena_match_results(match_id,season_id,guild_id,winner,participants) VALUES($1,$2,$3,'A',$4::jsonb)",[matchId,seasonId,guildId,JSON.stringify([{userId:ownerUser,team:'A',name:'Exported Fern'},{userId:buyerUser,team:'B',name:'Other Player'}])]);

    eventId=randomUUID();
    await pool.query(
      "INSERT INTO guild_events(event_id,guild_id,title,description,event_type,starts_at,ends_at,status,created_by) VALUES($1,$2,'Export test event','Personal event export fixture','community',NOW()-INTERVAL '2 days',NOW()-INTERVAL '1 day','completed',$3)",
      [eventId,guildId,buyerUser]
    );
    await pool.query("INSERT INTO guild_event_participants(event_id,guild_id,user_id) VALUES($1,$2,$3)",[eventId,guildId,ownerUser]);

    const [lowUser,highUser]=[ownerUser,buyerUser].sort();
    await pool.query("INSERT INTO social_friend_requests(request_id,guild_id,requester_id,target_id,status) VALUES($1,$2,$3,$4,'accepted')",[randomUUID(),guildId,ownerUser,buyerUser]);
    await pool.query("INSERT INTO social_relationships(guild_id,user_low_id,user_high_id,relationship_type,created_by) VALUES($1,$2,$3,'friend',$4)",[guildId,lowUser,highUser,ownerUser]);
    await pool.query("INSERT INTO social_coin_gifts(gift_id,guild_id,sender_id,recipient_id,amount,note) VALUES($1,$2,$3,$4,25,'export test')",[randomUUID(),guildId,ownerUser,buyerUser]);
    await pool.query("INSERT INTO social_reputation_votes(guild_id,giver_id,recipient_id,week_start) VALUES($1,$2,$3,CURRENT_DATE)",[guildId,ownerUser,buyerUser]);

    listingId=randomUUID();
    await pool.query("INSERT INTO player_market_listings(listing_id,guild_id,seller_id,item_key,quantity,price_coins) VALUES($1,$2,$3,'export_relic',1,250)",[listingId,guildId,ownerUser]);
    await pool.query("INSERT INTO player_market_offers(offer_id,listing_id,guild_id,buyer_id,offer_coins) VALUES($1,$2,$3,$4,200)",[randomUUID(),listingId,guildId,buyerUser]);

    const ticket=await createSupportTicket(pool,accountId,{category:'account',subject:'Dışa aktarma testi',message:'Hesap verilerimin dışa aktarım kapsamını doğrula.'});
    assert.equal(ticket.status,'created');
    ticketId=ticket.ticket.ticket_id;
    assert.equal((await replySupportTicketFromOwner(pool,ticketId,'1553794496234262641','Destek yanıtı kaydedildi.')).status,'replied');
    assert.equal((await updateSupportTicketStatusFromOwner(pool,ticketId,'1553794496234262641','in_progress')).status,'updated');

    const exported=await exportSiteAccountData(pool,accountId);
    const excludedTablePattern='(auth|session|credential|token|secret|owner|support|oauth|audit|log|site_discord_links)';
    const userOwnedTables=await pool.query(
      "SELECT DISTINCT table_name FROM information_schema.columns WHERE table_schema=current_schema() AND column_name='user_id' AND table_name !~* $1 ORDER BY table_name",
      [excludedTablePattern]
    );
    const missingUserTables=userOwnedTables.rows.map(row=>row.table_name).filter(table=>!Object.hasOwn(exported.linkedProfiles[0].gameData,table));
    assert.deepEqual(missingUserTables,[],'every non-sensitive direct user_id table must be included in the linked profile export');
    const accountOwnedTables=await pool.query(
      "SELECT DISTINCT account_column.table_name FROM information_schema.columns account_column WHERE account_column.table_schema=current_schema() AND account_column.column_name='account_id' AND account_column.table_name !~* $1 AND NOT EXISTS (SELECT 1 FROM information_schema.columns user_column WHERE user_column.table_schema=account_column.table_schema AND user_column.table_name=account_column.table_name AND user_column.column_name='user_id') ORDER BY account_column.table_name",
      [excludedTablePattern]
    );
    const missingAccountTables=accountOwnedTables.rows.map(row=>row.table_name).filter(table=>!Object.hasOwn(exported.accountData,table));
    assert.deepEqual(missingAccountTables,[],'every non-sensitive direct account_id table must be included in accountData');
    assert.equal(exported.account.username.startsWith('audit_'),true);
    assert.equal(exported.linkedProfiles.length,1);
    assert.equal(exported.linkedProfiles[0].inventory.find(row=>row.item_key==='export_relic').quantity,2);
    assert.equal(exported.linkedProfiles[0].collections.find(row=>row.character_name==='Fern').quantity,1);
    assert.equal(exported.linkedProfiles[0].achievements.some(row=>row.achievement_key==='export_test_achievement'),true);
    assert.equal(exported.linkedProfiles[0].marketHistory.length,1);
    assert.equal(exported.linkedProfiles[0].marketOffers.length,1);
    assert.equal(exported.linkedProfiles[0].arenaMatchHistory.length,1,'the linked player match result must be exported through arena_match_players');
    assert.equal(exported.linkedProfiles[0].arenaMatchHistory[0].participants.length,1,'arena export must not expose other match participants');
    assert.equal(exported.linkedProfiles[0].arenaMatchHistory[0].participants[0].userId,ownerUser);
    assert.equal(exported.linkedProfiles[0].arenaMatchHistory[0].participants[0].name,'Exported Fern');
    assert.equal(exported.linkedProfiles[0].guildEventHistory.length,1,'the linked player event context must be exported');
    assert.equal(exported.linkedProfiles[0].guildEventHistory[0].title,'Export test event');
    assert.equal(Object.hasOwn(exported.linkedProfiles[0].guildEventHistory[0],'created_by'),false,'event export must not expose another user's creator identity');
    assert.equal(exported.linkedProfiles[0].gameData.social_friend_requests.length,1,'requester/target references must be exported');
    assert.equal(exported.linkedProfiles[0].gameData.social_relationships.length,1,'both sides of a social relationship must be exported');
    assert.equal(exported.linkedProfiles[0].gameData.social_coin_gifts.length,1,'sender/recipient gift records must be exported');
    assert.equal(exported.linkedProfiles[0].gameData.social_reputation_votes.length,1,'giver/recipient reputation records must be exported');
    assert.ok(exported.linkedProfiles[0].gameData.users?.some(row=>row.guild_id===guildId&&row.user_id===ownerUser),'the linked Discord user row must be present as the FK traversal root');
    const noteForeignKey=await pool.query(
      "SELECT child.relname AS child_table,parent.relname AS parent_table,"+
      "ARRAY_AGG(child_column.attname::text ORDER BY child_key.ordinality) AS child_columns,"+
      "ARRAY_AGG(parent_column.attname::text ORDER BY child_key.ordinality) AS parent_columns "+
      "FROM pg_constraint relation JOIN pg_class child ON child.oid=relation.conrelid "+
      "JOIN pg_namespace child_schema ON child_schema.oid=child.relnamespace "+
      "JOIN pg_class parent ON parent.oid=relation.confrelid JOIN pg_namespace parent_schema ON parent_schema.oid=parent.relnamespace "+
      "JOIN LATERAL unnest(relation.conkey) WITH ORDINALITY child_key(attnum,ordinality) ON TRUE "+
      "JOIN pg_attribute child_column ON child_column.attrelid=child.oid AND child_column.attnum=child_key.attnum "+
      "JOIN LATERAL unnest(relation.confkey) WITH ORDINALITY parent_key(attnum,ordinality) ON parent_key.ordinality=child_key.ordinality "+
      "JOIN pg_attribute parent_column ON parent_column.attrelid=parent.oid AND parent_column.attnum=parent_key.attnum "+
      "WHERE relation.contype='f' AND child_schema.nspname=current_schema() AND parent_schema.nspname=current_schema() "+
      "AND child.relname='account_export_fk_player_notes' GROUP BY child.relname,parent.relname,relation.oid"
    );
    assert.equal(noteForeignKey.rowCount,1,'the composite user foreign key must be visible to the export query');
    assert.deepEqual(noteForeignKey.rows[0].child_columns,['guild_id','player_ref']);
    assert.deepEqual(noteForeignKey.rows[0].parent_columns,['guild_id','user_id']);
    assert.deepEqual(noteForeignKey.rows[0].child_columns,['guild_id','player_ref']);
    assert.deepEqual(noteForeignKey.rows[0].parent_columns,['guild_id','user_id']);
    const directNote=await pool.query('SELECT 1 FROM account_export_fk_player_notes WHERE guild_id::text=$1 AND player_ref::text=$2',[guildId,ownerUser]);
    assert.equal(directNote.rowCount,1,'the child row must match the linked user composite key');
    assert.equal(exported.linkedProfiles[0].gameData.account_export_fk_player_notes.length,1,'composite foreign keys to a user must seed export even without a user_id-named column');
    assert.equal(exported.linkedProfiles[0].gameData.account_export_fk_note_revisions.length,1,'foreign-key descendants of user-linked rows must be exported');
    assert.equal(exported.accountData.site_profile_preference_details.length,1,'foreign-key descendants of account-owned rows must be exported');
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
    assert.equal((await pool.query('SELECT 1 FROM site_profile_preference_details WHERE preference_id=$1',[accountUuid])).rowCount,0,'account-owned descendants must cascade with the account preference');
    assert.equal((await pool.query('SELECT 1 FROM account_export_fk_player_notes WHERE note_id=$1',[noteId])).rowCount,1,'Discord-owned RPG records must remain after portal account deletion');
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
    if(matchId) await pool.query('DELETE FROM arena_matches WHERE match_id=$1',[matchId]);
    if(eventId) await pool.query('DELETE FROM guild_events WHERE event_id=$1',[eventId]);
    if(seasonId) await pool.query('DELETE FROM arena_seasons WHERE season_id=$1',[seasonId]);
    await pool.query('DELETE FROM owner_audit_records WHERE account_id=$1',[accountUuid]);
    await pool.query('DELETE FROM frieren_support_tickets WHERE account_id=$1',[accountUuid]);
    await pool.query('DELETE FROM frieren_site_accounts WHERE id=$1',[accountUuid]);
    await pool.query('DELETE FROM site_profile_preferences WHERE account_id=$1',[accountUuid]);
    await pool.query('DELETE FROM users WHERE guild_id=$1 AND user_id=ANY($2::text[])',[guildId,users]);
  }
});

test.after(async()=>{await pool.end();});
