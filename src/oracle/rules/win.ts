/**
 * Win detection (plan §6.2, §6.7 gate).
 *
 * A color wins when all 4 of its tokens are finished (progress === 56). The
 * game is over when only one (or zero) non-won colors remain — in standard
 * 4-player we keep playing for placement, but v1 ends at the first winner for
 * simplicity. hasColorFinished is shared with turns.ts semantics.
 */

import type { Color } from '../board/track';
import { FINISH } from '../board/track';
import type { GameState } from '../types';

/** True if all of `color`'s tokens are finished. */
export function hasColorWon(state: GameState, color: Color): boolean {
  const tokens = Object.values(state.tokens).filter((t) => t.color === color);
  return tokens.length > 0 && tokens.every((t) => t.progress === FINISH);
}

/** Colors that have won, in the order they finished. Derived from winners[]. */
export function winnersSoFar(state: GameState): Color[] {
  return state.winners;
}

/**
 * After a move, check whether the current player just won. Returns the color
 * if this move completed their set, else null.
 */
export function checkWin(state: GameState, color: Color): Color | null {
  return hasColorWon(state, color) ? color : null;
}

/** Is the game over? v1: game ends at the first winner. */
export function isGameOver(state: GameState): boolean {
  return state.winners.length > 0;
}
