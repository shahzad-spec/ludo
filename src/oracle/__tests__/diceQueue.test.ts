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
import { stateWithPlacements } from './helpers';
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

describe('rollSet — as-rolled order, injectable RNG (5D-1b)', () => {
  it('count 2, pinned [3,6] → [3,6] (no sort here — sorting is the engine\'s job)', async () => {
    const { rollSet } = await import('../rules/dice');
    expect(rollSet(pinnedRng([3, 6]), 2)).toEqual([3, 6]);
  });

  it('count 1 → single-element set (equivalence anchor)', async () => {
    const { rollSet } = await import('../rules/dice');
    expect(rollSet(pinnedRng([4]), 1)).toEqual([4]);
  });

  it('count 4, pinned [1,2,3,4] → four values in draw order', async () => {
    const { rollSet } = await import('../rules/dice');
    expect(rollSet(pinnedRng([1, 2, 3, 4]), 4)).toEqual([1, 2, 3, 4]);
  });
});

describe('multi-die REQUEST_ROLL (5D-1b)', () => {
  const twoDice = { ...V1_RULES, diceCount: 2 as const };

  it('diceCount 2, pinned [3,6] → queue DESCENDING [6,3]; rolledSet keeps roll order; alias = 6', () => {
    let state = createInitialState(undefined, twoDice);
    const res = applyAction(state, { type: 'REQUEST_ROLL' }, pinnedRng([3, 6]));
    state = res.state;
    expect(state.phase).toBe('ROLLING');
    expect(state.dice.queue).toEqual([6, 3]); // A1 Decision 14: largest first
    expect(state.dice.rolledSet).toEqual([3, 6]);
    expect(state.dice.value).toBe(6);
    expect(state.dice.capturedInSet).toBe(false);
    expectDiceInvariants(state);
  });

  it('DICE_ROLLED carries values[] (additive) AND value (compat)', () => {
    const state = createInitialState(undefined, twoDice);
    const res = applyAction(state, { type: 'REQUEST_ROLL' }, pinnedRng([3, 6]));
    expect(res.events).toEqual([
      { type: 'DICE_ROLLED', player: 'red', values: [3, 6], value: 6 },
    ]);
  });

  it('diceCount 4 sorts the queue [4,3,2,1]; alias = 4', () => {
    const four = { ...V1_RULES, diceCount: 4 as const };
    const state = createInitialState(undefined, four);
    const res = applyAction(state, { type: 'REQUEST_ROLL' }, pinnedRng([1, 2, 3, 4]));
    expect(res.state.dice.queue).toEqual([4, 3, 2, 1]);
    expect(res.state.dice.value).toBe(4);
    expectDiceInvariants(res.state);
  });

  it('double-6 set: queue [6,6], value 6 — the Decision-5 anchor (one extra turn, not two)', () => {
    const state = createInitialState(undefined, twoDice);
    const res = applyAction(state, { type: 'REQUEST_ROLL' }, pinnedRng([6, 6]));
    expect(res.state.dice.queue).toEqual([6, 6]);
    expect(res.state.dice.rolledSet).toEqual([6, 6]);
  });

  it('out-of-phase reject: REQUEST_ROLL during ROLLING leaves the queue untouched', () => {
    let state = createInitialState(undefined, twoDice);
    state = applyAction(state, { type: 'REQUEST_ROLL' }, pinnedRng([3, 6])).state;
    const rejected = applyAction(state, { type: 'REQUEST_ROLL' }, pinnedRng([1, 1]));
    expect(rejected.state).toBe(state); // same reference — unchanged
    expect(rejected.events).toEqual([]);
  });
});

/** Craft a ROLLING state with an explicit queue (new-test-only; prior tests
 *  never hand-write dice — they drive the engine). */
function rollingWithQueue(
  placements: Parameters<typeof stateWithPlacements>[0],
  queue: number[],
  rules = V1_RULES,
): GameState {
  return stateWithPlacements(placements, {
    currentPlayer: 'red',
    phase: 'ROLLING',
    rules,
    dice: { queue, rolledSet: [...queue].sort((a, b) => a - b), value: queue[0], rolled: true, capturedInSet: false },
  });
}

describe('RESOLVE_ROLL + burn-loop (5D-1c)', () => {
  const twoDice = { ...V1_RULES, diceCount: 2 as const };

  it('burns an unplayable head die and continues to a playable one', () => {
    // Every red token overshoots on 6 (p51-53 + 6 > 56) but is legal on 3.
    const state = rollingWithQueue(
      {
        'red-0': { color: 'red', progress: 51 },
        'red-1': { color: 'red', progress: 52 },
        'red-2': { color: 'red', progress: 53 },
        'red-3': { color: 'red', progress: 53 },
      },
      [6, 3],
      twoDice,
    );
    const res = applyAction(state, { type: 'RESOLVE_ROLL', value: 6 });
    expect(res.events).toEqual([{ type: 'DIE_BURNED', player: 'red', value: 6 }]);
    expect(res.state.phase).toBe('SELECTING_TOKEN');
    expect(res.state.dice.queue).toEqual([3]);
    expect(res.state.dice.value).toBe(3);
    expect(res.state.validMoves.length).toBeGreaterThan(0);
    expectDiceInvariants(res.state);
  });

  it('fully burned set lands on the v1 NO_LEGAL_MOVE route (turn pass, dice cleared)', () => {
    // All-yard + no six in the set → nothing playable at all.
    let state = createInitialState(undefined, twoDice);
    state = applyAction(state, { type: 'REQUEST_ROLL' }, pinnedRng([3, 2])).state;
    const res = applyAction(state, { type: 'RESOLVE_ROLL', value: 3 });
    expect(res.events).toEqual([
      { type: 'DIE_BURNED', player: 'red', value: 3 },
      { type: 'DIE_BURNED', player: 'red', value: 2 },
      { type: 'NO_LEGAL_MOVE', player: 'red', value: 3 },
      { type: 'TURN_CHANGED', nextPlayer: 'green' },
    ]);
    expect(res.state.phase).toBe('IDLE');
    expect(res.state.currentPlayer).toBe('green');
    expect(res.state.dice.queue).toEqual([]);
    expectDiceInvariants(res.state);
  });

  it('a six in a FULLY BURNED set still counts (extra turn granted, count reset)', () => {
    // All red at p54: every die 2..6 overshoots; the rolled 6 burned but the
    // SET contains it → sixGrantsExtraTurn keeps the turn (Decision 5), with
    // consecutiveSixes reset by the v1 pass route.
    const state = rollingWithQueue(
      {
        'red-0': { color: 'red', progress: 54 },
        'red-1': { color: 'red', progress: 54 },
        'red-2': { color: 'red', progress: 54 },
        'red-3': { color: 'red', progress: 54 },
      },
      [6, 3],
      twoDice,
    );
    const res = applyAction(state, { type: 'RESOLVE_ROLL', value: 6 });
    expect(res.events.map((e) => e.type)).toEqual(['DIE_BURNED', 'DIE_BURNED', 'NO_LEGAL_MOVE']);
    expect(res.state.currentPlayer).toBe('red'); // extra turn — the set had a 6
    expect(res.state.consecutiveSixes).toBe(0); // v1 pass route resets
    expectDiceInvariants(res.state);
  });

  it('count 1 no-move is BYTE-IDENTICAL v1: NO_LEGAL_MOVE only, never DIE_BURNED', () => {
    let state = createInitialState(); // V1_RULES, diceCount 1
    state = applyAction(state, { type: 'REQUEST_ROLL' }, pinnedRng([3])).state;
    const res = applyAction(state, { type: 'RESOLVE_ROLL', value: 3 });
    expect(res.events).toEqual([
      { type: 'NO_LEGAL_MOVE', player: 'red', value: 3 },
      { type: 'TURN_CHANGED', nextPlayer: 'green' },
    ]);
    expect(res.state.currentPlayer).toBe('green');
    expectDiceInvariants(res.state);
  });

  it('move computation follows the QUEUE HEAD, not the legacy action.value', () => {
    // All-yard, queue [6,2]: the head 6 frees a yard token even though a stale
    // action claims value 2.
    let state = createInitialState(undefined, twoDice);
    state = applyAction(state, { type: 'REQUEST_ROLL' }, pinnedRng([2, 6])).state;
    expect(state.dice.queue).toEqual([6, 2]);
    const res = applyAction(state, { type: 'RESOLVE_ROLL', value: 2 }); // stale
    expect(res.state.phase).toBe('SELECTING_TOKEN');
    expect(res.state.validMoves.some((m) => m.isEnteringBoard)).toBe(true);
  });
});
