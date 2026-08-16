/**
 * diceMath invariants (PHASE-5D 5D-3a) — THE STANDING INSTRUCTION lives here.
 *
 * threatProb is the PREFIX-LANDING distribution (A1): capture fires on ANY
 * per-die landing (descending prefix sums), not only the final sum. It gets
 * its OWN invariants. Sum-table invariants (rows-sum-to-1, symmetry) are
 * pinned BELOW for sumProb ONLY and are FORBIDDEN on threatProb — a set
 * threatens multiple distances, so its marginals exceed 1 and are asymmetric.
 */

import { describe, it, expect } from 'vitest';
import { meanStep, yardExitTurns, THREAT_REACH, sumProb, threatProb } from '../diceMath';

describe('meanStep / yardExitTurns / THREAT_REACH', () => {
  it('meanStep scales: 3.5, 7, 10.5, 14', () => {
    expect(meanStep(1)).toBeCloseTo(3.5, 12);
    expect(meanStep(2)).toBeCloseTo(7, 12);
    expect(meanStep(3)).toBeCloseTo(10.5, 12);
    expect(meanStep(4)).toBeCloseTo(14, 12);
  });

  it('yardExitTurns: 6 at 1 die; 36/11 ≈ 3.27 at 2; monotonically fewer', () => {
    expect(yardExitTurns(1)).toBeCloseTo(6, 12);
    expect(yardExitTurns(2)).toBeCloseTo(36 / 11, 12);
    expect(yardExitTurns(3)).toBeLessThan(yardExitTurns(2));
    expect(yardExitTurns(4)).toBeLessThan(yardExitTurns(3));
  });

  it('THREAT_REACH: 6k', () => {
    expect(THREAT_REACH(1)).toBe(6);
    expect(THREAT_REACH(2)).toBe(12);
    expect(THREAT_REACH(4)).toBe(24);
  });
});

describe('threatProb — k=1 reduction to v1 (flat 1/6)', () => {
  it('flat 1/6 across 1..6, zero beyond', () => {
    expect(threatProb(1, 0)).toBe(0);
    for (let d = 1; d <= 6; d++) expect(threatProb(1, d)).toBeCloseTo(1 / 6, 12);
    expect(threatProb(1, 7)).toBe(0);
    expect(threatProb(1, 12)).toBe(0);
  });
});

describe('threatProb — exact k=2 pins (A1: prefix-landing, descending)', () => {
  it('P(d) = P(max=d) + P(sum=d), disjoint — the sniping zone is ~3x the sum model at d=6', () => {
    expect(threatProb(2, 1)).toBeCloseTo(1 / 36, 12); // {1,1} max only
    expect(threatProb(2, 2)).toBeCloseTo(4 / 36, 12); // max 2 (3/36) + sum 2 (1/36)
    expect(threatProb(2, 6)).toBeCloseTo(16 / 36, 12); // max 6 (11/36) + sum 6 (5/36)
    expect(threatProb(2, 7)).toBeCloseTo(6 / 36, 12); // sum only
    expect(threatProb(2, 12)).toBeCloseTo(1 / 36, 12); // {6,6} sum only
    expect(threatProb(2, 13)).toBe(0); // beyond reach
  });
});

describe('threatProb — superset of sums (a landing exists wherever a sum exists)', () => {
  it('threatProb >= sumProb pointwise for k=1..4, d=0..30', () => {
    for (let k = 1; k <= 4; k++) {
      for (let d = 0; d <= 30; d++) {
        expect(threatProb(k, d)).toBeGreaterThanOrEqual(sumProb(k, d) - 1e-12);
      }
    }
  });
});

describe('sumProb — SUM-TABLE invariants (pinned HERE, on sumProb, and FORBIDDEN on threatProb)', () => {
  it('rows sum to 1 for k=1..4', () => {
    for (let k = 1; k <= 4; k++) {
      let total = 0;
      for (let d = 0; d <= 6 * k; d++) total += sumProb(k, d);
      expect(total).toBeCloseTo(1, 12);
    }
  });

  it('symmetry P(d) = P(7k - d)', () => {
    for (let k = 1; k <= 4; k++) {
      for (let d = 1; d <= 6 * k; d++) {
        expect(sumProb(k, d)).toBeCloseTo(sumProb(k, 7 * k - d), 12);
      }
    }
  });

  it('DEMONSTRATION of why these are forbidden on threatProb: its marginals exceed 1', () => {
    let total = 0;
    for (let d = 0; d <= 12; d++) total += threatProb(2, d);
    expect(total).toBeGreaterThan(1); // one 2-dice set threatens ~2 distinct distances
  });
});

describe('diceOutcomes — multiset enumeration for the search chance node', () => {
  it('counts: 6 / 21 / 56 / 126 at k=1..4; weights sum to 1', async () => {
    const { diceOutcomes } = await import('../diceMath');
    expect(diceOutcomes(1)).toHaveLength(6);
    expect(diceOutcomes(2)).toHaveLength(21);
    expect(diceOutcomes(3)).toHaveLength(56);
    expect(diceOutcomes(4)).toHaveLength(126);
    for (let k = 1; k <= 4; k++) {
      const total = diceOutcomes(k).reduce((a, o) => a + o.weight, 0);
      expect(total).toBeCloseTo(1, 12);
    }
  });
});
