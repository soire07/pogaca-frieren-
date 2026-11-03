import test from 'node:test';
import assert from 'node:assert/strict';
import { createArenaState, getArenaCurrentPlayer, resolveArenaTurn } from '../arena-engine.js';

const teamA = ['10000000000000001','10000000000000002','10000000000000003'].map((userId, i) => ({
  userId, name: 'A' + i, hp: 100, maxHp: 100, mana: 100, maxMana: 100, attack: 40, defense: 10
}));
const teamB = ['20000000000000001','20000000000000002','20000000000000003'].map((userId, i) => ({
  userId, name: 'B' + i, hp: 100, maxHp: 100, mana: 100, maxMana: 100, attack: 30, defense: 10
}));
const create = () => createArenaState({ matchId: 'arena-test-0001', teamA, teamB });

test('3v3 state requires six unique valid players in two complete teams', () => {
  assert.equal(create().players.length, 6);
  assert.throws(() => createArenaState({ matchId: 'arena-test-0001', teamA: teamA.slice(0, 2), teamB }), /ARENA_REQUIRES_TWO_FULL_TEAMS/);
  assert.throws(() => createArenaState({ matchId: 'arena-test-0001', teamA, teamB: teamA }), /ARENA_DUPLICATE_PLAYER/);
});

test('arena rejects malformed match identifiers and unsafe player stats', () => {
  assert.throws(() => createArenaState({ matchId: 'bad', teamA, teamB }), /ARENA_MATCH_ID_INVALID/);
  assert.throws(() => createArenaState({ matchId: 'arena-test-0001', teamA: teamA.map((p, i) => i ? p : { ...p, hp: -1 }), teamB }), /ARENA_HP_INVALID/);
  assert.throws(() => createArenaState({ matchId: 'arena-test-0001', teamA: teamA.map((p, i) => i ? p : { ...p, hp: 101 }), teamB }), /ARENA_CURRENT_RESOURCE_EXCEEDS_MAXIMUM/);
});

test('turn ownership is enforced and a normal attack advances to the next living player', () => {
  const state = create();
  assert.equal(getArenaCurrentPlayer(state).userId, teamA[0].userId);
  assert.throws(() => resolveArenaTurn(state, { actorId: teamA[1].userId }), /ARENA_NOT_YOUR_TURN/);
  const result = resolveArenaTurn(state, { actorId: teamA[0].userId, targetId: teamB[0].userId });
  assert.equal(result.event.damage, 37);
  assert.equal(result.state.players[3].hp, 63);
  assert.equal(result.state.turnIndex, 1);
});

test('friendly fire, missing targets and invalid actions are rejected without mutating input', () => {
  const state = create();
  assert.throws(() => resolveArenaTurn(state, { actorId: teamA[0].userId, targetId: teamA[1].userId }), /ARENA_TARGET_INVALID/);
  assert.throws(() => resolveArenaTurn(state, { actorId: teamA[0].userId, targetId: '20000000000000001', action: 'delete' }), /ARENA_ACTION_INVALID/);
  assert.equal(state.players[3].hp, 100);
});

test('guard reduces the next incoming hit and is consumed exactly once', () => {
  let state = create();
  state = resolveArenaTurn(state, { actorId: teamA[0].userId, action: 'guard' }).state;
  state = resolveArenaTurn(state, { actorId: teamA[1].userId, targetId: teamB[0].userId }).state;
  state = resolveArenaTurn(state, { actorId: teamA[2].userId, targetId: teamB[0].userId }).state;
  state = resolveArenaTurn(state, { actorId: teamB[0].userId, targetId: teamA[0].userId }).state;
  assert.equal(state.players[0].hp, 86);
  assert.equal(state.players[0].guarding, false);
});

test('spell consumes mana and deals boosted damage; insufficient mana is rejected', () => {
  const state = create();
  const result = resolveArenaTurn(state, { actorId: teamA[0].userId, action: 'spell', targetId: teamB[0].userId });
  assert.equal(result.event.damage, 57);
  assert.equal(result.state.players[0].mana, 80);
  const exhausted = { ...state, players: state.players.map((p, i) => i ? p : { ...p, mana: 0 }) };
  assert.throws(() => resolveArenaTurn(exhausted, { actorId: teamA[0].userId, action: 'spell', targetId: teamB[0].userId }), /ARENA_INSUFFICIENT_MANA/);
});

test('defeated players are skipped and a team is declared winner only after all opponents fall', () => {
  let state = create();
  state.players = state.players.map((p, i) => i >= 3 ? { ...p, hp: 1 } : p);
  const first = resolveArenaTurn(state, { actorId: teamA[0].userId, targetId: teamB[0].userId });
  assert.equal(first.state.players[3].alive, false);
  assert.equal(first.state.turnIndex, 1);
  let next = resolveArenaTurn(first.state, { actorId: teamA[1].userId, targetId: teamB[1].userId });
  next = resolveArenaTurn(next.state, { actorId: teamA[2].userId, targetId: teamB[2].userId });
  assert.equal(next.state.status, 'finished');
  assert.equal(next.state.winner, 'A');
});

