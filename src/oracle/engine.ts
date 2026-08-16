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
import type { Action, GameState, Move } from './types';
import type { GameEvent } from '../bus/events';
import { rollDice } from './rules/dice';
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

  const value = rollDice(rng);
  // 5D-1a interim: single-die queue (rollSet arrives in 5D-1b). The alias and
  // rolledSet are populated so the queue invariants hold from the first commit.
  const next = patch(state, {
    dice: { queue: [value], rolledSet: [value], value, rolled: true, capturedInSet: false },
    phase: 'ROLLING',
  });
  return {
    state: next,
    events: [{ type: 'DICE_ROLLED', player: state.currentPlayer, value }],
  };
}

function handleResolveRoll(state: GameState, value: number): ApplyResult {
  if (state.phase !== 'ROLLING') return reject(state);

  const moves = getLegalMoves(state, value);

  // No legal move: pass the turn and notify. The current player's roll is
  // wasted. consecutiveSixes is reset on pass.
  if (moves.length === 0) {
    const advanced = resolveTurn(
      state,
      value === 6,
      false, // no capture
      value === 6 ? state.consecutiveSixes + 1 : 0,
    );
    const next = patch(state, {
      phase: 'IDLE',
      dice: clearedDice(),
      validMoves: [],
      currentPlayer: advanced.nextPlayer,
      consecutiveSixes: 0,
    });
    const events: GameEvent[] = [
      { type: 'NO_LEGAL_MOVE', player: state.currentPlayer, value },
    ];
    if (advanced.advanced) {
      events.push({ type: 'TURN_CHANGED', nextPlayer: advanced.nextPlayer });
    }
    return { state: next, events };
  }

  // Legal moves exist → wait for the player to pick a token.
  const next = patch(state, {
    phase: 'SELECTING_TOKEN',
    validMoves: moves,
  });
  return { state: next, events: [] };
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

  // 2. Captures (resets victims to BASE, emits TOKEN_CAPTURED).
  let captured = false;
  const captureIds: string[] = [];
  for (const result of checkCaptures(state, moverId, move.finalProgress)) {
    tokens[result.victim.id] = result.victim; // progress === BASE
    events.push(result.event);
    captured = true;
    captureIds.push(result.victim.id);
  }

  // 3. Win check (must use the post-move token set).
  const movedState = patch(state, { tokens });
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
      turnHistory: [
        ...state.turnHistory,
        {
          player: mover.color,
          roll: state.dice.value ?? 0,
          tokenId: moverId,
          capturedIds: captureIds.length ? captureIds : undefined,
        },
      ],
    });
    return { state: next, events };
  }

  // 4. Turn resolution.
  const rolledSix = state.dice.value === 6;
  const newConsecutiveSixes = rolledSix ? state.consecutiveSixes + 1 : 0;
  const turn = resolveTurn(state, rolledSix, captured, newConsecutiveSixes);

  const next = patch(movedState, {
    phase: 'IDLE',
    validMoves: [],
    dice: clearedDice(),
    currentPlayer: turn.nextPlayer,
    consecutiveSixes: turn.resetSixes ? 0 : newConsecutiveSixes,
    turnHistory: [
      ...state.turnHistory,
      {
        player: mover.color,
        roll: state.dice.value ?? 0,
        tokenId: move.tokenIds[0],
        capturedIds: captureIds.length ? captureIds : undefined,
      },
    ],
  });
  if (turn.advanced) {
    events.push({ type: 'TURN_CHANGED', nextPlayer: turn.nextPlayer });
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
