/**
 * BotDriver — auto-plays for bot seats (IMPLEMENTATION-PLAN-v1 §10 Step 2).
 *
 * Non-rendering subscriber. Mount <BotDriver/> in App.tsx.
 * When currentPlayer is in rules.bots, auto-dispatches after a think delay:
 *   IDLE → REQUEST_ROLL (after 800ms)
 *   SELECTING_TOKEN → REQUEST_MOVE(chooseBotMove(...)) (after 1000ms)
 *
 * Phase-gated by construction: the engine rejects out-of-phase actions,
 * so a bot can NEVER make an illegal move.
 *
 * Difficulty: reads from a module-level setting (set by the menu/Solo button).
 */

import { useEffect, useRef } from 'react';
import { useGame } from './useGame';
import { chooseBotMove, type BotDifficulty } from '../oracle/ai';

/** Current bot difficulty. Set by the UI before starting a bot game. */
let botDifficulty: BotDifficulty = 'medium';

export function setBotDifficulty(d: BotDifficulty): void {
  botDifficulty = d;
}

export function BotDriver() {
  const state = useGame((s) => s.state);
  const dispatch = useGame((s) => s.dispatch);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

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

    if (phase === 'IDLE') {
      // Bot rolls after 800ms think delay
      timerRef.current = setTimeout(() => {
        dispatch({ type: 'REQUEST_ROLL' });
      }, 800);
    } else if (phase === 'SELECTING_TOKEN') {
      // Bot picks a move after 1000ms think delay
      timerRef.current = setTimeout(() => {
        const move = chooseBotMove(state, validMoves, botDifficulty);
        if (move) {
          dispatch({ type: 'REQUEST_MOVE', tokenId: move.tokenIds[0] });
        }
        // If move is null (shouldn't happen — validMoves is non-empty in this phase),
        // the engine will time out naturally. But this shouldn't occur.
      }, 1000);
    }
    // ROLLING and ANIMATING_MOVE: bot waits for the animation to auto-resolve

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [state, dispatch]);

  return null; // non-rendering subscriber
}
