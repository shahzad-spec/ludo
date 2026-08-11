/**
 * Evaluation function tests (PLAN-PHASE-5B §3.5).
 * Amendment C: strict monotonicity across zones.
 */

import { describe, it, expect } from 'vitest';
import { tokenValue, evaluate, riskScale, captureTempoScale } from '../evaluate';
import { stateWithPlacements } from '../../__tests__/helpers';
import { BASE, FINISH } from '../../board/track';

describe('tokenValue — zone values', () => {
  it('yard (BASE) = 0', () => {
    expect(tokenValue(BASE)).toBe(0);
  });

  it('track p=0 = 0', () => {
    expect(tokenValue(0)).toBe(0);
  });

  it('track p=43 = 43 (no bonus yet)', () => {
    expect(tokenValue(43)).toBe(43);
  });

  it('track p=44 = 46 (bonus kicks in: 44 + 1×2)', () => {
    expect(tokenValue(44)).toBe(46);
  });

  it('track p=50 = 64', () => {
    expect(tokenValue(50)).toBe(64);
  });

  it('home h=0 (progress 51) = 66', () => {
    expect(tokenValue(51)).toBe(66);
  });

  it('home h=4 (progress 55) = 98', () => {
    expect(tokenValue(55)).toBe(98);
  });

  it('finished (progress 56) = 100', () => {
    expect(tokenValue(FINISH)).toBe(100);
  });
});

describe('tokenValue — amendment C monotonicity', () => {
  it('track(50) < home(51): 64 < 66 — bot WANTS to enter home', () => {
    expect(tokenValue(50)).toBeLessThan(tokenValue(51));
  });

  it('strictly increasing along every legal move path', () => {
    let prev = tokenValue(BASE);
    for (let p = 0; p <= 50; p++) {
      const v = tokenValue(p);
      expect(v, `progress ${p}`).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    // Track → home boundary
    expect(tokenValue(50)).toBeLessThan(tokenValue(51));
    // Home column
    prev = tokenValue(51);
    for (let p = 52; p <= 55; p++) {
      expect(tokenValue(p)).toBeGreaterThan(prev);
      prev = tokenValue(p);
    }
    // Home → finished
    expect(tokenValue(55)).toBeLessThan(tokenValue(FINISH));
  });
});

describe('evaluate — board scoring', () => {
  it('positive when my tokens are further ahead', () => {
    const state = stateWithPlacements({
      'red-0': { color: 'red', progress: 30 },
      'red-1': { color: 'red', progress: 20 },
      'green-0': { color: 'green', progress: 5 },
      'green-1': { color: 'green', progress: 3 },
      'yellow-0': { color: 'yellow', progress: -1 },
      'yellow-1': { color: 'yellow', progress: -1 },
      'blue-0': { color: 'blue', progress: -1 },
      'blue-1': { color: 'blue', progress: -1 },
    });
    const score = evaluate(state, 'red');
    expect(score).toBeGreaterThan(0);
  });

  it('negative when opponents are ahead', () => {
    const state = stateWithPlacements({
      'red-0': { color: 'red', progress: 5 },
      'green-0': { color: 'green', progress: 30 },
      'green-1': { color: 'green', progress: 25 },
    });
    const score = evaluate(state, 'red');
    expect(score).toBeLessThan(0);
  });
});

describe('riskScale + captureTempoScale — amendment E', () => {
  it('riskScale > 1 when ahead', () => {
    const state = stateWithPlacements({
      'red-0': { color: 'red', progress: 40 },
      'green-0': { color: 'green', progress: 5 },
    });
    expect(riskScale(state, 'red')).toBeGreaterThan(1);
  });

  it('riskScale = 1 when behind', () => {
    const state = stateWithPlacements({
      'red-0': { color: 'red', progress: 5 },
      'green-0': { color: 'green', progress: 40 },
    });
    expect(riskScale(state, 'red')).toBe(1);
  });

  it('captureTempoScale > 1 when behind', () => {
    const state = stateWithPlacements({
      'red-0': { color: 'red', progress: 5 },
      'green-0': { color: 'green', progress: 40 },
    });
    expect(captureTempoScale(state, 'red')).toBeGreaterThan(1);
  });

  it('captureTempoScale = 1 when ahead', () => {
    const state = stateWithPlacements({
      'red-0': { color: 'red', progress: 40 },
      'green-0': { color: 'green', progress: 5 },
    });
    expect(captureTempoScale(state, 'red')).toBe(1);
  });
});
