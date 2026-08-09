/**
 * Celebration sequences — yard-entry pop, finish spin, win dance (PLAN-PHASE-4 §6).
 *
 * All go through the GSAP funnel. Each returns a timeline the caller plays.
 */

import { gsap } from './gsap';
import type { Object3D } from 'three';

/**
 * Yard-entry pop: token scales 0→1.15→1 with elastic overshoot.
 * Plays after the hop animation completes on a yard-entry move.
 */
export function yardEntryPop(token: Object3D): gsap.core.Timeline {
  const tl = gsap.timeline();
  token.scale.set(0, 0, 0); // start invisible
  tl.to(token.scale, {
    x: 1.15, y: 1.15, z: 1.15,
    duration: 0.2,
    ease: 'back.out(2)',
  });
  tl.to(token.scale, {
    x: 1, y: 1, z: 1,
    duration: 0.25,
    ease: 'elastic.out(1, 0.5)',
  });
  return tl;
}

/**
 * Finish spin: token does a 360° victory spin on Y.
 * Plays when a token reaches the finish (isFinishing flag).
 */
export function finishSpin(token: Object3D): gsap.core.Timeline {
  const tl = gsap.timeline();
  tl.to(token.rotation, {
    y: token.rotation.y + Math.PI * 2,
    duration: 0.6,
    ease: 'power2.inOut',
  });
  tl.to(token.scale, {
    x: 1.2, y: 1.2, z: 1.2,
    duration: 0.15,
    ease: 'back.out(2)',
    yoyo: true,
    repeat: 1,
  }, 0);
  return tl;
}

/**
 * Win dance: a single token bounces up and down. Called for each of the
 * winner's tokens with a stagger delay so they dance in sync (slightly offset).
 */
export function winDance(token: Object3D, delay: number = 0): gsap.core.Timeline {
  const tl = gsap.timeline({ delay });
  tl.to(token.position, {
    y: '+=0.5',
    duration: 0.25,
    ease: 'power2.out',
    yoyo: true,
    repeat: 5,
  });
  return tl;
}
