/**
 * TokenSkin — GLB model loader with double fallback (PLAN-PHASE-4 §5.4).
 *
 * If the skin has a URL: try to load the GLB via useGLTF (Suspense handles
 * loading, ErrorBoundary handles 404/corrupt → pawn).
 * If the skin has no URL or loading fails: fall back to the procedural pawn.
 *
 * The GLB is cloned and tinted with the player's color at runtime so one model
 * serves all 4 colors.
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

/** GLB skin — loads, clones, tints with player color. */
function GLBSkin({ skin, color }: { skin: TokenSkin; color: Color }) {
  const { scene } = useGLTF(skin.url!);
  const tinted = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
        mat.color.set(COLOR_HEX[color]);
        mat.roughness = 0.4;
        mat.metalness = 0.1;
        mesh.material = mat;
      }
    });
    return clone;
  }, [scene, color]);

  return (
    <primitive object={tinted} scale={skin.scale} rotation-y={skin.rotationY} />
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
