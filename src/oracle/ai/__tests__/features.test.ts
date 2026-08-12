/**
 * Feature extractor tests — ETF race model (PHASE-5C §3.2).
 *
 * ETF (Expected Turns To Finish) is the foundation of every "who is winning"
 * judgment in the competitive bot. The hard invariant is MONOTONICITY: a token
 * closer to finishing must have a strictly lower ETF.
 */

import { describe, it, expect } from 'vitest';
import {
  tokenETF,
  colorETF,
  raceLeader,
  raceLead,
  MEAN_STEP,
  YARD_EXIT_TURNS,
} from '../features';
import { stateWithPlacements } from '../../__tests__/helpers';
import { BASE, FINISH } from '../../board/track';

describe('tokenETF — the per-token race model', () => {
  it('finished (FINISH) = 0', () => {
    expect(tokenETF(FINISH)).toBe(0);
  });

  it('yard (BASE) is the most expensive position', () => {
    expect(tokenETF(BASE)).toBeGreaterThan(tokenETF(0));
  });

  it('track start (progress 0) = FINISH / MEAN_STEP = 16', () => {
    expect(tokenETF(0)).toBe(FINISH / MEAN_STEP);
  });

  it('yard (BASE) = YARD_EXIT_TURNS + FINISH/MEAN_STEP = 22', () => {
    expect(tokenETF(BASE)).toBe(YARD_EXIT_TURNS + FINISH / MEAN_STEP);
  });

  it('strictly decreases as progress increases along the shared loop', () => {
    for (let p = 0; p < 50; p++) {
      expect(tokenETF(p), `progress ${p}`).toBeGreaterThan(tokenETF(p + 1));
    }
  });

  it('strictly decreases across the home column into finished', () => {
    // track end (50) → home cells (51..55) → finished (56)
    for (let p = 50; p < FINISH; p++) {
      expect(tokenETF(p), `progress ${p}`).toBeGreaterThan(tokenETF(p + 1));
    }
    expect(tokenETF(FINISH)).toBe(0);
  });
});

describe('colorETF — house-level race position', () => {
  it('all-yard house = 4 × tokenETF(BASE) = 88', () => {
    const state = stateWithPlacements({}); // every token in yard
    expect(colorETF(state, 'red')).toBe(4 * tokenETF(BASE));
  });

  it('decreases as one of the color\u2019s tokens advances', () => {
    const yard = stateWithPlacements({});
    const advanced = stateWithPlacements({ 'red-0': { color: 'red', progress: 20 } });
    expect(colorETF(advanced, 'red')).toBeLessThan(colorETF(yard, 'red'));
  });

  it('finished tokens contribute 0', () => {
    const state = stateWithPlacements({ 'red-0': { color: 'red', progress: FINISH } });
    // 3 yard tokens (3 × 22) + 1 finished (0) = 66
    expect(colorETF(state, 'red')).toBe(3 * tokenETF(BASE));
  });
});

describe('raceLeader — the opponent currently winning', () => {
  it('returns the opponent with the lowest colorETF', () => {
    // Red all yard; green has a token advanced → green is winning the race.
    const state = stateWithPlacements({ 'green-0': { color: 'green', progress: 40 } });
    expect(raceLeader(state, 'red')).toBe('green');
  });

  it('never returns me, even when I am ahead', () => {
    // Red is ahead, but raceLeader must report the fastest OPPONENT.
    const state = stateWithPlacements({
      'red-0': { color: 'red', progress: 50 },
      'green-0': { color: 'green', progress: 10 },
    });
    const leader = raceLeader(state, 'red');
    expect(leader).not.toBe('red');
    expect(leader).toBe('green');
  });

  it('returns null when no opponents remain', () => {
    const state = stateWithPlacements(
      { 'red-0': { color: 'red', progress: 10 } },
      { turnOrder: ['red'] },
    );
    expect(raceLeader(state, 'red')).toBeNull();
  });
});

describe('raceLead — am I ahead of the fastest opponent', () => {
  it('positive when I am ahead of every opponent', () => {
    const state = stateWithPlacements({
      'red-0': { color: 'red', progress: 50 },
      'green-0': { color: 'green', progress: 5 },
    });
    expect(raceLead(state, 'red')).toBeGreaterThan(0);
  });

  it('negative when an opponent is ahead of me', () => {
    const state = stateWithPlacements({
      'red-0': { color: 'red', progress: 5 },
      'green-0': { color: 'green', progress: 50 },
    });
    expect(raceLead(state, 'red')).toBeLessThan(0);
  });

  it('Infinity when no opponents remain (uncontested)', () => {
    const state = stateWithPlacements(
      { 'red-0': { color: 'red', progress: 10 } },
      { turnOrder: ['red'] },
    );
    expect(raceLead(state, 'red')).toBe(Infinity);
  });
});
