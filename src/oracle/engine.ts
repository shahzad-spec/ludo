/**
 * The reducer — the orchestrator (plan §6.3).
 *
 * Pure: takes (state, action, rng) and returns { state, events }. No Zustand,
 * no React. Phase-gated: out-of-phase actions are rejected (state returned
 * unchanged, no events). The store wraps this and fans events to the bus.
 *
 * Action lifecycle:
 *   REQUEST_ROLL   (IDLE)            → roll, phase=ROLLING, emit DICE_ROLLED
 *   RESOLVE_ROLL   (ROLLING)         → compute validMoves; SELECTING_TOKEN or
 *                                       (no moves) pass turn + NO_LEGAL_MOVE
 *   REQUEST_MOVE   (SELECTING_TOKEN) → validate, phase=ANIMATING_MOVE
 *   RESOLVE_MOVE   (ANIMATING_MOVE)  → commit captures/turn/win, emit, back to IDLE
 *
 * The Director drives the resolve-* actions from GSAP onComplete callbacks,
 * which is what makes double-roll / move-during-animation impossible.
 */

import { BASE, FINISH } from './board/track';
import type { Action, GameState, Move, TurnRecord } from './types';
import type { GameEvent } from '../bus/events';
import { rollSet } from './rules/dice';
import { getLegalMoves } from './rules/legalMoves';
import { applyMove } from './rules/movement';
import { checkCaptures } from './rules/capture';
import { resolveTurn } from './rules/turns';
import { checkWin, isGameOver } from './rules/win';

export interface ApplyResult {
  state: GameState;
  events: GameEvent[];
}

/** Reject an action: return state unchanged with no events. */
function reject(state: GameState): ApplyResult {
  return { state, events: [] };
}

/** The cleared dice object (turn over / game over). A1: value alias is null. */
function clearedDice(): GameState['dice'] {
  return { queue: [], rolledSet: [], value: null, rolled: false, capturedInSet: false, activeDie: null };
}

/** Legal-move groups per DISTINCT remaining die, in queue (descending) order. */
function dieMoveGroups(state: GameState): { die: number; moves: Move[] }[] {
  const groups: { die: number; moves: Move[] }[] = [];
  for (const die of state.dice.queue) {
    if (groups.some((g) => g.die === die)) continue; // same-value dice share moves
    groups.push({ die, moves: getLegalMoves(state, die) });
  }
  return groups;
}

/**
 * Present the union of legal moves across ALL remaining dice (A3.1), or burn
 * out when nothing is playable. LAZY burn: a die with no moves of its own
 * stays in the queue while other dice have moves (Decision 8 preserved — a
 * dead-looking die may become playable after another die moves); ALL remaining
 * dice burn (DIE_BURNED, k>1 only) when nothing is playable at all. At
 * diceCount 1 this reduces exactly to the v1 behavior (no events on burn).
 */
function presentRemainingDice(state: GameState, events: GameEvent[]): GameState {
  const playable = dieMoveGroups(state).filter((g) => g.moves.length > 0);
  if (playable.length > 0) {
    return patch(state, {
      phase: 'SELECTING_TOKEN',
      validMoves: playable.flatMap((g) => g.moves),
    });
  }
  for (const die of state.dice.queue) {
    if (state.rules.diceCount > 1) {
      events.push({ type: 'DIE_BURNED', player: state.currentPlayer, value: die });
    }
  }
  return patch(state, { dice: { ...state.dice, queue: [], value: null, activeDie: null } });
}

/** Shallow clone with overridden fields (immutable updates). */
function patch(state: GameState, overrides: Partial<GameState>): GameState {
  return { ...state, ...overrides };
}

// ---------- Individual action handlers ----------

function handleRequestRoll(state: GameState, rng: () => number): ApplyResult {
  if (state.phase !== 'IDLE') return reject(state);
  if (isGameOver(state)) return reject(state);

  const set = rollSet(rng, state.rules.diceCount);
  // A1 Decision 14 (A3.1-revised): the queue is DESCENDING — the bots' default
  // play order and tie-break. Humans choose freely (REQUEST_MOVE dieValue).
  // rolledSet keeps draw order for UI/history; value aliases queue[0].
  const queue = [...set].sort((a, b) => b - a);
  const next = patch(state, {
    dice: { queue, rolledSet: set, value: queue[0], rolled: true, capturedInSet: false, activeDie: null },
    phase: 'ROLLING',
  });
  return {
    state: next,
    events: [{ type: 'DICE_ROLLED', player: state.currentPlayer, values: set, value: queue[0] }],
  };
}

/**
 * Infer the die a Move consumes (A3.1 helper for bots/tools/search, where a
 * chosen Move must be re-expressed as REQUEST_MOVE {tokenId, dieValue}).
 * Non-entry: the progress delta. Entry: any entry-eligible die is
 * effect-identical — default to the LARGEST eligible in the queue (descending
 * default). Returns null when no eligible die remains.
 */
export function inferDieValue(state: GameState, move: Move): number | null {
  const token = state.tokens[move.tokenIds[0]];
  if (!token) return null;
  if (move.isEnteringBoard) {
    const eligible = (d: number): boolean => {
      if (state.rules.entryRoll === 'any') return true;
      if (state.rules.entryRoll === 'sixOrOne') return d === 6 || d === 1;
      return d === 6; // 'six'
    };
    let best: number | null = null;
    for (const d of state.dice.queue) {
      if (eligible(d) && (best === null || d > best)) best = d;
    }
    return best;
  }
  return move.finalProgress - token.progress;
}

function handleResolveRoll(state: GameState, _value: number): ApplyResult {
  if (state.phase !== 'ROLLING') return reject(state);

  const events: GameEvent[] = [];
  const presented = presentRemainingDice(state, events);
  if (presented.phase === 'SELECTING_TOKEN') {
    return { state: presented, events };
  }

  // The set fully burned with no move played → the v1 NO_LEGAL_MOVE route,
  // byte-identical at diceCount 1, with set-aware six-counting (A3.2): an
  // extra turn requires ALL dice to show six (any-six snowballed 2-dice games).
  const allSixes = state.dice.rolledSet.every((d) => d === 6);
  const firstHead = state.dice.queue[0] ?? _value;
  const advanced = resolveTurn(
    state,
    allSixes,
    false, // no capture
    allSixes ? state.consecutiveSixes + 1 : 0,
  );
  const next = patch(state, {
    phase: 'IDLE',
    dice: clearedDice(),
    validMoves: [],
    currentPlayer: advanced.nextPlayer,
    consecutiveSixes: 0,
  });
  events.push({ type: 'NO_LEGAL_MOVE', player: state.currentPlayer, value: firstHead });
  if (advanced.advanced) {
    events.push({ type: 'TURN_CHANGED', nextPlayer: advanced.nextPlayer });
  } else if (state.rules.diceCount > 1) {
    // 5D-2 (ruling 2): a burned six-keep announces at diceCount > 1, matching
    // played-set keeps. Count 1 stays silent — v1 event-stream equivalence.
    events.push({ type: 'TURN_CHANGED', nextPlayer: advanced.nextPlayer, extraTurn: true });
  }
  return { state: next, events };
}

function handleRequestMove(
  state: GameState,
  tokenId: string,
  dieValue?: number,
): ApplyResult {
  if (state.phase !== 'SELECTING_TOKEN') return reject(state);

  // A3.1: resolve by (tokenId, dieValue) against the presented menu. Each
  // candidate's die is its progress delta (the menu was built per-die, so the
  // delta identifies the die); entry moves are die-ambiguous but
  // effect-identical — any entry-eligible die matches, and the named die is
  // the one consumed (the player chose that pip).
  const token = state.tokens[tokenId];
  const candidates = state.validMoves.filter((m) => m.tokenIds.includes(tokenId));
  if (!token || candidates.length === 0) return reject(state); // not a legal selection

  const entryOk = (d: number): boolean => {
    if (state.rules.entryRoll === 'any') return true;
    if (state.rules.entryRoll === 'sixOrOne') return d === 6 || d === 1;
    return d === 6;
  };
  const dieOf = (m: Move): number | null =>
    m.isEnteringBoard
      ? (state.dice.queue.filter(entryOk).sort((a, b) => b - a)[0] ?? null)
      : m.finalProgress - token.progress;

  let pick: Move;
  if (dieValue !== undefined) {
    pick = candidates.find((m) =>
      m.isEnteringBoard ? entryOk(dieValue) : dieOf(m) === dieValue,
    )!;
    if (!pick) return reject(state); // that die cannot move this token
  } else {
    const distinctDies = new Set(candidates.map((m) => dieOf(m)));
    if (distinctDies.size > 1) return reject(state); // ambiguous — no guessing (A3.1)
    pick = candidates[0]; // unambiguous (or same-value dice — interchangeable)
  }
  const die = dieValue ?? dieOf(pick);
  const move = pick;

  // Freeze the chosen move and lock the phase. We emit TOKEN_MOVED HERE (with
  // the path) so the Director can start the hop animation. The token's progress
  // is NOT committed yet — that happens on RESOLVE_MOVE after the animation.
  // This avoids the deadlock: the Director needs the path to animate, and
  // RESOLVE_MOVE is triggered by the animation's onComplete.
  const next = patch(state, {
    phase: 'ANIMATING_MOVE',
    validMoves: [{ ...move }], // freeze the single chosen move
    dice: { ...state.dice, activeDie: die }, // carried for RESOLVE_MOVE (A3.1)
  });
  return {
    state: next,
    events: [
      {
        type: 'TOKEN_MOVED',
        tokenIds: move.tokenIds,
        path: move.path,
        finalProgress: move.finalProgress,
        isEnteringBoard: move.isEnteringBoard,
        isEnteringHome: move.isEnteringHome,
        isFinishing: move.isFinishing,
      },
    ],
  };
}

function handleResolveMove(state: GameState): ApplyResult {
  if (state.phase !== 'ANIMATING_MOVE') return reject(state);
  const move = state.validMoves[0];
  if (!move) return reject(state);

  const events: GameEvent[] = [];
  const tokens = { ...state.tokens };

  // 1. Commit the token movement (progress update). TOKEN_MOVED was already
  // emitted by REQUEST_MOVE so the Director could animate; we don't re-emit it.
  const moverId = move.tokenIds[0];
  const mover = tokens[moverId];
  tokens[moverId] = applyMove(mover, move);

  // 2. Captures (resets victims to BASE, emits TOKEN_CAPTURED) — per die.
  let captured = false;
  const captureIds: string[] = [];
  for (const result of checkCaptures(state, moverId, move.finalProgress)) {
    tokens[result.victim.id] = result.victim; // progress === BASE
    events.push(result.event);
    captured = true;
    captureIds.push(result.victim.id);
  }

  // A3.1: consume the die chosen at REQUEST_MOVE (activeDie — entry moves
  // cannot be re-inferred post-hoc). Fallback = queue head (v1 safety net).
  const diePlayed = state.dice.activeDie ?? state.dice.queue[0] ?? state.dice.value ?? 0;
  const remaining = [...state.dice.queue];
  const consumedIdx = remaining.indexOf(diePlayed);
  if (consumedIdx >= 0) remaining.splice(consumedIdx, 1);
  else remaining.shift();
  const diceAfterDie: GameState['dice'] = {
    ...state.dice,
    queue: remaining,
    value: remaining[0] ?? null,
    capturedInSet: state.dice.capturedInSet || captured,
    activeDie: null,
  };
  const record: TurnRecord = {
    player: mover.color,
    roll: diePlayed,
    rolls: state.dice.rolledSet,
    tokenId: moverId,
    capturedIds: captureIds.length ? captureIds : undefined,
  };
  const movedState = patch(state, { tokens, dice: diceAfterDie });

  // 3. Win check — immediate, mid-set (Decision 7): remaining dice discarded.
  const winner = checkWin(movedState, mover.color);
  if (winner) {
    const winners = state.winners.includes(winner)
      ? state.winners
      : [...state.winners, winner];
    events.push({ type: 'PLAYER_WON', player: winner });
    const next = patch(movedState, {
      phase: 'GAME_OVER',
      winners,
      validMoves: [],
      dice: clearedDice(),
      turnHistory: [...state.turnHistory, record],
    });
    return { state: next, events };
  }

  // 4a. Set continues: present the remaining dice (lazy burn inside); a
  // playable die re-enters SELECTING_TOKEN with the union menu (A3.1).
  if (remaining.length > 0) {
    const presented = presentRemainingDice(movedState, events);
    if (presented.phase === 'SELECTING_TOKEN') {
      return {
        state: patch(presented, { turnHistory: [...state.turnHistory, record] }),
        events,
      };
    }
    // Nothing playable remained → burns emptied the queue → end of set.
    return endOfSet(presented, state, record, events);
  }

  // 4b. Queue empty → end-of-set resolution (Decisions 5/6).
  return endOfSet(movedState, state, record, events);
}

/**
 * End-of-set turn resolution (PHASE-5D 5D-1d, A3.2). Six-counting is per SET
 * and requires ALL dice six (rolledSet.every(d => d === 6) — a double-6 set
 * increments once; a single 6 grants nothing; at diceCount 1 every ≡ includes);
 * capture is per SET (capturedInSet, Decision 6). State transitions are
 * v1-identical at diceCount 1. The announce-on-keep emission (extraTurn: true)
 * is the one intentional event-stream addition (design §3.4).
 */
function endOfSet(
  movedState: GameState,
  preMoveState: GameState,
  record: TurnRecord,
  events: GameEvent[],
): ApplyResult {
  const allSixes = preMoveState.dice.rolledSet.every((d) => d === 6);
  const setCaptured = movedState.dice.capturedInSet;
  const newConsecutiveSixes = allSixes ? preMoveState.consecutiveSixes + 1 : 0;
  const turn = resolveTurn(preMoveState, allSixes, setCaptured, newConsecutiveSixes);

  const next = patch(movedState, {
    phase: 'IDLE',
    validMoves: [],
    dice: clearedDice(),
    currentPlayer: turn.nextPlayer,
    consecutiveSixes: turn.resetSixes ? 0 : newConsecutiveSixes,
    turnHistory: [...preMoveState.turnHistory, record],
  });
  if (turn.advanced) {
    events.push({ type: 'TURN_CHANGED', nextPlayer: turn.nextPlayer });
  } else {
    events.push({ type: 'TURN_CHANGED', nextPlayer: turn.nextPlayer, extraTurn: true });
  }
  return { state: next, events };
}

// ---------- Public reducer ----------

export function applyAction(
  state: GameState,
  action: Action,
  rng: () => number = Math.random,
): ApplyResult {
  switch (action.type) {
    case 'REQUEST_ROLL':
      return handleRequestRoll(state, rng);
    case 'RESOLVE_ROLL':
      return handleResolveRoll(state, action.value);
    case 'REQUEST_MOVE':
      return handleRequestMove(state, action.tokenId, action.dieValue);
    case 'RESOLVE_MOVE':
      return handleResolveMove(state);
  }
}

// ---------- Factory: initial game state ----------

import type { Color, RulesConfig, Token } from './types';
import { V1_RULES } from './config/rulesPreset';

/**
 * Oracle-owned derivation of which colors play for a given player count.
 * Pure, tested. The Stage calls createInitialState(colorsForPlayerCount(n), rules).
 *
 *   2 → red + yellow (opposite corners, standard 2p)
 *   3 → red, green, yellow (blue's corner is the dead one — documented convention)
 *   4 → all
 */
export function colorsForPlayerCount(n: 2 | 3 | 4): Color[] {
  switch (n) {
    case 2:
      return ['red', 'yellow'];
    case 3:
      return ['red', 'green', 'yellow'];
    case 4:
      return ['red', 'green', 'yellow', 'blue'];
  }
}

/** Build tokens in their yards, one set of 4 per active color. */
function initialTokens(colors: readonly Color[]): Record<string, Token> {
  const tokens: Record<string, Token> = {};
  for (const color of colors) {
    for (let slot = 0; slot < 4; slot++) {
      const id = `${color}-${slot}`;
      tokens[id] = { id, color, progress: BASE, slot };
    }
  }
  return tokens;
}

/**
 * Create a fresh game state for a new match.
 *
 * Explicit colors — server-compatible. In online multiplayer the host/server
 * assigns seats; a signature deriving colors internally from playerCount would
 * have to be rewritten the day the server ships. The derivation rule lives in
 * colorsForPlayerCount (testable, Oracle-owned), not here.
 *
 * Dev-only invariant: colors.length === rules.playerCount (caught early).
 */
export function createInitialState(
  colors: Color[] = colorsForPlayerCount(V1_RULES.playerCount),
  rules: RulesConfig = V1_RULES,
): GameState {
  if (import.meta.env?.DEV && colors.length !== rules.playerCount) {
    console.warn(
      `createInitialState: colors.length (${colors.length}) !== rules.playerCount (${rules.playerCount}). ` +
        'This is likely a bug — the colors list and the rules disagree about how many players are in the game.',
    );
  }
  return {
    tokens: initialTokens(colors),
    turnOrder: [...colors],
    currentPlayer: colors[0],
    dice: clearedDice(),
    phase: 'IDLE',
    validMoves: [],
    consecutiveSixes: 0,
    winners: [],
    rules,
    turnHistory: [],
  };
}

/** Convenience: a color's tokens that are not yet finished. */
export function activeTokensOf(state: GameState, color: Color): Token[] {
  return Object.values(state.tokens).filter(
    (t) => t.color === color && t.progress !== FINISH,
  );
}
