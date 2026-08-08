/**
 * Capture detection (plan §6.2, §6.8 capture-reset gotcha).
 *
 * When a token lands on an opponent occupying a non-safe shared-loop cell, the
 * opponent is sent back to the yard. Critically: the victim's progress resets
 * to **BASE (-1)** — NOT 0. `progress 0` is the entry cell (back in play); a
 * test asserting reset-to-0 would encode a bug where captured tokens instantly
 * re-enter the board.
 *
 * This module is pure: it returns the victim tokens (with progress=BASE) and
 * the capture-event payloads. The engine commits them to state and emits.
 */

import type { Color } from '../board/track';
import { BASE, progressToPosition } from '../board/track';
import { isSafePosition } from '../board/safeCells';
import type { GameEvent, GameState, Token } from '../types';

/** A capture to apply: the victim reset to BASE + the event to emit. */
export interface CaptureResult {
  /** Updated victim token (progress === BASE). */
  victim: Token;
  /** The TOKEN_CAPTURED event for the bus. */
  event: GameEvent;
}

/** Tokens on a shared-loop cell that an opponent just landed on. */
function capturableOccupants(
  state: GameState,
  moverColor: Color,
  cell: number,
): Token[] {
  return Object.values(state.tokens).filter((t) => {
    if (t.color === moverColor) return false;
    if (t.progress < 0 || t.progress > 50) return false; // yard/home/finish
    const pos = progressToPosition(t.color, t.progress);
    return pos.kind === 'track' && pos.cell === cell;
  });
}

/**
 * Compute captures triggered by a mover landing at destProgress.
 * Safe cells produce no captures. Returns one CaptureResult per victim
 * (stacking:'none' → typically 0 or 1, but we handle the general case).
 */
export function checkCaptures(
  state: GameState,
  moverId: string,
  destProgress: number,
): CaptureResult[] {
  const mover = state.tokens[moverId];
  if (!mover) return [];

  const destPos = progressToPosition(mover.color, destProgress);
  if (destPos.kind !== 'track') return []; // home/finish: private, no capture
  if (isSafePosition(destPos)) return []; // safe cell: no capture

  const victims = capturableOccupants(state, mover.color, destPos.cell);
  return victims.map((victim) => ({
    victim: { ...victim, progress: BASE },
    event: {
      type: 'TOKEN_CAPTURED',
      attackerId: mover.id,
      victimId: victim.id,
      cell: destPos.cell,
    },
  }));
}
