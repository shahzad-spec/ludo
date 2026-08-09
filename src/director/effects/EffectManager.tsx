/**
 * EffectManager — spawns one-shot particle effects on bus events (PLAN-PHASE-4 §4.3).
 *
 * Maintains a list of active effects. On a bus event, pushes a new effect with a
 * unique key. Each effect self-removes via its onComplete callback.
 * Caps at 50 active effects to prevent memory leaks.
 *
 * Particle sizes tuned for visibility: 0.15–0.2 minimum, 0.5–0.8s duration.
 */

import { useState, useEffect, useCallback } from 'react';
import { bus } from '../../bus/events';
import type { GameEvent } from '../../bus/events';
import { ParticleBurst, Confetti } from './Particles';
import { gsap } from '../anim/gsap';
import {
  SHARED_TRACK_COORDS,
  positionToVector3,
} from '../config/boardGeometry';
import { isSafeTrackCell } from '../../oracle/board/safeCells';
import { playSfx } from '../../audio/sfx';
import { useAudio } from '../../store/audioStore';
import type { Color } from '../../oracle/board/track';

interface ActiveEffect {
  id: string;
  type: 'dust' | 'sparks' | 'confetti';
  position: [number, number, number];
  color: string;
}

const MAX_EFFECTS = 50;
let effectId = 0;

export function EffectManager() {
  const [effects, setEffects] = useState<ActiveEffect[]>([]);

  const addEffect = useCallback((effect: Omit<ActiveEffect, 'id'>) => {
    setEffects((prev) => {
      if (prev.length >= MAX_EFFECTS) return prev;
      return [...prev, { ...effect, id: `fx-${effectId++}` }];
    });
  }, []);

  const removeEffect = useCallback((id: string) => {
    setEffects((prev) => prev.filter((e) => e.id !== id));
  }, []);

  useEffect(() => {
    const vol = () => useAudio.getState().volume;
    const muted = () => useAudio.getState().muted;

    const handlers: Array<() => void> = [];

    // TOKEN_CAPTURED → slow-mo (restored by Token.tsx fly-back onComplete) + sparks
    handlers.push(
      bus.on('TOKEN_CAPTURED', (e: Extract<GameEvent, { type: 'TOKEN_CAPTURED' }>) => {
        // Slow-mo: set to 0.3x. The victim token's fly-back onComplete restores to 1.0.
        gsap.globalTimeline.timeScale(0.3);
        const coord = SHARED_TRACK_COORDS[e.cell];
        if (coord) {
          addEffect({
            type: 'sparks',
            position: [coord.x, 0.3, coord.z],
            color: '#ff6600',
          });
        }
      }),
    );

    // TOKEN_MOVED → effects based on the move's semantic flags + destination
    handlers.push(
      bus.on('TOKEN_MOVED', (e: Extract<GameEvent, { type: 'TOKEN_MOVED' }>) => {
        const lastPos = e.path[e.path.length - 1];
        if (!lastPos) return;

        // Extract the mover's color from the token id (e.g. 'green-0' → 'green')
        const moverColor = e.tokenIds[0]?.split('-')[0] as Color ?? 'red';

        // Destination position (correct color → correct home-column coords)
        const destCoord = positionToVector3(moverColor, lastPos, 0);

        // Safe cell → GOLD dust (replaces grey; don't spawn both)
        const isSafe = lastPos.kind === 'track' && isSafeTrackCell(lastPos.cell);
        if (isSafe) {
          playSfx('safeSpot', vol(), muted());
          addEffect({
            type: 'dust',
            position: [destCoord.x, 0.2, destCoord.z],
            color: '#ffd700', // gold — clearly distinct from grey
          });
        } else {
          // Normal landing → grey dust puff
          addEffect({
            type: 'dust',
            position: [destCoord.x, 0.2, destCoord.z],
            color: '#cccccc',
          });
        }

        // Home entry → rising chime
        if (e.isEnteringHome) {
          playSfx('homeWin', vol() * 0.5, muted());
        }

        // Finishing → confetti
        if (e.isFinishing) {
          addEffect({
            type: 'confetti',
            position: [0, 1.5, 0],
            color: '#ffffff',
          });
        }
      }),
    );

    // PLAYER_WON → confetti at center
    handlers.push(
      bus.on('PLAYER_WON', () => {
        addEffect({
          type: 'confetti',
          position: [0, 1.5, 0],
          color: '#ffffff',
        });
      }),
    );

    return () => handlers.forEach((unsub) => unsub());
  }, [addEffect]);

  return (
    <>
      {effects.map((fx) => {
        if (fx.type === 'confetti') {
          return (
            <Confetti
              key={fx.id}
              position={fx.position}
              onComplete={() => removeEffect(fx.id)}
            />
          );
        }
        return (
          <ParticleBurst
            key={fx.id}
            position={fx.position}
            color={fx.color}
            count={fx.type === 'sparks' ? 24 : 12}
            speed={fx.type === 'sparks' ? 3 : 1.2}
            size={fx.type === 'sparks' ? 0.4 : 0.25}
            duration={fx.type === 'sparks' ? 1.2 : 0.7}
            onComplete={() => removeEffect(fx.id)}
          />
        );
      })}
    </>
  );
}
