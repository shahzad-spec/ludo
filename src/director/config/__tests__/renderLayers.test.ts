/**
 * Render-layer audit test — prevents Z-fighting regressions.
 *
 * Asserts every pair of Y values is ≥ MIN_GAP apart. If a future tidy-up
 * makes two surfaces coplanar, this fails at build time, not at render time.
 */
import { describe, it, expect } from 'vitest';
import { Y, findCoplanarLayers } from '../renderLayers';

describe('renderLayers — no coplanar surfaces', () => {
  it('all Y values are pairwise ≥ MIN_GAP apart', () => {
    const violation = findCoplanarLayers();
    expect(violation, `coplanar: ${violation?.a} & ${violation?.b}, gap=${violation?.gap}`).toBeNull();
  });

  it('tiles sit above the slab', () => {
    expect(Y.TILE_TOP).toBeGreaterThan(Y.SLAB_TOP);
  });

  it('overlay sits above tiles', () => {
    expect(Y.OVERLAY).toBeGreaterThan(Y.TILE_TOP);
  });

  it('selection ring sits above overlay', () => {
    expect(Y.RING).toBeGreaterThan(Y.OVERLAY);
  });

  it('yard plate sits below tiles (it is the colored floor of the yard)', () => {
    expect(Y.YARD_PLATE).toBeGreaterThan(Y.SLAB_TOP);
    expect(Y.YARD_PLATE).toBeLessThan(Y.TILE_TOP);
  });
});
