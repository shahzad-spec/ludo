/**
 * Turn-order logic (plan §6.2, §6.7 gate).
 *
 * Decides whether the current player keeps the turn or passes it on:
 *  - sixGrantsExtraTurn && rolledSix            → same player (subject to limit)
 *  - captureGrantsExtraTurn && captured         → same player (OFF in v1)
 *  - consecutiveSixes >= limit                  → FORFEIT (pass turn even on a 6)
 *  - otherwise                                  → next player
 *
 * "Next player" skips any color that has already won (all 4 finished).
 */

import type { Color } from '../board/track';
import type { GameState } from '../types';

/** Has this color finished all four tokens? */
export function hasColorFinished(state: GameState, color: Color): boolean {
  const tokens = Object.values(state.tokens).filter((t) => t.color === color);
  return tokens.length > 0 && tokens.every((t) => t.progress === 56);
}

/**
 * Returns the color whose turn is next (skipping finished players), starting
 * after `fromColor`. Used both for normal advancement and forfeit.
 */
function nextActiveColor(state: GameState, fromColor: Color): Color {
  const order = state.turnOrder;
  const startIdx = order.indexOf(fromColor);
  for (let offset = 1; offset <= order.length; offset++) {
    const candidate = order[(startIdx + offset) % order.length];
    if (!hasColorFinished(state, candidate)) return candidate;
  }
  // Everyone finished (shouldn't happen in a real game) — return start color.
  return fromColor;
}

export interface TurnResult {
  /** The color whose turn it now is. */
  nextPlayer: Color;
  /** Did the turn actually advance to a new player? */
  advanced: boolean;
  /** Reset consecutiveSixes back to 0 (happens when the turn passes). */
  resetSixes: boolean;
}

/**
 * Resolve the turn after a move/capture.
 *
 * @param rolledSix   the die was a 6 this turn
 * @param captured    a capture occurred this turn
 * @param consecutiveSixes  current player's running six count (before this roll)
 */
export function resolveTurn(
  state: GameState,
  rolledSix: boolean,
  captured: boolean,
  consecutiveSixes: number,
): TurnResult {
  const rules = state.rules;

  // Forfeit: too many sixes in a row — pass even though it was a 6.
  // sixesLimit: null means ∞ (no forfeit ever).
  const forfeited =
    rolledSix &&
    rules.sixesLimit !== null &&
    consecutiveSixes >= rules.sixesLimit;

  const keepsTurn =
    !forfeited &&
    ((rolledSix && rules.sixGrantsExtraTurn) ||
      (captured && rules.extraTurnOnCapture));

  if (keepsTurn) {
    return {
      nextPlayer: state.currentPlayer,
      advanced: false,
      resetSixes: false,
    };
  }

  return {
    nextPlayer: nextActiveColor(state, state.currentPlayer),
    advanced: true,
    resetSixes: true,
  };
}
