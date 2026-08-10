/**
 * Bot AI — pure heuristic move selection (IMPLEMENTATION-PLAN-v1 §10).
 *
 * No React, no three — pure Oracle layer. Reads GameState + Move[], returns
 * the chosen Move (or null if none). Injectable RNG for deterministic tests.
 *
 * Two difficulties:
 *  - Easy: weighted-random, biased toward good moves but not always optimal.
 *  - Medium: always picks the highest-scored move (greedy).
 *
 * Scoring:
 *  - finalProgress: further along the board = better
 *  - isFinishing: +1000 (winning a token is the best outcome)
 *  - isCapture: +900 (sending opponent home is huge)
 *  - isEnteringBoard: +500 (getting a token out of the yard on a 6)
 *  - isEnteringHome: +80 (entering the safe home column)
 *  - Medium only: exposure penalty (-300) for parking where an opponent
 *    could land next roll (within 6 cells, non-safe cell)
 */

import type { GameState, Move } from './types';
import { ENTRY_OFFSET } from './board/track';
import { SAFE_TRACK_CELLS } from './board/safeCells';

export type BotDifficulty = 'easy' | 'medium';

/** Base score: how good is this move intrinsically? */
function scoreMove(state: GameState, m: Move): number {
  let s = m.finalProgress; // further along = better
  if (m.isFinishing) s += 1000;
  if (m.isCapture) s += 900;
  if (m.isEnteringBoard) s += 500;
  if (m.isEnteringHome) s += 80;
  return s;
}

/**
 * Medium only: penalty for landing where an opponent could capture next turn.
 * Checks if any opponent token is within 1–6 cells behind the destination.
 */
function exposurePenalty(state: GameState, m: Move): number {
  const dest = m.path[m.path.length - 1];
  if (!dest || dest.kind !== 'track') return 0;
  if (SAFE_TRACK_CELLS.has(dest.cell)) return 0; // safe cell — no penalty

  const myColor = state.tokens[m.tokenId]?.color;
  const threatened = Object.values(state.tokens).some((t) => {
    if (t.color === myColor) return false;
    if (t.progress < 0 || t.progress > 50) return false; // yard/home/finished
    const opponentCell = (ENTRY_OFFSET[t.color] + t.progress) % 52;
    const behind = (dest.cell - opponentCell + 52) % 52;
    return behind >= 1 && behind <= 6; // within dice range
  });

  return threatened ? 300 : 0;
}

/**
 * Choose the best move for a bot.
 * @returns the chosen Move, or null if moves is empty.
 */
export function chooseBotMove(
  state: GameState,
  moves: Move[],
  difficulty: BotDifficulty,
  rng: () => number = Math.random,
): Move | null {
  if (moves.length === 0) return null;

  const scored = moves.map((m) => ({
    m,
    s: scoreMove(state, m) - (difficulty === 'medium' ? exposurePenalty(state, m) : 0),
  }));

  if (difficulty === 'medium') {
    // Greedy: always pick the highest-scored move
    scored.sort((a, b) => b.s - a.s);
    return scored[0].m;
  }

  // Easy: weighted-random — biased toward good moves but not always optimal
  const min = Math.min(...scored.map((x) => x.s));
  const weights = scored.map((x) => x.s - min + 1); // all weights ≥ 1
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < scored.length; i++) {
    r -= weights[i];
    if (r <= 0) return scored[i].m;
  }
  return scored[scored.length - 1].m;
}
