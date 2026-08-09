/**
 * Dice — the 3D die that tumbles and lands on the Oracle's value (PLAN §8.2).
 *
 * - Tumbles on ROLLING, auto-resolves via GSAP onComplete.
 * - Body tints to the current player's pastel color on TURN_CHANGED
 *   (material.color multiply: white bg tints, black pips stay black).
 */

import { useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { Color, Group } from 'three';
import { useGame } from '../store/useGame';
import { createDiceRollTimeline, faceRestingRotation } from './anim/diceRoll';
import { createDiceMaterials } from './anim/dicePips';
import { gsap } from './anim/gsap';
import type { Color as PlayerColor } from '../oracle/board/track';

const PLAYER_HEX: Record<PlayerColor, string> = {
  red: '#ff4444',
  green: '#44cc44',
  yellow: '#ffcc44',
  blue: '#4488ff',
};

/** Lerp a player color 30% toward white — saturated enough to read as the player's color. */
function pastelColor(color: PlayerColor): Color {
  return new Color(PLAYER_HEX[color]).lerp(new Color('#ffffff'), 0.3);
}

export function Dice() {
  const phase = useGame((s) => s.state.phase);
  const diceValue = useGame((s) => s.state.dice.value);
  const currentPlayer = useGame((s) => s.state.currentPlayer);
  const dispatch = useGame((s) => s.dispatch);
  const ref = useRef<Group>(null);

  const materials = useMemo(() => createDiceMaterials(), []);

  // Set resting orientation (face 1) before paint — no flash.
  useLayoutEffect(() => {
    if (ref.current) {
      const r = faceRestingRotation(1);
      ref.current.rotation.set(r.x, r.y, r.z);
    }
  }, []);

  // Dice color per turn: tween material.color to the player's pastel.
  useEffect(() => {
    const target = pastelColor(currentPlayer);
    materials.forEach((mat) => {
      gsap.to(mat.color, {
        r: target.r, g: target.g, b: target.b,
        duration: 0.4, ease: 'power2.out',
      });
    });
  }, [currentPlayer, materials]);

  // Tumble on ROLLING.
  useEffect(() => {
    if (phase !== 'ROLLING' || !ref.current || !diceValue) return;
    const value = diceValue as 1 | 2 | 3 | 4 | 5 | 6;
    const tl = createDiceRollTimeline(ref.current, value);
    tl.eventCallback('onComplete', () => {
      dispatch({ type: 'RESOLVE_ROLL', value });
    });
    tl.play();
  }, [phase, diceValue, dispatch]);

  if (phase === 'GAME_OVER') return null;

  const PAD_X = 9;
  const PAD_Z = 0;
  const DICE_Y = 0.55;

  return (
    <group>
      <mesh position={[PAD_X, 0.02, PAD_Z]} receiveShadow>
        <boxGeometry args={[2, 0.06, 2]} />
        <meshStandardMaterial color="#2c2c2c" roughness={0.6} metalness={0.15} />
      </mesh>
      <group ref={ref} position={[PAD_X, DICE_Y, PAD_Z]}>
        <mesh castShadow material={materials}>
          <boxGeometry args={[0.8, 0.8, 0.8]} />
        </mesh>
      </group>
    </group>
  );
}
