/**
 * Dice-queue state contract (PHASE-5D 5D-1a).
 *
 * The A1 alias invariant — dice.value === queue[0] ?? null — is THE compat
 * mechanism that keeps all 315 prior tests/tools source-compatible. The helper
 * below is reused by every later 5D-1 sub-step; per the A2.1 stipulation it
 * also asserts capturedInSet is cleared whenever the queue is empty (no
 * cross-turn leakage) and rolled tracks queue occupancy.
 */

import { describe, it, expect } from 'vitest';
import { applyAction, createInitialState } from '../engine';
import { V1_RULES, soloRules } from '../config/rulesPreset';
import { pinnedRng } from '../rules/dice';
import type { GameState } from '../types';

/** The A1 alias + A2.1 clearing invariant, checked everywhere. */
export function expectDiceInvariants(state: GameState): void {
  const { dice } = state;
  expect(dice.value, 'alias: value === queue[0] ?? null').toBe(dice.queue[0] ?? null);
  if (dice.queue.length === 0) {
    expect(dice.rolled, 'empty queue ⇒ rolled false').toBe(false);
    // A2.1 stipulation: the flag never survives across turns.
    expect(dice.capturedInSet, 'empty queue ⇒ capturedInSet cleared').toBe(false);
  }
}

describe('dice queue — initial state shape (5D-1a)', () => {
  it('createInitialState: empty queue, null alias, unrolled, flag cleared', () => {
    const state = createInitialState();
    expect(state.dice).toEqual({
      queue: [],
      rolledSet: [],
      value: null,
      rolled: false,
      capturedInSet: false,
    });
    expectDiceInvariants(state);
  });

  it('rules presets default to diceCount 1 (v1 preservation)', () => {
    expect(V1_RULES.diceCount).toBe(1);
    expect(soloRules().diceCount).toBe(1);
  });

  it('RulesConfig accepts diceCount 2 as a type-level value (behavior lands in 5D-1b)', () => {
    const rules = { ...V1_RULES, diceCount: 2 as const };
    const state = createInitialState(undefined, rules);
    expect(state.rules.diceCount).toBe(2);
    expectDiceInvariants(state);
  });
});

describe('dice queue — v1 single-die flow keeps the alias (5D-1a interim)', () => {
  it('REQUEST_ROLL at diceCount 1 → queue [v], rolledSet [v], alias holds', () => {
    let state = createInitialState();
    const rng = pinnedRng([6]);
    state = applyAction(state, { type: 'REQUEST_ROLL' }, rng).state;
    expect(state.phase).toBe('ROLLING');
    expect(state.dice.queue).toEqual([6]);
    expect(state.dice.rolledSet).toEqual([6]);
    expect(state.dice.value).toBe(6);
    expect(state.dice.capturedInSet).toBe(false);
    expectDiceInvariants(state);
  });

  it('turn end (no-move pass) clears the whole dice object', () => {
    // All-yard board + roll 3 (no entry) → NO_LEGAL_MOVE path clears dice.
    let state = createInitialState();
    state = applyAction(state, { type: 'REQUEST_ROLL' }, pinnedRng([3])).state;
    state = applyAction(state, { type: 'RESOLVE_ROLL', value: 3 }).state;
    expect(state.phase).toBe('IDLE');
    expect(state.dice.queue).toEqual([]);
    expect(state.dice.value).toBeNull();
    expectDiceInvariants(state);
  });
});
