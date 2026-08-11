/**
 * Bot policy — chooseBotMove for easy/medium/hard/pro (PLAN-PHASE-5B §4.4).
 *
 * Migrated from the original ai.ts. Easy + Medium logic unchanged.
 * Hard tier added (greedy over full eval, no search).
 * Pro tier delegates to search.ts (added in 5B-2).
 */

import type { GameState, Move } from '../types';
import { ENTRY_OFFSET } from '../board/track';
import { SAFE_TRACK_CELLS } from '../board/safeCells';
import type { Difficulty } from './types';
import { riskScale, captureTempoScale } from './evaluate';
import { exposurePenalty } from './threats';

// Re-export BotDifficulty for backward compatibility
export type { Difficulty as BotDifficulty } from './types';

/** Base heuristic score (used by easy + medium). */
function scoreMove(state: GameState, m: Move): number {
  let s = m.finalProgress;
  if (m.isFinishing) s += 1000;
  if (m.isCapture) s += 900;
  if (m.isEnteringBoard) s += 500;
  if (m.isEnteringHome) s += 80;
  return s;
}

/** Medium exposure penalty. */
function exposurePenaltyMedium(state: GameState, m: Move): number {
  const dest = m.path[m.path.length - 1];
  if (!dest || dest.kind !== 'track') return 0;
  if (SAFE_TRACK_CELLS.has(dest.cell)) return 0;

  const myColor = state.tokens[m.tokenId]?.color;
  if (!myColor) return 0;
  const threatened = Object.values(state.tokens).some((t) => {
    if (t.color === myColor) return false;
    if (t.progress < 0 || t.progress > 50) return false;
    const opponentCell = (ENTRY_OFFSET[t.color] + t.progress) % 52;
    const behind = (dest.cell - opponentCell + 52) % 52;
    return behind >= 1 && behind <= 6;
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
  difficulty: Difficulty,
  rng: () => number = Math.random,
): Move | null {
  if (moves.length === 0) return null;

  // Hard: greedy over full evaluation (amendment E: riskScale + captureTempoScale)
  if (difficulty === 'hard') {
    const me = state.tokens[moves[0].tokenIds[0]]?.color;
    if (!me) return moves[0];
    const rScale = riskScale(state, me);
    const cScale = captureTempoScale(state, me);

    let best = moves[0];
    let bestScore = -Infinity;
    for (const m of moves) {
      // Simulate the move to get the resulting state
      // For Hard, we use the evaluation of the move's outcome
      let score = scoreMove(state, m);

      // Apply exposure penalty with riskScale
      const dest = m.path[m.path.length - 1];
      if (dest) {
        score -= exposurePenalty(state, dest, me, rScale, m.finalProgress);
      }

      // Capture tempo with captureTempoScale
      if (m.isCapture) score += 20 * cScale;

      if (score > bestScore) {
        bestScore = score;
        best = m;
      }
    }
    return best;
  }

  // Pro: delegate to search (added in 5B-2)
  // For now, fall through to medium behavior until search.ts is ready
  if (difficulty === 'pro') {
    // Temporary: use hard logic until search.ts is implemented
    return chooseBotMove(state, moves, 'hard', rng);
  }

  // Easy + Medium: existing logic
  const scored = moves.map((m) => ({
    m,
    s: scoreMove(state, m) - (difficulty === 'medium' ? exposurePenaltyMedium(state, m) : 0),
  }));

  if (difficulty === 'medium') {
    scored.sort((a, b) => b.s - a.s);
    return scored[0].m;
  }

  // Easy: weighted-random
  const min = Math.min(...scored.map((x) => x.s));
  const weights = scored.map((x) => x.s - min + 1);
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < scored.length; i++) {
    r -= weights[i];
    if (r <= 0) return scored[i].m;
  }
  return scored[scored.length - 1].m;
}
