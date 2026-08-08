/**
 * Legal-move computation (plan §6.2, §6.1.1).
 *
 * Returns Move[] (not bare token IDs) so the Director gets the full hop path
 * and flags for choreography. Filtering rules:
 *  - Yard tokens move only if (roll === 6 && rules.enterOnSix) — single-step
 *    entry to progress 0.
 *  - On-board tokens advance by roll, but with exactFinishRequired an overshoot
 *    past FINISH is illegal.
 *  - isCapture is set by consulting the destination cell for an opponent on a
 *    non-safe cell. (Actual capture mutation happens in capture.ts; this is
 *    just the flag for UI highlighting + path preview.)
 *  - stacking: 'none' (v1) means no barrier blocking, so we never reject a
 *    move because of intermediate same-color pairs. 'block' (v2) would scan
 *    the path for enemy pairs.
 */

import type { Color } from '../board/track';
import {
  BASE,
  FINISH,
  cellsTraversed,
  progressToPosition,
} from '../board/track';
import { isSafePosition } from '../board/safeCells';
import type { GameState, Move, RulesConfig, Token } from '../types';

/** Whether a roll allows a yard token to enter, per the entryRoll rule. */
function canEnter(roll: number, mode: RulesConfig['entryRoll']): boolean {
  switch (mode) {
    case 'six':
      return roll === 6;
    case 'sixOrOne':
      return roll === 6 || roll === 1;
    case 'any':
      return true;
  }
}

/** All tokens belonging to a color. */
function tokensOfColor(state: GameState, color: Color): Token[] {
  return Object.values(state.tokens).filter((t) => t.color === color);
}

/** Tokens currently occupying a given track cell (stacking:'none' → ≤1, but defensive). */
function occupantsOfTrackCell(state: GameState, cell: number): Token[] {
  return Object.values(state.tokens).filter((t) => {
    if (t.progress < 0 || t.progress > 50) return false; // yard/home/finish
    const pos = progressToPosition(t.color, t.progress);
    return pos.kind === 'track' && pos.cell === cell;
  });
}

/** Does moving this token onto destPos capture an opponent? */
function isCaptureMove(state: GameState, mover: Token, destProgress: number): boolean {
  const destPos = progressToPosition(mover.color, destProgress);
  if (destPos.kind !== 'track') return false; // home/finish are private — no capture
  if (isSafePosition(destPos)) return false; // safe cell — no capture
  return occupantsOfTrackCell(state, destPos.cell).some((t) => t.color !== mover.color);
}

/** Build a Move for a token leaving the yard (BASE → progress 0). */
function entryMove(state: GameState, token: Token): Move {
  const finalProgress = 0;
  return {
    tokenIds: [token.id],
    path: cellsTraversed(token.color, BASE, 6), // single step to entry cell
    finalProgress,
    isCapture: isCaptureMove(state, token, finalProgress),
    isEnteringHome: false,
    isEnteringBoard: true,
    isFinishing: false,
  };
}

/** Build a Move for an on-board token advancing by `roll`. */
function advanceMove(
  state: GameState,
  token: Token,
  roll: number,
): Move | null {
  const finalProgress = token.progress + roll;
  // finishRule: v1 implements 'exact' only. 'bounce'/'overflow' land in v1.5 Batch A.
  if (state.rules.finishRule === 'exact' && finalProgress > FINISH) {
    return null; // overshoot — illegal
  }
  const prevPos = progressToPosition(token.color, token.progress);
  const finalPos = progressToPosition(token.color, finalProgress);
  const path = cellsTraversed(token.color, token.progress, roll);
  return {
    tokenIds: [token.id],
    path,
    finalProgress,
    isCapture: isCaptureMove(state, token, finalProgress),
    isEnteringHome: prevPos.kind === 'track' && finalPos.kind === 'home',
    isEnteringBoard: false,
    isFinishing: finalProgress === FINISH,
  };
}

/**
 * Every legal move for the current player given a die value.
 * Empty array means "no legal move" — the engine will pass the turn and emit
 * NO_LEGAL_MOVE.
 */
export function getLegalMoves(state: GameState, roll: number): Move[] {
  const moves: Move[] = [];
  const player = state.currentPlayer;

  for (const token of tokensOfColor(state, player)) {
    if (token.progress === FINISH) continue; // already home

    if (token.progress === BASE) {
      if (canEnter(roll, state.rules.entryRoll)) moves.push(entryMove(state, token));
      continue;
    }

    const move = advanceMove(state, token, roll);
    if (move) moves.push(move);
  }

  return moves;
}
