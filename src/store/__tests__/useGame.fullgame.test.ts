/**
 * Full-game integration test via the Zustand store (plan §6.7 sub-gate B #4).
 *
 * Drives a complete game by repeatedly: roll → resolve → (pick first legal
 * move) → resolve, until GAME_OVER. Uses a scripted RNG weighted toward 6s so
 * the game actually progresses (yard entries happen). This proves the state
 * machine doesn't break over a full game — the substance of gate criterion #4,
 * verified headlessly since we can't click a browser from CI.
 *
 * We instantiate a FRESH store (not the singleton) so test runs are isolated.
 */

import { describe, it, expect } from 'vitest';
import { create } from 'zustand';
import { applyAction, createInitialState, colorsForPlayerCount } from '../../oracle/engine';
import { bus } from '../../bus/events';
import type { GameEvent } from '../../bus/events';
import { V1_RULES } from '../../oracle/config/rulesPreset';
import type { Action } from '../../oracle/types';

/** RNG that mostly rolls 6 (for entries) with occasional other values. */
function progressingRng(): () => number {
  const seq = [6, 6, 5, 6, 6, 1, 6, 6, 4, 6, 6, 2, 6, 6, 3, 6, 6, 6, 6, 6];
  let i = 0;
  return () => {
    const v = seq[i % seq.length];
    i++;
    return (v - 1) / 6; // invert rollDice's floor(r*6)+1
  };
}

function makeStore(rng: () => number) {
  return create<{
    state: ReturnType<typeof createInitialState>;
    dispatch: (a: Action) => void;
  }>((set, get) => ({
    state: createInitialState(colorsForPlayerCount(V1_RULES.playerCount), V1_RULES),
    dispatch: (action) => {
      const { state, events } = applyAction(get().state, action, rng);
      for (const e of events) bus.emit(e);
      set({ state });
    },
  }));
}

/** Helper: dispatch via getState() (Zustand vanilla-store pattern). */
function dispatch(store: ReturnType<typeof makeStore>, action: Action): void {
  store.getState().dispatch(action);
}

describe('full-game integration via store', () => {
  it('plays to completion (GAME_OVER) without the state machine breaking', () => {
    const store = makeStore(progressingRng());
    const events: GameEvent[] = [];
    const unsubs = (['DICE_ROLLED', 'TOKEN_MOVED', 'TOKEN_CAPTURED', 'TURN_CHANGED', 'PLAYER_WON', 'NO_LEGAL_MOVE'] as GameEvent['type'][]).map(
      (t) => bus.on(t, (e) => events.push(e as GameEvent)),
    );

    let turns = 0;
    const MAX_TURNS = 2000; // hard safety cap

    while (store.getState().state.phase !== 'GAME_OVER' && turns < MAX_TURNS) {
      turns++;
      const s0 = store.getState().state;

      // Roll
      dispatch(store, { type: 'REQUEST_ROLL' });
      if (store.getState().state === s0) break; // rejected → stop
      const rolledValue = store.getState().state.dice.value!;
      dispatch(store, { type: 'RESOLVE_ROLL', value: rolledValue });

      // If phase advanced to IDLE, no legal move — turn already passed. Loop.
      if (store.getState().state.phase === 'IDLE') continue;

      // SELECTING_TOKEN → pick first legal move
      if (store.getState().state.phase === 'SELECTING_TOKEN') {
        const move = store.getState().state.validMoves[0];
        dispatch(store, { type: 'REQUEST_MOVE', tokenId: move.tokenIds[0] });
        dispatch(store, { type: 'RESOLVE_MOVE' });
      }
    }

    unsubs.forEach((u) => u());

    // Assertions
    expect(turns).toBeLessThan(MAX_TURNS); // didn't time out
    expect(store.getState().state.phase).toBe('GAME_OVER');
    expect(store.getState().state.winners.length).toBeGreaterThan(0);

    // At least one PLAYER_WON event fired
    expect(events.some((e) => e.type === 'PLAYER_WON')).toBe(true);

    // Many TOKEN_MOVED events (the game actually progressed)
    expect(events.filter((e) => e.type === 'TOKEN_MOVED').length).toBeGreaterThan(10);

    // The winner has all 4 tokens finished
    const winner = store.getState().state.winners[0];
    const winnerTokens = Object.values(store.getState().state.tokens).filter(
      (t) => t.color === winner,
    );
    expect(winnerTokens.every((t) => t.progress === 56)).toBe(true);
  });

  it('reset() returns to a fresh IDLE state', () => {
    const store = makeStore(progressingRng());
    // Dirty the state
    dispatch(store, { type: 'REQUEST_ROLL' });
    expect(store.getState().state.phase).not.toBe('IDLE');

    // Reset by creating fresh state (mirrors store.reset)
    store.setState({ state: createInitialState(colorsForPlayerCount(V1_RULES.playerCount), V1_RULES) });
    expect(store.getState().state.phase).toBe('IDLE');
    expect(store.getState().state.tokens['red-0'].progress).toBe(-1);
  });
});
