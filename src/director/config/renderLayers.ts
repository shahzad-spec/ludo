/**
 * Render layers — explicit Y offsets so no two surfaces are ever coplanar.
 *
 * Z-fighting (the shredded/streaky look) happens when two meshes share the same
 * depth value and the GPU can't decide which is in front. The fix is structural:
 * every surface type lives at its own Y, separated by ≥0.01 units. The audit test
 * (renderLayers.test.ts) enforces this so a future tidy-up can't reintroduce it.
 *
 * Convention: the board slab top is at Y=0. Everything else stacks above it.
 * Tiles are boxes with real height (top at TILE_TOP), not planes flush with the
 * slab. Overlays (safe tints, selection rings, yard plates) each get a distinct Y.
 */

export const Y = {
  /** Board base slab top face — the wooden surface. */
  SLAB_TOP: 0,
  /** Path/home tiles are boxes; their top face sits clearly above the slab. */
  TILE_TOP: 0.08,
  /** Safe-star / start-color tint plane, just above tiles. */
  OVERLAY: 0.1,
  /** Selection ring under a token. */
  RING: 0.12,
  /** Yard plate (translucent colored square). */
  YARD_PLATE: 0.06,
} as const;

/**
 * Tile geometry: width × height × depth. Tiles are boxes centered so their
 * bottom touches the slab and their top is at Y.TILE_TOP.
 */
export const TILE_SIZE = {
  W: 0.95,
  H: Y.TILE_TOP, // box height = top offset (centered at H/2)
  D: 0.95,
} as const;

/**
 * Assert every pair of Y values is ≥ MIN_GAP apart. Called by the audit test.
 * Returns the violating pair if any, or null if all clear.
 */
export const MIN_GAP = 0.01;

export function findCoplanarLayers(): { a: string; b: string; gap: number } | null {
  const entries = Object.entries(Y) as [string, number][];
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const [ka, va] = entries[i];
      const [kb, vb] = entries[j];
      const gap = Math.abs(va - vb);
      if (gap < MIN_GAP) {
        return { a: ka, b: kb, gap };
      }
    }
  }
  return null;
}
