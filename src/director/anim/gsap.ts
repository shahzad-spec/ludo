/**
 * useGsapTimeline — the mandatory GSAP funnel (IMPLEMENTATION-PLAN-v1 §8.1.1).
 *
 * Every GSAP timeline in the Director goes through this hook. It enforces:
 *  - gsap.context() scoping (selectors/tweens scoped to the component)
 *  - ctx.revert() cleanup on unmount (kills timeline + reverts inline styles)
 *    → React 18 Strict Mode's double-mount can't stack tweens or drift tokens
 *  - useLayoutEffect for state-setting tweens (no one-frame-wrong-state flash)
 *
 * Two entry points:
 *  - useGsapLayoutTimeline: for state-setting tweens (dice resting orientation,
 *    token resting position). Runs before paint.
 *  - useGsapEffectTimeline: for event-triggered tweens (a hop that starts when
 *    TOKEN_MOVED fires). Runs after paint.
 *
 * Both return a ref to the created timeline (null until mounted).
 */

import { useLayoutEffect, useEffect, useRef, type DependencyList } from 'react';
import { gsap } from 'gsap';

type TimelineFactory = () => gsap.core.Timeline;

/** State-setting timeline: useLayoutEffect (before paint, no flash). */
export function useGsapLayoutTimeline(setup: TimelineFactory, deps: DependencyList) {
  const tlRef = useRef<gsap.core.Timeline | null>(null);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      tlRef.current = setup();
    });
    return () => ctx.revert();
  }, deps);

  return tlRef;
}

/** Event-triggered timeline: useEffect (after paint, fine for triggered anims). */
export function useGsapEffectTimeline(setup: TimelineFactory, deps: DependencyList) {
  const tlRef = useRef<gsap.core.Timeline | null>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      tlRef.current = setup();
    });
    return () => ctx.revert();
  }, deps);

  return tlRef;
}

/**
 * Play a one-shot timeline imperatively (for event-driven anims like dice roll).
 * Creates a fresh context, plays, and reverts on completion. Safe under Strict
 * Mode because the context is local to this call, not stored across renders.
 */
export function playOneShot(
  factory: TimelineFactory,
  onComplete?: () => void,
): gsap.core.Timeline {
  const tl = factory();
  if (onComplete) tl.eventCallback('onComplete', onComplete);
  tl.play();
  return tl;
}

export { gsap };
