/**
 * Movement — apply a Move to a token, returning the updated token (plan §6.2).
 *
 * Pure: does not mutate state or handle captures (that's capture.ts). The
 * engine orchestrates: applyMove → capture.checkCaptures → turns.nextTurn.
 *
 * The Move already carries finalProgress and the validated path, so this is a
 * trivial progress update. Keeping it as its own module preserves the
 * one-responsibility rule and gives the engine a clear seam.
 */

import type { Move, Token } from '../types';

/** Return a new Token with progress set to the move's finalProgress. */
export function applyMove(token: Token, move: Move): Token {
  return { ...token, progress: move.finalProgress };
}
