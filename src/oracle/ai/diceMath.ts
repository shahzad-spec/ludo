/**
 * Dice mathematics for multi-dice mode (PHASE-5D 5D-3a). Pure Oracle layer.
 *
 * Two probability models, deliberately separate:
 *
 *  - sumProb(k, d): the plain dice-SUM distribution. Used for race/ETF-style
 *    expectations (how far does a set carry a token on average). Satisfies the
 *    classic sum-table invariants: rows sum to 1, symmetry P(d) = P(7k-d).
 *
 *  - threatProb(k, d): the PREFIX-LANDING distribution (design A1). Capture
 *    fires on ANY per-die landing — a descending queue {6,2} lands at 6, then
 *    8, threatening BOTH distances — so P(threat at d) sums multiset weights
 *    where any prefix sum equals d. For k=2 this is exactly
 *    P(max = d) + P(sum = d) (disjoint events). At k=1 it reduces to the flat
 *    1/6. WARNING (standing instruction): threatProb's marginals EXCEED 1 and
 *    are asymmetric — sum-table invariants are FORBIDDEN on it. Its own
 *    invariants: k=1 flat-1/6 reduction, pointwise superset of sumProb, exact
 *    k=2 pins (see diceMath.test.ts).
 */

/** Expected total pips per turn at k dice. */
export function meanStep(diceCount: number): number {
  return 3.5 * diceCount;
}

/** Expected turns to roll at least one 6 with k dice per turn: 1/(1-(5/6)^k). */
export function yardExitTurns(diceCount: number): number {
  return 1 / (1 - Math.pow(5 / 6, diceCount));
}

/** Worst-case one-turn stacked reach of a player holding k dice. */
export const THREAT_REACH = (k: number): number => 6 * k;

export interface Multiset {
  /** Non-increasing (descending) dice values, length k. */
  dice: number[];
  /** Exact probability weight = multinomial(k; counts) / 6^k. */
  weight: number;
}

const multisetCache = new Map<number, Multiset[]>();

/** All unordered k-dice outcomes with exact weights (21 at k=2, 126 at k=4). */
function multisets(k: number): Multiset[] {
  const cached = multisetCache.get(k);
  if (cached) return cached;

  const outcomes: Multiset[] = [];
  const current: number[] = [];

  // Build NON-INCREASING sequences (combination-with-repetition) over 1..6 —
  // descending matters: prefix sums must mirror the A1 queue order (largest
  // die first), or threatProb would count landings that never happen.
  const build = (maxAllowed: number, remaining: number): void => {
    if (remaining === 0) {
      const counts = new Map<number, number>();
      for (const v of current) counts.set(v, (counts.get(v) ?? 0) + 1);
      let perms = 1;
      for (let i = 2; i <= k; i++) perms *= i; // k!
      for (const c of counts.values()) {
        for (let i = 2; i <= c; i++) perms /= i; // divide by each count!
      }
      outcomes.push({ dice: [...current], weight: perms / Math.pow(6, k) });
      return;
    }
    for (let v = maxAllowed; v >= 1; v--) {
      current.push(v); // v <= maxAllowed keeps the sequence non-increasing
      build(v, remaining - 1);
      current.pop();
    }
  };
  build(6, k);

  multisetCache.set(k, outcomes);
  return outcomes;
}

/** Plain dice-sum distribution: P(total of k dice === d). */
export function sumProb(k: number, d: number): number {
  let p = 0;
  for (const { dice, weight } of multisets(k)) {
    const total = dice.reduce((a, b) => a + b, 0);
    if (total === d) p += weight;
  }
  return p;
}

/**
 * Unordered k-dice outcomes with exact weights, for the search chance node
 * (PHASE-5D Decision 11: 21 outcomes at k=2, not 36). `dice` is DESCENDING —
 * use as the draw sequence for a pinned RNG; the engine re-sorts identically.
 */
export function diceOutcomes(k: number): Multiset[] {
  return multisets(k);
}

/** Prefix-landing threat: P(some descending prefix sum of k dice === d). */
export function threatProb(k: number, d: number): number {
  let p = 0;
  for (const { dice, weight } of multisets(k)) {
    let prefix = 0;
    for (const die of dice) {
      prefix += die;
      if (prefix === d) {
        p += weight;
        break; // one landing at d is enough; weights stay whole
      }
    }
  }
  return p;
}
