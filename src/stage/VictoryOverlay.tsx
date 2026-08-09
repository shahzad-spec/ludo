/**
 * VictoryOverlay — DOM trophy overlay on PLAYER_WON (PLAN-PHASE-4 §6.3).
 *
 * Shows "🏆 [Color] Wins!" with a Play Again button. Stage-layer (DOM).
 */

import { useState, useEffect } from 'react';
import { bus } from '../bus/events';
import type { GameEvent } from '../bus/events';
import type { Color } from '../oracle/board/track';
import { useGame } from '../store/useGame';

const COLOR_NAME: Record<Color, string> = {
  red: 'Red',
  green: 'Green',
  yellow: 'Yellow',
  blue: 'Blue',
};

const COLOR_HEX: Record<Color, string> = {
  red: '#e74c3c',
  green: '#2ecc71',
  yellow: '#f1c40f',
  blue: '#3498db',
};

export function VictoryOverlay() {
  const [winner, setWinner] = useState<Color | null>(null);
  const reset = useGame((s) => s.reset);

  useEffect(() => {
    const unsub = bus.on('PLAYER_WON', (e: Extract<GameEvent, { type: 'PLAYER_WON' }>) => {
      // Delay the overlay so the win dance + confetti play first
      setTimeout(() => setWinner(e.player), 1500);
    });
    return unsub;
  }, []);

  if (!winner) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)',
        zIndex: 200,
        animation: 'victoryFadeIn 0.5s ease-out',
      }}
    >
      <div style={{ fontSize: 80, marginBottom: 16 }}>🏆</div>
      <h1
        style={{
          fontSize: 48,
          fontWeight: 900,
          color: COLOR_HEX[winner],
          textShadow: '0 0 30px rgba(255,255,255,0.3)',
          margin: 0,
        }}
      >
        {COLOR_NAME[winner]} Wins!
      </h1>
      <button
        onClick={() => {
          setWinner(null);
          reset();
        }}
        style={{
          marginTop: 32,
          padding: '14px 36px',
          fontSize: 20,
          fontWeight: 700,
          border: 'none',
          borderRadius: 12,
          background: COLOR_HEX[winner],
          color: 'white',
          cursor: 'pointer',
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        }}
      >
        Play Again
      </button>
      <style>{`
        @keyframes victoryFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
