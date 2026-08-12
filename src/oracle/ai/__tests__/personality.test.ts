/**
 * Personality tests — competitive-bot behavior (PHASE-5C §4, §6).
 *
 * 5C-2a: the paranoid opponent model. P-1…P-8 (the full crafted-position
 * acceptance suite) are added in 5C-2e once the TT + capture extensions land.
 */

import { describe, it, expect } from 'vitest';
import { paranoidPolicy } from '../policy';
import { simulateMove } from '../search';
import { stateWithPlacements } from '../../__tests__/helpers';
import type { Move } from '../../types';

/** Minimal legal-shape move for crafted fixtures (mirrors search.test.ts). */
function makeMove(
  tokenId: string,
  finalProgress: number,
  cell: number,
  isCapture = false,
): Move {
  return {
    tokenIds: [tokenId],
    path: [{ kind: 'track', cell }],
    finalProgress,
    isCapture,
    isEnteringHome: false,
    isEnteringBoard: false,
    isFinishing: false,
  };
}

describe('paranoidPolicy — opponent minimizes MY evaluation', () => {
  it('picks the opponent move that captures my token (worst for me)', () => {
    // me = red. Green to move. green-0 (progress 44 → cell 5) can either:
    //   - capture: advance to progress 49 → cell 10, landing on red-0 (capture)
    //   - advance: advance to progress 45 → cell 6 (no capture)
    // Paranoid assumes the worst for me, so it takes the capture.
    const capture = makeMove('green-0', 49, 10, true);
    const advance = makeMove('green-0', 45, 6, false);
    const state = stateWithPlacements(
      {
        'red-0': { color: 'red', progress: 10 }, // cell 10
        'green-0': { color: 'green', progress: 44 }, // cell 5
      },
      { currentPlayer: 'green', phase: 'SELECTING_TOKEN', validMoves: [capture, advance] },
    );
    const choice = paranoidPolicy('red', simulateMove)(state, [capture, advance]);
    expect(choice?.isCapture).toBe(true);
  });

  it('is deterministic — same inputs yield the same pick', () => {
    const a = makeMove('green-0', 45, 6, false);
    const b = makeMove('green-0', 49, 10, true);
    const state = stateWithPlacements(
      {
        'red-0': { color: 'red', progress: 10 },
        'green-0': { color: 'green', progress: 44 },
      },
      { currentPlayer: 'green', phase: 'SELECTING_TOKEN', validMoves: [a, b] },
    );
    const policy = paranoidPolicy('red', simulateMove);
    const r1 = policy(state, [a, b]);
    const r2 = policy(state, [a, b]);
    expect(r1?.finalProgress).toBe(r2?.finalProgress);
  });

  it('returns null on empty moves', () => {
    expect(paranoidPolicy('red', simulateMove)(stateWithPlacements({}), [])).toBeNull();
  });
});
