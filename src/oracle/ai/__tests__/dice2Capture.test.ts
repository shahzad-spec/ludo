/**
 * Dice-2 free-capture vision check (5D playtest finding, 2026-08-18).
 *
 * User report: "the confirmed token capture was ignored" at x2 — a bot had two
 * tokens and two dice, one token could easily capture an opponent token, and
 * the bot didn't take it.
 *
 * This fixture isolates VISION from JUDGMENT: a capture with ZERO retaliation
 * risk (no other opponent on the board) must be taken by every sound
 * difficulty. If these pass, the playtest case was a judged tradeoff (the
 * dice-2 exposure geometry priced the landing as too dangerous — tuning
 * backlog). If any fail, it's a bug to fix before merge.
 *
 * Geometry (real engine menu, no synthesis):
 *   red-0   progress 10 -> cell 10
 *   green-0 progress  2 -> cell 15  (green offset 13; NOT a safe cell)
 *   dice {5,2}: die 5 lands red-0 on cell 15 = CAPTURE; die 2 advances to 12.
 *   Every other token is in the yard -> landing exposure is exactly 0.
 */

import { describe, it, expect } from 'vitest';
import { applyAction } from '../../engine';
import { V1_RULES } from '../../config/rulesPreset';
import { pinnedRng } from '../../rules/dice';
import { chooseBotMove, paranoidPolicy } from '../policy';
import { searchBestMove, simulateMove } from '../search';
import type { GameState } from '../../types';
import { stateWithPlacements } from '../../__tests__/helpers';

function freeCaptureState(): GameState {
  const rules = { ...V1_RULES, diceCount: 2 as const };
  let state = stateWithPlacements(
    {
      'red-0': { color: 'red', progress: 10 },
      'green-0': { color: 'green', progress: 2 },
    },
    { currentPlayer: 'red', rules },
  );
  state = applyAction(state, { type: 'REQUEST_ROLL' }, pinnedRng([5, 2])).state;
  state = applyAction(state, { type: 'RESOLVE_ROLL', value: 5 }).state;
  return state;
}

describe('dice-2 free capture — vision check (5D playtest finding)', () => {
  it('the union menu contains the die-5 capture', () => {
    const state = freeCaptureState();
    expect(state.phase).toBe('SELECTING_TOKEN');
    expect(state.dice.queue).toEqual([5, 2]);
    expect(state.validMoves.some((m) => m.isCapture)).toBe(true);
  });

  it('medium takes the free capture', () => {
    const state = freeCaptureState();
    const move = chooseBotMove(state, state.validMoves, 'medium');
    expect(move?.isCapture).toBe(true);
  });

  it('hard takes the free capture', () => {
    const state = freeCaptureState();
    const move = chooseBotMove(state, state.validMoves, 'hard');
    expect(move?.isCapture).toBe(true);
  });

  it('pro takes the free capture (paranoid model, fixedDepth 3)', () => {
    const state = freeCaptureState();
    const move = searchBestMove(
      state,
      state.validMoves,
      'red',
      { fixedDepth: 3 },
      paranoidPolicy('red', simulateMove),
    );
    expect(move?.isCapture).toBe(true);
  });
});
