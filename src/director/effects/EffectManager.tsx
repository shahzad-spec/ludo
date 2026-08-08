/**
 * EffectManager — spawns one-shot particle effects on bus events (PLAN-PHASE-4 §4.3).
 *
 * Maintains a list of active effects. On a bus event, pushes a new effect with a
 * unique key. Each effect self-removes via its onComplete callback.
 * Caps at 50 active effects to prevent memory leaks.
 */

import { useState, useEffect, useCallback } from 'react';
import { bus } from '../../bus/events';
import type { GameEvent } from '../../bus/events';
import { ParticleBurst, Confetti } from './Particles';
import { SHARED_TRACK_COORDS } from '../config/boardGeometry';
import { isSafeTrackCell } from '../../oracle/board/safeCells';
import { playSfx } from '../../audio/sfx';
import { useAudio } from '../../store/audioStore';

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
      if (prev.length >= MAX_EFFECTS) return prev; // cap
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

    // TOKEN_CAPTURED → spark burst at the capture cell + sound
    handlers.push(
      bus.on('TOKEN_CAPTURED', (e: Extract<GameEvent, { type: 'TOKEN_CAPTURED' }>) => {
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

    // TOKEN_MOVED → safe-cell shimmer + sound (check destination cell)
    handlers.push(
      bus.on('TOKEN_MOVED', (e: Extract<GameEvent, { type: 'TOKEN_MOVED' }>) => {
        // Check if the destination is a safe track cell
        const lastPos = e.path[e.path.length - 1];
        if (lastPos && lastPos.kind === 'track' && isSafeTrackCell(lastPos.cell)) {
          playSfx('safeSpot', vol(), muted());
          const coord = SHARED_TRACK_COORDS[lastPos.cell];
          if (coord) {
            addEffect({
              type: 'dust',
              position: [coord.x, 0.15, coord.z],
              color: '#ffd700',
            });
          }
        }
        // Home entry sound (isEnteringHome flag)
        if (e.isEnteringHome) {
          playSfx('homeWin', vol() * 0.5, muted());
        }
      }),
    );

    // PLAYER_WON → confetti at center
    handlers.push(
      bus.on('PLAYER_WON', () => {
        addEffect({
          type: 'confetti',
          position: [0, 1, 0],
          color: '#ffffff',
        });
      }),
    );

    // isFinishing → confetti at center (via TOKEN_MOVED flag)
    // Already handled above via the AudioBus; here we add the visual.
    // We re-check TOKEN_MOVED for isFinishing to add confetti.
    handlers.push(
      bus.on('TOKEN_MOVED', (e: Extract<GameEvent, { type: 'TOKEN_MOVED' }>) => {
        if (e.isFinishing) {
          addEffect({
            type: 'confetti',
            position: [0, 1, 0],
            color: '#ffffff',
          });
        }
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
            count={fx.type === 'sparks' ? 14 : 6}
            speed={fx.type === 'sparks' ? 1.5 : 0.5}
            size={fx.type === 'sparks' ? 0.08 : 0.05}
            duration={fx.type === 'sparks' ? 0.6 : 0.3}
            onComplete={() => removeEffect(fx.id)}
          />
        );
      })}
    </>
  );
}
