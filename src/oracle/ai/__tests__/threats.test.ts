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
    expect(exposurePenalty(state, { kind: 'track', cell: 0 }, 'red', 1, 5)).toBe(0);
  });

  // Semantic direction tests (reviewer request) — verify the formula is
  // (dest − opp), NOT (opp − dest).
  it('penalty when opponent is BEHIND (can reach me next roll)', () => {
    // I land on cell 10. Opponent at cell 6 (4 behind). Rolls 4 → captures me.
    const state = stateWithPlacements({
      'red-0': { color: 'red', progress: 10 },
      'green-0': { color: 'green', progress: 45 }, // cell (13+45)%52 = 6
    });
    expect(exposurePenalty(state, { kind: 'track', cell: 10 }, 'red', 1, 10)).toBeGreaterThan(0);
  });

  it('NO penalty when opponent is AHEAD (moving away from me)', () => {
    // I land on cell 10. Opponent at cell 14 (4 ahead). Cannot reach me.
    const state = stateWithPlacements({
      'red-0': { color: 'red', progress: 10 },
      'green-0': { color: 'green', progress: 1 }, // cell (13+1)%52 = 14
    });
    expect(exposurePenalty(state, { kind: 'track', cell: 10 }, 'red', 1, 10)).toBe(0);
  });

  it('no penalty when opponent is 7+ cells behind', () => {
    // I land on cell 10. Opponent at cell 3 (7 behind). Out of dice range.
    const state = stateWithPlacements({
      'red-0': { color: 'red', progress: 10 },
      'green-0': { color: 'green', progress: 42 }, // cell (13+42)%52 = 3
    });
    expect(exposurePenalty(state, { kind: 'track', cell: 10 }, 'red', 1, 10)).toBe(0);
  });

  it('no penalty when no opponents on the track', () => {
    const state = stateWithPlacements({
      'red-0': { color: 'red', progress: 10 },
      'green-0': { color: 'green', progress: -1 }, // in yard
    });
    expect(exposurePenalty(state, { kind: 'track', cell: 10 }, 'red', 1, 10)).toBe(0);
  });

  it('penalty scales with riskScale', () => {
    const state = stateWithPlacements({
      'red-0': { color: 'red', progress: 10 },
      'green-0': { color: 'green', progress: 45 }, // cell 6, 4 behind cell 10
    });
    const base = exposurePenalty(state, { kind: 'track', cell: 10 }, 'red', 1, 10);
    const scaled = exposurePenalty(state, { kind: 'track', cell: 10 }, 'red', 1.5, 10);
    expect(scaled).toBeGreaterThan(base);
  });
});
