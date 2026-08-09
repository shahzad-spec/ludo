/**
 * CaptureDrama — DOM overlays for the capture sequence (PLAN-PHASE-4 §5.1).
 *
 * Two effects on TOKEN_CAPTURED:
 *   - ScreenFlash: full-screen player-color overlay (opacity 0→0.3→0, 200ms)
 *   - CapturePopup: "Capture!" text, scale-in + fade-out, 600ms
 *
 * Stage-layer (DOM). Subscribes to the bus directly.
 */

import { useState, useEffect, useRef } from 'react';
import { bus } from '../bus/events';
import type { GameEvent } from '../bus/events';
import type { Color } from '../oracle/board/track';

const COLOR_HEX: Record<Color, string> = {
  red: '#e74c3c',
  green: '#2ecc71',
  yellow: '#f1c40f',
  blue: '#3498db',
};

export function CaptureDrama() {
  const [flash, setFlash] = useState<{ color: string; key: number } | null>(null);
  const [popup, setPopup] = useState<{ key: number } | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout>>();
  const popupTimer = useRef<ReturnType<typeof setTimeout>>();
  const popupKey = useRef(0);
  const flashKey = useRef(0);

  useEffect(() => {
    const unsub = bus.on('TOKEN_CAPTURED', (e: Extract<GameEvent, { type: 'TOKEN_CAPTURED' }>) => {
      // Flash: find the attacker's color from the token id (first char before '-')
      const attackerColor = e.attackerId.split('-')[0] as Color;
      const color = COLOR_HEX[attackerColor] ?? '#ffffff';
      const fk = ++flashKey.current;
      setFlash({ color, key: fk });
      clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlash(null), 300);

      // Popup
      const pk = ++popupKey.current;
      setPopup({ key: pk });
      clearTimeout(popupTimer.current);
      popupTimer.current = setTimeout(() => setPopup(null), 800);
    });
    return () => {
      unsub();
      clearTimeout(flashTimer.current);
      clearTimeout(popupTimer.current);
    };
  }, []);

  return (
    <>
      {/* Screen flash */}
      {flash && (
        <div
          key={`flash-${flash.key}`}
          style={{
            position: 'fixed',
            inset: 0,
            background: flash.color,
            opacity: 0.3,
            pointerEvents: 'none',
            animation: 'captureFlash 0.3s ease-out forwards',
            zIndex: 100,
          }}
        />
      )}

      {/* "Capture!" popup */}
      {popup && (
        <div
          key={`popup-${popup.key}`}
          style={{
            position: 'fixed',
            top: '30%',
            left: '50%',
            transform: 'translateX(-50%)',
            fontSize: 48,
            fontWeight: 900,
            color: '#fff',
            textShadow: '0 0 20px rgba(255,100,50,0.8), 0 2px 4px rgba(0,0,0,0.8)',
            pointerEvents: 'none',
            zIndex: 101,
            animation: 'capturePopup 0.8s ease-out forwards',
          }}
        >
          CAPTURE!
        </div>
      )}

      {/* Keyframes */}
      <style>{`
        @keyframes captureFlash {
          0% { opacity: 0; }
          20% { opacity: 0.4; }
          100% { opacity: 0; }
        }
        @keyframes capturePopup {
          0% { opacity: 0; transform: translateX(-50%) scale(0.5); }
          20% { opacity: 1; transform: translateX(-50%) scale(1.2); }
          40% { transform: translateX(-50%) scale(1); }
          80% { opacity: 1; }
          100% { opacity: 0; transform: translateX(-50%) scale(1.1) translateY(-20px); }
        }
      `}</style>
    </>
  );
}
