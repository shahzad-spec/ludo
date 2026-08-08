/**
 * legalMoves tests (plan §6.7 sub-gate A).
 *
 * Covers: enterOnSix gating, exact-finish overshoot rejection, Move[] shape,
 * blocked/illegal filtering, capture-flag detection, home-entry flag.
 */
import { describe, it, expect } from 'vitest';
import { getLegalMoves } from '../rules/legalMoves';
import { stateWithPlacements } from './helpers';
import { V1_RULES } from '../config/rulesPreset';

describe('legalMoves — yard entry (enterOnSix)', () => {
  it('roll of 6 lets a yard token enter', () => {
    const state = stateWithPlacements(
      { 'red-0': { color: 'red', progress: -1, slot: 0 } },
      { currentPlayer: 'red' },
    );
    const moves = getLegalMoves(state, 6);
    expect(moves.some((m) => m.tokenIds[0] === 'red-0' && m.isEnteringBoard)).toBe(true);
  });

  it('roll of 4 does NOT let a yard token enter', () => {
    const state = stateWithPlacements(
      { 'red-0': { color: 'red', progress: -1, slot: 0 } },
      { currentPlayer: 'red' },
    );
    const moves = getLegalMoves(state, 4);
    expect(moves.some((m) => m.tokenIds[0] === 'red-0')).toBe(false);
  });

  it('a token already on the board advances on a non-6 roll', () => {
    const state = stateWithPlacements(
      { 'red-0': { color: 'red', progress: 5, slot: 0 } },
      { currentPlayer: 'red' },
    );
    const moves = getLegalMoves(state, 4);
    expect(moves).toHaveLength(1);
    expect(moves[0].tokenIds[0]).toBe('red-0');
    expect(moves[0].finalProgress).toBe(9);
  });
});

describe('legalMoves — entryRoll modes (Step 1 lock)', () => {
  it("entryRoll: 'sixOrOne' allows entry on a 1", () => {
    const state = stateWithPlacements(
      { 'red-0': { color: 'red', progress: -1, slot: 0 } },
      { currentPlayer: 'red', rules: { ...V1_RULES, entryRoll: 'sixOrOne' } },
    );
    const moves = getLegalMoves(state, 1);
    expect(moves.some((m) => m.tokenIds[0] === 'red-0' && m.isEnteringBoard)).toBe(true);
  });

  it("entryRoll: 'sixOrOne' still allows entry on a 6", () => {
    const state = stateWithPlacements(
      { 'red-0': { color: 'red', progress: -1, slot: 0 } },
      { currentPlayer: 'red', rules: { ...V1_RULES, entryRoll: 'sixOrOne' } },
    );
    const moves = getLegalMoves(state, 6);
    expect(moves.some((m) => m.tokenIds[0] === 'red-0')).toBe(true);
  });

  it("entryRoll: 'sixOrOne' blocks entry on a 4", () => {
    const state = stateWithPlacements(
      { 'red-0': { color: 'red', progress: -1, slot: 0 } },
      { currentPlayer: 'red', rules: { ...V1_RULES, entryRoll: 'sixOrOne' } },
    );
    const moves = getLegalMoves(state, 4);
    expect(moves.some((m) => m.tokenIds[0] === 'red-0')).toBe(false);
  });

  it("entryRoll: 'any' allows entry on any roll", () => {
    const state = stateWithPlacements(
      { 'red-0': { color: 'red', progress: -1, slot: 0 } },
      { currentPlayer: 'red', rules: { ...V1_RULES, entryRoll: 'any' } },
    );
    expect(getLegalMoves(state, 3).some((m) => m.tokenIds[0] === 'red-0')).toBe(true);
    expect(getLegalMoves(state, 5).some((m) => m.tokenIds[0] === 'red-0')).toBe(true);
  });
});

describe('legalMoves — exact-finish overshoot rejection', () => {
  it('roll that lands exactly on 56 is legal', () => {
    const state = stateWithPlacements(
      { 'red-0': { color: 'red', progress: 50, slot: 0 } }, // needs 6
      { currentPlayer: 'red' },
    );
    const moves = getLegalMoves(state, 6);
    expect(moves.some((m) => m.tokenIds[0] === 'red-0' && m.isFinishing)).toBe(true);
  });

  it('roll that overshoots 56 is illegal (exactFinishRequired)', () => {
    const state = stateWithPlacements(
      { 'red-0': { color: 'red', progress: 53, slot: 0 } }, // 53 + 5 = 58 > 56
      { currentPlayer: 'red' },
    );
    const moves = getLegalMoves(state, 5);
    expect(moves.some((m) => m.tokenIds[0] === 'red-0')).toBe(false);
  });

  it('a token already finished is never movable', () => {
    const state = stateWithPlacements(
      {
        'red-0': { color: 'red', progress: 56, slot: 0 },
        'red-1': { color: 'red', progress: -1, slot: 1 },
      },
      { currentPlayer: 'red' },
    );
    const moves = getLegalMoves(state, 6);
    expect(moves.some((m) => m.tokenIds[0] === 'red-0')).toBe(false);
    expect(moves.some((m) => m.tokenIds[0] === 'red-1')).toBe(true);
  });
});

describe('legalMoves — Move[] shape', () => {
  it('path excludes source and includes destination', () => {
    const state = stateWithPlacements(
      { 'red-0': { color: 'red', progress: 10, slot: 0 } },
      { currentPlayer: 'red' },
    );
    const move = getLegalMoves(state, 3)[0];
    expect(move.path).toHaveLength(3);
    // red offset 0: progress 11,12,13 → cells 11,12,13
    expect(move.path[2]).toEqual({ kind: 'track', cell: 13 });
  });

  it('isEnteringHome flag set when crossing into home column', () => {
    const state = stateWithPlacements(
      { 'red-0': { color: 'red', progress: 49, slot: 0 } }, // 49 + 2 → 51 (home 0)
      { currentPlayer: 'red' },
    );
    const move = getLegalMoves(state, 2)[0];
    expect(move.isEnteringHome).toBe(true);
    expect(move.finalProgress).toBe(51);
  });
});

describe('legalMoves — capture flag', () => {
  it('flag set when landing on an opponent on a non-safe cell', () => {
    const state = stateWithPlacements(
      {
        'red-0': { color: 'red', progress: 5, slot: 0 },
        // green offset 13. To be on cell 9, green progress = (9-13+52)%52 = 48
        'green-0': { color: 'green', progress: 48, slot: 0 },
      },
      { currentPlayer: 'red' },
    );
    const move = getLegalMoves(state, 4)[0]; // red 5→9
    expect(move.isCapture).toBe(true);
  });

  it('flag NOT set when landing on an opponent on a safe cell', () => {
    const state = stateWithPlacements(
      {
        'red-0': { color: 'red', progress: 1, slot: 0 },
        // cell 8 is safe. green on cell 8 → green progress (8-13+52)%52 = 47
        'green-0': { color: 'green', progress: 47, slot: 0 },
      },
      { currentPlayer: 'red' },
    );
    const move = getLegalMoves(state, 7)[0]; // red 1→8 (safe cell 8)
    expect(move.isCapture).toBe(false);
  });

  it('flag NOT set when landing on own color', () => {
    const state = stateWithPlacements(
      {
        'red-0': { color: 'red', progress: 5, slot: 0 },
        'red-1': { color: 'red', progress: 9, slot: 1 },
      },
      { currentPlayer: 'red' },
    );
    const move = getLegalMoves(state, 4)[0]; // red-0 lands on red-1's cell
    // stacking:'none' → no block, but not a capture either (same color)
    expect(move.isCapture).toBe(false);
  });
});

describe('legalMoves — empty when no moves possible', () => {
  it('returns [] when only yard tokens and roll != 6', () => {
    const state = stateWithPlacements(
      { 'red-0': { color: 'red', progress: -1, slot: 0 } },
      { currentPlayer: 'red' },
    );
    expect(getLegalMoves(state, 3)).toEqual([]);
  });
});
