/**
 * Expectimax search engine — the Pro bot's brain (PLAN-PHASE-5B §4 + 5C budget).
 *
 * Simulates 3-8 turns into the future using the REAL applyAction engine
 * (zero desync guarantee). Opponents are modeled as an injected policy (Medium by
 * default) to keep branching low and to break the circular dependency with
 * policy.ts.
 *
 * Amendments applied:
 *   A: Phase-aware node typing (IDLE → chance, SELECTING_TOKEN → max/policy)
 *   B: Null-safe simulate (turn-pass on NO_LEGAL_MOVE)
 *   D: fixedDepth option for deterministic tests
 *
 * 5C budget-honoring: a `shouldStop` deadline is checked at every node so Pro's
 * search respects its wall-clock budget even with the (much richer) 5C weighted
 * evaluation. The deadline is only active in budget mode; fixedDepth tests pass
 * a deadline of Infinity and are bit-for-bit unchanged.
 *
 * Architecture:
 *   - simulate() uses applyAction (REQUEST_MOVE + RESOLVE_MOVE)
 *   - simulateRoll() uses applyAction with pinned RNG: () => (roll-1)/6
 *   - expectimax branches on state.phase, not state.currentPlayer
 *   - opponentPolicy is injected (no circular import with policy.ts)
 */

import type { GameState, Move } from '../types';
import type { Color } from '../board/track';
import type { SearchOptions } from './types';
import { applyAction } from '../engine';
import { evaluate } from './evaluate';

/** Opponent model — injected to break circular dependency with policy.ts. */
export type OpponentPolicy = (state: GameState, moves: Move[]) => Move | null;

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

/**
 * Expectimax recursive evaluation (amendment A: phase-aware).
 *
 * Node types:
 *   state.phase === 'IDLE'                    → Chance node (enumerate rolls 1-6)
 *   state.phase === 'SELECTING_TOKEN' + me    → Max node
 *   state.phase === 'SELECTING_TOKEN' + opp   → Policy node
 *   terminal (GAME_OVER or depth 0)           → Leaf (evaluate)
 *
 * `shouldStop` (5C): once the wall-clock budget is exhausted, further nodes are
 * evaluated as leaves instead of expanded. This keeps Pro inside its budget with
 * the richer 5C eval. Inactive in fixedDepth mode (deadline = Infinity).
 */
function expectimax(
  state: GameState,
  depth: number,
  me: Color,
  opponentPolicy: OpponentPolicy,
  shouldStop: () => boolean,
): number {
  // Terminal: depth exhausted, game over, or budget exhausted (treat as leaf).
  if (depth <= 0 || state.phase === 'GAME_OVER' || shouldStop()) {
    return evaluate(state, me);
  }

  // Amendment A: branch on PHASE, not player
  if (state.phase === 'IDLE') {
    // Chance node: enumerate all 6 dice rolls
    let sum = 0;
    for (let roll = 1; roll <= 6; roll++) {
      const rolled = simulateRoll(state, roll);

      if (rolled.phase === 'SELECTING_TOKEN') {
        if (rolled.currentPlayer === me) {
          // Max node: my turn — pick best of my legal moves
          const myMoves = rolled.validMoves;
          if (myMoves.length > 0) {
            let best = -Infinity;
            for (const m of myMoves) {
              const val = expectimax(simulate(rolled, m), depth - 1, me, opponentPolicy, shouldStop);
              if (val > best) best = val;
            }
            sum += best;
          } else {
            // Shouldn't happen (SELECTING_TOKEN implies moves exist), but safe
            sum += expectimax(rolled, depth - 1, me, opponentPolicy, shouldStop);
          }
        } else {
          // Policy node: opponent plays their modeled policy
          const oppMove = opponentPolicy(rolled, rolled.validMoves);
          sum += expectimax(simulate(rolled, oppMove), depth - 1, me, opponentPolicy, shouldStop);
        }
      } else {
        // NO_LEGAL_MOVE → turn passed automatically by engine.
        // State is now IDLE for the next player — continue recursing.
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

  // Fallback: just evaluate
  return evaluate(state, me);
}

/**
 * Search for the best move using iterative-deepening expectimax.
 *
 * @param state Current game state (must be SELECTING_TOKEN phase)
 * @param moves Legal moves for the current player
 * @param me The bot's color
 * @param opts SearchOptions (budgetMs for runtime, fixedDepth for tests)
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

  let best = moves[0];
  const t0 = useBudget ? performance.now() : 0;
  // 5C: deadline checked at every node so the search honors its budget even with
  // the richer evaluation. Infinity in fixedDepth mode → never stops early.
  const deadline = useBudget ? t0 + budgetMs : Infinity;
  const shouldStop = () => performance.now() > deadline;

  for (let depth = 1; depth <= maxDepth; depth++) {
    let bestScore = -Infinity;
    for (const m of moves) {
      const score = expectimax(simulate(state, m), depth - 1, me, opponentPolicy, shouldStop);
      if (score > bestScore) {
        bestScore = score;
        best = m;
      }
    }
    // Budget check (runtime only — tests use fixedDepth)
    if (useBudget && performance.now() - t0 > budgetMs) break;
  }

  return best;
}
