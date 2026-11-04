import test from 'node:test';
import assert from 'node:assert/strict';
import { randomInt } from 'node:crypto';
import { pool, withIsolatedTestSchema } from '../database/db.js';
import { ensureGuildGameTables, startGuildMiniGame, answerGuildMiniGame, getGuildGameLeaderboard } from '../guild-games.js';

const dedicatedAuditDatabase = /^postgres(?:ql)?:\/\/postgres:postgres@localhost:5432\/frieren_audit(?:\?|$)/.test(process.env.DATABASE_URL || '');
function snowflake(prefix) { return prefix + String(randomInt(0,281_474_976_710_655)).padStart(15,'0'); }

test('guild mini-games persist scores once, isolate guild/channel and reject expired answers', {
  skip: !dedicatedAuditDatabase && 'Requires the disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    await ensureGuildGameTables(pool);
    const guildId = snowflake('91');
    const otherGuildId = snowflake('92');
    const channelId = snowflake('93');
    const otherChannelId = snowflake('94');
    const creatorId = snowflake('90');
    const playerId = snowflake('89');
    const secondPlayerId = snowflake('88');

    const session = await startGuildMiniGame(pool, {
      guildId, channelId, userId: creatorId, gameType: 'bilgi',
      random: () => 0, now: new Date('2026-11-04T12:00:00.000Z')
    });
    assert.equal(session.options.length,4);
    const overlap = await startGuildMiniGame(pool, { guildId, channelId, userId:creatorId, gameType:'kelime', random:()=>0, now:new Date('2026-11-04T12:00:01.000Z') });
    assert.equal(overlap.status,'channel_active','a channel must not host overlapping active rounds');
    const correctIndex = session.answerIndex;

    const duplicateAttempts = await Promise.all(Array.from({length:8},()=>answerGuildMiniGame(pool,{
      guildId,channelId,sessionId:session.session_id,userId:playerId,answerIndex:correctIndex,
      now:new Date('2026-11-04T12:00:10.000Z')
    })));
    assert.equal(duplicateAttempts.filter(result=>result.status==='correct').length,1);
    assert.equal(duplicateAttempts.filter(result=>result.status==='already_answered').length,7);

    const wrong = await answerGuildMiniGame(pool,{
      guildId,channelId,sessionId:session.session_id,userId:secondPlayerId,answerIndex:(correctIndex+1)%4,
      now:new Date('2026-11-04T12:00:11.000Z')
    });
    assert.equal(wrong.status,'incorrect');
    const secondTry = await answerGuildMiniGame(pool,{
      guildId,channelId,sessionId:session.session_id,userId:secondPlayerId,answerIndex:correctIndex,
      now:new Date('2026-11-04T12:00:12.000Z')
    });
    assert.equal(secondTry.status,'already_answered');

    const crossChannel = await answerGuildMiniGame(pool,{
      guildId,channelId:otherChannelId,sessionId:session.session_id,userId:snowflake('87'),answerIndex:correctIndex
    });
    assert.equal(crossChannel.status,'not_found');
    const crossGuild = await answerGuildMiniGame(pool,{
      guildId:otherGuildId,channelId,sessionId:session.session_id,userId:snowflake('86'),answerIndex:correctIndex
    });
    assert.equal(crossGuild.status,'not_found');

    const board = await getGuildGameLeaderboard(pool,guildId,10);
    assert.equal(board.length,2);
    assert.equal(Number(board.find(row=>row.user_id===playerId).points),10);
    assert.equal(Number(board.find(row=>row.user_id===secondPlayerId).points),0);
    assert.deepEqual(await getGuildGameLeaderboard(pool,otherGuildId,10),[]);

    const expired = await answerGuildMiniGame(pool,{
      guildId,channelId,sessionId:session.session_id,userId:snowflake('85'),answerIndex:correctIndex,
      now:new Date('2026-11-04T12:02:00.000Z')
    });
    assert.equal(expired.status,'expired');
    const nextSession = await startGuildMiniGame(pool,{guildId,channelId,userId:creatorId,gameType:'hafiza',random:()=>0,now:new Date('2026-11-04T12:02:01.000Z')});
    assert.ok(nextSession.session_id,'expired channel sessions must not block the next round');
    assert.equal(nextSession.status,undefined);
  });
});

test.after(async()=>{await pool.end();});
