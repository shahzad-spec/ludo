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
  return { queue: [], rolledSet: [], value: null, rolled: false, capturedInSet: false };
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
  // A1 Decision 14: the queue is DESCENDING — largest die first. The rolledSet
  // keeps draw order for UI/history; value is the compat alias onto queue[0].
  const queue = [...set].sort((a, b) => b - a);
  const next = patch(state, {
    dice: { queue, rolledSet: set, value: queue[0], rolled: true, capturedInSet: false },
    phase: 'ROLLING',
  });
  return {
    state: next,
    events: [{ type: 'DICE_ROLLED', player: state.currentPlayer, values: set, value: queue[0] }],
  };
}

/**
 * Burn unplayable dice from the head of the queue (PHASE-5D 5D-1c, Decision 4).
 * Stops when a die has legal moves (→ SELECTING_TOKEN) or the queue empties
 * (the CALLER resolves the turn). DIE_BURNED fires only at diceCount > 1 — at
 * count 1 the bare NO_LEGAL_MOVE route is byte-identical v1, so no extra event
 * may appear. Mutates `events` by push; returns the advanced state.
 */
function advanceQueueToPlayableDie(state: GameState, events: GameEvent[]): GameState {
  let cur = state;
  while (cur.dice.queue.length > 0) {
    const head = cur.dice.queue[0];
    const moves = getLegalMoves(cur, head);
    if (moves.length > 0) {
      return patch(cur, { phase: 'SELECTING_TOKEN', validMoves: moves });
    }
    const rest = cur.dice.queue.slice(1);
    if (cur.rules.diceCount > 1) {
      events.push({ type: 'DIE_BURNED', player: cur.currentPlayer, value: head });
    }
    cur = patch(cur, {
      dice: { ...cur.dice, queue: rest, value: rest[0] ?? null },
    });
  }
  return cur; // queue empty — caller resolves the turn
}

function handleResolveRoll(state: GameState, value: number): ApplyResult {
  if (state.phase !== 'ROLLING') return reject(state);

  // A1/A2.2: the queue head is authoritative for move computation. The legacy
  // action.value is accepted for contract stability; a disagreement is a bug
  // in the caller — warn loudly in DEV, never branch on it.
  if (import.meta.env?.DEV && state.dice.queue.length > 0 && value !== state.dice.queue[0]) {
    console.warn(
      `RESOLVE_ROLL value (${value}) !== queue head (${state.dice.queue[0]}) — the queue is authoritative.`,
    );
  }

  const events: GameEvent[] = [];
  const afterBurns = advanceQueueToPlayableDie(state, events);
  if (afterBurns.phase === 'SELECTING_TOKEN') {
    return { state: afterBurns, events };
  }

  // The set fully burned with no move played → the v1 NO_LEGAL_MOVE route,
  // byte-identical at diceCount 1, with set-aware six-counting (Decision 5):
  // ANY six in the rolled set counts, exactly once.
  const setHasSix = state.dice.rolledSet.includes(6);
  const firstHead = state.dice.queue[0] ?? value;
  const advanced = resolveTurn(
    state,
    setHasSix,
    false, // no capture
    setHasSix ? state.consecutiveSixes + 1 : 0,
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
  }
  return { state: next, events };
}

function pickMove(state: GameState, tokenId: string): Move | null {
  return state.validMoves.find((m) => m.tokenIds.includes(tokenId)) ?? null;
}

function handleRequestMove(
  state: GameState,
  tokenId: string,
): ApplyResult {
  if (state.phase !== 'SELECTING_TOKEN') return reject(state);
  const move = pickMove(state, tokenId);
  if (!move) return reject(state); // not a legal selection

  // Freeze the chosen move and lock the phase. We emit TOKEN_MOVED HERE (with
  // the path) so the Director can start the hop animation. The token's progress
  // is NOT committed yet — that happens on RESOLVE_MOVE after the animation.
  // This avoids the deadlock: the Director needs the path to animate, and
  // RESOLVE_MOVE is triggered by the animation's onComplete.
  const next = patch(state, {
    phase: 'ANIMATING_MOVE',
    validMoves: [{ ...move }], // freeze the single chosen move
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

  // 5D-1d: consume the played head die; accumulate the set-capture flag (A2.1).
  const diePlayed = state.dice.queue[0] ?? state.dice.value ?? 0;
  const remaining = state.dice.queue.slice(1);
  const diceAfterDie: GameState['dice'] = {
    ...state.dice,
    queue: remaining,
    value: remaining[0] ?? null,
    capturedInSet: state.dice.capturedInSet || captured,
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

  // 4a. Set continues: burn dead dice; a playable die re-enters SELECTING_TOKEN.
  if (remaining.length > 0) {
    const afterBurns = advanceQueueToPlayableDie(movedState, events);
    if (afterBurns.phase === 'SELECTING_TOKEN') {
      return {
        state: patch(afterBurns, { turnHistory: [...state.turnHistory, record] }),
        events,
      };
    }
    // Burns emptied the queue → end of set on the burned state.
    return endOfSet(afterBurns, state, record, events);
  }

  // 4b. Queue empty → end-of-set resolution (Decisions 5/6).
  return endOfSet(movedState, state, record, events);
}

/**
 * End-of-set turn resolution (PHASE-5D 5D-1d). Six-counting is per SET
 * (rolledSet.includes(6) — a double-6 increments once, Decision 5); capture is
 * per SET (capturedInSet, Decision 6). State transitions are v1-identical at
 * diceCount 1. The announce-on-keep emission (extraTurn: true) is the one
 * intentional event-stream addition (design §3.4) — v1 emitted nothing when a
 * player kept their turn.
 */
function endOfSet(
  movedState: GameState,
  preMoveState: GameState,
  record: TurnRecord,
  events: GameEvent[],
): ApplyResult {
  const rolledSix = preMoveState.dice.rolledSet.includes(6);
  const setCaptured = movedState.dice.capturedInSet;
  const newConsecutiveSixes = rolledSix ? preMoveState.consecutiveSixes + 1 : 0;
  const turn = resolveTurn(preMoveState, rolledSix, setCaptured, newConsecutiveSixes);

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
      return handleRequestMove(state, action.tokenId);
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
