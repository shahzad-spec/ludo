/**
 * Threat detection — exposure penalty (PLAN-PHASE-5B §3.4).
 *
 * Correction 2: uses tokenValue(move.finalProgress) for the at-risk token's
 * value, immune to diversion-edge cases (no need to reverse-map cell → progress).
 */

import type { GameState } from '../types';
import type { Color, Position } from '../board/track';
import { ENTRY_OFFSET } from '../board/track';
import { SAFE_TRACK_CELLS } from '../board/safeCells';
import { tokenValue } from './evaluate';

/**
 * Expected loss from parking at `dest` where opponents can capture.
 * Sums (1/6 × tokenValue) for each opponent within dice range (1-6 behind).
 * Multiplied by riskScale (amendment E: ahead → larger penalty).
 *
 * @param finalProgress The moving token's progress after the move (for value calc)
 */
export function exposurePenalty(
  state: GameState,
  dest: Position,
  me: Color,
  scale: number = 1,
  finalProgress?: number,
): number {
  if (dest.kind !== 'track') return 0;
  if (SAFE_TRACK_CELLS.has(dest.cell)) return 0;

  // Correction 2: use the move's finalProgress for the token's value
  const myValue = tokenValue(finalProgress ?? 50);

  let penalty = 0;
  for (const t of Object.values(state.tokens)) {
    if (t.color === me) continue;
    if (t.progress < 0 || t.progress > 50) continue;
    const oppCell = (ENTRY_OFFSET[t.color] + t.progress) % 52;
    const behind = (dest.cell - oppCell + 52) % 52;
    if (behind >= 1 && behind <= 6) {
      penalty += (1 / 6) * myValue;
    }
  }
  return penalty * scale;
}

/**
 * Aggregate expected loss across all of `me`'s tokens on the shared loop.
 * Reuses `exposurePenalty` geometry per token (opponents BEHIND within 1–6).
 * Safe cells contribute 0 (handled inside exposurePenalty). Used by the
 * competitive evaluation function (PHASE-5C §3.5).
 */
export function totalExposure(state: GameState, me: Color): number {
  let total = 0;
  for (const t of Object.values(state.tokens)) {
    if (t.color !== me) continue;
    if (t.progress < 0 || t.progress > 50) continue; // shared loop only
    const cell = (ENTRY_OFFSET[me] + t.progress) % 52;
    total += exposurePenalty(state, { kind: 'track', cell }, me, 1, t.progress);
  }
  return total;
}
