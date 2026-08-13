/**
 * Phase 5C benchmark — seeded placement ladder for offline tuning (5C-3).
 *
 * Headless: drives `applyAction` directly via vite-node. No browser, no R3F,
 * OUTSIDE the vitest CI suite (the suite is already ~18s; this is a manual /
 * overnight tool per PHASE-5C §8.2).
 *
 * Run:  npx vite-node tools/bot-benchmark.ts -- --seed 42
 *   flags: --seed <n>        (default 42)
 *          --games <n>       non-Pro pairings (default 200)
 *          --games-pro <n>   Pro pairings     (default 25, budget-capped)
 *          --out <path>      report path (default docs/reports/5C-baseline.md)
 *
 * Placement metric (PHASE-5C §8.1, adapted): v1 ends at the first winner
 * (win.ts:34), so 1st = winner; 2nd–4th ranked by finished-token count then
 * colorETF (closer to finishing = higher). "A placement-beats B" = rank(A)<rank(B).
 * Each game: seat0=A, seat1=B, seat2/3 = Easy fillers.
 *
 * Also reports mean turns-to-finish per pairing — F-1's stall signature (a tier
 * whose games run long is failing to close; pre-tuning Hard-greedy hit ~3000).
 */

import { applyAction, createInitialState, colorsForPlayerCount } from '../src/oracle/engine';
import { chooseBotMove } from '../src/oracle/ai/policy';
import { soloRules } from '../src/oracle/config/rulesPreset';
import { colorETF } from '../src/oracle/ai/features';
import { FINISH } from '../src/oracle/board/track';
import type { Color } from '../src/oracle/board/track';
import type { Difficulty } from '../src/oracle/ai/types';
import type { GameState } from '../src/oracle/types';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

function seededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

const COLORS: Color[] = ['red', 'green', 'yellow', 'blue'];
const CAP = 4000;

function finishedCount(state: GameState, color: Color): number {
  let n = 0;
  for (const t of Object.values(state.tokens)) if (t.color === color && t.progress === FINISH) n++;
  return n;
}

/** Placement proxy: [winner, ...others by finishedCount desc then colorETF asc]. */
function placementOrder(state: GameState): Color[] {
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

interface GameResult {
  ranks: Record<Color, number>;
  turns: number;
  terminated: boolean;
}

/** Play one 4-seat game (seat0=A, seat1=B, seat2/3 Easy fillers). Exported so the
 *  tuning harness (tools/tune-bot.ts) reuses the exact same loop. */
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

interface PairingResult {
  label: string;
  games: number;
  aBeatsB: number;
  meanRankA: number;
  meanRankB: number;
  meanTurns: number;
  terminated: number;
}

function runPairing(a: Difficulty, b: Difficulty, label: string, games: number, baseSeed: number): PairingResult {
  let aBeatsB = 0;
  let sumRankA = 0;
  let sumRankB = 0;
  let sumTurns = 0;
  let terminated = 0;
  for (let i = 0; i < games; i++) {
    const { ranks, turns, terminated: term } = playGame(a, b, baseSeed + i);
    if (ranks.red < ranks.green) aBeatsB++;
    sumRankA += ranks.red;
    sumRankB += ranks.green;
    sumTurns += turns;
    if (term) terminated++;
  }
  return {
    label,
    games,
    aBeatsB,
    meanRankA: +(sumRankA / games).toFixed(2),
    meanRankB: +(sumRankB / games).toFixed(2),
    meanTurns: Math.round(sumTurns / games),
    terminated,
  };
}

const pct = (n: number, d: number): string => `${((n / d) * 100).toFixed(0)}%`;

function parseArgs(argv: string[]) {
  const get = (name: string, dflt: string): string => {
    const i = argv.indexOf(name);
    return i >= 0 ? (argv[i + 1] ?? dflt) : dflt;
  };
  return {
    seed: parseInt(get('--seed', '42'), 10),
    games: parseInt(get('--games', '200'), 10),
    gamesPro: parseInt(get('--games-pro', '25'), 10),
    out: get('--out', 'docs/reports/5C-baseline.md'),
  };
}

function main() {
  const { seed, games, gamesPro, out } = parseArgs(process.argv.slice(2));
  const pairings: { a: Difficulty; b: Difficulty; n: number }[] = [
    { a: 'medium', b: 'easy', n: games },
    { a: 'hard', b: 'easy', n: games },
    { a: 'hard', b: 'medium', n: games },
    { a: 'pro', b: 'medium', n: gamesPro },
    { a: 'pro', b: 'hard', n: gamesPro },
  ];

  const results: PairingResult[] = [];
  for (const { a, b, n } of pairings) {
    const label = `${a}:${b}`;
    const t0 = Date.now();
    const r = runPairing(a, b, label, n, seed);
    console.log(
      `[bench] ${label} (${n}g): A beats B ${r.aBeatsB}/${n} = ${pct(r.aBeatsB, n)} | mean rank A=${r.meanRankA} B=${r.meanRankB} | mean turns ${r.meanTurns} | term ${pct(r.terminated, n)} | ${Date.now() - t0}ms`,
    );
    results.push(r);
  }

  const date = new Date().toISOString().slice(0, 10);
  const md = [
    `# 5C Baseline — Pre-Tuning Placement Ladder`,
    ``,
    `> Generated ${date}, seed ${seed}, games: non-Pro ${games}, Pro ${gamesPro}.`,
    `> Weights: pre-tuning defaults (\`EVAL_WEIGHTS\`). Hard = v1 \`scoreMove\` (F-1).`,
    `> **Placement proxy:** v1 ends at the first winner (\`win.ts:34\`), so 1st = winner;`,
    `> 2nd–4th ranked by finished-token count then colorETF. "A beats B" = rank(A) < rank(B).`,
    `> Each game: seat0=A, seat1=B, seat2/3 = Easy fillers.`,
    ``,
    `## Placement (A beats B)`,
    ``,
    `| Pairing | Games | A beats B | mean rank A | mean rank B | terminated |`,
    `|---|---:|---:|---:|---:|---:|`,
    ...results.map((r) =>
      `| ${r.label} | ${r.games} | ${pct(r.aBeatsB, r.games)} | ${r.meanRankA} | ${r.meanRankB} | ${pct(r.terminated, r.games)} |`,
    ),
    ``,
    `## Mean turns-to-finish per pairing (F-1 stall early-warning; lower = faster)`,
    ``,
    `| Pairing | mean turns |`,
    `|---|---:|`,
    ...results.map((r) => `| ${r.label} | ${r.meanTurns} |`),
    ``,
    `## Target gates (5C-4, post-tuning)`,
    ``,
    `- Placement ordering: Pro > Hard > Medium > Easy`,
    `- Hard placement-beats Medium ≥ 55% (F-1: Hard stays on scoreMove — its only lever`,
    `  is the shared ETF-anchored scale constants, not EVAL_WEIGHTS; demote to ≥52% +`,
    `  backlog if unreachable, never silent)`,
    `- Pro placement-beats Medium ≥ 65% at ≥ 30 games (sample-size rule: n=10 is noise)`,
    `- All \`it.skip\` P-tests (P-2/P-3/P-4/P-5/P-8) unskipped and green (F-2)`,
    `- No tier stalls: mean turns-to-finish stays in normal range (no F-1 recurrence)`,
  ].join('\n');

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, md);
  console.log(`\n[bench] report written to ${out}`);
}

// Only run when invoked directly — NOT when imported by tools/tune-bot.ts.
if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
