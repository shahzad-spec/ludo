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
import { BASE, FINISH, FIRST_HOME_PROGRESS, ENTRY_OFFSET, SHARED_LOOP_LENGTH } from '../board/track';
import type { Color } from '../board/track';
import { SAFE_TRACK_CELLS } from '../board/safeCells';

/** Expected value of a single dice roll. */
export const MEAN_STEP = 3.5;

/** Expected rolls to exit the yard (geometric distribution, p = 1/6 → mean 6). */
export const YARD_EXIT_TURNS = 6;

/**
 * Per-token progress value (amendment C — strictly monotonic):
 *   Yard:      0
 *   Track:     p + max(0, p - 43) * 2       (range 0..64)
 *   Home col:  66 + (p - 51) * 8             (range 66..98)
 *   Finished:  100
 *
 * Monotonicity: yard(0) < track(0→64) < home(66→98) < finished(100). ✓
 *
 * Defined here (not evaluate.ts) so the feature extractors can use it without
 * creating an evaluate↔features import cycle; evaluate.ts re-exports it.
 */
export function tokenValue(progress: number): number {
  if (progress === BASE) return 0;
  if (progress === FINISH) return 100;
  if (progress <= 50) return progress + Math.max(0, progress - 43) * 2;
  return 66 + (progress - 51) * 8;
}

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

/**
 * Leader taxation: the race leader's tokens are weighted ×LEADER_TAX in opponent
 * mass and shot value, so the search feels captures/blocks against the runaway
 * player as more valuable. Initial guess — tuned in 5C-4.
 */
export const LEADER_TAX = 1.6;

/** A "live shot": one of my tokens can capture an opponent token with a single roll. */
export interface CaptureShot {
  /** My token that could make the capture. */
  tokenId: string;
  /** Opponent token within striking range. */
  victimId: string;
  /** 1..6 — the exact roll that lands the capture. */
  neededRoll: number;
  /** tokenValue(victim.progress) — richer targets are worth more. */
  victimValue: number;
}

/**
 * All capture opportunities for `me`. A shot exists when an opponent token sits
 * 1–6 cells AHEAD of one of mine on the shared loop, on a non-safe cell,
 * reachable without my token first diverting into its home column.
 *
 * Direction: shots look AHEAD — `(oppCell − myCell + 52) % 52 ∈ 1..6` — the
 * mirror of `exposurePenalty` (threats.ts), which looks BEHIND. Both directions
 * are pinned by tests; geometry mix-ups are this codebase's #1 historical bug.
 */
export function captureShots(state: GameState, me: Color): CaptureShot[] {
  const shots: CaptureShot[] = [];
  for (const myToken of Object.values(state.tokens)) {
    if (myToken.color !== me) continue;
    if (myToken.progress < 0 || myToken.progress > 50) continue; // shared loop only
    const myCell = (ENTRY_OFFSET[me] + myToken.progress) % 52;
    for (const opp of Object.values(state.tokens)) {
      if (opp.color === me) continue;
      if (opp.progress < 0 || opp.progress > 50) continue; // victim on shared loop
      const oppCell = (ENTRY_OFFSET[opp.color] + opp.progress) % 52;
      if (SAFE_TRACK_CELLS.has(oppCell)) continue; // can't capture on a safe cell
      const dist = (oppCell - myCell + 52) % 52;
      // Must stay on the shared loop after the roll (no home-column diversion).
      if (dist >= 1 && dist <= 6 && myToken.progress + dist <= 50) {
        shots.push({
          tokenId: myToken.id,
          victimId: opp.id,
          neededRoll: dist,
          victimValue: tokenValue(opp.progress),
        });
      }
    }
  }
  return shots;
}

/**
 * Expected-value-weighted capture pressure. Sum of (1/6 × victimValue) over all
 * live shots, with shots against the race leader's tokens scaled by LEADER_TAX.
 */
export function shotPressure(state: GameState, me: Color): number {
  const leader = raceLeader(state, me);
  let pressure = 0;
  for (const shot of captureShots(state, me)) {
    const victim = state.tokens[shot.victimId];
    const tax = leader !== null && victim.color === leader ? LEADER_TAX : 1;
    pressure += (1 / 6) * shot.victimValue * tax;
  }
  return pressure;
}

/**
 * Opponent token mass — total tokenValue across opponent tokens, with the race
 * leader's tokens weighted ×LEADER_TAX. Subtracted in the eval so the search
 * feels leader captures/blocks as ~1.6× more valuable than hitting a straggler.
 */
export function opponentMass(state: GameState, me: Color): number {
  const leader = raceLeader(state, me);
  let mass = 0;
  for (const t of Object.values(state.tokens)) {
    if (t.color === me) continue;
    const v = tokenValue(t.progress);
    mass += leader !== null && t.color === leader ? v * LEADER_TAX : v;
  }
  return mass;
}

/** My tokens currently in play (shared loop or home column; yard and finished excluded). */
export function spread(state: GameState, me: Color): number {
  let count = 0;
  for (const t of Object.values(state.tokens)) {
    if (t.color === me && t.progress >= 0 && t.progress < FINISH) count++;
  }
  return count;
}

/** My tokens in the home column (FIRST_HOME_PROGRESS..FINISH-1) — safe and close. */
export function homeLoaded(state: GameState, me: Color): number {
  let count = 0;
  for (const t of Object.values(state.tokens)) {
    if (t.color === me && t.progress >= FIRST_HOME_PROGRESS && t.progress < FINISH) count++;
  }
  return count;
}

/** My finished-token count minus the race leader's finished-token count. */
export function finishGap(state: GameState, me: Color): number {
  const leader = raceLeader(state, me);
  let mine = 0;
  let theirs = 0;
  for (const t of Object.values(state.tokens)) {
    if (t.progress < FINISH) continue; // only finished tokens count
    if (t.color === me) mine++;
    else if (leader !== null && t.color === leader) theirs++;
  }
  return mine - theirs;
}

/**
 * Anticipation band (PHASE-5C 5C-6): the zone beyond single-roll reach where
 * approaching opponents are invisible to the 1-6 shot/exposure bands. An
 * opponent in this zone behind my SAFE token is future prey (it must transit my
 * strike zone to get ahead); behind my EXPOSED token it is future danger.
 * Multi-dice (future phase) widens capture reach — ONLY these constants and the
 * band factor change then; that is the cheap-migration promise.
 */
export const ANTICIPATION_BAND_MIN = 7;
export const ANTICIPATION_BAND_MAX = 12;
/** Weight of the 7-12 sub-band relative to the 1-6 sub-band. */
export const AMBUSH_FAR_DISCOUNT = 0.5;

/** Forward distance around the shared loop from `fromCell` to `toCell` (0-51). */
export function loopDelta(fromCell: number, toCell: number): number {
  return (toCell - fromCell + SHARED_LOOP_LENGTH) % SHARED_LOOP_LENGTH;
}

/**
 * Future-shot value of my SAFE tokens: an opponent trailing a safe token must
 * pass through its 1-6 strike zone, so it is discounted prey (the playtest
 * "wait and foresee" behavior). Mirrors shotPressure's (1/6 x victimValue x
 * tax) structure with a band factor.
 */
export function ambushPressure(state: GameState, me: Color): number {
  const leader = raceLeader(state, me);
  let pressure = 0;
  for (const t of Object.values(state.tokens)) {
    if (t.color !== me) continue;
    if (t.progress < 0 || t.progress > 50) continue; // shared loop only
    const cell = (ENTRY_OFFSET[me] + t.progress) % SHARED_LOOP_LENGTH;
    if (!SAFE_TRACK_CELLS.has(cell)) continue; // ambush is only safe from safety
    for (const opp of Object.values(state.tokens)) {
      if (opp.color === me) continue;
      if (opp.progress < 0 || opp.progress > 50) continue;
      const oppCell = (ENTRY_OFFSET[opp.color] + opp.progress) % SHARED_LOOP_LENGTH;
      const behind = loopDelta(oppCell, cell); // how far the opponent trails me
      if (behind < 1 || behind > ANTICIPATION_BAND_MAX) continue;
      const factor = behind <= 6 ? 1 : AMBUSH_FAR_DISCOUNT;
      const tax = leader !== null && opp.color === leader ? LEADER_TAX : 1;
      pressure += (1 / 6) * tokenValue(opp.progress) * factor * tax;
    }
  }
  return pressure;
}
