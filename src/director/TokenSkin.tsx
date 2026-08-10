/**
 * TokenSkin — GLB model loader with skinned-safe cloning (PLAN-PHASE-4 §5.4).
 *
 * Architecture:
 *  - SkeletonUtils.clone() — correctly rebinds SkinnedMesh skeletons to cloned
 *    bones. scene.clone(true) does NOT do this, causing skinned meshes to render
 *    at the original bone positions (board center) while static meshes follow
 *    the clone. This was the root cause of the "models at center" bug.
 *  - Per-skin tuning constants (scale/offsetY/rotationY from tokenSkins.ts).
 *    No auto-normalization — all 8 models are SkinnedMesh, so Box3 bounds
 *    are unreliable (bind-pose, not rendered-pose).
 *  - Wrapping <group> carries ALL transforms declaratively. The <primitive>
 *    inside is a raw clone with no mutations — R3F owns the transforms.
 */

import { Suspense, useMemo, Component, type ReactNode } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { TokenSkin } from '../theme/tokenSkins';
import type { Color } from '../oracle/board/track';

const COLOR_HEX: Record<Color, string> = {
  red: '#e74c3c',
  green: '#2ecc71',
  yellow: '#f1c40f',
  blue: '#3498db',
};

/** The procedural pawn — fallback when no GLB skin is set. */
export function ProceduralPawn({ color }: { color: Color }) {
  return (
    <>
      <mesh castShadow position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.28, 0.34, 0.4, 24]} />
        <meshStandardMaterial color={COLOR_HEX[color]} roughness={0.35} metalness={0.15} />
      </mesh>
      <mesh castShadow position={[0, 0.52, 0]}>
        <sphereGeometry args={[0.22, 24, 16]} />
        <meshStandardMaterial color={COLOR_HEX[color]} roughness={0.35} metalness={0.15} />
      </mesh>
    </>
  );
}

/** Colored base puck — player-color indicator under character models. */
function ColorBase({ color }: { color: Color }) {
  return (
    <mesh position={[0, 0.02, 0]}>
      <cylinderGeometry args={[0.32, 0.36, 0.04, 24]} />
      <meshStandardMaterial
        color={COLOR_HEX[color]}
        emissive={COLOR_HEX[color]}
        emissiveIntensity={0.2}
        roughness={0.4}
        metalness={0.2}
      />
    </mesh>
  );
}

/** GLB skin — SkeletonUtils.clone + wrapping-group transforms + per-skin constants. */
function GLBSkin({ skin, color }: { skin: TokenSkin; color: Color }) {
  const { scene } = useGLTF(skin.url!);

  // SkeletonUtils.clone — correctly rebinds SkinnedMesh skeletons to cloned bones.
  // This is the fix for the "models at center" bug: scene.clone(true) leaves
  // skinned meshes bound to the ORIGINAL scene's bones, so they render at
  // the original bone positions (world origin = board center).
  const model = useMemo(
    () => skeletonClone(scene) as THREE.Group,
    [scene],
  );

  return (
    <group>
      <ColorBase color={color} />
      {/* Wrapping group carries ALL transforms declaratively.
          R3F owns these props; <primitive> below is a raw child with no mutations. */}
      <group
        position={[0, skin.offsetY, 0]}
        scale={skin.scale}
        rotation-y={skin.rotationY}
      >
        <primitive object={model} />
      </group>
    </group>
  );
}

/** Error boundary — catches GLB load failures and renders the pawn. */
class SkinErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

/** TokenModel — the main entry point. Chooses GLB or pawn based on skin. */
export function TokenModel({ skin, color }: { skin: TokenSkin | null; color: Color }) {
  const fallback = <ProceduralPawn color={color} />;
  if (!skin?.url) return fallback;
  return (
    <Suspense fallback={fallback}>
      <SkinErrorBoundary fallback={fallback}>
        <GLBSkin skin={skin} color={color} />
      </SkinErrorBoundary>
    </Suspense>
  );
}
