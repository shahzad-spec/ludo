/**
 * Evaluation function — full positional eval (PLAN-PHASE-5B §3.2).
 *
 * Amendment C: zone values are strictly monotonic (yard < track < home < finished).
 * Amendment E: riskScale (ahead → protect) + captureTempoScale (behind → gamble).
 */

import type { GameState } from '../types';
import type { Color } from '../board/track';
import { FINISH, BASE } from '../board/track';

/**
 * Per-token value (amendment C — strictly monotonic):
 *   Yard:      0
 *   Track:     p + max(0, p - 43) * 2       (range 0..64)
 *   Home col:  66 + h * 8                    (range 66..98)
 *   Finished:  100
 *
 * Monotonicity: yard(0) < track(0→64) < home(66→98) < finished(100). ✓
 */
export function tokenValue(progress: number): number {
  if (progress === BASE) return 0;
  if (progress === FINISH) return 100;
  if (progress <= 50) return progress + Math.max(0, progress - 43) * 2;
  return 66 + (progress - 51) * 8;
}

/**
 * Full board evaluation from `me`'s perspective.
 * Returns myScore − Σ(opponentScores) + race pressure.
 */
export function evaluate(state: GameState, me: Color): number {
  let myScore = 0;
  let oppScore = 0;
  let myMaxProgress = 0;
  let oppMaxProgress = 0;

  for (const token of Object.values(state.tokens)) {
    const val = tokenValue(token.progress);
    if (token.color === me) {
      myScore += val;
      if (token.progress > myMaxProgress) myMaxProgress = token.progress;
    } else {
      oppScore += val;
      if (token.progress > oppMaxProgress) oppMaxProgress = token.progress;
    }
  }

  const racePressure = 2 * (myMaxProgress - oppMaxProgress);
  return myScore - oppScore + racePressure;
}

/**
 * Advantage-scaled risk multiplier (amendment E — ahead).
 * When ahead: higher (protect the lead, avoid exposure).
 * Range: 1.0 (neutral/behind) to 1.5 (far ahead).
 */
export function riskScale(state: GameState, me: Color): number {
  const adv = evaluate(state, me);
  return 1 + 0.5 * Math.max(0, Math.min(1, adv / 150));
}

/**
 * Advantage-scaled capture tempo multiplier (amendment E — behind).
 * When behind: higher (take risks, capture aggressively to catch up).
 * Range: 1.0 (neutral/ahead) to 1.5 (far behind).
 */
export function captureTempoScale(state: GameState, me: Color): number {
  const adv = evaluate(state, me);
  return 1 + 0.5 * Math.max(0, Math.min(1, -adv / 150));
}
