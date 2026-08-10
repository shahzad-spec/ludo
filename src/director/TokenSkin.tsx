/**
 * TokenSkin — GLB model loader with double fallback (PLAN-PHASE-4 §5.4).
 *
 * Auto-normalizes scale (targetHeight=0.4) and origin (feet at y=0).
 * Keeps the model's original textures (no tinting) — player color is applied
 * to a colored base ring under the character instead.
 */

import { Suspense, useMemo, Component, type ReactNode } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { TokenSkin } from '../theme/tokenSkins';
import type { Color } from '../oracle/board/track';

const COLOR_HEX: Record<Color, string> = {
  red: '#e74c3c',
  green: '#2ecc71',
  yellow: '#f1c40f',
  blue: '#3498db',
};

/** The procedural pawn — extracted from Token.tsx for reuse as fallback. */
export function ProceduralPawn({ color }: { color: Color }) {
  return (
    <>
      <mesh castShadow position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.28, 0.34, 0.4, 24]} />
        <meshStandardMaterial
          color={COLOR_HEX[color]}
          roughness={0.35}
          metalness={0.15}
        />
      </mesh>
      <mesh castShadow position={[0, 0.52, 0]}>
        <sphereGeometry args={[0.22, 24, 16]} />
        <meshStandardMaterial
          color={COLOR_HEX[color]}
          roughness={0.35}
          metalness={0.15}
        />
      </mesh>
    </>
  );
}

/** Colored base ring — the player-color indicator under character models. */
function ColorBase({ color }: { color: Color }) {
  // A short cylinder (puck) — default axis is Y (vertical), so NO rotation.
  // The rotation=[-PI/2] was tipping it sideways (the "coin" bug).
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

/** GLB skin — loads, clones, auto-normalizes to targetHeight, origin at feet. */
function GLBSkin({ skin, color }: { skin: TokenSkin; color: Color }) {
  const { scene } = useGLTF(skin.url!);

  const model = useMemo(() => {
    const clone = scene.clone(true);
    // Auto-normalize: scale to target height, set origin at feet
    const TARGET_HEIGHT = 0.4;
    const box = new THREE.Box3().setFromObject(clone);
    const size = new THREE.Vector3();
    box.getSize(size);

    if (size.y > 0) {
      const scaleFactor = TARGET_HEIGHT / size.y;
      clone.scale.setScalar(scaleFactor);
    }

    // Recalculate box after scaling, shift up so feet are at y=0
    const scaledBox = new THREE.Box3().setFromObject(clone);
    clone.position.y -= scaledBox.min.y;

    return clone;
  }, [scene]);

  return (
    <>
      <ColorBase color={color} />
      <primitive object={model} rotation-y={skin.rotationY} />
    </>
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
