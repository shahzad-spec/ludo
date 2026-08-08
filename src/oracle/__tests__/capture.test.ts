/**
 * capture tests (plan §6.7 sub-gate A, §6.8 capture-reset gotcha).
 *
 * The critical assertion: victims reset to **BASE (-1)**, NOT 0. progress 0
 * is the entry cell (back in play); a reset-to-0 would re-enter the board.
 */
import { describe, it, expect } from 'vitest';
import { checkCaptures } from '../rules/capture';
import { stateWithPlacements } from './helpers';
import { BASE } from '../board/track';

describe('capture — non-safe cell', () => {
  it('captures an opponent and resets it to BASE (not 0)', () => {
    // red lands on cell 9 (non-safe); green sits on cell 9.
    const state = stateWithPlacements({
      'red-0': { color: 'red', progress: 5, slot: 0 }, // mover
      'green-0': { color: 'green', progress: 48, slot: 0 }, // victim on cell 9
    });
    const results = checkCaptures(state, 'red-0', 9); // red lands at progress 9 = cell 9
    expect(results).toHaveLength(1);
    expect(results[0].victim.id).toBe('green-0');
    expect(results[0].victim.progress).toBe(BASE); // THE critical assertion
    expect(results[0].victim.progress).not.toBe(0);
  });

  it('emits TOKEN_CAPTURED with both attacker and victim ids', () => {
    const state = stateWithPlacements({
      'red-0': { color: 'red', progress: 5, slot: 0 },
      'green-0': { color: 'green', progress: 48, slot: 0 },
    });
    const [result] = checkCaptures(state, 'red-0', 9);
    expect(result.event.type).toBe('TOKEN_CAPTURED');
    expect(result.event).toMatchObject({
      attackerId: 'red-0',
      victimId: 'green-0',
      cell: 9,
    });
  });
});

describe('capture — safe cell prevents capture', () => {
  it('no capture when landing on an opponent on a safe cell', () => {
    // cell 8 is safe. green on cell 8 → green progress 47.
    const state = stateWithPlacements({
      'red-0': { color: 'red', progress: 1, slot: 0 },
      'green-0': { color: 'green', progress: 47, slot: 0 },
    });
    const results = checkCaptures(state, 'red-0', 8); // red lands at cell 8
    expect(results).toEqual([]);
  });
});

describe('capture — same color not captured', () => {
  it('does not capture own color', () => {
    const state = stateWithPlacements({
      'red-0': { color: 'red', progress: 5, slot: 0 },
      'red-1': { color: 'red', progress: 9, slot: 1 },
    });
    const results = checkCaptures(state, 'red-0', 9);
    expect(results).toEqual([]);
  });
});

describe('capture — home column and finish', () => {
  it('no capture in the home column (private)', () => {
    const state = stateWithPlacements({
      'red-0': { color: 'red', progress: 49, slot: 0 },
      'green-0': { color: 'green', progress: 50, slot: 0 }, // somewhere, irrelevant
    });
    // red lands at progress 52 → home cell 1 (private to red)
    const results = checkCaptures(state, 'red-0', 52);
    expect(results).toEqual([]);
  });
});
