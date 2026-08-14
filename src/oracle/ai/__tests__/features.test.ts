/**
 * Feature extractor tests — ETF race model + offense/defense (PHASE-5C §3.2-3.5).
 *
 * ETF (Expected Turns To Finish) is the foundation of every "who is winning"
 * judgment. The hard invariant is MONOTONICITY: a token closer to finishing
 * must have a strictly lower ETF.
 *
 * Capture-shot geometry is the MIRROR of exposure: shots look AHEAD of me
 * ((oppCell − myCell) ∈ 1..6); exposure looks BEHIND. Both directions are pinned
 * here and in threats.test.ts — geometry mix-ups are this codebase's #1 bug class.
 */

import { describe, it, expect } from 'vitest';
import {
  tokenETF,
  colorETF,
  raceLeader,
  raceLead,
  captureShots,
  shotPressure,
  opponentMass,
  spread,
  homeLoaded,
  finishGap,
  MEAN_STEP,
  YARD_EXIT_TURNS,
  LEADER_TAX,
  ambushPressure,
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

describe('captureShots — live capture opportunities (look AHEAD)', () => {
  it('a shot exists when an opponent is 1\u20136 AHEAD on a non-safe cell', () => {
    // red-0 cell 10; green-0 progress 1 → cell 14 (4 ahead). Roll 4 → capture.
    const state = stateWithPlacements({
      'red-0': { color: 'red', progress: 10 },
      'green-0': { color: 'green', progress: 1 },
    });
    const shots = captureShots(state, 'red');
    const onGreen = shots.find((s) => s.victimId === 'green-0');
    expect(onGreen, 'expected a shot against green-0').toBeDefined();
    expect(onGreen!.neededRoll).toBe(4); // forward distance
  });

  it('NO shot when the opponent is BEHIND me (that is exposure, not offense)', () => {
    // red-0 cell 10; green-0 progress 45 → cell 6 (4 behind). No capture possible.
    const state = stateWithPlacements({
      'red-0': { color: 'red', progress: 10 },
      'green-0': { color: 'green', progress: 45 },
    });
    expect(captureShots(state, 'red')).toHaveLength(0);
  });

  it('NO shot when the opponent is 7+ cells ahead (out of dice range)', () => {
    // red-0 cell 10; green-0 progress 4 → cell 17 (7 ahead).
    const state = stateWithPlacements({
      'red-0': { color: 'red', progress: 10 },
      'green-0': { color: 'green', progress: 4 },
    });
    expect(captureShots(state, 'red')).toHaveLength(0);
  });

  it('NO shot when the opponent sits on a SAFE cell', () => {
    // red-0 cell 10; green-0 progress 0 → cell 13 (green start, SAFE). dist 3 but safe.
    const state = stateWithPlacements({
      'red-0': { color: 'red', progress: 10 },
      'green-0': { color: 'green', progress: 0 },
    });
    expect(captureShots(state, 'red')).toHaveLength(0);
  });
});

describe('shotPressure — expected-value-weighted capture pressure', () => {
  it('positive when a live shot exists', () => {
    const state = stateWithPlacements({
      'red-0': { color: 'red', progress: 10 },
      'green-0': { color: 'green', progress: 1 }, // cell 14, 4 ahead
    });
    expect(shotPressure(state, 'red')).toBeGreaterThan(0);
  });

  it('zero when there are no live shots', () => {
    const state = stateWithPlacements({
      'red-0': { color: 'red', progress: 10 },
      'green-0': { color: 'green', progress: 45 }, // behind → no shot
    });
    expect(shotPressure(state, 'red')).toBe(0);
  });
});

describe('opponentMass — leader-taxed opponent token value', () => {
  it("weights the race leader\u2019s tokens \u00d7LEADER_TAX", () => {
    // green is the leader; green-0 (progress 10) is worth 10 raw → 10 \u00d7 1.6 = 16.
    const state = stateWithPlacements({
      'red-0': { color: 'red', progress: 0 },
      'green-0': { color: 'green', progress: 10 },
    });
    expect(opponentMass(state, 'red')).toBe(10 * LEADER_TAX);
  });

  it('zero when all opponents are in the yard', () => {
    const state = stateWithPlacements({ 'red-0': { color: 'red', progress: 10 } });
    expect(opponentMass(state, 'red')).toBe(0);
  });
});

describe('structural features', () => {
  it('spread counts my tokens in play (yard and finished excluded)', () => {
    const state = stateWithPlacements({
      'red-0': { color: 'red', progress: 10 },
      'red-1': { color: 'red', progress: 20 },
    });
    expect(spread(state, 'red')).toBe(2);
  });

  it('homeLoaded counts my tokens in the home column', () => {
    const state = stateWithPlacements({ 'red-0': { color: 'red', progress: 53 } });
    expect(homeLoaded(state, 'red')).toBe(1);
  });

  it('finishGap = my finished count \u2212 the leader\u2019s finished count', () => {
    const state = stateWithPlacements({ 'red-0': { color: 'red', progress: FINISH } });
    expect(finishGap(state, 'red')).toBe(1);
  });
});

describe('ambushPressure — anticipation band (5C-6)', () => {
  // Geometry: red-0 parks on safe star cell 8 (p8). blue-0 progress is chosen so
  // its cell = (39 + pb) % 52 lands where each case needs. All blue positions are
  // well past exit (exit = p0 at cell 39) per the exit-cell rule.
  it('positive for an opponent 1-6 behind my SAFE token', () => {
    const state = stateWithPlacements({
      'red-0': { color: 'red', progress: 8 }, // cell 8, safe star
      'blue-0': { color: 'blue', progress: 18 }, // cell 5, 3 behind
    });
    expect(ambushPressure(state, 'red')).toBeGreaterThan(0);
  });

  it('discounted but positive at 7-12 behind (the band proper)', () => {
    const state = stateWithPlacements({
      'red-0': { color: 'red', progress: 8 },
      'blue-0': { color: 'blue', progress: 9 }, // cell 48, 12 behind
    });
    expect(ambushPressure(state, 'red')).toBeGreaterThan(0);
  });

  it('zero for an opponent behind my UNSAFE token (that is danger, not prey)', () => {
    const state = stateWithPlacements({
      'red-0': { color: 'red', progress: 10 }, // cell 10, not safe
      'blue-0': { color: 'blue', progress: 18 }, // cell 5, 5 behind
    });
    expect(ambushPressure(state, 'red')).toBe(0);
  });

  it('zero when the opponent is AHEAD (that is shotPressure territory)', () => {
    const state = stateWithPlacements({
      'red-0': { color: 'red', progress: 8 },
      'blue-0': { color: 'blue', progress: 27 }, // cell 14, ahead of cell 8
    });
    expect(ambushPressure(state, 'red')).toBe(0);
  });

  it('zero beyond the band (13+ behind)', () => {
    const state = stateWithPlacements({
      'red-0': { color: 'red', progress: 8 },
      'blue-0': { color: 'blue', progress: 8 }, // cell 47, 13 behind
    });
    expect(ambushPressure(state, 'red')).toBe(0);
  });
});
