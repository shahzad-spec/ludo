/**
 * Token — a single game piece (ARCHITECTURE-v3 §7.2).
 *
 * Position control: IMPERATIVE. The <group> has NO position prop. Instead, a
 * useEffect syncs the group's position to the state-derived world coordinate
 * ONLY when GSAP is not animating (isAnimating || isFlyingBack). This prevents
 * the React-vs-GSAP conflict where React snaps a captured token to the yard
 * before GSAP can animate the fly-back.
 *
 * Data-driven: rendered for every token in state.tokens (Scene maps them).
 */

import { useRef, useMemo, useEffect, useState } from 'react';
import type { Group } from 'three';
import { useGame } from '../store/useGame';
import { useUI } from '../store/uiStore';
import { bus } from '../bus/events';
import { positionToVector3, TOKEN_Y, SHARED_TRACK_COORDS, YARD_COORDS } from './config/boardGeometry';
import { Y } from './config/renderLayers';
import { createHopTimeline, createGlideTimeline } from './anim/tokenHop';
import { gsap } from './anim/gsap';
import { winDance } from './anim/celebrationSequence';
import { TokenModel } from './TokenSkin';
import { useCosmetics } from '../store/cosmeticsStore';
import { TOKEN_SKINS } from '../theme/tokenSkins';
import { progressToPosition, BASE } from '../oracle/board/track';
import type { Color, Position } from '../oracle/board/track';
import type { Token as TokenData } from '../oracle/types';

function posKey(color: Color, pos: Position, slot: number): string {
  switch (pos.kind) {
    case 'base': return `yard:${color}:${slot}`;
    case 'track': return `track:${pos.cell}`;
    case 'home': return `home:${color}:${pos.cell}`;
    case 'finished': return 'finished';
  }
}

const STACK_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [-0.18, -0.18],
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

  // Animation flags — when true, GSAP controls position; React stays out.
  const [isAnimating, setIsAnimating] = useState(false);
  const [isFlyingBack, setIsFlyingBack] = useState(false);

  // Compute world position + stack offset from state.
  const { world, stackOffset } = useMemo(() => {
    if (!token) return { world: null, stackOffset: [0, 0] as [number, number] };
    const pos = progressToPosition(token.color, token.progress);
    const base = positionToVector3(token.color, pos, token.slot);
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

  const isSelected = selectedTokenId === tokenId;
  const liftY = isSelected ? TOKEN_Y + 0.15 : TOKEN_Y;

  // IMPERATIVE position sync: update the group's position ONLY when GSAP is not
  // controlling it. This is the React-vs-GSAP safe pattern — no declarative
  // position prop on the <group>, so React never fights a running tween.
  useEffect(() => {
    if (!ref.current || !world) return;
    if (isAnimating || isFlyingBack) return; // GSAP has control
    ref.current.position.set(
      world.x + stackOffset[0],
      liftY,
      world.z + stackOffset[1],
    );
    // Belt-and-braces: normalize transform so no animation can leave a deformed token
    ref.current.scale.set(1, 1, 1);
    ref.current.rotation.set(0, 0, 0);
  }, [world, stackOffset, liftY, isAnimating, isFlyingBack]);

  // TOKEN_MOVED → glide (home column) or hop (shared loop), then celebrations
  useEffect(() => {
    if (!ref.current) return;
    const unsub = bus.on('TOKEN_MOVED', (event) => {
      if (!event.tokenIds.includes(tokenId) || !ref.current || !token) return;

      // Yard entry: set scale to 0 SYNCHRONOUSLY before the hop
      if (event.isEnteringBoard && ref.current) {
        ref.current.scale.set(0, 0, 0);
      }

      setIsAnimating(true);

      const glide = event.isEnteringHome || event.isFinishing;

      if (glide) {
        // ONE continuous arc over the home column — no per-cell hops
        const target = positionToVector3(token!.color, { kind: 'home', cell: event.finalProgress - 51 }, token!.slot);
        // For finishing, target is the center
        const finalTarget = event.isFinishing
          ? positionToVector3(token!.color, { kind: 'finished' }, token!.slot)
          : target;
        const cells = event.path.length;
        const gl = createGlideTimeline(ref.current, finalTarget, cells, () => {
          if (event.isFinishing) {
            // Finish bounce + pulse
            const tl2 = gsap.timeline({
              onComplete: () => {
                setIsAnimating(false);
                dispatch({ type: 'RESOLVE_MOVE' });
              },
            });
            tl2.to(ref.current!.position, { y: '+=0.6', duration: 0.2, ease: 'power2.out' })
               .to(ref.current!.scale, { x: 1.3, y: 1.3, z: 1.3, duration: 0.2, ease: 'power2.out' }, 0)
               .to(ref.current!.position, { y: TOKEN_Y, duration: 0.3, ease: 'bounce.out' })
               .to(ref.current!.scale, { x: 1, y: 1, z: 1, duration: 0.3, ease: 'elastic.out(1, 0.5)' }, '-=0.2');
            tl2.play();
          } else {
            setIsAnimating(false);
            dispatch({ type: 'RESOLVE_MOVE' });
          }
        });
        gl.play();
      } else {
        // Per-cell hops (shared loop)
        const waypoints = event.path.map((pos) =>
          positionToVector3(token!.color, pos, token!.slot),
        );
        if (waypoints.length === 0) return;
        const tl = createHopTimeline(ref.current, waypoints, () => {
          setIsAnimating(false);
          dispatch({ type: 'RESOLVE_MOVE' });
          if (event.isEnteringBoard && ref.current) {
            const pop = gsap.timeline();
            pop.to(ref.current.scale, { x: 1.15, y: 1.15, z: 1.15, duration: 0.25, ease: 'power2.out' })
               .to(ref.current.scale, { x: 1, y: 1, z: 1, duration: 0.3, ease: 'elastic.out(1, 0.4)' });
            pop.play();
          }
        });
        tl.play();
      }
    });
    return unsub;
  }, [tokenId, token, dispatch]);

  // TOKEN_CAPTURED → victim fly-back + attacker victory jump
  useEffect(() => {
    if (!ref.current) return;
    const unsub = bus.on('TOKEN_CAPTURED', (event) => {
      if (!ref.current || !token) return;

      if (event.victimId === tokenId) {
        // --- VICTIM FLY-BACK ---
        setIsFlyingBack(true);
        const startPos = SHARED_TRACK_COORDS[event.cell];
        const endPos = YARD_COORDS[token.color][token.slot];
        if (!startPos || !endPos) return;

        // Snap to capture cell immediately before animating
        ref.current.position.set(startPos.x, TOKEN_Y, startPos.z);
        ref.current.scale.set(1, 1, 1);

        const tl = gsap.timeline({
          onComplete: () => {
            // Reset dramatic transforms before handing control back to React
            ref.current?.scale.set(1, 1, 1);
            ref.current?.rotation.set(0, 0, 0);
            setIsFlyingBack(false);
            gsap.globalTimeline.timeScale(1);
          },
        });

        // Arc X/Z
        tl.to(ref.current.position, {
          x: endPos.x, z: endPos.z,
          duration: 1.2, ease: 'power1.inOut',
        }, 0)
        // High arc Y (up then down via yoyo)
        .to(ref.current.position, {
          y: 2.5, duration: 0.6, ease: 'power2.out',
          yoyo: true, repeat: 1,
        }, 0)
        // Tumble + spin (2 horizontal, 1 forward)
        .to(ref.current.rotation, {
          y: `+=${Math.PI * 4}`, x: `+=${Math.PI * 2}`,
          duration: 1.2, ease: 'power1.inOut',
        }, 0)
        // Shrink as it flies away
        .to(ref.current.scale, {
          x: 0.4, y: 0.4, z: 0.4,
          duration: 1.2, ease: 'power2.in',
        }, 0);

        tl.play();

      } else if (event.attackerId === tokenId) {
        // --- ATTACKER VICTORY JUMP (juicier: squash → jump → stretch → fall → impact) ---
        const tl = gsap.timeline();
        tl.to(ref.current.scale, { x: 1.1, y: 0.8, z: 1.1, duration: 0.1, ease: 'power2.in' }) // Anticipation squash
          .to(ref.current.position, { y: `+=0.4`, duration: 0.25, ease: 'power2.out' }, 0) // Jump up
          .to(ref.current.scale, { x: 0.9, y: 1.3, z: 0.9, duration: 0.25, ease: 'power2.out' }, 0) // Air stretch
          .to(ref.current.rotation, { y: `+=${Math.PI / 4}`, duration: 0.4, ease: 'power1.out' }, 0) // Swivel
          .to(ref.current.position, { y: TOKEN_Y, duration: 0.15, ease: 'power2.in' }) // Fall
          .to(ref.current.scale, { x: 1.15, y: 0.85, z: 1.15, duration: 0.1, ease: 'sine.out' }) // Impact squash
          .to(ref.current.scale, { x: 1, y: 1, z: 1, duration: 0.2, ease: 'elastic.out(1, 0.5)' }); // Recover
        tl.play();
      }
    });
    return unsub;
  }, [tokenId, token]);

  // PLAYER_WON → winner's tokens do a victory dance (staggered)
  useEffect(() => {
    if (!ref.current) return;
    const unsub = bus.on('PLAYER_WON', (event) => {
      if (!ref.current || !token) return;
      if (token.color === event.player) {
        // Stagger by slot so the 4 tokens dance in sequence
        winDance(ref.current, token.slot * 0.15).play();
      }
    });
    return unsub;
  }, [tokenId, token]);

  if (!token || !world) return null;

  // Skin lookup from cosmeticsStore (per-device, not RulesConfig)
  const skinId = useCosmetics.getState().skins[token.color];
  const skin = skinId ? TOKEN_SKINS[skinId] ?? null : null;

  const isMovable =
    phase === 'SELECTING_TOKEN' &&
    validMoves.some((m) => m.tokenIds.includes(tokenId));

  function handleClick() {
    if (phase !== 'SELECTING_TOKEN') return;
    if (!isMovable) return;
    if (isSelected) {
      dispatch({ type: 'REQUEST_MOVE', tokenId });
    } else {
      select(tokenId);
    }
  }

  return (
    <group
      ref={ref}
      onClick={(e) => {
        e.stopPropagation();
        handleClick();
      }}
    >
      {/* Selection ring */}
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

      {/* Token model — GLB skin or procedural pawn (from cosmeticsStore) */}
      <TokenModel skin={skin} color={token.color} />

      {/* Invisible hit-proxy cylinder — consistent click target regardless of skin shape */}
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.35, 0.35, 0.8, 8]} />
        <meshBasicMaterial visible={false} />
      </mesh>
    </group>
  );
}

export type { TokenData };
export { BASE };
