/**
 * Dice roll animation — deterministic, face-guaranteed (IMPLEMENTATION-PLAN-v1 §8.2).
 *
 * No physics. The Oracle rolls the value; the Director plays a pre-baked timeline
 * that tumbles the die and ends on the orientation showing that face up.
 *
 * A standard die is a boxGeometry. Each face's "up" orientation is a specific
 * Euler rotation. We tumble to a random mid-air spin, then settle to the target
 * orientation. The mid-air spin makes it look chaotic; the settle guarantees
 * the face.
 *
 * Face → target rotation (so face N points up):
 *   1: identity (0,0,0)
 *   2: rotate X -90°  (around X axis)
 *   3: rotate Z +90°
 *   4: rotate Z -90°
 *   5: rotate X +90°
 *   6: rotate X 180°
 */

import { gsap } from './gsap';
import type { Object3D } from 'three';

const DEG = Math.PI / 180;

/** Target resting rotation (Euler radians) for each face to show up. */
const FACE_ROTATION: Record<number, { x: number; y: number; z: number }> = {
  1: { x: 0, y: 0, z: 0 },
  2: { x: -90 * DEG, y: 0, z: 0 },
  3: { x: 0, y: 0, z: 90 * DEG },
  4: { x: 0, y: 0, z: -90 * DEG },
  5: { x: 90 * DEG, y: 0, z: 0 },
  6: { x: 180 * DEG, y: 0, z: 0 },
};

/**
 * Create a dice-roll timeline for `target` that tumbles the die and lands on
 * the face showing `target`. Duration ~1.2s. Returns a gsap timeline (not yet
 * played — caller controls playback).
 */
export function createDiceRollTimeline(
  target: Object3D,
  value: 1 | 2 | 3 | 4 | 5 | 6,
): gsap.core.Timeline {
  const tl = gsap.timeline();
  const dest = FACE_ROTATION[value];

  // Phase 1: quick tumble — random full rotations on all axes (~0.8s)
  tl.to(target.rotation, {
    x: `+=${(2 + Math.floor(Math.random() * 2)) * Math.PI}`,
    y: `+=${(1 + Math.floor(Math.random() * 2)) * Math.PI}`,
    z: `+=${(2 + Math.floor(Math.random() * 2)) * Math.PI}`,
    duration: 0.8,
    ease: 'power2.out',
  });

  // Phase 2: settle to exact target orientation (~0.4s) — the face guarantee
  tl.to(target.rotation, {
    x: dest.x,
    y: dest.y,
    z: dest.z,
    duration: 0.4,
    ease: 'power3.out',
  });

  return tl;
}

/** The resting rotation for a given face (for setting initial state). */
export function faceRestingRotation(value: 1 | 2 | 3 | 4 | 5 | 6) {
  return { ...FACE_ROTATION[value] };
}
