/**
 * The Zustand store — the side-effect boundary (plan §6.5).
 *
 * Contract (reviewed & locked):
 *  - The store holds exactly ONE GameState. Nothing hand-edits its fields.
 *  - The Oracle (applyAction) is the ONLY writer. The store's dispatch()
 *    runs the reducer and commits the WHOLE returned state.
 *  - Side-effects (emitting to the bus) happen HERE, after state commit, so
 *    the bus is always in sync with state. The reducer itself stays pure.
 *  - RNG is injectable for tests; defaults to Math.random in the browser.
 */

import { create } from 'zustand';
import { applyAction, createInitialState, colorsForPlayerCount } from '../oracle/engine';
import { bus } from '../bus/events';
import { V1_RULES } from '../oracle/config/rulesPreset';
import type { Action, GameState, RulesConfig } from '../oracle/types';

interface GameStore {
  /** The single source of truth. Components subscribe narrowly via selectors. */
  state: GameState;
  /** Dispatch an intent. The reducer validates + computes; the store commits + emits. */
  dispatch: (action: Action) => void;
  /** Reset to a fresh game. */
  reset: (rules?: RulesConfig) => void;
}

/**
 * The RNG used by dispatch. Tests swap this to a pinned generator:
 *   useGame.getState().__setRng(pinnedRng([6,3,...]));
 * Exposed via the store so tests don't need to import internals.
 */
let dispatchRng: () => number = Math.random;

export const useGame = create<GameStore>((set) => ({
  state: createInitialState(colorsForPlayerCount(V1_RULES.playerCount), V1_RULES),

  dispatch: (action) =>
    set((store) => {
      const { state: nextState, events } = applyAction(
        store.state,
        action,
        dispatchRng,
      );
      // 1. Commit the whole new state atomically.
      // 2. Fan events to the bus AFTER commit so subscribers see fresh state.
      //    We emit inside the set callback's return so state + bus stay synced
      //    even if a subscriber reads during dispatch.
      queueMicrotask(() => {
        for (const event of events) bus.emit(event);
      });
      return { state: nextState };
    }),

  reset: (rules = V1_RULES) => {
    bus.clear();
    set({ state: createInitialState(colorsForPlayerCount(rules.playerCount), rules) });
  },
}));

/** Test-only hook to pin the RNG. Not used by the app. */
export function __setDispatchRng(rng: () => number): void {
  dispatchRng = rng;
}

/** Test-only hook to restore the default RNG. */
export function __resetDispatchRng(): void {
  dispatchRng = Math.random;
}
