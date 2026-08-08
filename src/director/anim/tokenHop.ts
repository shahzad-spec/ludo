/**
 * Token hop animation — bezier arc + squash/stretch per cell (PLAN §8.3).
 *
 * For a multi-cell move, we chain N single-cell hops. Each hop:
 *   1. Launch: squash Y down (anticipation)
 *   2. Arc: travel from→to via a parabolic Y peak (the "hop")
 *   3. Land: squash Y + stretch X on impact
 *   4. Recover: ease back to identity scale
 *
 * ~150ms per cell, slight overlap for fluid multi-cell runs.
 */

import { gsap } from './gsap';
import type { Object3D, Vector3 } from 'three';

const HOP_MS = 160;
const HOP_PEAK = 0.6; // world units up at arc apex
const SQUASH = 0.7;   // Y scale at land
const STRETCH = 1.2;  // X/Z scale at land

/**
 * Create a chained hop timeline for a token traversing a list of waypoints.
 * Each waypoint is a world-space Vector3 the token hops to (in sequence).
 * The token's group is animated; onComplete fires after the last hop.
 */
export function createHopTimeline(
  token: Object3D,
  waypoints: Vector3[],
  onComplete?: () => void,
): gsap.core.Timeline {
  const tl = gsap.timeline({ onComplete });

  for (let i = 0; i < waypoints.length; i++) {
    const wp = waypoints[i];

    // Arc: move X/Z linearly while Y goes up then down (parabola via two tweens)
    tl.to(token.position, {
      x: wp.x,
      z: wp.z,
      duration: HOP_MS / 1000,
      ease: 'none',
    }, i * (HOP_MS - 20) / 1000); // slight overlap (-20ms)

    // Y up (first half of hop)
    tl.to(token.position, {
      y: wp.y + HOP_PEAK,
      duration: (HOP_MS / 2) / 1000,
      ease: 'power2.out',
    }, i * (HOP_MS - 20) / 1000);

    // Y down (second half — land)
    tl.to(token.position, {
      y: wp.y,
      duration: (HOP_MS / 2) / 1000,
      ease: 'power2.in',
      onStart: () => {
        if (i === waypoints.length - 1) {
          // Final landing: squash + stretch
          gsap.to(token.scale, {
            x: STRETCH, z: STRETCH, y: SQUASH,
            duration: 0.06,
            yoyo: true, repeat: 1,
            ease: 'power2.out',
          });
        }
      },
    }, i * (HOP_MS - 20) / 1000 + (HOP_MS / 2) / 1000);
  }

  return tl;
}
