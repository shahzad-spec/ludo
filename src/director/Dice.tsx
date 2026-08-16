/**
 * Dice — the 3D dice that tumble and land on the Oracle's values (PLAN §8.2,
 * PHASE-5D 5D-4 for multi-dice).
 *
 * - Renders `rules.diceCount` dice side by side on the tray.
 * - On ROLLING the whole set tumbles together (each die to its rolledSet face)
 *   and auto-resolves via a completion counter — one RESOLVE_ROLL per set.
 * - Dice dim (opacity + no shadow read) as they are played or burned: the
 *   display order is descending (the A1 queue play order), so the leftmost
 *   `played` dice are the consumed ones. The queue is the source of truth.
 * - Body tints to the current player's pastel color on TURN_CHANGED.
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

const PAD_X = 9;
const DICE_Y = 0.55;
const SPREAD = 1.15;

export function Dice() {
  const phase = useGame((s) => s.state.phase);
  const diceCount = useGame((s) => s.state.rules.diceCount);
  const rolledSet = useGame((s) => s.state.dice.rolledSet);
  const queue = useGame((s) => s.state.dice.queue);
  const diceValue = useGame((s) => s.state.dice.value);
  const currentPlayer = useGame((s) => s.state.currentPlayer);
  const dispatch = useGame((s) => s.dispatch);
  const refs = useRef<(Group | null)[]>([]);

  const n = Math.max(diceCount, 1);
  // One material set PER DIE so played dice can dim independently.
  const materials = useMemo(
    () => Array.from({ length: n }, () => createDiceMaterials()),
    [n],
  );

  // Set resting orientation (face 1) before paint — no flash.
  useLayoutEffect(() => {
    refs.current.forEach((g) => {
      if (g) {
        const r = faceRestingRotation(1);
        g.rotation.set(r.x, r.y, r.z);
      }
    });
  }, [n]);

  // Dice color per turn: tween material.color to the player's pastel.
  useEffect(() => {
    const target = pastelColor(currentPlayer);
    materials.forEach((mats) =>
      mats.forEach((mat) => {
        gsap.to(mat.color, {
          r: target.r, g: target.g, b: target.b,
          duration: 0.4, ease: 'power2.out',
        });
      }),
    );
  }, [currentPlayer, materials]);

  // Tumble the SET on ROLLING — each die to its face; resolve once when all land.
  useEffect(() => {
    if (phase !== 'ROLLING' || rolledSet.length === 0) return;
    const display = [...rolledSet].sort((a, b) => b - a); // queue play order
    let completed = 0;
    display.forEach((value, i) => {
      const g = refs.current[i];
      if (!g) return;
      const tl = createDiceRollTimeline(g, value as 1 | 2 | 3 | 4 | 5 | 6);
      tl.eventCallback('onComplete', () => {
        completed++;
        if (completed === display.length) {
          dispatch({ type: 'RESOLVE_ROLL', value: (diceValue ?? display[0]) as number });
        }
      });
      tl.play();
    });
  }, [phase, rolledSet, diceValue, dispatch]);

  // Dim played/burned dice: the first `played` in display order are consumed.
  const played = rolledSet.length > 0 ? rolledSet.length - queue.length : 0;
  useEffect(() => {
    materials.forEach((mats, i) => {
      const dim = i < played;
      mats.forEach((mat) => {
        mat.transparent = true;
        mat.opacity = dim ? 0.35 : 1;
      });
    });
  }, [played, materials, rolledSet]);

  if (phase === 'GAME_OVER') return null;

  const xFor = (i: number): number => (i - (n - 1) / 2) * SPREAD;
  const trayWidth = 2 + (n - 1) * SPREAD;

  return (
    <group>
      <mesh position={[PAD_X, 0.02, 0]} receiveShadow>
        <boxGeometry args={[trayWidth, 0.06, 2]} />
        <meshStandardMaterial color="#2c2c2c" roughness={0.6} metalness={0.15} />
      </mesh>
      {Array.from({ length: n }).map((_, i) => (
        <group
          key={i}
          ref={(g: Group | null) => {
            refs.current[i] = g;
          }}
          position={[PAD_X + xFor(i), DICE_Y, 0]}
        >
          <mesh castShadow material={materials[i]}>
            <boxGeometry args={[0.8, 0.8, 0.8]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
