/**
 * Expectimax search engine — the Pro bot's brain (PLAN-PHASE-5B §4 + 5C §5).
 *
 * Simulates 3-8 turns into the future using the REAL applyAction engine
 * (zero desync guarantee). Opponents are modeled as an injected policy (paranoid
 * by default — see policy.ts) to keep branching low and to break the circular
 * dependency with policy.ts.
 *
 * Amendments applied:
 *   A: Phase-aware node typing (IDLE → chance, SELECTING_TOKEN → max/policy)
 *   B: Null-safe simulate (turn-pass on NO_LEGAL_MOVE)
 *   D: fixedDepth option for deterministic tests
 *
 * 5C §5 additions:
 *   - Transposition table (bounded, CLEARED per root search) — a transparent
 *     cache keyed by (token-progress signature, player, phase, depth).
 *   - Budget-honoring shouldStop checked at every node, so Pro respects its
 *     wall-clock budget with the richer 5C eval.
 *   - Completion-tracking: iterative deepening only ADOPTS a depth's result if
 *     that depth searched the full horizon without the budget firing — an
 *     interrupted depth (which mixes deep + leaf-fallback scores) is discarded.
 */

import type { GameState, Move } from '../types';
import type { Color } from '../board/track';
import type { SearchOptions } from './types';
import { applyAction } from '../engine';
import { evaluate } from './evaluate';

/** Opponent model — injected to break circular dependency with policy.ts. */
export type OpponentPolicy = (state: GameState, moves: Move[]) => Move | null;

const TT_MAX = 50_000;
// Module-scoped transposition cache (PHASE-5C §5.1). Cleared at every root
// search so there is zero cross-move staleness. Single-threaded => no races.
let tt = new Map<string, number>();
let ttHits = 0; // instrumentation, reset per root search
let ttEnabled = true; // toggled per search via opts.tt

/** Testing seam: read TT hit count + size (reset at each searchBestMove root). */
export function getTTStatsForTesting(): { hits: number; size: number } {
  return { hits: ttHits, size: tt.size };
}

/**
 * Simulate a move using the real engine (amendment B: null-safe).
 * Returns the state after REQUEST_MOVE + RESOLVE_MOVE.
 * If move is null (NO_LEGAL_MOVE), returns state unchanged.
 *
 * CRITICAL: The engine's REQUEST_MOVE handler picks a move from validMoves
 * by tokenId. When two moves share the same token (both move red-0), the
 * engine can't distinguish them. We solve this by filtering validMoves to
 * contain ONLY the chosen move before calling applyAction.
 */
function simulate(state: GameState, move: Move | null): GameState {
  if (move === null) return state;
  // Filter validMoves to just this specific move so pickMove finds the right one
  const filteredState: GameState = { ...state, validMoves: [move] };
  const r1 = applyAction(filteredState, { type: 'REQUEST_MOVE', tokenId: move.tokenIds[0] });
  const r2 = applyAction(r1.state, { type: 'RESOLVE_MOVE' });
  return r2.state;
}

/**
 * Public simulation entry — the same zero-desync engine replay used internally,
 * exported so the paranoid opponent model (policy.ts) can evaluate opponent
 * replies without re-implementing simulation.
 */
export function simulateMove(state: GameState, move: Move | null): GameState {
  return simulate(state, move);
}

/**
 * Simulate a dice roll using the real engine with pinned RNG.
 * () => (roll - 1) / 6 maps to Math.floor(r * 6) + 1 === roll.
 */
function simulateRoll(state: GameState, roll: number): GameState {
  const r1 = applyAction(state, { type: 'REQUEST_ROLL' }, () => (roll - 1) / 6);
  const r2 = applyAction(r1.state, { type: 'RESOLVE_ROLL', value: roll });
  return r2.state;
}

/** TT key: full token-progress signature + current player + phase + depth. */
function ttKey(state: GameState, depth: number): string {
  let sig = '';
  for (const tok of Object.values(state.tokens)) sig += `${tok.progress},`;
  return `${sig}${state.currentPlayer}|${state.phase}|${depth}`;
}

/**
 * Expectimax with a TT probe wrapper. Cached values are exact in fixedDepth
 * mode; in budget mode an interrupted depth's results are not adopted (see
 * searchBestMove's completion-tracking), so any approximate cached values from
 * the boundary depth are harmless.
 */
function expectimax(
  state: GameState,
  depth: number,
  me: Color,
  opponentPolicy: OpponentPolicy,
  shouldStop: () => boolean,
): number {
  if (depth <= 0 || state.phase === 'GAME_OVER' || shouldStop()) {
    return evaluate(state, me);
  }
  if (ttEnabled) {
    const key = ttKey(state, depth);
    const cached = tt.get(key);
    if (cached !== undefined) {
      ttHits++;
      return cached;
    }
    const val = expectimaxExpand(state, depth, me, opponentPolicy, shouldStop);
    if (tt.size < TT_MAX) tt.set(key, val);
    return val;
  }
  return expectimaxExpand(state, depth, me, opponentPolicy, shouldStop);
}

/** The phase-aware branching (amendment A) — no TT, called via expectimax(). */
function expectimaxExpand(
  state: GameState,
  depth: number,
  me: Color,
  opponentPolicy: OpponentPolicy,
  shouldStop: () => boolean,
): number {
  if (state.phase === 'IDLE') {
    // Chance node: enumerate all 6 dice rolls
    let sum = 0;
    for (let roll = 1; roll <= 6; roll++) {
      const rolled = simulateRoll(state, roll);

      if (rolled.phase === 'SELECTING_TOKEN') {
        if (rolled.currentPlayer === me) {
          const myMoves = rolled.validMoves;
          if (myMoves.length > 0) {
            let best = -Infinity;
            for (const m of myMoves) {
              const val = expectimax(simulate(rolled, m), depth - 1, me, opponentPolicy, shouldStop);
              if (val > best) best = val;
            }
            sum += best;
          } else {
            sum += expectimax(rolled, depth - 1, me, opponentPolicy, shouldStop);
          }
        } else {
          const oppMove = opponentPolicy(rolled, rolled.validMoves);
          sum += expectimax(simulate(rolled, oppMove), depth - 1, me, opponentPolicy, shouldStop);
        }
      } else {
        sum += expectimax(rolled, depth - 1, me, opponentPolicy, shouldStop);
      }
    }
    return sum / 6;
  }

  // SELECTING_TOKEN — my turn: max node
  if (state.currentPlayer === me && state.validMoves.length > 0) {
    let best = -Infinity;
    for (const m of state.validMoves) {
      const val = expectimax(simulate(state, m), depth - 1, me, opponentPolicy, shouldStop);
      if (val > best) best = val;
    }
    return best;
  }

  // SELECTING_TOKEN — opponent's turn: policy node
  if (state.currentPlayer !== me && state.validMoves.length > 0) {
    const oppMove = opponentPolicy(state, state.validMoves);
    return expectimax(simulate(state, oppMove), depth - 1, me, opponentPolicy, shouldStop);
  }

  return evaluate(state, me);
}

/**
 * Search for the best move using iterative-deepening expectimax.
 *
 * @param state Current game state (must be SELECTING_TOKEN phase)
 * @param moves Legal moves for the current player
 * @param me The bot's color
 * @param opts SearchOptions (budgetMs for runtime, fixedDepth for tests, tt)
 * @param opponentPolicy Injected opponent model (breaks circular dependency)
 * @returns The best Move, or null if moves is empty
 */
export function searchBestMove(
  state: GameState,
  moves: Move[],
  me: Color,
  opts: SearchOptions = {},
  opponentPolicy: OpponentPolicy = () => null,
): Move | null {
  if (moves.length === 0) return null;
  if (moves.length === 1) return moves[0]; // no choice — skip search

  const budgetMs = opts.budgetMs ?? 80;
  const maxDepth = opts.fixedDepth ?? 8;
  const useBudget = opts.fixedDepth === undefined;

  // Fresh TT per root search (no cross-move staleness); reset instrumentation.
  tt = new Map();
  ttHits = 0;
  ttEnabled = opts.tt !== false;

  let best = moves[0];
  const t0 = useBudget ? performance.now() : 0;
  const deadline = useBudget ? t0 + budgetMs : Infinity;

  for (let depth = 1; depth <= maxDepth; depth++) {
    // 5C completion-tracking: only adopt a depth's result if it searched the
    // full horizon without the budget firing. An interrupted depth mixes deep
    // and leaf-fallback scores and is discarded; the last completed depth wins.
    let interrupted = false;
    const shouldStop = (): boolean => {
      if (performance.now() > deadline) {
        interrupted = true;
        return true;
      }
      return false;
    };

    let bestScore = -Infinity;
    let bestThisDepth = moves[0];
    for (const m of moves) {
      const score = expectimax(simulate(state, m), depth - 1, me, opponentPolicy, shouldStop);
      if (score > bestScore) {
        bestScore = score;
        bestThisDepth = m;
      }
    }
    if (!interrupted) best = bestThisDepth;
    if (useBudget && performance.now() - t0 > budgetMs) break;
  }

  return best;
}
