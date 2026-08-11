/**
 * Threat detection tests (PLAN-PHASE-5B §3.6).
 */

import { describe, it, expect } from 'vitest';
import { exposurePenalty } from '../threats';
import { stateWithPlacements } from '../../__tests__/helpers';

describe('exposurePenalty', () => {
  it('no penalty on safe cell', () => {
    const state = stateWithPlacements({
      'red-0': { color: 'red', progress: 5 },
      'green-0': { color: 'green', progress: 10 },
    });
    // Cell 0 is safe (red start)
    expect(exposurePenalty(state, { kind: 'track', cell: 0 }, 'red', 1, 5)).toBe(0);
  });

  it('no penalty when no opponents nearby', () => {
    // Green at progress 10 → cell (13+10)%52 = 23. Red at cell 5. behind = (5-23+52)%52 = 34. Out of range.
    const state = stateWithPlacements({
      'red-0': { color: 'red', progress: 5 },
      'green-0': { color: 'green', progress: 10 },
    });
    expect(exposurePenalty(state, { kind: 'track', cell: 5 }, 'red', 1, 5)).toBe(0);
  });

  it('penalty when opponent is 1-6 cells behind', () => {
    // Green at progress 44 → cell (13+44)%52 = 5
    // Red token at cell 10 → behind = (10-5+52)%52 = 5 → within range
    const state = stateWithPlacements({
      'red-0': { color: 'red', progress: 10 },
      'green-0': { color: 'green', progress: 44 },
    });
    const penalty = exposurePenalty(state, { kind: 'track', cell: 10 }, 'red', 1, 10);
    expect(penalty).toBeGreaterThan(0);
  });

  it('no penalty when opponent is 7+ cells behind', () => {
    // Green at cell 3, red token at cell 10 → behind = 7 → out of range
    const state = stateWithPlacements({
      'red-0': { color: 'red', progress: 10 },
      'green-0': { color: 'green', progress: 42 }, // cell (13+42)%52 = 3
    });
    expect(exposurePenalty(state, { kind: 'track', cell: 10 }, 'red', 1, 10)).toBe(0);
  });

  it('penalty scales with riskScale', () => {
    const state = stateWithPlacements({
      'red-0': { color: 'red', progress: 10 },
      'green-0': { color: 'green', progress: 44 },
    });
    const base = exposurePenalty(state, { kind: 'track', cell: 10 }, 'red', 1, 10);
    const scaled = exposurePenalty(state, { kind: 'track', cell: 10 }, 'red', 1.5, 10);
    expect(scaled).toBeGreaterThan(base);
  });
});
