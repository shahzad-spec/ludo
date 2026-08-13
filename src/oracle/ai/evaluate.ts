/**
 * Competitive evaluation function (PHASE-5C §3.6).
 *
 * Replaces v1's pure-progress eval (which bribed single-token racing — see
 * PHASE-5C §0.2.1) with a weighted feature vector. The search engine
 * (search.ts) is unchanged; it now optimizes a better objective. Weights are
 * initial guesses — the offline tuning loop (5C-4) calibrates them.
 *
 * `tokenValue` is defined in ./features (shared by feature extractors) and
 * re-exported here so existing `import { tokenValue } from './evaluate'` sites
 * keep working (it never touches this module's logic now).
 */

import {
  raceLead,
  shotPressure,
  opponentMass,
  spread,
  homeLoaded,
  finishGap,
} from './features';
import { totalExposure } from './threats';
import type { GameState } from '../types';
import type { Color } from '../board/track';

// Re-export so callers can keep importing tokenValue from './evaluate'.
export { tokenValue } from './features';

/** Tunable feature weights (PHASE-5C §3.6). Initial guesses — tuned in 5C-4. */
export interface EvalWeights {
  /** ETF race lead (turns). Positive when I'm ahead of the fastest opponent. */
  raceLead: number;
  /** Live-shot capture pressure (expected victim value, leader-taxed). */
  shotPressure: number;
  /** Applied to totalExposure (expected loss on my exposed tokens). Negative. */
  exposure: number;
  /** Applied to opponentMass (leader-taxed opponent token value). Negative. */
  mass: number;
  /** My tokens currently in play. */
  spread: number;
  /** My tokens in the home column. */
  homeLoaded: number;
  /** My finished count − the race leader's finished count. */
  finishGap: number;
}

/** Default weights — initial guesses per PHASE-5C §3.6; tuned offline in 5C-4. */
export const EVAL_WEIGHTS: EvalWeights = {
  raceLead: 4.0,
  shotPressure: 0.9,
  exposure: -1.0,
  mass: -1.0,
  spread: 3.0,
  homeLoaded: 2.0,
  finishGap: 12.0,
};

/**
 * Weighted feature-vector evaluation from `me`'s perspective. Positive ≈ winning.
 * `weights` defaults to EVAL_WEIGHTS but is injectable for the 5C-4 tuning loop.
 */
export function evaluate(
  state: GameState,
  me: Color,
  weights: EvalWeights = EVAL_WEIGHTS,
): number {
  // Advantage-scaled terms (PHASE-5C amendment E / Decision 8, wired 5C-4):
  // exposure is penalized MORE when ahead (protect the lead) and LESS when behind;
  // shot-pressure is valued MORE when behind (gamble to catch up). raceLead is
  // computed once and the scale arithmetic inlined for leaf-eval efficiency (the
  // canonical riskScale/captureTempoScale functions below stay for tests + Hard).
  const lead = raceLead(state, me);
  const rScale = 1 + 0.5 * Math.max(0, Math.min(1, lead / 15));
  const cScale = 1 + 0.5 * Math.max(0, Math.min(1, -lead / 15));
  return (
    weights.raceLead * lead +
    weights.shotPressure * cScale * shotPressure(state, me) +
    weights.exposure * rScale * totalExposure(state, me) +
    weights.mass * opponentMass(state, me) +
    weights.spread * spread(state, me) +
    weights.homeLoaded * homeLoaded(state, me) +
    weights.finishGap * finishGap(state, me)
  );
}

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

/**
 * Advantage-scaled risk multiplier (amendment E — ahead → protect). Re-anchored
 * to the ETF race gap (Decision 8): the gap is a stable "am I winning the race"
 * signal, unlike raw eval score which drifts as features are added.
 * Range: 1.0 (neutral/behind) to 1.5 (far ahead).
 */
export function riskScale(state: GameState, me: Color): number {
  return 1 + 0.5 * clamp01(raceLead(state, me) / 15);
}

/**
 * Advantage-scaled capture-tempo multiplier (amendment E — behind → gamble).
 * Re-anchored to the ETF race gap (Decision 8). Range: 1.0 (neutral/ahead) to 1.5.
 */
export function captureTempoScale(state: GameState, me: Color): number {
  return 1 + 0.5 * clamp01(-raceLead(state, me) / 15);
}
