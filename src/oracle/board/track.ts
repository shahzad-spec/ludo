/**
 * The Ludo track data model — the foundation of the entire game.
 *
 * Every token's journey is a single linear `progress` index per color. This is
 * the ONLY source of truth for a token's location; the readable `getPhase()`
 * enum is derived from it, never stored separately (which would risk desync).
 *
 * Convention (IMPLEMENTATION-PLAN-v1 §5.1):
 *
 *   progress: BASE ─ 0 ─────────────── 50 │ 51 52 53 54 55 ─ 56
 *              │     <── shared loop ──►     <── home col ──►  FINISH
 *            (yard)   cell = (ENTRY_OFFSET[color] + progress) % 52
 *
 *   BASE = -1            → token in its yard
 *   0..50                → on the 52-cell shared loop
 *   51..55               → the color's private 5-cell home column (cells 0..4)
 *   56                   → finished
 *
 * Home-entry geometry: a color travels 51 steps of the shared loop (progress
 * 0→50), reaching the cell just before its own start, then diverts into its
 * home column at progress 51. Trace for green (offset 13): progress 50 → cell
 * (13+50)%52 = 11; the next shared cell would be 12 (its own start), so it
 * diverts instead. This is standard Ludo semantics.
 *
 * Exact finish: progress + roll === 56 → legal; anything over is an overshoot.
 */

/** The four player colors. Fixed 4-player board (v1 decision). */
export type Color = 'red' | 'green' | 'yellow' | 'blue';

/** Sentinel for "token is in the yard, not yet on the board." */
export const BASE = -1;

/** progress value meaning "token has reached the finish." */
export const FINISH = 56;

/** Number of cells in the shared cross-shaped loop. */
export const SHARED_LOOP_LENGTH = 52;

/** Number of cells in each color's private home column (excludes finish). */
export const HOME_COLUMN_LENGTH = 5;

/**
 * Where each color enters the shared loop, as a cell index 0..51.
 * Colors are 13 cells apart → 4 colors evenly spaced around the 52-cell loop.
 * Red starts at cell 0, green at 13, yellow at 26, blue at 39.
 */
export const ENTRY_OFFSET: Record<Color, number> = {
  red: 0,
  green: 13,
  yellow: 26,
  blue: 39,
};

/**
 * Boundary constants between the shared loop and the home column.
 * A token travels 51 steps on the shared loop (progress 0..50), then diverts
 * into its home column (progress 51..55), then finishes (56).
 *
 * Written as literals, not derived arithmetic, so the boundary can't drift
 * from a typo (an earlier draft computed 52-1+1 and silently got 52 — the
 * test suite caught it. Prefer explicit values here).
 */
export const LAST_SHARED_TRACK_PROGRESS = 50;
export const FIRST_HOME_PROGRESS = 51;

/** A logical board position. The Director maps this to a world-space Vector3. */
export type Position =
  | { kind: 'base' }
  | { kind: 'track'; cell: number } // 0..51
  | { kind: 'home'; cell: number } // 0..4
  | { kind: 'finished' };

/** Readable phase label, derived from progress (never stored separately). */
export type Phase = 'yard' | 'track' | 'home' | 'finished';

/**
 * Convert a token's progress into its logical Position on the board.
 *
 * This is pure: given the same (color, progress) it always returns the same
 * Position. No THREE, no React — the Director translates Position → Vector3.
 */
export function progressToPosition(color: Color, progress: number): Position {
  if (progress === BASE) return { kind: 'base' };
  if (progress <= LAST_SHARED_TRACK_PROGRESS) {
    const cell = (ENTRY_OFFSET[color] + progress) % SHARED_LOOP_LENGTH;
    return { kind: 'track', cell };
  }
  if (progress < FINISH) {
    // 51..55 → home cells 0..4
    return { kind: 'home', cell: progress - FIRST_HOME_PROGRESS };
  }
  if (progress === FINISH) return { kind: 'finished' };
  // Out of range: callers should guard against this, but we coerce to finished
  // rather than throw, so a buggy caller can never wedge the reducer.
  return { kind: 'finished' };
}

/**
 * Derive the readable phase label from progress. Used by the UI/Director to
 * branch on state without duplicating the boundary arithmetic.
 */
export function getPhase(progress: number): Phase {
  if (progress === BASE) return 'yard';
  if (progress <= LAST_SHARED_TRACK_PROGRESS) return 'track';
  if (progress < FINISH) return 'home';
  return 'finished';
}

/**
 * Whether a roll can legally advance a token to exactly the finish.
 * With exactFinishRequired: true, overshooting 56 is illegal.
 */
export function isExactFinishReachable(progress: number, roll: number): boolean {
  // Can't finish from the yard in a single move (entry is handled separately
  // by legalMoves using enterOnSix). Defensive: reject non-positive rolls.
  if (progress === BASE) return false;
  if (roll <= 0) return false;
  return progress + roll === FINISH;
}

/**
 * List the logical Positions a token passes through for a given roll.
 *
 * Does NOT include the starting cell; DOES include the destination. This is
 * what capture/safe-cell logic iterates over later — and because v1 uses
 * stacking: 'none' (no blocks), we don't need an intermediate-cell barrier
 * check, but we still return the full path for capture-via-landing and for
 * future 'block' support in v2.
 *
 * For a yard entry (progress === BASE, roll === 6 with enterOnSix), the path
 * is a single step onto the entry cell.
 */
export function cellsTraversed(
  color: Color,
  fromProgress: number,
  roll: number,
): Position[] {
  if (roll <= 0) return [];

  // Yard entry: jump straight to the entry cell (progress 0).
  if (fromProgress === BASE) {
    // Only a 6 (with enterOnSix) allows this; legalMoves validates that, but
    // this function is pure geometry — we return the entry position regardless
    // and let the caller decide legality.
    return [progressToPosition(color, 0)];
  }

  const path: Position[] = [];
  for (let step = 1; step <= roll; step++) {
    const nextProgress = fromProgress + step;
    // Overshooting finish is illegal — legalMoves filters this out before
    // calling. If called anyway, stop at the boundary.
    if (nextProgress > FINISH) break;
    path.push(progressToPosition(color, nextProgress));
  }
  return path;
}
