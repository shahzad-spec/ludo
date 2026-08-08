/**
 * Safe cells on the shared loop. Standard Ludo rules:
 *   - the 4 colored start cells (where each color enters the loop), and
 *   - 4 "star" cells midway between starts.
 * A token on a safe cell cannot be captured.
 *
 * With ENTRY_OFFSET red=0, green=13, yellow=26, blue=39, the starts are
 * 0, 13, 26, 39. The classic stars sit one cell before each subsequent start,
 * i.e. 8 before the next start by convention — here we use the widely-played
 * set: the 4 starts plus the 4 cells at 8, 21, 34, 47 (each ~halfway to the
 * next color's start). Safe cells are only on the shared loop, never in the
 * home columns (those are private — no opponents can land there anyway).
 */

import type { Position } from './track';

/** The shared-loop cells that grant safety from capture. */
export const SAFE_TRACK_CELLS: ReadonlySet<number> = new Set([
  0, 8, 13, 21, 26, 34, 39, 47,
]);

/** True if a shared-loop cell index is safe. */
export function isSafeTrackCell(cell: number): boolean {
  return SAFE_TRACK_CELLS.has(cell);
}

/**
 * True if a Position is safe from capture.
 * Base, home column, and finished are all inherently safe (opponents can't
 * reach them). On the shared loop, only SAFE_TRACK_CELLS are safe.
 */
export function isSafePosition(pos: Position): boolean {
  switch (pos.kind) {
    case 'base':
    case 'home':
    case 'finished':
      return true;
    case 'track':
      return isSafeTrackCell(pos.cell);
  }
}
