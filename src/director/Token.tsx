/**
 * Token — a single game piece (ARCHITECTURE-v3 §7.2).
 *
 * Subscribes narrowly to its own token via the store, computes its world position
 * from the logical Position (the Position→Vector3 boundary), and renders a beveled
 * pawn. Phase 2: instant teleport on state change (no animation). Phase 3 adds the
 * GSAP hop timeline driven by the TOKEN_MOVED event.
 *
 * Stacking: when multiple tokens share a cell, each is offset into a small cluster
 * so all are visible and individually clickable. The offset is computed from the
 * token's index among co-located tokens (same logical Position).
 *
 * Data-driven: rendered for every token in state.tokens (Scene maps them), so a
 * 2-player game naturally shows 8 tokens, 3-player shows 12.
 */
import { useRef, useMemo, useEffect, useState } from 'react';
import type { Group } from 'three';
import { useGame } from '../store/useGame';
import { useUI } from '../store/uiStore';
import { bus } from '../bus/events';
import { positionToVector3, TOKEN_Y, SHARED_TRACK_COORDS, YARD_COORDS } from './config/boardGeometry';
import { Y } from './config/renderLayers';
import { createHopTimeline } from './anim/tokenHop';
import { victimFlyBack, attackerBounce } from './anim/captureSequence';
import { progressToPosition, BASE } from '../oracle/board/track';
import type { Color, Position } from '../oracle/board/track';
import type { Token as TokenData } from '../oracle/types';

const COLOR_HEX: Record<Color, string> = {
  red: '#e74c3c',
  green: '#2ecc71',
  yellow: '#f1c40f',
  blue: '#3498db',
};

/** Position key for grouping co-located tokens (same cell/home/yard-slot). */
function posKey(color: Color, pos: Position, slot: number): string {
  switch (pos.kind) {
    case 'base': return `yard:${color}:${slot}`;
    case 'track': return `track:${pos.cell}`;
    case 'home': return `home:${color}:${pos.cell}`;
    case 'finished': return 'finished';
  }
}

/** Small offsets for up to 4 stacked tokens on one cell (in cell-local XZ). */
const STACK_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],       // 1 token: center
  [-0.18, -0.18], // 2+ tokens: spread to a 2x2 cluster
  [0.18, -0.18],
  [-0.18, 0.18],
  [0.18, 0.18],
];

export function Token({ tokenId }: { tokenId: string }) {
  const token = useGame((s) => s.state.tokens[tokenId]);
  const dispatch = useGame((s) => s.dispatch);
  const phase = useGame((s) => s.state.phase);
  const validMoves = useGame((s) => s.state.validMoves);
  const allTokens = useGame((s) => s.state.tokens);
  const selectedTokenId = useUI((s) => s.selectedTokenId);
  const select = useUI((s) => s.select);
  const ref = useRef<Group>(null);

  // Compute this token's position + its stack offset among co-located tokens.
  const { world, stackOffset } = useMemo(() => {
    if (!token) return { world: null, stackOffset: [0, 0] as [number, number] };
    const pos = progressToPosition(token.color, token.progress);
    const base = positionToVector3(token.color, pos, token.slot);

    // Find all tokens sharing this exact position key; get this token's index.
    const myKey = posKey(token.color, pos, token.slot);
    const siblings = Object.values(allTokens).filter((t) => {
      const tp = progressToPosition(t.color, t.progress);
      return posKey(t.color, tp, t.slot) === myKey;
    });
    const myIndex = siblings.findIndex((t) => t.id === tokenId);
    const count = siblings.length;
    const offset: [number, number] =
      count === 1 ? [0, 0] : STACK_OFFSETS[Math.min(myIndex, STACK_OFFSETS.length - 1)] as [number, number];

    return { world: base, stackOffset: offset };
  }, [token, allTokens, tokenId]);

  // Animation: when TOKEN_MOVED fires for this token, hop along the path.
  // During animation, suppress the state-derived position (GSAP controls it).
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const unsub = bus.on('TOKEN_MOVED', (event) => {
      if (!event.tokenIds.includes(tokenId) || !ref.current) return;
      // Convert the event's path (logical Positions) to world waypoints.
      const waypoints = event.path.map((pos) =>
        positionToVector3(token!.color, pos, token!.slot),
      );
      if (waypoints.length === 0) return;
      setIsAnimating(true);
      const tl = createHopTimeline(ref.current, waypoints, () => {
        setIsAnimating(false);
        // THE auto-resolve wire: GSAP onComplete is the ONLY caller of RESOLVE_MOVE.
        dispatch({ type: 'RESOLVE_MOVE' });
      });
      tl.play();
    });
    return unsub;
  }, [tokenId, token, dispatch]);

  // Capture: when this token is the victim, play the fly-back arc.
  // When it's the attacker, play a victory bounce.
  useEffect(() => {
    if (!ref.current) return;
    const unsub = bus.on('TOKEN_CAPTURED', (event) => {
      if (!ref.current || !token) return;
      if (event.victimId === tokenId) {
        // Victim: fly back to yard
        setIsAnimating(true);
        const captureCellCoord = SHARED_TRACK_COORDS[event.cell];
        const yardCoord = YARD_COORDS[token.color][token.slot];
        if (!captureCellCoord || !yardCoord) return;
        const tl = victimFlyBack(
          ref.current,
          captureCellCoord.clone(),
          yardCoord.clone(),
          () => {
            setIsAnimating(false);
          },
        );
        tl.play();
      } else if (event.attackerId === tokenId) {
        // Attacker: victory bounce
        attackerBounce(ref.current).play();
      }
    });
    return unsub;
  }, [tokenId, token]);

  if (!token || !world) return null;

  const isMovable =
    phase === 'SELECTING_TOKEN' &&
    validMoves.some((m) => m.tokenIds.includes(tokenId));
  const isSelected = selectedTokenId === tokenId;

  // Two-step selection in SELECTING_TOKEN:
  //   - First click on a movable token → select (highlight), no move yet.
  //   - Second click on the SAME selected token → confirm move (REQUEST_MOVE).
  //   - Click a DIFFERENT movable token → switch selection to it.
  //   - Clicking empty space (handled by Board's onPointerMissed) → deselect.
  function handleClick() {
    if (phase !== 'SELECTING_TOKEN') return;
    if (!isMovable) return;
    if (isSelected) {
      dispatch({ type: 'REQUEST_MOVE', tokenId });
    } else {
      select(tokenId);
    }
  }

  // Stack height: when multiple tokens share a cell, lift each slightly so they
  // don't z-fight and the top of the stack is visually distinct.
  const liftY = isSelected ? TOKEN_Y + 0.15 : TOKEN_Y; // selected token lifts up

  // When animating, GSAP controls the group position — don't let React override.
  // When not animating, derive position from state as before.
  const groupX = isAnimating ? undefined : world.x + stackOffset[0];
  const groupY = isAnimating ? undefined : liftY;
  const groupZ = isAnimating ? undefined : world.z + stackOffset[1];

  return (
    <group
      ref={ref}
      position={groupX !== undefined ? [groupX, groupY!, groupZ!] : undefined}
      onClick={(e) => {
        e.stopPropagation();
        handleClick();
      }}
    >
      {/* Selection ring at Y.RING (above tiles/overlay, no Z-fighting). */}
      {isMovable && (
        <mesh
          position={[0, Y.RING - liftY, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <ringGeometry args={[0.34, 0.44, 24]} />
          <meshStandardMaterial
            color={isSelected ? '#ffffff' : '#ffd700'}
            emissive={isSelected ? '#ffffff' : '#ffd700'}
            emissiveIntensity={0.6}
            transparent
            opacity={0.8}
            polygonOffset
            polygonOffsetFactor={-1}
          />
        </mesh>
      )}

      {/* Pawn body — a cylinder + sphere cap, beveled look via two meshes */}
      <mesh castShadow position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.28, 0.34, 0.4, 24]} />
        <meshStandardMaterial
          color={COLOR_HEX[token.color]}
          roughness={0.35}
          metalness={0.15}
          emissive={isSelected ? '#ffffff' : '#000000'}
          emissiveIntensity={isSelected ? 0.35 : 0}
        />
      </mesh>
      <mesh castShadow position={[0, 0.52, 0]}>
        <sphereGeometry args={[0.22, 24, 16]} />
        <meshStandardMaterial
          color={COLOR_HEX[token.color]}
          roughness={0.35}
          metalness={0.15}
          emissive={isSelected ? '#ffffff' : '#000000'}
          emissiveIntensity={isSelected ? 0.35 : 0}
        />
      </mesh>
    </group>
  );
}

// Re-export for consumers
export type { TokenData };
export { BASE };
