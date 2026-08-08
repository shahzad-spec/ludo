/**
 * Track model tests — the Phase 0.5 hard gate (IMPLEMENTATION-PLAN-v1 §5.4).
 *
 * Every architectural commitment rides on these passing. The track model is
 * the foundation; if it's wrong, every rule built on it is wrong. 57 cases
 * across 11 groups, with 8 dedicated wrap-around tests (the #1 bug source).
 *
 * Trace any case by hand against the paper model before trusting the test.
 */
import { describe, it, expect } from 'vitest';
import {
  BASE,
  FINISH,
  ENTRY_OFFSET,
  SHARED_LOOP_LENGTH,
  progressToPosition,
  getPhase,
  isExactFinishReachable,
  cellsTraversed,
} from '../board/track';
import {
  SAFE_TRACK_CELLS,
  isSafeTrackCell,
  isSafePosition,
} from '../board/safeCells';

describe('constants', () => {
  it('shared loop is 52 cells', () => {
    expect(SHARED_LOOP_LENGTH).toBe(52);
  });

  it('entry offsets are 13 apart and evenly spaced', () => {
    expect(ENTRY_OFFSET.red).toBe(0);
    expect(ENTRY_OFFSET.green).toBe(13);
    expect(ENTRY_OFFSET.yellow).toBe(26);
    expect(ENTRY_OFFSET.blue).toBe(39);
    expect((ENTRY_OFFSET.green - ENTRY_OFFSET.red) % 13).toBe(0);
  });

  it('BASE and FINISH sentinels are distinct and outside the loop range', () => {
    expect(BASE).toBe(-1);
    expect(FINISH).toBe(56);
    expect(BASE).toBeLessThan(0);
    expect(FINISH).toBeGreaterThan(50);
  });
});

// ============================================================
// Group: Base / yard — each color, BASE → { kind: 'base' }
// ============================================================
describe('progressToPosition — base/yard', () => {
  it.each([
    ['red', BASE],
    ['green', BASE],
    ['yellow', BASE],
    ['blue', BASE],
  ] as const)('%s at BASE is in the yard', (_color, p) => {
    expect(progressToPosition(_color, p)).toEqual({ kind: 'base' });
  });
});

// ============================================================
// Group: Entry cells — each color at progress 0 → correct start cell
// ============================================================
describe('progressToPosition — entry cells', () => {
  it('red at progress 0 enters at cell 0', () => {
    expect(progressToPosition('red', 0)).toEqual({ kind: 'track', cell: 0 });
  });
  it('green at progress 0 enters at cell 13', () => {
    expect(progressToPosition('green', 0)).toEqual({ kind: 'track', cell: 13 });
  });
  it('yellow at progress 0 enters at cell 26', () => {
    expect(progressToPosition('yellow', 0)).toEqual({ kind: 'track', cell: 26 });
  });
  it('blue at progress 0 enters at cell 39', () => {
    expect(progressToPosition('blue', 0)).toEqual({ kind: 'track', cell: 39 });
  });
});

// ============================================================
// Group: Red linear movement on the shared loop
// ============================================================
describe('progressToPosition — red linear on shared loop', () => {
  // red offset = 0, so progress N → cell N (until wrap at 52, not yet here)
  it.each([
    [1, 1],
    [2, 2],
    [5, 5],
    [25, 25],
    [49, 49],
    [50, 50],
  ])('red progress %i → cell %i', (progress, cell) => {
    expect(progressToPosition('red', progress)).toEqual({ kind: 'track', cell });
  });
});

// ============================================================
// Group: WRAP-AROUND — the #1 bug source. offset + progress ≥ 52.
// Verifies modulo arithmetic for green/yellow/blue.
// ============================================================
describe('progressToPosition — wrap-around (modulo 52)', () => {
  it('green progress 40 wraps: (13+40)%52 = 1', () => {
    expect(progressToPosition('green', 40)).toEqual({ kind: 'track', cell: 1 });
  });
  it('green progress 50 is last shared cell: (13+50)%52 = 11', () => {
    expect(progressToPosition('green', 50)).toEqual({ kind: 'track', cell: 11 });
  });
  it('yellow progress 30 wraps: (26+30)%52 = 4', () => {
    expect(progressToPosition('yellow', 30)).toEqual({ kind: 'track', cell: 4 });
  });
  it('yellow progress 50 is last shared cell: (26+50)%52 = 24', () => {
    expect(progressToPosition('yellow', 50)).toEqual({ kind: 'track', cell: 24 });
  });
  it('blue progress 20 wraps: (39+20)%52 = 7', () => {
    expect(progressToPosition('blue', 20)).toEqual({ kind: 'track', cell: 7 });
  });
  it('blue progress 50 is last shared cell: (39+50)%52 = 37', () => {
    expect(progressToPosition('blue', 50)).toEqual({ kind: 'track', cell: 37 });
  });
  it('red does NOT wrap below 52 (progress 50 → cell 50)', () => {
    expect(progressToPosition('red', 50)).toEqual({ kind: 'track', cell: 50 });
  });
  it('red full loop at progress 51 would wrap, but it diverts to home', () => {
    // Sanity: progress 51 for red is home cell 0, NOT track cell 51.
    expect(progressToPosition('red', 51).kind).toBe('home');
  });
});

// ============================================================
// Group: Home-entry boundary — progress 50 = last loop cell, 51 = home cell 0
// ============================================================
describe('progressToPosition — home-entry boundary', () => {
  it.each([
    ['red', 50, 50],
    ['green', 50, 11],
    ['yellow', 50, 24],
    ['blue', 50, 37],
  ] as const)('%s progress 50 is last shared cell %i', (color, progress, cell) => {
    expect(progressToPosition(color, progress)).toEqual({ kind: 'track', cell });
  });

  it.each([
    ['red'],
    ['green'],
    ['yellow'],
    ['blue'],
  ] as const)('%s progress 51 diverts to home cell 0', (color) => {
    expect(progressToPosition(color, 51)).toEqual({ kind: 'home', cell: 0 });
  });
});

// ============================================================
// Group: Home column walk — progress 51..55 → home cells 0..4
// ============================================================
describe('progressToPosition — home column walk', () => {
  it.each([
    ['red', 51, 0],
    ['red', 52, 1],
    ['red', 53, 2],
    ['red', 54, 3],
    ['red', 55, 4],
    ['green', 55, 4],
    ['yellow', 53, 2],
    ['blue', 51, 0],
  ] as const)('%s progress %i → home cell %i', (color, progress, cell) => {
    expect(progressToPosition(color, progress)).toEqual({ kind: 'home', cell });
  });
});

// ============================================================
// Group: Finish
// ============================================================
describe('progressToPosition — finish', () => {
  it.each([
    ['red'],
    ['green'],
    ['yellow'],
    ['blue'],
  ] as const)('%s at progress 56 is finished', (color) => {
    expect(progressToPosition(color, FINISH)).toEqual({ kind: 'finished' });
  });
});

// ============================================================
// Group: getPhase derived enum
// ============================================================
describe('getPhase — derived phase label', () => {
  it('BASE → yard', () => {
    expect(getPhase(BASE)).toBe('yard');
  });
  it('progress 25 → track', () => {
    expect(getPhase(25)).toBe('track');
  });
  it('progress 53 → home', () => {
    expect(getPhase(53)).toBe('home');
  });
  it('progress 56 → finished', () => {
    expect(getPhase(FINISH)).toBe('finished');
  });
});

// ============================================================
// Group: Exact-finish legality
// ============================================================
describe('isExactFinishReachable', () => {
  it('progress 50 + roll 6 = exactly 56 → reachable', () => {
    expect(isExactFinishReachable(50, 6)).toBe(true);
  });
  it('progress 53 + roll 3 = exactly 56 → reachable', () => {
    expect(isExactFinishReachable(53, 3)).toBe(true);
  });
  it('progress 53 + roll 5 = 58 > 56 → overshoot, not reachable', () => {
    expect(isExactFinishReachable(53, 5)).toBe(false);
  });
  it('progress 55 + roll 1 = exactly 56 → reachable', () => {
    expect(isExactFinishReachable(55, 1)).toBe(true);
  });
  it('cannot finish directly from the yard', () => {
    expect(isExactFinishReachable(BASE, 6)).toBe(false);
  });
  it('rejects non-positive rolls', () => {
    expect(isExactFinishReachable(50, 0)).toBe(false);
    expect(isExactFinishReachable(50, -1)).toBe(false);
  });
});

// ============================================================
// Group: cellsTraversed — the path a token walks for a roll
// ============================================================
describe('cellsTraversed', () => {
  it('red progress 10, roll 6 → 6 positions, ending at cell 16', () => {
    const path = cellsTraversed('red', 10, 6);
    expect(path).toHaveLength(6);
    expect(path[0]).toEqual({ kind: 'track', cell: 11 });
    expect(path[5]).toEqual({ kind: 'track', cell: 16 });
  });

  it('does NOT include the starting cell', () => {
    const path = cellsTraversed('red', 10, 6);
    expect(path.some((p) => p.kind === 'track' && p.cell === 10)).toBe(false);
  });

  it('includes the destination cell', () => {
    const path = cellsTraversed('red', 10, 6);
    expect(path[path.length - 1]).toEqual({ kind: 'track', cell: 16 });
  });

  it('green wrapping move: progress 45, roll 8 ends at home cell 1 (via wrap+divert)', () => {
    // green offset 13. progress 45..50 → cells (58,59,60,61,62,63)%52 = 6,7,8,9,10,11
    // progress 51 → home 0, progress 52 → home 1. Roll 8 from 45: 46..53
    const path = cellsTraversed('green', 45, 8);
    expect(path).toHaveLength(8);
    expect(path[4]).toEqual({ kind: 'track', cell: 11 }); // progress 50
    expect(path[5]).toEqual({ kind: 'home', cell: 0 }); // progress 51
    expect(path[7]).toEqual({ kind: 'home', cell: 2 }); // progress 53
  });

  it('yard entry: BASE + roll 6 → single step to entry cell', () => {
    const path = cellsTraversed('blue', BASE, 6);
    expect(path).toEqual([{ kind: 'track', cell: 39 }]);
  });

  it('non-positive roll returns empty path', () => {
    expect(cellsTraversed('red', 10, 0)).toEqual([]);
    expect(cellsTraversed('red', 10, -2)).toEqual([]);
  });
});

// ============================================================
// Group: Safe cells
// ============================================================
describe('safe cells', () => {
  it('contains exactly the 4 starts + 4 stars', () => {
    expect(SAFE_TRACK_CELLS.size).toBe(8);
    expect([...SAFE_TRACK_CELLS].sort((a, b) => a - b)).toEqual([
      0, 8, 13, 21, 26, 34, 39, 47,
    ]);
  });

  it.each([0, 8, 13, 21, 26, 34, 39, 47])('cell %i is safe', (cell) => {
    expect(isSafeTrackCell(cell)).toBe(true);
  });

  it.each([1, 7, 12, 14, 25, 38, 48])('cell %i is NOT safe', (cell) => {
    expect(isSafeTrackCell(cell)).toBe(false);
  });

  it('base is a safe position', () => {
    expect(isSafePosition({ kind: 'base' })).toBe(true);
  });

  it('home column is a safe position', () => {
    expect(isSafePosition({ kind: 'home', cell: 2 })).toBe(true);
  });

  it('finished is a safe position', () => {
    expect(isSafePosition({ kind: 'finished' })).toBe(true);
  });

  it('a safe track cell is a safe position', () => {
    expect(isSafePosition({ kind: 'track', cell: 0 })).toBe(true);
  });

  it('a non-safe track cell is NOT a safe position', () => {
    expect(isSafePosition({ kind: 'track', cell: 5 })).toBe(false);
  });
});

// ============================================================
// Group: Out-of-range / robustness
// ============================================================
describe('robustness — out-of-range inputs', () => {
  it('progress just past finish coerces to finished (no throw)', () => {
    expect(progressToPosition('red', 57).kind).toBe('finished');
    expect(progressToPosition('red', 100).kind).toBe('finished');
  });

  it('deeply negative progress (not BASE) treats first branch as base? no — only BASE is base', () => {
    // Document the contract: only the exact BASE sentinel is 'base'.
    // Other negatives fall through to the track branch and wrap modulo 52.
    // This is intentional — callers should pass BASE, not arbitrary negatives.
    const pos = progressToPosition('red', -2);
    expect(pos.kind).not.toBe('base');
  });

  it('NaN progress does not crash (returns some Position)', () => {
    const pos = progressToPosition('red', NaN);
    expect(pos).toBeDefined();
    // NaN <= 50 is false, NaN < 56 is false, NaN === 56 is false → finished branch
    expect(pos.kind).toBe('finished');
  });
});
