/**
 * Board geometry validation (IMPLEMENTATION-PLAN-v1 §7.3.1).
 *
 * Catches placement errors at build time, not play time. This is what makes the
 * procedural-coordinate approach safe: if a cell is misplaced, this suite fails
 * before any token renders in the wrong spot.
 *
 * Note: these tests run in node (no jsdom), but Vector3 is pure math from three,
 * so it works without a WebGL context.
 */
import { describe, it, expect } from 'vitest';
import { Vector3 } from 'three';
import {
  SHARED_TRACK_COORDS,
  HOME_COORDS,
  YARD_COORDS,
  CENTER_COORD,
  positionToVector3,
} from '../boardGeometry';
import { progressToPosition } from '../../../oracle/board/track';
import type { Color } from '../../../oracle/board/track';

const COLORS: Color[] = ['red', 'green', 'yellow', 'blue'];

/** Stringify a Vector3 for readable failure messages. */
function v(v: Vector3): string {
  return `(${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)})`;
}

describe('boardGeometry — exact counts (88 total)', () => {
  it('shared loop has exactly 52 cells', () => {
    expect(SHARED_TRACK_COORDS).toHaveLength(52);
  });

  it('each color has exactly 5 home cells', () => {
    for (const c of COLORS) {
      expect(HOME_COORDS[c], `${c} home count`).toHaveLength(5);
    }
  });

  it('each color has exactly 4 yard slots', () => {
    for (const c of COLORS) {
      expect(YARD_COORDS[c], `${c} yard count`).toHaveLength(4);
    }
  });

  it('total coordinate count = 52 + (5×4) + (4×4) = 88', () => {
    const home = COLORS.reduce((s, c) => s + HOME_COORDS[c].length, 0);
    const yard = COLORS.reduce((s, c) => s + YARD_COORDS[c].length, 0);
    expect(SHARED_TRACK_COORDS.length + home + yard).toBe(88);
  });
});

describe('boardGeometry — no NaN / Infinity / duplicates', () => {
  it('no coordinate contains NaN or Infinity', () => {
    const all = [
      ...SHARED_TRACK_COORDS,
      ...COLORS.flatMap((c) => HOME_COORDS[c]),
      ...COLORS.flatMap((c) => YARD_COORDS[c]),
      CENTER_COORD,
    ];
    for (const vec of all) {
      expect(Number.isFinite(vec.x), `x finite at ${v(vec)}`).toBe(true);
      expect(Number.isFinite(vec.y), `y finite at ${v(vec)}`).toBe(true);
      expect(Number.isFinite(vec.z), `z finite at ${v(vec)}`).toBe(true);
    }
  });

  it('no two shared-loop cells share the same coordinate', () => {
    const seen = new Set<string>();
    for (const vec of SHARED_TRACK_COORDS) {
      const key = v(vec);
      expect(seen.has(key), `duplicate track cell at ${key}`).toBe(false);
      seen.add(key);
    }
  });
});

describe('boardGeometry — shared-loop spacing band', () => {
  it('consecutive track cells are ~1 unit apart (straight) or √2 (corner L-turns)', () => {
    // 4 arm-junction corners are diagonal (√2 ≈ 1.414); all others are axial (1.0).
    let corners = 0;
    for (let i = 0; i < SHARED_TRACK_COORDS.length; i++) {
      const a = SHARED_TRACK_COORDS[i];
      const b = SHARED_TRACK_COORDS[(i + 1) % SHARED_TRACK_COORDS.length];
      const dist = a.distanceTo(b);
      if (dist > 1.05) corners++; // corner L-turn
      expect(dist, `cells ${i}→${(i + 1) % 52} dist ${dist.toFixed(3)}`).toBeGreaterThan(0.95);
      expect(dist, `cells ${i}→${(i + 1) % 52} dist ${dist.toFixed(3)}`).toBeLessThan(1.45);
    }
    expect(corners, 'exactly 4 arm-junction corners').toBe(4);
  });
});

describe('boardGeometry — home columns are roughly collinear', () => {
  it.each(COLORS)('%s home cells lie on a straight line toward center', (color) => {
    const cells = HOME_COORDS[color];
    // All 5 cells should be collinear: check that the direction from cell[0]→cell[1]
    // matches the direction from cell[0]→cell[4] (normalized).
    const d1 = cells[1].clone().sub(cells[0]).normalize();
    const d4 = cells[4].clone().sub(cells[0]).normalize();
    expect(d1.dot(d4), `${color} home collinearity`).toBeGreaterThan(0.99);
  });

  it.each(COLORS)('%s home column points toward the center', (color) => {
    const first = HOME_COORDS[color][0];
    const towardCenter = CENTER_COORD.clone().sub(first).normalize();
    const columnDir = HOME_COORDS[color][4]
      .clone()
      .sub(first)
      .normalize();
    expect(columnDir.dot(towardCenter), `${color} points to center`).toBeGreaterThan(0.99);
  });
});

describe('boardGeometry — parity with oracle track model', () => {
  // Cross-check: for each color, progressToPosition(color, ENTRY_OFFSET[color])
  // should map to a track cell whose world position is the color's entry cell.
  it.each(COLORS)(
    '%s entry cell (progress 0) maps to the entry coordinate',
    (color) => {
      const pos = progressToPosition(color, 0);
      expect(pos.kind).toBe('track');
      if (pos.kind === 'track') {
        const worldFromOracle = SHARED_TRACK_COORDS[pos.cell];
        const worldFromHelper = positionToVector3(color, pos, 0);
        expect(worldFromHelper.distanceTo(worldFromOracle)).toBeLessThan(0.01);
      }
    },
  );

  it('each color diverts to home at progress 51, not track cell 51', () => {
    for (const color of COLORS) {
      const pos = progressToPosition(color, 51);
      expect(pos.kind, `${color} at progress 51`).toBe('home');
    }
  });
});

describe('boardGeometry — positionToVector3 covers all Position kinds', () => {
  it('base → yard slot', () => {
    const v = positionToVector3('red', { kind: 'base' }, 2);
    expect(v.distanceTo(YARD_COORDS.red[2])).toBeLessThan(0.01);
  });

  it('track → shared loop cell', () => {
    const v = positionToVector3('red', { kind: 'track', cell: 5 });
    expect(v.distanceTo(SHARED_TRACK_COORDS[5])).toBeLessThan(0.01);
  });

  it('home → home column cell', () => {
    const v = positionToVector3('green', { kind: 'home', cell: 3 });
    expect(v.distanceTo(HOME_COORDS.green[3])).toBeLessThan(0.01);
  });

  it('finished → center', () => {
    const v = positionToVector3('blue', { kind: 'finished' });
    expect(v.distanceTo(CENTER_COORD)).toBeLessThan(0.01);
  });
});
