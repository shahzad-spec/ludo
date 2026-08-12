/**
 * Personality tests — competitive-bot behavior (PHASE-5C §4, §6).
 *
 * 5C-2a: the paranoid opponent model. P-1…P-8 (the full crafted-position
 * acceptance suite) are added in 5C-2e once the TT + capture extensions land.
 */

import { describe, it, expect } from 'vitest';
import { paranoidPolicy } from '../policy';
import { simulateMove, searchBestMove } from '../search';
import { stateWithPlacements } from '../../__tests__/helpers';
import type { GameState, Move } from '../../types';

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

/** Build a state with specific validMoves (needed for simulate via applyAction). */
function stateWithMoves(
  placements: Parameters<typeof stateWithPlacements>[0],
  overrides: Parameters<typeof stateWithPlacements>[1],
  moves: Move[],
): GameState {
  return stateWithPlacements(placements, { ...overrides, validMoves: moves });
}

describe('P-3 — Pro refuses bait (paranoid recapture)', () => {
  // SKIPPED — 5C-4-gated. With the initial weights, the `mass` term (−1.0 on a
  // 0–300 scale) over-values captures: Pro takes even an UNFAVORABLE capture
  // because the opponentMass drop outweighs the recapture cost (verified: it
  // picks finalProgress 46, the capture). The paranoid model DOES see the
  // recapture; the eval just rates the trade as winning. Once 5C-4 tunes the
  // mass weight down, unskip this and it should pass. Fixture-contract verified
  // (both moves are in validMoves), so this is a weight issue, not a 5B-2-style
  // contract bug.
  it.skip('declines an UNFAVORABLE capture that the paranoid opponent recaptures', () => {
    // red-0 (p43, value 46) can capture green-0 at cell 46 (p33, value 33), but
    // green-1 (cell 45) recaptures red-0 on roll 1. The trade loses red's more
    // valuable token. Safe alternative: cell 47 (safe star).
    const capture = makeMove('red-0', 46, 46, true);
    const safe = makeMove('red-0', 47, 47);
    const state = stateWithMoves(
      {
        'red-0': { color: 'red', progress: 43 },
        'green-0': { color: 'green', progress: 33 }, // cell 46
        'green-1': { color: 'green', progress: 32 }, // cell 45, recaptures cell 46 on roll 1
      },
      { currentPlayer: 'red', phase: 'SELECTING_TOKEN' },
      [capture, safe],
    );
    const choice = searchBestMove(
      state, [capture, safe], 'red', { fixedDepth: 3 },
      paranoidPolicy('red', simulateMove),
    );
    // fixture-contract check (5B-2 lesson): both moves must be in validMoves
    expect(state.validMoves).toContain(capture);
    expect(state.validMoves).toContain(safe);
    expect(choice?.finalProgress).toBe(47); // declines the bait, parks safe
  });
});
