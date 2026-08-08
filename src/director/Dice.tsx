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

import { useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import type { Group } from 'three';
import { useGame } from '../store/useGame';
import { createDiceRollTimeline, faceRestingRotation } from './anim/diceRoll';
import { createDiceMaterials } from './anim/dicePips';

export function Dice() {
  const phase = useGame((s) => s.state.phase);
  const diceValue = useGame((s) => s.state.dice.value);
  const dispatch = useGame((s) => s.dispatch);
  const ref = useRef<Group>(null);

  // Pip materials (generated once, memoized — CanvasTexture is expensive).
  const materials = useMemo(() => createDiceMaterials(), []);

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

  // The dice sits on a dedicated pad at the board's right edge — outside all
  // yard plates and path tiles, never overlapping tokens.
  const PAD_X = 9;
  const PAD_Z = 0;
  const DICE_Y = 0.55;

  return (
    <group>
      {/* Dice pad — a small recessed dark square */}
      <mesh position={[PAD_X, 0.02, PAD_Z]} receiveShadow>
        <boxGeometry args={[2, 0.06, 2]} />
        <meshStandardMaterial color="#2c2c2c" roughness={0.6} metalness={0.15} />
      </mesh>

      {/* The die */}
      <group ref={ref} position={[PAD_X, DICE_Y, PAD_Z]}>
        <mesh castShadow material={materials}>
          <boxGeometry args={[0.8, 0.8, 0.8]} />
        </mesh>
      </group>
    </group>
  );
}
