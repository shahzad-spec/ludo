/**
 * Strategic feature extractors for the Competitive Bot (PHASE-5C §3).
 *
 * The centerpiece is Expected-Turns-To-Finish (ETF) — the race model that
 * drives every "who is winning" judgment. LOWER ETF = closer to finishing =
 * further ahead. It replaces v1's progress-sum + `racePressure` (which bribed
 * single-token racing) with a stable, monotone race signal.
 *
 * Pure Oracle layer: depends only on track geometry + game state. No React,
 * three, or zustand (enforced by the existing ESLint layer guard).
 */

import type { GameState } from '../types';
import { BASE, FINISH } from '../board/track';
import type { Color } from '../board/track';

/** Expected value of a single dice roll. */
export const MEAN_STEP = 3.5;

/** Expected rolls to exit the yard (geometric distribution, p = 1/6 → mean 6). */
export const YARD_EXIT_TURNS = 6;

/**
 * Expected turns for ONE token to finish from its current progress.
 *
 * Strictly decreasing in progress:
 *   yard (BASE) ≈ 22  >  track start (16)  >  …  >  home  >  finished (0)
 *
 * The crude linear model is intentional — the offline tuning loop (5C-4)
 * absorbs the modelling error. Monotonicity is the only hard invariant and is
 * pinned by `features.test.ts`.
 */
export function tokenETF(progress: number): number {
  if (progress === BASE) return YARD_EXIT_TURNS + FINISH / MEAN_STEP; // ≈ 22
  if (progress >= FINISH) return 0;
  return (FINISH - progress) / MEAN_STEP;
}

/**
 * Expected turns for a whole COLOR to finish all four tokens.
 * Sum-of-work model: one token advances per turn, so each token's remaining
 * work adds up. Lower colorETF = closer to finishing the house = ahead.
 */
export function colorETF(state: GameState, color: Color): number {
  let total = 0;
  for (const token of Object.values(state.tokens)) {
    if (token.color === color) total += tokenETF(token.progress);
  }
  return total;
}

/**
 * The opponent currently winning the race — the one with the LOWEST colorETF.
 * Returns null when no opponents remain. `me` is never returned.
 */
export function raceLeader(state: GameState, me: Color): Color | null {
  let leader: Color | null = null;
  let best = Infinity;
  for (const color of state.turnOrder) {
    if (color === me) continue;
    const etf = colorETF(state, color);
    if (etf < best) {
      best = etf;
      leader = color;
    }
  }
  return leader;
}

/**
 * Positive when I'm racing ahead of the fastest opponent.
 *   raceLead = leaderETF − myETF     (>0 ⇒ I'm ahead; <0 ⇒ I'm behind)
 * +∞ when no opponents remain (the house is uncontested).
 */
export function raceLead(state: GameState, me: Color): number {
  const leader = raceLeader(state, me);
  if (leader === null) return Infinity;
  return colorETF(state, leader) - colorETF(state, me);
}
