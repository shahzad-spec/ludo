/**
 * Shared headless game runner for the 5C tools (PHASE-5C §8). Pure game-loop
 * primitives used by BOTH the benchmark (tools/bot-benchmark.ts) and the tuner
 * (tools/tune-bot.ts). Has NO main() — importing it never starts a run, which is
 * what lets the two CLI tools coexist without one triggering the other.
 */

import { applyAction, createInitialState, colorsForPlayerCount } from '../src/oracle/engine';
import { chooseBotMove } from '../src/oracle/ai/policy';
import { soloRules } from '../src/oracle/config/rulesPreset';
import { colorETF } from '../src/oracle/ai/features';
import { FINISH } from '../src/oracle/board/track';
import type { Color } from '../src/oracle/board/track';
import type { Difficulty } from '../src/oracle/ai/types';
import type { GameState } from '../src/oracle/types';

export const COLORS: Color[] = ['red', 'green', 'yellow', 'blue'];
export const CAP = 4000;

export function seededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

export function finishedCount(state: GameState, color: Color): number {
  let n = 0;
  for (const t of Object.values(state.tokens)) if (t.color === color && t.progress === FINISH) n++;
  return n;
}

/** Placement proxy: [winner, ...others by finishedCount desc then colorETF asc]. */
export function placementOrder(state: GameState): Color[] {
  const winner = state.winners[0];
  const others = COLORS.filter((c) => c !== winner);
  others.sort((a, b) => {
    const fa = finishedCount(state, a);
    const fb = finishedCount(state, b);
    if (fa !== fb) return fb - fa; // more finished → higher placement
    return colorETF(state, a) - colorETF(state, b); // closer to finishing → higher
  });
  return [winner, ...others];
}

export interface GameResult {
  ranks: Record<Color, number>;
  turns: number;
  terminated: boolean;
}

/** Play one 4-seat game (seat0=A, seat1=B, seat2/3 Easy fillers). */
export function playGame(a: Difficulty, b: Difficulty, seed: number): GameResult {
  const colors = colorsForPlayerCount(4); // [red, green, yellow, blue]
  const rules = { ...soloRules(), bots: colors };
  let state = createInitialState(colors, rules);
  const rng = seededRng(seed);
  const diffFor = (c: Color): Difficulty => (c === 'red' ? a : c === 'green' ? b : 'easy');

  let turn = 0;
  for (turn = 0; turn < CAP; turn++) {
    if (state.phase === 'GAME_OVER') break;
    if (state.phase === 'IDLE') {
      state = applyAction(state, { type: 'REQUEST_ROLL' }, rng).state;
    } else if (state.phase === 'ROLLING') {
      state = applyAction(state, { type: 'RESOLVE_ROLL', value: state.dice.value ?? 1 }).state;
    } else if (state.phase === 'SELECTING_TOKEN') {
      const move = chooseBotMove(state, state.validMoves, diffFor(state.currentPlayer), rng);
      if (move) state = applyAction(state, { type: 'REQUEST_MOVE', tokenId: move.tokenIds[0] }).state;
    } else if (state.phase === 'ANIMATING_MOVE') {
      state = applyAction(state, { type: 'RESOLVE_MOVE' }).state;
    }
  }
  const order = placementOrder(state);
  const ranks = {} as Record<Color, number>;
  order.forEach((c, i) => { ranks[c] = i + 1; });
  return { ranks, turns: turn, terminated: state.phase === 'GAME_OVER' };
}
