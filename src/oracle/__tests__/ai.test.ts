/**
 * Bot AI tests (IMPLEMENTATION-PLAN-v1 §10, Phase 5 gate).
 */

import { describe, it, expect } from 'vitest';
import { chooseBotMove } from '../ai';
import type { Move } from '../types';
import { stateWithPlacements } from './helpers';

function makeMove(overrides: Partial<Move> & { tokenId: string }): Move {
  return {
    tokenIds: [overrides.tokenId],
    path: [{ kind: 'track', cell: 0 }],
    finalProgress: 5,
    isCapture: false,
    isEnteringHome: false,
    isEnteringBoard: false,
    isFinishing: false,
    ...overrides,
  };
}

function seededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

describe('chooseBotMove — empty moves', () => {
  it('returns null for empty moves (medium)', () => {
    expect(chooseBotMove(stateWithPlacements({}), [], 'medium')).toBeNull();
  });
  it('returns null for empty moves (easy)', () => {
    expect(chooseBotMove(stateWithPlacements({}), [], 'easy')).toBeNull();
  });
});

describe('chooseBotMove — medium picks the best move', () => {
  it('picks capture over normal advance', () => {
    const state = stateWithPlacements({ 'red-0': { color: 'red', progress: 5 } });
    const advance = makeMove({ tokenId: 'red-0', finalProgress: 9 });
    const capture = makeMove({ tokenId: 'red-0', finalProgress: 10, isCapture: true });
    const result = chooseBotMove(state, [advance, capture], 'medium');
    expect(result?.isCapture).toBe(true);
  });

  it('picks finish over capture', () => {
    const state = stateWithPlacements({ 'red-0': { color: 'red', progress: 50 } });
    const capture = makeMove({ tokenId: 'red-0', finalProgress: 52, isCapture: true });
    const finish = makeMove({ tokenId: 'red-0', finalProgress: 56, isFinishing: true });
    const result = chooseBotMove(state, [capture, finish], 'medium');
    expect(result?.isFinishing).toBe(true);
  });

  it('picks yard exit on a 6 when nothing else special is available', () => {
    const state = stateWithPlacements({
      'red-0': { color: 'red', progress: -1 },
      'red-1': { color: 'red', progress: 10 },
    });
    const advance = makeMove({ tokenId: 'red-1', finalProgress: 13 });
    const exit = makeMove({ tokenId: 'red-0', finalProgress: 0, isEnteringBoard: true });
    const result = chooseBotMove(state, [advance, exit], 'medium');
    expect(result?.isEnteringBoard).toBe(true);
  });

  it('prefers safe cell (yard exit to cell 0) over exposed advance', () => {
    const state = stateWithPlacements({
      'red-0': { color: 'red', progress: 5 },
      'red-1': { color: 'red', progress: -1 },
      'green-0': { color: 'green', progress: 44 },
    });
    const advanceAway = makeMove({ tokenId: 'red-0', finalProgress: 10, path: [{ kind: 'track', cell: 10 }] });
    const exitSafe = makeMove({ tokenId: 'red-1', finalProgress: 0, isEnteringBoard: true, path: [{ kind: 'track', cell: 0 }] });
    const result = chooseBotMove(state, [advanceAway, exitSafe], 'medium');
    expect(result?.tokenId).toBe('red-1');
  });
});

describe('chooseBotMove — easy returns valid moves', () => {
  it('always returns a member of the moves array', () => {
    const state = stateWithPlacements({ 'red-0': { color: 'red', progress: 5 } });
    const moves = [
      makeMove({ tokenId: 'red-0', finalProgress: 8 }),
      makeMove({ tokenId: 'red-0', finalProgress: 11 }),
    ];
    for (let seed = 1; seed <= 20; seed++) {
      const result = chooseBotMove(state, moves, 'easy', seededRng(seed));
      expect(result).not.toBeNull();
      expect(moves.some((m) => m.tokenIds[0] === result!.tokenIds[0])).toBe(true);
    }
  });
});
