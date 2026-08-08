/**
 * Scene — lights, environment, and the board contents (ARCHITECTURE-v3 §7.1).
 *
 * Minimalist/premium lighting: one key directional + soft ambient + ContactShadows
 * for ground-contact depth without real-time shadow maps. Data-driven: tokens
 * derive from state.turnOrder, not a hardcoded color list.
 */
import { ContactShadows, Environment } from '@react-three/drei';
import { useEffect } from 'react';
import { Board } from './Board';
import { Dice } from './Dice';
import { Token } from './Token';
import { CameraRig } from './CameraRig';
import { useGame } from '../store/useGame';
import { useUI } from '../store/uiStore';

export function Scene() {
  // Data-driven: tokens render from state.tokens (keyed by id), so a 2-player
  // game naturally shows 8, 3-player shows 12. turnOrder isn't needed directly
  // here since tokens is already filtered to active colors by createInitialState.
  const tokens = useGame((s) => s.state.tokens);
  const phase = useGame((s) => s.state.phase);
  const select = useUI((s) => s.select);

  // Clear selection whenever we leave SELECTING_TOKEN (move confirmed, turn passed, etc.)
  useEffect(() => {
    if (phase !== 'SELECTING_TOKEN') select(null);
  }, [phase, select]);

  return (
    <>
      <CameraRig />

      {/* Lighting — soft studio feel */}
      <ambientLight intensity={0.6} />
      <directionalLight position={[8, 15, 6]} intensity={1.1} />
      <Environment preset="apartment" />

      {/* The board + path tiles */}
      <Board />

      {/* The 3D die (tumbles on ROLLING, auto-resolves) */}
      <Dice />

      {/* Contact shadows under everything (mobile-friendly; no shadow maps) */}
      <ContactShadows
        position={[0, 0, 0]}
        opacity={0.4}
        scale={20}
        blur={2.5}
        far={5}
      />

      {/* Tokens — data-driven from turnOrder (2p renders 8, 3p renders 12, 4p renders 16) */}
      {Object.values(tokens).map((token) => (
        <Token key={token.id} tokenId={token.id} />
      ))}
    </>
  );
}
