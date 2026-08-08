/**
 * CameraRig — orbit controls, locked to prevent mobile camera loss (§1 locked decisions).
 *
 * enablePan=false (can't drift off-board), polar angle clamped (can't flip under the
 * board), zoom clamped (can't clip through), damping on for premium feel. Phase 3 will
 * add scripted camera moves on TURN_CHANGED/token-follow; Phase 2 is user-orbit only.
 */
import { OrbitControls } from '@react-three/drei';

export function CameraRig() {
  return (
    <OrbitControls
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      minPolarAngle={0.3}
      maxPolarAngle={Math.PI / 2.2}
      minDistance={8}
      maxDistance={24}
      target={[0, 0, 0]}
    />
  );
}
