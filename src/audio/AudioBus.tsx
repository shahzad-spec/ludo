/**
 * AudioBus — non-rendering subscriber that maps bus events to SFX (PLAN-PHASE-4 §3).
 *
 * Mount <AudioBus/> once in App.tsx. It renders nothing (returns null) but
 * subscribes to the event bus on mount and cleans up on unmount. Volume/mute
 * come from audioStore; SFX come from sfx.ts.
 *
 * Stage-layer (DOM audio via Howler), but subscribes to the same bus as the Director.
 *
 * Event → Sound mapping (PLAN-PHASE-4 §3.3):
 *   DICE_ROLLED        → diceRoll
 *   TOKEN_MOVED        → pileMove (only if first path cell is 'base' = yard entry)
 *   TOKEN_CAPTURED     → collide, then cheer (200ms delay)
 *   PLAYER_WON         → homeWin + cheer (overlap)
 *   NO_LEGAL_MOVE      → ui (lower volume)
 *
 * Safe-cell landing (safeSpot) is detected by the Director during hops, not
 * here — the AudioBus can't see intermediate cell positions from the event.
 * That sound will be triggered from the hop animation in Step 4B.
 */

import { useEffect } from 'react';
import { bus } from '../bus/events';
import type { GameEvent } from '../bus/events';
import { playSfx } from './sfx';
import { useAudio } from '../store/audioStore';

export function AudioBus() {
  const volume = useAudio((s) => s.volume);
  const muted = useAudio((s) => s.muted);

  useEffect(() => {
    // Read current volume/mute at call time (not closure-stale).
    const getVol = () => useAudio.getState().volume;
    const getMuted = () => useAudio.getState().muted;

    const handlers: Array<() => void> = [];

    // DICE_ROLLED → diceRoll
    handlers.push(
      bus.on('DICE_ROLLED', () => {
        playSfx('diceRoll', getVol(), getMuted());
      }),
    );

    // TOKEN_MOVED → pileMove (yard entry only: first path cell is 'base')
    handlers.push(
      bus.on('TOKEN_MOVED', (e: Extract<GameEvent, { type: 'TOKEN_MOVED' }>) => {
        if (e.path.length > 0 && e.path[0].kind === 'base') {
          playSfx('pileMove', getVol(), getMuted());
        }
      }),
    );

    // TOKEN_CAPTURED → collide, then cheer (200ms delay for impact→celebration)
    handlers.push(
      bus.on('TOKEN_CAPTURED', () => {
        playSfx('collide', getVol(), getMuted());
        if (!getMuted()) {
          setTimeout(() => playSfx('cheer', getVol() * 0.7, getMuted()), 200);
        }
      }),
    );

    // PLAYER_WON → homeWin + cheer (overlap for a fuller sound)
    handlers.push(
      bus.on('PLAYER_WON', () => {
        playSfx('homeWin', getVol(), getMuted());
        if (!getMuted()) {
          setTimeout(() => playSfx('cheer', getVol() * 0.8, getMuted()), 100);
        }
      }),
    );

    // NO_LEGAL_MOVE → ui (lower volume, it's a minor feedback)
    handlers.push(
      bus.on('NO_LEGAL_MOVE', () => {
        playSfx('ui', getVol() * 0.5, getMuted());
      }),
    );

    return () => handlers.forEach((unsub) => unsub());
  }, [volume, muted]); // re-subscribe if volume/mute change (closures stay fresh)

  return null; // non-rendering subscriber
}
