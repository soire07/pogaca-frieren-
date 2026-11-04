const SNOWFLAKE = /^\d{17,20}$/;
const MAX_STAT = 500;
const MAX_HP = 2000;
const MAX_MANA = 2000;
export const ARENA_ELEMENTS = Object.freeze(['fire','ice','lightning','light','dark','neutral']);
const ELEMENT_ADVANTAGE = Object.freeze({fire:'ice',ice:'lightning',lightning:'fire',light:'dark',dark:'light'});

export function getArenaElementEffect(attackerElement,targetElement) {
  const attacker=ARENA_ELEMENTS.includes(attackerElement)?attackerElement:'neutral';
  const target=ARENA_ELEMENTS.includes(targetElement)?targetElement:'neutral';
  if(attacker==='neutral'||target==='neutral'||attacker===target)return {multiplier:1,effect:'neutral'};
  if(ELEMENT_ADVANTAGE[attacker]===target)return {multiplier:1.25,effect:'advantage'};
  if(ELEMENT_ADVANTAGE[target]===attacker)return {multiplier:0.8,effect:'disadvantage'};
  return {multiplier:1,effect:'neutral'};
}

function safeInteger(value, min, max, code) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) throw new Error(code);
  return number;
}

function normalizePlayer(player, team, slot) {
  const userId = String(player?.userId || '');
  if (!SNOWFLAKE.test(userId)) throw new Error('ARENA_PLAYER_ID_INVALID');
  return {
    userId,
    team,
    slot,
    name: String(player.name || 'Maceracı').slice(0, 32),
    hp: safeInteger(player.hp, 1, MAX_HP, 'ARENA_HP_INVALID'),
    maxHp: safeInteger(player.maxHp ?? player.hp, 1, MAX_HP, 'ARENA_MAX_HP_INVALID'),
    mana: safeInteger(player.mana ?? 100, 0, MAX_MANA, 'ARENA_MANA_INVALID'),
    maxMana: safeInteger(player.maxMana ?? player.mana ?? 100, 1, MAX_MANA, 'ARENA_MAX_MANA_INVALID'),
    attack: safeInteger(player.attack ?? 10, 1, MAX_STAT, 'ARENA_ATTACK_INVALID'),
    defense: safeInteger(player.defense ?? 0, 0, MAX_STAT, 'ARENA_DEFENSE_INVALID'),
    element: ARENA_ELEMENTS.includes(player.element)?player.element:'neutral',
    guarding: false,
    alive: true
  };
}

export function createArenaState({ matchId, teamA, teamB, mode = '3v3', createdAt = new Date().toISOString() }) {
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(String(matchId || ''))) throw new Error('ARENA_MATCH_ID_INVALID');
  if (!['1v1','3v3'].includes(mode)) throw new Error('ARENA_MODE_INVALID');
  const teamSize = mode === '1v1' ? 1 : 3;
  if (!Array.isArray(teamA) || !Array.isArray(teamB) || teamA.length !== teamSize || teamB.length !== teamSize) {
    throw new Error(mode === '1v1' ? 'ARENA_REQUIRES_TWO_PLAYERS' : 'ARENA_REQUIRES_TWO_FULL_TEAMS');
  }
  const players = [
    ...teamA.map((player, slot) => normalizePlayer(player, 'A', slot)),
    ...teamB.map((player, slot) => normalizePlayer(player, 'B', slot))
  ];
  if (new Set(players.map(player => player.userId)).size !== teamSize * 2) throw new Error('ARENA_DUPLICATE_PLAYER');
  if (players.some(player => player.hp > player.maxHp || player.mana > player.maxMana)) {
    throw new Error('ARENA_CURRENT_RESOURCE_EXCEEDS_MAXIMUM');
  }
  return {
    matchId: String(matchId),
    mode,
    status: 'active',
    round: 1,
    turnIndex: 0,
    players,
    winner: null,
    createdAt: new Date(createdAt).toISOString(),
    updatedAt: new Date(createdAt).toISOString(),
    turnCount: 0
  };
}

function nextLivingTurn(players, currentIndex) {
  for (let offset = 1; offset <= players.length; offset++) {
    const index = (currentIndex + offset) % players.length;
    if (players[index].alive) return index;
  }
  return -1;
}

export function resolveArenaTurn(state, { actorId, action = 'attack', targetId, now = new Date().toISOString() }) {
  const expectedPlayers = state?.mode === '1v1' ? 2 : 6;
  if (!state || state.status !== 'active' || !Array.isArray(state.players) || state.players.length !== expectedPlayers) {
    throw new Error('ARENA_MATCH_NOT_ACTIVE');
  }
  const players = state.players.map(player => ({ ...player }));
  const actor = players[state.turnIndex];
  if (!actor || actor.userId !== String(actorId) || !actor.alive) throw new Error('ARENA_NOT_YOUR_TURN');
  if (!['attack', 'guard', 'spell'].includes(action)) throw new Error('ARENA_ACTION_INVALID');

  let event;
  if (action === 'guard') {
    actor.guarding = true;
    event = { type: 'guard', actorId: actor.userId, message: 'Savunma duruşu aldı.' };
  } else {
    const target = players.find(player => player.userId === String(targetId));
    if (!target || !target.alive || target.team === actor.team) throw new Error('ARENA_TARGET_INVALID');
    const manaCost = action === 'spell' ? 20 : 0;
    if (actor.mana < manaCost) throw new Error('ARENA_INSUFFICIENT_MANA');
    actor.mana -= manaCost;
    const baseDamage = action === 'spell' ? Math.floor(actor.attack * 1.5) : actor.attack;
    const mitigated = Math.max(1, Math.floor(baseDamage - target.defense * 0.35));
    const element = getArenaElementEffect(actor.element,target.element);
    const elementalDamage = Math.max(1,Math.floor(mitigated*element.multiplier));
    const damage = target.guarding ? Math.max(1, Math.ceil(elementalDamage * 0.5)) : elementalDamage;
    target.guarding = false;
    target.hp = Math.max(0, target.hp - damage);
    target.alive = target.hp > 0;
    event = { type: action, actorId: actor.userId, targetId: target.userId, damage, targetHp: target.hp, defeated: !target.alive, elementEffect: element.effect, elementMultiplier: element.multiplier };
  }

  const teamAAlive = players.some(player => player.team === 'A' && player.alive);
  const teamBAlive = players.some(player => player.team === 'B' && player.alive);
  const winner = teamAAlive && teamBAlive ? null : teamAAlive ? 'A' : teamBAlive ? 'B' : 'draw';
  const turnIndex = winner ? state.turnIndex : nextLivingTurn(players, state.turnIndex);
  const round = turnIndex <= state.turnIndex && !winner ? state.round + 1 : state.round;
  return {
    state: {
      ...state,
      players,
      status: winner ? 'finished' : 'active',
      winner,
      turnIndex: winner ? state.turnIndex : turnIndex,
      round,
      turnCount: state.turnCount + 1,
      updatedAt: new Date(now).toISOString()
    },
    event
  };
}

export function getArenaCurrentPlayer(state) {
  if (!state || state.status !== 'active' || !Array.isArray(state.players)) return null;
  return state.players[state.turnIndex] || null;
}
