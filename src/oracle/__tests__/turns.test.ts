/**
 * turns + win tests (plan §6.7 sub-gate A).
 *
 * Covers: six-grants-extra-turn (rules flag on), capture-no-extra-turn
 * (rules flag off in v1), consecutive-sixes forfeit (3× six → skip),
 * turn-skip for finished players, win detection (4/4 vs 3/4).
 */
import { describe, it, expect } from 'vitest';
import { resolveTurn, hasColorFinished } from '../rules/turns';
import { hasColorWon, checkWin, isGameOver } from '../rules/win';
import { stateWithPlacements } from './helpers';
import { V1_RULES } from '../config/rulesPreset';

describe('resolveTurn — six grants extra turn (rules flag on)', () => {
  it('keeps turn on a 6 (under the consecutive limit)', () => {
    const state = stateWithPlacements({}, { currentPlayer: 'red' });
    const result = resolveTurn(state, true, false, 1); // rolled six, 1st consecutive
    expect(result.advanced).toBe(false);
    expect(result.nextPlayer).toBe('red');
    expect(result.resetSixes).toBe(false);
  });
});

describe('resolveTurn — capture does NOT grant extra turn (v1 rules flag off)', () => {
  it('passes turn after a capture on a non-6 roll', () => {
    const state = stateWithPlacements({}, { currentPlayer: 'red' });
    const result = resolveTurn(state, false, true, 0); // captured, not a six
    expect(result.advanced).toBe(true);
    expect(result.nextPlayer).toBe('green');
  });
});

describe('resolveTurn — consecutive-sixes forfeit', () => {
  it('3rd six in a row forfeits the turn (limit = 3)', () => {
    const state = stateWithPlacements({}, { currentPlayer: 'red' });
    const result = resolveTurn(state, true, false, 3); // already at limit
    expect(result.advanced).toBe(true);
    expect(result.nextPlayer).toBe('green');
    expect(result.resetSixes).toBe(true);
  });

  it('2nd six in a row does NOT forfeit (under limit)', () => {
    const state = stateWithPlacements({}, { currentPlayer: 'red' });
    const result = resolveTurn(state, true, false, 2);
    expect(result.advanced).toBe(false);
  });
});

describe('resolveTurn — sixesLimit: null means no forfeit (Step 1 lock)', () => {
  it('null limit never forfeits, even at 10 consecutive sixes', () => {
    const state = stateWithPlacements(
      {},
      { currentPlayer: 'red', rules: { ...V1_RULES, sixesLimit: null } },
    );
    const result = resolveTurn(state, true, false, 10);
    expect(result.advanced).toBe(false);
    expect(result.nextPlayer).toBe('red');
  });
});

describe('resolveTurn — skips finished players', () => {
  it('advances past a color that has all 4 tokens finished', () => {
    const state = stateWithPlacements(
      {
        'green-0': { color: 'green', progress: 56, slot: 0 },
        'green-1': { color: 'green', progress: 56, slot: 1 },
        'green-2': { color: 'green', progress: 56, slot: 2 },
        'green-3': { color: 'green', progress: 56, slot: 3 },
      },
      { currentPlayer: 'red' },
    );
    const result = resolveTurn(state, false, false, 0);
    // red → (skip green) → yellow
    expect(result.nextPlayer).toBe('yellow');
  });
});

describe('hasColorFinished / hasColorWon', () => {
  it('hasColorFinished true when all 4 tokens at 56', () => {
    const state = stateWithPlacements({
      'green-0': { color: 'green', progress: 56, slot: 0 },
      'green-1': { color: 'green', progress: 56, slot: 1 },
      'green-2': { color: 'green', progress: 56, slot: 2 },
      'green-3': { color: 'green', progress: 56, slot: 3 },
    });
    expect(hasColorFinished(state, 'green')).toBe(true);
  });

  it('3 of 4 finished is NOT a win', () => {
    const state = stateWithPlacements({
      'green-0': { color: 'green', progress: 56, slot: 0 },
      'green-1': { color: 'green', progress: 56, slot: 1 },
      'green-2': { color: 'green', progress: 56, slot: 2 },
      'green-3': { color: 'green', progress: 30, slot: 3 },
    });
    expect(hasColorWon(state, 'green')).toBe(false);
  });

  it('checkWin returns the color when all 4 finish', () => {
    const state = stateWithPlacements({
      'green-0': { color: 'green', progress: 56, slot: 0 },
      'green-1': { color: 'green', progress: 56, slot: 1 },
      'green-2': { color: 'green', progress: 56, slot: 2 },
      'green-3': { color: 'green', progress: 56, slot: 3 },
    });
    expect(checkWin(state, 'green')).toBe('green');
  });

  it('isGameOver true once winners[] is non-empty', () => {
    const state = stateWithPlacements({}, { winners: ['red'] });
    expect(isGameOver(state)).toBe(true);
  });
});
