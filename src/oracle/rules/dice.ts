/**
 * Dice rolling — pure, with an injectable RNG (plan §6.2).
 *
 * Math.random is the default, but tests pass a seeded/pinned generator so a
 * "6" can be forced deterministically. No flaky tests.
 */

/** Roll a single die, returning 1..6. */
export function rollDice(rng: () => number = Math.random): number {
  // rng() is expected to return [0, 1). Floor + 1 → 1..6.
  return Math.floor(rng() * 6) + 1;
}

/**
 * Roll a set of `count` dice in draw order (PHASE-5D 5D-1b). No sorting here —
 * the engine owns the descending queue order (A1 Decision 14). A pinned RNG
 * scripts the whole set deterministically: pinnedRng([3,6]) → [3,6].
 */
export function rollSet(rng: () => number = Math.random, count: number): number[] {
  const set: number[] = [];
  for (let i = 0; i < count; i++) set.push(rollDice(rng));
  return set;
}

/**
 * Create a pinned RNG that always returns the given sequence, then repeats the
 * last value. Used in tests to script exact dice outcomes.
 *
 *   const rng = pinnedRng([6, 1, 3]); // first roll 6, then 1, then 3, then 3...
 */
export function pinnedRng(sequence: number[]): () => number {
  let i = 0;
  return () => {
    const v = sequence[Math.min(i, sequence.length - 1)];
    // Map a die value v∈[1..6] back to a [0,1) rng output that rollDice will
    // reconstruct into the same v: rollDice does floor(r*6)+1, so r = (v-1)/6.
    i++;
    return (v - 1) / 6;
  };
}
