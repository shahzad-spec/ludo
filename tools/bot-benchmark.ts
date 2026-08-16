/**
 * Phase 5C benchmark — seeded placement ladder for offline tuning (5C-3).
 *
 * Headless: drives the game loop in tools/game-runner.ts via vite-node. No browser,
 * no R3F, OUTSIDE the vitest CI suite (the suite is already ~18s; this is a manual /
 * overnight tool per PHASE-5C §8.2).
 *
 * Run:  npm run bench    # or: npx vite-node tools/bot-benchmark.ts
 *   flags: --seed <n>        (default 42)
 *          --games <n>       non-Pro pairings (default 200)
 *          --games-pro <n>   Pro pairings     (default 30)
 *          --out <path>      report path (default docs/reports/5C-baseline.md)
 *
 * Placement metric (PHASE-5C §8.1, adapted): v1 ends at the first winner
 * (win.ts:34), so 1st = winner; 2nd–4th ranked by finished-token count then
 * colorETF. "A placement-beats B" = rank(A) < rank(B). Each game: seat0=A,
 * seat1=B, seat2/3 = Easy fillers. Also reports mean turns-to-finish per pairing
 * (F-1 stall early-warning).
 */

import { playGame } from './game-runner';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Difficulty } from '../src/oracle/ai/types';

interface PairingResult {
  label: string;
  games: number;
  aBeatsB: number;
  meanRankA: number;
  meanRankB: number;
  meanTurns: number;
  terminated: number;
}

function runPairing(a: Difficulty, b: Difficulty, label: string, games: number, baseSeed: number, dice: 1 | 2 | 3 | 4 = 1): PairingResult {
  let aBeatsB = 0;
  let sumRankA = 0;
  let sumRankB = 0;
  let sumTurns = 0;
  let terminated = 0;
  for (let i = 0; i < games; i++) {
    const { ranks, turns, terminated: term } = playGame(a, b, baseSeed + i, dice);
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
    gamesPro: parseInt(get('--games-pro', '30'), 10),
    dice: parseInt(get('--dice', '1'), 10) as 1 | 2 | 3 | 4,
    out: get('--out', 'docs/reports/5C-baseline.md'),
  };
}

function main() {
  const { seed, games, gamesPro, dice, out } = parseArgs(process.argv.slice(2));
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
    const r = runPairing(a, b, label, n, seed, dice);
    console.log(
      `[bench] ${label} (${n}g): A beats B ${r.aBeatsB}/${n} = ${pct(r.aBeatsB, n)} | mean rank A=${r.meanRankA} B=${r.meanRankB} | mean turns ${r.meanTurns} | term ${pct(r.terminated, n)} | ${Date.now() - t0}ms`,
    );
    results.push(r);
  }

  const date = new Date().toISOString().slice(0, 10);
  const isMultiDice = dice > 1;
  const md = [
    isMultiDice
      ? `# 5D Bench — dice ${dice} (multi-dice regression, PHASE-5D 5D-3c/5D-6)`
      : `# 5C Baseline — Placement Ladder`,
    ``,
    `> Generated ${date}, seed ${seed}, dice ${dice}, games: non-Pro ${games}, Pro ${gamesPro}.`,
    `> Weights: committed \`EVAL_WEIGHTS\` + \`SCALE_PARAMS\` (see src/oracle/ai/evaluate.ts). Hard = v1 \`scoreMove\` (F-1).`,
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
    ...(isMultiDice
      ? [
          `## Gates (5D — regression-only, F-3: no ladder-adoption claims)`,
          ``,
          `- Stall-guard: 100% termination on every pairing (no F-1 recurrence)`,
          `- Speed: mean turns at dice ${dice} < the dice-1 baseline (~1800 on this harness)`,
          `- Placement rates are recorded, NOT interpreted (n too small for claims)`,
        ]
      : [
          `## Target gates (5C-4)`,
          ``,
          `- Placement ordering: Pro > Hard > Medium > Easy`,
          `- Hard placement-beats Medium ≥ 55% (F-1: Hard stays on scoreMove — its only lever`,
          `  is the shared ETF-anchored scale constants, not EVAL_WEIGHTS; demote to ≥52% +`,
          `  backlog if unreachable, never silent)`,
          `- Pro placement-beats Medium ≥ 65% at ≥ 30 games (sample-size rule: n=10 is noise)`,
          `- All \`it.skip\` P-tests (P-2/P-3/P-4/P-5/P-8) unskipped and green (F-2)`,
          `- No tier stalls: mean turns-to-finish stays in normal range (no F-1 recurrence)`,
        ]),
  ].join('\n');

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, md);
  console.log(`\n[bench] report written to ${out}`);
}

main();
