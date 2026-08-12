/**
 * BotDriver — auto-plays for bot seats (IMPLEMENTATION-PLAN-v1 §10 Step 2).
 *
 * Non-rendering subscriber. Mount <BotDriver/> in App.tsx.
 * When currentPlayer is in rules.bots, auto-dispatches after a think delay
 * scaled by difficulty (Pro feels like it's thinking harder).
 *
 * Phase-gated by construction: the engine rejects out-of-phase actions,
 * so a bot can NEVER make an illegal move.
 *
 * Difficulty: reads from a module-level setting (set by the UI/Solo button).
 */

import { useEffect, useRef } from 'react';
import { useGame } from './useGame';
import { chooseBotMove, type BotDifficulty } from '../oracle/ai';

/** Current bot difficulty. Set by the UI before starting a bot game. */
let botDifficulty: BotDifficulty = 'medium';

export function setBotDifficulty(d: BotDifficulty): void {
  botDifficulty = d;
}

export function getBotDifficulty(): BotDifficulty {
  return botDifficulty;
}

/** Per-difficulty think delays [roll, move] in ms.
 *  Pro computes in ≤80ms; the rest is UX so it feels like deliberate thought. */
const THINK_DELAYS: Record<BotDifficulty, [number, number]> = {
  easy:   [600, 900],
  medium: [800, 1100],
  hard:   [900, 1300],
  pro:    [1000, 1400],
};

export function BotDriver() {
  const state = useGame((s) => s.state);
  const dispatch = useGame((s) => s.dispatch);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    // Clear any pending timer on every state change
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }

    const { currentPlayer, phase, rules, validMoves } = state;

    // Is the current player a bot?
    if (!rules.bots.includes(currentPlayer)) return;
    if (phase === 'GAME_OVER') return;

    const [rollDelay, moveDelay] = THINK_DELAYS[botDifficulty];

    if (phase === 'IDLE') {
      timerRef.current = setTimeout(() => {
        dispatch({ type: 'REQUEST_ROLL' });
      }, rollDelay);
    } else if (phase === 'SELECTING_TOKEN') {
      timerRef.current = setTimeout(() => {
        const move = chooseBotMove(state, validMoves, botDifficulty);
        if (move) {
          dispatch({ type: 'REQUEST_MOVE', tokenId: move.tokenIds[0] });
        }
      }, moveDelay);
    }
    // ROLLING and ANIMATING_MOVE: bot waits for the animation to auto-resolve

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [state, dispatch]);

  return null; // non-rendering subscriber
}
