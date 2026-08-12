/**
 * Expectimax search tests (PLAN-PHASE-5B §4.5).
 *
 * All tests use fixedDepth for determinism (amendment D).
 * Moves must be in state.validMoves — the engine's REQUEST_MOVE handler
 * validates against validMoves before simulating.
 */

import { describe, it, expect } from 'vitest';
import { searchBestMove } from '../search';
import { chooseBotMove } from '../policy';
import { stateWithPlacements } from '../../__tests__/helpers';
import type { GameState, Move } from '../../types';

/** Medium policy for opponent modeling in search. */
const mediumPolicy = (s: GameState, m: Move[]) =>
  chooseBotMove(s, m, 'medium');

/** Build a state with specific validMoves (needed for simulate via applyAction). */
function stateWithMoves(
  placements: Parameters<typeof stateWithPlacements>[0],
  overrides: Parameters<typeof stateWithPlacements>[1],
  moves: Move[],
): GameState {
  return stateWithPlacements(placements, { ...overrides, validMoves: moves });
}

describe('searchBestMove — basic', () => {
  it('returns null for empty moves', () => {
    const state = stateWithPlacements({});
    expect(searchBestMove(state, [], 'red', { fixedDepth: 3 }, mediumPolicy)).toBeNull();
  });

  it('returns the only move without searching', () => {
    const state = stateWithPlacements({ 'red-0': { color: 'red', progress: 5 } });
    const move: Move = {
      tokenIds: ['red-0'], path: [{ kind: 'track', cell: 8 }],
      finalProgress: 8, isCapture: false, isEnteringHome: false,
      isEnteringBoard: false, isFinishing: false,
    };
    expect(searchBestMove(state, [move], 'red', { fixedDepth: 3 }, mediumPolicy)).toBe(move);
  });
});

describe('searchBestMove — Pro strategic decisions', () => {
  it('captures when no downside', () => {
    const safe: Move = {
      tokenIds: ['red-0'], path: [{ kind: 'track', cell: 7 }],
      finalProgress: 7, isCapture: false, isEnteringHome: false,
      isEnteringBoard: false, isFinishing: false,
    };
    const capture: Move = {
      tokenIds: ['red-0'], path: [{ kind: 'track', cell: 9 }],
      finalProgress: 9, isCapture: true, isEnteringHome: false,
      isEnteringBoard: false, isFinishing: false,
    };
    const state = stateWithMoves(
      {
        'red-0': { color: 'red', progress: 5 },
        'green-0': { color: 'green', progress: 48 },
      },
      { currentPlayer: 'red', phase: 'SELECTING_TOKEN' },
      [safe, capture],
    );
    const result = searchBestMove(state, [safe, capture], 'red', { fixedDepth: 2 }, mediumPolicy);
    expect(result?.isCapture).toBe(true);
  });

  it('finishes when possible', () => {
    const advance: Move = {
      tokenIds: ['red-0'], path: [{ kind: 'home', cell: 0 }],
      finalProgress: 51, isCapture: false, isEnteringHome: true,
      isEnteringBoard: false, isFinishing: false,
    };
    const finish: Move = {
      tokenIds: ['red-0'], path: [],
      finalProgress: 56, isCapture: false, isEnteringHome: false,
      isEnteringBoard: false, isFinishing: true,
    };
    const state = stateWithMoves(
      { 'red-0': { color: 'red', progress: 50 } },
      { currentPlayer: 'red', phase: 'SELECTING_TOKEN' },
      [advance, finish],
    );
    const result = searchBestMove(state, [advance, finish], 'red', { fixedDepth: 2 }, mediumPolicy);
    expect(result?.isFinishing).toBe(true);
  });

  it('enters home column without hesitation (amendment C)', () => {
    const stay: Move = {
      tokenIds: ['red-0'], path: [{ kind: 'track', cell: 50 }],
      finalProgress: 50, isCapture: false, isEnteringHome: false,
      isEnteringBoard: false, isFinishing: false,
    };
    const enterHome: Move = {
      tokenIds: ['red-0'], path: [{ kind: 'home', cell: 0 }],
      finalProgress: 51, isCapture: false, isEnteringHome: true,
      isEnteringBoard: false, isFinishing: false,
    };
    const state = stateWithMoves(
      { 'red-0': { color: 'red', progress: 49 } },
      { currentPlayer: 'red', phase: 'SELECTING_TOKEN' },
      [stay, enterHome],
    );
    const result = searchBestMove(state, [stay, enterHome], 'red', { fixedDepth: 2 }, mediumPolicy);
    expect(result?.isEnteringHome).toBe(true);
  });

  it('deterministic: same input + fixedDepth = same output', () => {
    const m1: Move = {
      tokenIds: ['red-0'], path: [{ kind: 'track', cell: 12 }],
      finalProgress: 12, isCapture: false, isEnteringHome: false,
      isEnteringBoard: false, isFinishing: false,
    };
    const m2: Move = {
      tokenIds: ['red-0'], path: [{ kind: 'track', cell: 14 }],
      finalProgress: 14, isCapture: false, isEnteringHome: false,
      isEnteringBoard: false, isFinishing: false,
    };
    const state = stateWithMoves(
      {
        'red-0': { color: 'red', progress: 10 },
        'green-0': { color: 'green', progress: 20 },
      },
      { currentPlayer: 'red', phase: 'SELECTING_TOKEN' },
      [m1, m2],
    );
    const r1 = searchBestMove(state, [m1, m2], 'red', { fixedDepth: 3 }, mediumPolicy);
    const r2 = searchBestMove(state, [m1, m2], 'red', { fixedDepth: 3 }, mediumPolicy);
    expect(r1?.tokenIds[0]).toBe(r2?.tokenIds[0]);
    expect(r1?.finalProgress).toBe(r2?.finalProgress);
  });
});

describe('searchBestMove — performance', () => {
  it('completes depth 4 in under 100ms', () => {
    const m1: Move = {
      tokenIds: ['red-0'], path: [{ kind: 'track', cell: 12 }],
      finalProgress: 12, isCapture: false, isEnteringHome: false,
      isEnteringBoard: false, isFinishing: false,
    };
    const m2: Move = {
      tokenIds: ['red-0'], path: [{ kind: 'track', cell: 14 }],
      finalProgress: 14, isCapture: false, isEnteringHome: false,
      isEnteringBoard: false, isFinishing: false,
    };
    const state = stateWithMoves(
      {
        'red-0': { color: 'red', progress: 10 },
        'green-0': { color: 'green', progress: 20 },
      },
      { currentPlayer: 'red', phase: 'SELECTING_TOKEN' },
      [m1, m2],
    );
    const t0 = performance.now();
    searchBestMove(state, [m1, m2], 'red', { fixedDepth: 4 }, mediumPolicy);
    const elapsed = performance.now() - t0;
    console.log(`[perf] depth 4: ${elapsed.toFixed(1)}ms`);
    expect(elapsed).toBeLessThan(100);
  });
});
