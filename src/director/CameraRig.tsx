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
      minPolarAngle={0.15}
      maxPolarAngle={0.9}
      minDistance={10}
      maxDistance={26}
      target={[0, 0, 0]}
    />
  );
}
