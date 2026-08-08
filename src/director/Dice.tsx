/**
 * Dice — the 3D die that tumbles and lands on the Oracle's value (PLAN §8.2).
 *
 * Listens to the phase machine:
 *   - When phase → ROLLING, reads dice.value (already rolled by the Oracle) and
 *     plays the face-guaranteed tumble timeline.
 *   - On timeline complete → dispatches RESOLVE_ROLL (severing the auto-resolve
 *     wire from UI; GSAP onComplete is the only caller).
 *
 * The die's resting orientation is set via useGsapLayoutTimeline (state-setting,
 * before paint, no flash). The roll itself is event-triggered via useEffect.
 */

import { useRef, useEffect, useLayoutEffect } from 'react';
import type { Group } from 'three';
import { useGame } from '../store/useGame';
import { createDiceRollTimeline, faceRestingRotation } from './anim/diceRoll';

export function Dice() {
  const phase = useGame((s) => s.state.phase);
  const diceValue = useGame((s) => s.state.dice.value);
  const dispatch = useGame((s) => s.dispatch);
  const ref = useRef<Group>(null);

  // Set resting orientation (face 1) before paint — no one-frame-wrong-face flash.
  useLayoutEffect(() => {
    if (ref.current) {
      const r = faceRestingRotation(1);
      ref.current.rotation.set(r.x, r.y, r.z);
    }
  }, []);

  // Event-triggered: when phase becomes ROLLING, play the tumble + settle.
  useEffect(() => {
    if (phase !== 'ROLLING' || !ref.current || !diceValue) return;
    const value = diceValue as 1 | 2 | 3 | 4 | 5 | 6;

    const tl = createDiceRollTimeline(ref.current, value);
    tl.eventCallback('onComplete', () => {
      // THE auto-resolve wire: GSAP onComplete is the ONLY caller of RESOLVE_ROLL.
      dispatch({ type: 'RESOLVE_ROLL', value });
    });
    tl.play();
  }, [phase, diceValue, dispatch]);

  if (phase === 'GAME_OVER') return null;

  return (
    <group ref={ref} position={[6, 0.5, -6]}>
      {/* Die body — a box. Face pips/textures come in v2; v1 is a clean white cube. */}
      <mesh castShadow>
        <boxGeometry args={[0.8, 0.8, 0.8]} />
        <meshStandardMaterial color="#f8f8f8" roughness={0.3} metalness={0.1} />
      </mesh>
    </group>
  );
}
