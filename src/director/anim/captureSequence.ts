/**
 * Capture drama sequence — the emotional centerpiece of Ludo (PLAN-PHASE-4 §6).
 *
 * On TOKEN_CAPTURED:
 *   1. Slow-mo: gsap.globalTimeline.timeScale(0.3) for the duration.
 *   2. Attacker bounce: scale 1.0→1.2→1.0 elastic.
 *   3. Victim fly-back: bezier arc from capture cell → yard slot, 360° Y-spin.
 *   4. Restore timeScale to 1.0.
 *
 * The spark burst (particle) + screen flash + popup are handled by separate
 * systems (EffectManager, ScreenFlash, CapturePopup). This module handles the
 * 3D choreography only.
 */

import { gsap } from './gsap';
import type { Object3D, Vector3 } from 'three';

/**
 * Play the attacker's victory bounce.
 * @returns the gsap timeline (caller doesn't need to wait, but can).
 */
export function attackerBounce(attacker: Object3D): gsap.core.Timeline {
  const tl = gsap.timeline();
  tl.to(attacker.scale, {
    x: 1.3, y: 1.3, z: 1.3,
    duration: 0.15,
    ease: 'back.out(2)',
  });
  tl.to(attacker.scale, {
    x: 1, y: 1, z: 1,
    duration: 0.2,
    ease: 'elastic.out(1, 0.5)',
  });
  return tl;
}

/**
 * Play the victim's fly-back arc: from the capture cell to the yard slot,
 * spinning 360° on Y. Duration ~0.8s real-time (longer in slow-mo).
 */
export function victimFlyBack(
  victim: Object3D,
  fromWorld: Vector3,
  toWorld: Vector3,
  onComplete?: () => void,
): gsap.core.Timeline {
  const tl = gsap.timeline({ onComplete });

  // Arc: X/Z move linearly, Y goes up then down (parabola)
  tl.to(victim.position, {
    x: toWorld.x,
    z: toWorld.z,
    duration: 0.8,
    ease: 'power1.inOut',
  });

  // Y up (first half)
  tl.to(victim.position, {
    y: Math.max(fromWorld.y, toWorld.y) + 1.5,
    duration: 0.4,
    ease: 'power2.out',
  }, 0);

  // Y down (second half — land in yard)
  tl.to(victim.position, {
    y: toWorld.y,
    duration: 0.4,
    ease: 'power2.in',
  }, 0.4);

  // 360° spin on Y
  tl.to(victim.rotation, {
    y: victim.rotation.y + Math.PI * 2,
    duration: 0.8,
    ease: 'power1.inOut',
  }, 0);

  return tl;
}

/**
 * Slow-mo wrapper: sets globalTimeline.timeScale to 0.3, runs a callback,
 * then restores to 1.0 after the given duration (in real seconds).
 */
export function withSlowMo(durationSec: number, action: () => void): void {
  gsap.globalTimeline.timeScale(0.3);
  action();
  // Restore after duration (in real time, not scaled time)
  setTimeout(() => {
    gsap.globalTimeline.timeScale(1);
  }, durationSec * 1000);
}
