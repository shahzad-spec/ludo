/**
 * 2D layout for the DebugHarness.
 *
 * The harness is for STATE-MACHINE validation, not aesthetics, so we don't try
 * to render a cross-shaped Ludo board. Instead:
 *   - The 52 shared-loop cells render as a horizontal strip (rows of 13).
 *   - Each color's 5 home-column cells render in a small block beside the loop.
 *   - Each color's 4 yard slots render in a small block.
 *
 * This keeps every logical Position mappable to a stable screen location so a
 * human can watch tokens teleport and verify captures/turns visually.
 *
 * This module imports from oracle/ (read-only utilities) — allowed for stage.
 */

import { BASE } from '../../oracle/board/track';
import type { Color, Position } from '../../oracle/board/track';

/** A renderable cell on the 2D board. */
export interface DisplayCell {
  /** Stable key for React. */
  key: string;
  /** CSS grid area or absolute position label. */
  label: string;
  /** Optional color tint (for home columns / yards / safe cells). */
  tint?: Color;
  /** Is this a safe cell? */
  safe?: boolean;
}

/** The 52 shared-loop cells in display order (0..51). */
export const LOOP_CELLS: DisplayCell[] = Array.from({ length: 52 }, (_, cell) => {
  const startOf: Record<number, Color> = {
    0: 'red',
    13: 'green',
    26: 'yellow',
    39: 'blue',
  };
  return {
    key: `loop-${cell}`,
    label: String(cell),
    tint: startOf[cell],
    safe: [0, 8, 13, 21, 26, 34, 39, 47].includes(cell),
  };
});

/** One color's home column (5 cells, 0..4). */
export function homeCells(color: Color): DisplayCell[] {
  return Array.from({ length: 5 }, (_, cell) => ({
    key: `home-${color}-${cell}`,
    label: `${color[0].toUpperCase()}${cell}`,
    tint: color,
  }));
}

/** One color's yard (4 slots). */
export function yardCells(color: Color): DisplayCell[] {
  return Array.from({ length: 4 }, (_, slot) => ({
    key: `yard-${color}-${slot}`,
    label: `${color[0].toUpperCase()}y${slot}`,
    tint: color,
  }));
}

/**
 * Find which display cell a token currently occupies.
 * Returns a key matching one of the DisplayCell.key values above, or null if
 * the token is finished (rendered in the finish area instead).
 */
export function tokenDisplayKey(
  color: Color,
  position: Position,
  slot: number,
): string | null {
  switch (position.kind) {
    case 'base':
      return `yard-${color}-${slot}`;
    case 'track':
      return `loop-${position.cell}`;
    case 'home':
      return `home-${color}-${position.cell}`;
    case 'finished':
      return null;
  }
}

/** Re-export for the harness. */
export { BASE };
