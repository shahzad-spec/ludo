/**
 * CanvasWrapper — the R3F <Canvas> host (ARCHITECTURE-v3 §7.1).
 *
 * Sets up the WebGL canvas with sensible defaults for a board game: shadows off
 * (using ContactShadows instead per mobile-first discipline), dpr capped for perf,
 * a fixed camera that CameraRig controls.
 */
import { Canvas } from '@react-three/fiber';
import { Scene } from './Scene';
import { useUI } from '../store/uiStore';

export function CanvasWrapper() {
  const select = useUI((s) => s.select);
  return (
    <Canvas
      shadows={false}
      dpr={[1, 2]}
      camera={{ position: [0, 18, 14], fov: 35 }}
      gl={{ antialias: true }}
      onPointerMissed={() => select(null)} // click empty space → deselect
    >
      <Scene />
    </Canvas>
  );
}
