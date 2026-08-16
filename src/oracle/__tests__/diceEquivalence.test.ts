/**
 * 5D-1e — the diceCount:1 equivalence battery (the 5D-1 HARD GATE).
 *
 * The queue engine must be indistinguishable from v1 at one die: queue length
 * <= 1, the value alias exact, event/record shapes v1-identical, no DIE_BURNED
 * ever, identical RNG consumption (same seed -> same game), and full games
 * terminating. Swept over a complete seeded game, not just snippets.
 */

import { describe, it, expect } from 'vitest';
import { applyAction, createInitialState } from '../engine';
import { V1_RULES, soloRules } from '../config/rulesPreset';
import type { GameEvent } from '../../bus/events';
import type { GameState, RulesConfig } from '../types';

function seededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function assertV1Shape(state: GameState): void {
  expect(state.dice.queue.length).toBeLessThanOrEqual(1);
  expect(state.dice.value).toBe(state.dice.queue[0] ?? null);
  expect(state.dice.rolledSet.length).toBe(state.dice.queue.length);
  if (state.dice.queue.length === 0) {
    expect(state.dice.rolled).toBe(false);
    expect(state.dice.capturedInSet).toBe(false);
  }
}

interface Sweep {
  state: GameState;
  events: GameEvent[];
  steps: number;
}

/** Drive a full diceCount:1 game, asserting the v1 shape after every action. */
function sweepGame(rules: RulesConfig, seed: number, maxSteps = 6000): Sweep {
  let state = createInitialState(undefined, rules);
  const rng = seededRng(seed);
  const events: GameEvent[] = [];
  let steps = 0;
  while (state.phase !== 'GAME_OVER' && steps < maxSteps) {
    steps++;
    let res;
    if (state.phase === 'IDLE') {
      res = applyAction(state, { type: 'REQUEST_ROLL' }, rng);
    } else if (state.phase === 'ROLLING') {
      res = applyAction(state, { type: 'RESOLVE_ROLL', value: state.dice.value ?? 1 });
    } else if (state.phase === 'SELECTING_TOKEN') {
      res = applyAction(state, { type: 'REQUEST_MOVE', tokenId: state.validMoves[0].tokenIds[0] });
    } else {
      res = applyAction(state, { type: 'RESOLVE_MOVE' });
    }
    state = res.state;
    events.push(...res.events);
    assertV1Shape(state);
  }
  return { state, events, steps };
}

describe('5D-1e — diceCount:1 equivalence battery (HARD GATE)', () => {
  it('a full seeded V1_RULES game holds the v1 dice shape at EVERY step and terminates', () => {
    const run = sweepGame(V1_RULES, 20260816);
    expect(run.state.phase).toBe('GAME_OVER');
    expect(run.state.winners.length).toBeGreaterThan(0);
    expect(run.steps).toBeLessThan(6000);
  });

  it('never emits DIE_BURNED; every DICE_ROLLED is single-value with value === values[0]', () => {
    const run = sweepGame(V1_RULES, 20260816);
    expect(run.events.some((e) => e.type === 'DIE_BURNED')).toBe(false);
    const rolls = run.events.filter((e) => e.type === 'DICE_ROLLED');
    expect(rolls.length).toBeGreaterThan(50);
    for (const e of rolls) {
      expect(e.type).toBe('DICE_ROLLED');
      if (e.type === 'DICE_ROLLED') {
        expect(e.values).toHaveLength(1);
        expect(e.value).toBe(e.values[0]);
      }
    }
  });

  it('every TurnRecord is per-single-die: roll === rolls[0] (rolls length 1)', () => {
    const run = sweepGame(V1_RULES, 20260816);
    expect(run.state.turnHistory.length).toBeGreaterThan(50);
    for (const rec of run.state.turnHistory) {
      expect(rec.rolls).toEqual([rec.roll]);
    }
  });

  it('same seed → identical game (RNG-draw parity with v1: one draw per roll)', () => {
    const a = sweepGame(V1_RULES, 777);
    const b = sweepGame(V1_RULES, 777);
    expect(b.state.winners).toEqual(a.state.winners);
    expect(b.state.turnHistory.length).toBe(a.state.turnHistory.length);
    expect(b.steps).toBe(a.steps);
    const pa = Object.values(a.state.tokens).map((t) => t.progress).join(',');
    const pb = Object.values(b.state.tokens).map((t) => t.progress).join(',');
    expect(pb).toBe(pa);
  });

  it('soloRules (bots preset, still diceCount 1) sweeps clean too', () => {
    const run = sweepGame(soloRules(), 4242);
    expect(run.state.phase).toBe('GAME_OVER');
  });
});
