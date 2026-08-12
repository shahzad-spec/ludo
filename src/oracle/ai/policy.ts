/**
 * Bot policy — chooseBotMove for easy/medium/hard/pro (PLAN-PHASE-5B §4.4 +
 * PHASE-5C §4 paranoid model).
 *
 * Easy + Medium logic unchanged. Hard = greedy over scoreMove + exposure (a full
 * evaluate() inheritance is wired in 5C-2d). Pro = expectimax search with a
 * PARANOID opponent model (5C-2a) instead of v1's tame Medium assumption.
 */

import type { GameState, Move } from '../types';
import { ENTRY_OFFSET } from '../board/track';
import type { Color } from '../board/track';
import { SAFE_TRACK_CELLS } from '../board/safeCells';
import type { Difficulty } from './types';
import { evaluate, riskScale, captureTempoScale } from './evaluate';
import { exposurePenalty } from './threats';
import { searchBestMove, simulateMove, type OpponentPolicy } from './search';

// Re-export BotDifficulty for backward compatibility
export type { Difficulty as BotDifficulty } from './types';

/** Base heuristic score (used by easy + medium). */
function scoreMove(m: Move): number {
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

  const myColor = state.tokens[m.tokenIds[0]]?.color;
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
 * Paranoid opponent model (PHASE-5C §4). At opponent nodes the opponent plays the
 * move that minimizes MY evaluation one ply later — a deterministic 1-ply
 * best-response against me (ties broken by move order, so tests pin exact picks).
 * Replaces Medium as Pro's default opponent model: this is what makes the search
 * fear captures, refuse bait, and respect traps.
 */
export function paranoidPolicy(
  me: Color,
  simulate: (state: GameState, move: Move | null) => GameState,
): OpponentPolicy {
  return (state, moves) => {
    if (moves.length === 0) return null;
    let worst = moves[0];
    let worstScore = Infinity;
    for (const m of moves) {
      const score = evaluate(simulate(state, m), me);
      if (score < worstScore) {
        worstScore = score;
        worst = m;
      }
    }
    return worst;
  };
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
      let score = scoreMove(m);

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

  // Pro: expectimax search with a PARANOID opponent model (PHASE-5C §4). The
  // opponent is assumed to play the move worst for me — so Pro fears captures,
  // refuses bait, and respects traps (v1 modeled opponents as Medium, which is
  // why it never defended or punished). 5C-2d will add per-opponent blending.
  if (difficulty === 'pro') {
    const me = state.tokens[moves[0].tokenIds[0]]?.color;
    if (!me) return moves[0];
    return searchBestMove(
      state, moves, me,
      { budgetMs: 80 },
      paranoidPolicy(me, simulateMove),
    );
  }

  // Easy + Medium: existing logic
  const scored = moves.map((m) => ({
    m,
    s: scoreMove(m) - (difficulty === 'medium' ? exposurePenaltyMedium(state, m) : 0),
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
