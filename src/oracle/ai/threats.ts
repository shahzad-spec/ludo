/**
 * Threat detection — exposure penalty (PLAN-PHASE-5B §3.4).
 *
 * Correction 2: uses tokenValue(move.finalProgress) for the at-risk token's
 * value, immune to diversion-edge cases (no need to reverse-map cell → progress).
 */

import type { GameState } from '../types';
import type { Color, Position } from '../board/track';
import { ENTRY_OFFSET, SHARED_LOOP_LENGTH } from '../board/track';
import { SAFE_TRACK_CELLS } from '../board/safeCells';
import {
  tokenValue,
  ANTICIPATION_BAND,
  AMBUSH_FAR_DISCOUNT,
  loopDelta,
} from './features';
import { threatProb, THREAT_REACH } from './diceMath';

/**
 * Expected loss from parking at `dest` where opponents can capture.
 * 5D-3b: dice-aware — each opponent k dice in hand threatens distances 1..6k,
 * weighted by threatProb(k, behind) (the PREFIX-LANDING probability; at k=1 the
 * classic flat 1/6 over 1..6, byte-identical to v1). Multiplied by riskScale
 * (amendment E: ahead → larger penalty).
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
  const k = state.rules.diceCount;

  let penalty = 0;
  for (const t of Object.values(state.tokens)) {
    if (t.color === me) continue;
    if (t.progress < 0 || t.progress > 50) continue;
    const oppCell = (ENTRY_OFFSET[t.color] + t.progress) % 52;
    const behind = (dest.cell - oppCell + 52) % 52;
    if (behind >= 1 && behind <= THREAT_REACH(k)) {
      penalty += threatProb(k, behind) * myValue;
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

/**
 * Anticipation-band danger (5C-6, 5D-3b dice-aware): opponents in the
 * (6k+1)..12k zone behind my EXPOSED shared-loop tokens are ~two turns away —
 * discounted future capture risk, distinct from exposurePenalty's immediate
 * 1..6k band. The far zone keeps 5C-6's flat 1/6×discount heuristic (threatProb
 * is zero beyond 6k by definition — one-turn landing probabilities cannot price
 * two-turn danger); only the WINDOW widens with k.
 */
export function anticipationDanger(state: GameState, me: Color): number {
  const k = state.rules.diceCount;
  const [bandMin, bandMax] = ANTICIPATION_BAND(k);
  let total = 0;
  for (const t of Object.values(state.tokens)) {
    if (t.color !== me) continue;
    if (t.progress < 0 || t.progress > 50) continue;
    const cell = (ENTRY_OFFSET[me] + t.progress) % SHARED_LOOP_LENGTH;
    if (SAFE_TRACK_CELLS.has(cell)) continue; // safe tokens are not endangered
    const myValue = tokenValue(t.progress);
    for (const opp of Object.values(state.tokens)) {
      if (opp.color === me) continue;
      if (opp.progress < 0 || opp.progress > 50) continue;
      const oppCell = (ENTRY_OFFSET[opp.color] + opp.progress) % SHARED_LOOP_LENGTH;
      const behind = loopDelta(oppCell, cell);
      if (behind >= bandMin && behind <= bandMax) {
        total += AMBUSH_FAR_DISCOUNT * (1 / 6) * myValue;
      }
    }
  }
  return total;
}
