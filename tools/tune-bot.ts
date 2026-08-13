/**
 * Phase 5C-4b tuning harness — coordinate-ascent weight + scale optimizer.
 *
 * Headless (vite-node), OUTSIDE vitest CI. Designed to run OVERNIGHT.
 *   npx vite-node tools/tune-bot.ts                 # full overnight run
 *   npx vite-node tools/tune-bot.ts -- --smoke      # tiny counts, end-to-end check
 *
 * Anti-noise rules (per 5C-4b design constraints):
 *  - Deterministic: identical seeds across all candidates; a holdout seed set
 *    validates the champion — committed (next session) only if the holdout
 *    confirms it still beats the incumbent on UNSEEN seeds.
 *  - Fitness (Phase A) = pro:medium + pro:hard placement-beat rates at PRO_GAMES
 *    each. hard:medium/easy are EVAL_WEIGHTS-independent -> measured once per
 *    pass for the report, NOT in per-candidate fitness.
 *  - Phase B (after weights converge): sweep SCALE_PARAMS.gapTurns/amplitude
 *    (Hard's lever); fitness adds hard:medium.
 *  - Acceptance: a candidate becomes champion ONLY on improvement >= MARGIN
 *    placement points AND passing the F-1 guardrail. Ties keep the incumbent;
 *    regressions never accepted.
 *  - F-1 guardrail: termination < 100% or mean turns > MAX_TURNS -> auto-reject
 *    (stall detection is part of fitness).
 *  - Prior ordering: `mass` multipliers tried first each pass.
 *
 * Champion weights/scale are PRINTED + written to docs/reports/5C-tuning-champion.md;
 * the harness does NOT mutate source. Commit the champion manually next session.
 */

import { EVAL_WEIGHTS, SCALE_PARAMS, type EvalWeights } from '../src/oracle/ai/evaluate';
import { playGame } from './bot-benchmark';
import type { Difficulty } from '../src/oracle/ai/types';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const COLOR_KEYS = ['red', 'green', 'yellow', 'blue'] as const;

// Defaults (overnight); --smoke shrinks these.
let PRO_GAMES = 30;
const MARGIN = 8; // placement points (>= half the ~±18 CI at n=30)
const MAX_TURNS = 2500; // F-1 stall guardrail (phase-steps)
const MAX_PASSES = 3;
let WEIGHT_KEYS: (keyof EvalWeights)[] = ['mass', 'raceLead', 'shotPressure', 'exposure', 'spread', 'homeLoaded', 'finishGap'];
let MULTIPLIERS = [0.5, 0.75, 1.5, 2.0];
let DO_PHASE_B = true;
const GAP_VALUES = [10, 15, 20];
const AMP_VALUES = [0.4, 0.5, 0.6];
const BASE_SEED = 1000;
const HOLDOUT_SEED = 9000;

const round3 = (x: number): number => Math.round(x * 1000) / 1000;

function applyWeights(w: EvalWeights): void {
  // Mutate the module-level EVAL_WEIGHTS so evaluate()'s default param sees it
  // (searchBestMake -> expectimax -> evaluate(state, me) uses EVAL_WEIGHTS).
  (Object.keys(w) as (keyof EvalWeights)[]).forEach((k) => { EVAL_WEIGHTS[k] = w[k]; });
}
function applyScale(s: { gapTurns: number; amplitude: number }): void {
  SCALE_PARAMS.gapTurns = s.gapTurns;
  SCALE_PARAMS.amplitude = s.amplitude;
}

interface Fit {
  points: number; // sum of placement-beat rates
  terminated: boolean; // every game terminated
  meanTurns: number;
  detail: string; // human-readable breakdown
}

function pairingRate(a: Difficulty, b: Difficulty, baseSeed: number, n: number) {
  let beats = 0;
  let terminated = true;
  let sumTurns = 0;
  for (let i = 0; i < n; i++) {
    const g = playGame(a, b, baseSeed + i);
    if (g.ranks[COLOR_KEYS[0]] < g.ranks[COLOR_KEYS[1]]) beats++;
    if (!g.terminated) terminated = false;
    sumTurns += g.turns;
  }
  return { ratePct: (beats / n) * 100, terminated, sumTurns };
}

/** Phase A: pro:medium + pro:hard. Phase B: + hard:medium. */
function fitness(baseSeed: number, phase: 'A' | 'B'): Fit {
  const pm = pairingRate('pro', 'medium', baseSeed, PRO_GAMES);
  const ph = pairingRate('pro', 'hard', baseSeed, PRO_GAMES);
  let points = pm.ratePct + ph.ratePct;
  let terminated = pm.terminated && ph.terminated;
  let sumTurns = pm.sumTurns + ph.sumTurns;
  let games = PRO_GAMES * 2;
  let detail = `pro:medium ${pm.ratePct.toFixed(0)}% / pro:hard ${ph.ratePct.toFixed(0)}%`;
  if (phase === 'B') {
    const hm = pairingRate('hard', 'medium', baseSeed, PRO_GAMES);
    points += hm.ratePct;
    terminated = terminated && hm.terminated;
    sumTurns += hm.sumTurns;
    games += PRO_GAMES;
    detail += ` / hard:medium ${hm.ratePct.toFixed(0)}%`;
  }
  return { points, terminated, meanTurns: Math.round(sumTurns / games), detail };
}

const passesGuard = (f: Fit): boolean => f.terminated && f.meanTurns <= MAX_TURNS;

function runPhaseA(incumbent: EvalWeights, incumbentScale: { gapTurns: number; amplitude: number }) {
  applyWeights(incumbent);
  applyScale(incumbentScale);
  let champWeights: EvalWeights = { ...incumbent };
  let champFit = fitness(BASE_SEED, 'A');
  console.log(`[tune] incumbent: points=${champFit.points.toFixed(1)} turns=${champFit.meanTurns} (${champFit.detail})`);

  // mass first, then the rest
  const keys = WEIGHT_KEYS.slice().sort((a, b) => (a === 'mass' ? 0 : 1) - (b === 'mass' ? 0 : 1));

  for (let pass = 1; pass <= MAX_PASSES; pass++) {
    let improved = false;
    for (const key of keys) {
      for (const mult of MULTIPLIERS) {
        const cand: EvalWeights = { ...champWeights, [key]: round3(champWeights[key] * mult) };
        applyScale(incumbentScale); // Phase A: scale held at incumbent
        applyWeights(cand);
        const cf = fitness(BASE_SEED, 'A');
        const accept = passesGuard(cf) && cf.points >= champFit.points + MARGIN;
        console.log(
          `[tune] A pass ${pass} ${key}×${mult}: points=${cf.points.toFixed(1)} turns=${cf.meanTurns} term=${cf.terminated} ${accept ? 'ACCEPT' : 'reject'} (${cf.detail})`,
        );
        if (accept) {
          champWeights = cand;
          champFit = cf;
          improved = true;
          break; // coordinate ascent: move to next key after an acceptance
        }
      }
    }
    // once-per-pass hard:medium (EVAL_WEIGHTS-independent, informational)
    applyWeights(champWeights);
    const hm = pairingRate('hard', 'medium', BASE_SEED, PRO_GAMES);
    writePassReport(`A-${pass}`, champWeights, champFit, `hard:medium ${hm.ratePct.toFixed(0)}%`);
    if (!improved) {
      console.log(`[tune] A pass ${pass}: no candidate met the +${MARGIN} margin — stopping Phase A`);
      break;
    }
  }
  return { champWeights, champFit };
}

function runPhaseB(champWeights: EvalWeights, incumbentScale: { gapTurns: number; amplitude: number }) {
  let champScale = { ...incumbentScale };
  applyWeights(champWeights);
  applyScale(champScale);
  let champFit = fitness(BASE_SEED, 'B');
  console.log(`[tune] Phase B incumbent: points=${champFit.points.toFixed(1)} (${champFit.detail}) scale=${JSON.stringify(champScale)}`);

  for (const gap of GAP_VALUES) {
    for (const amp of AMP_VALUES) {
      if (gap === incumbentScale.gapTurns && amp === incumbentScale.amplitude) continue;
      applyScale({ gapTurns: gap, amplitude: amp });
      const cf = fitness(BASE_SEED, 'B');
      const accept = passesGuard(cf) && cf.points >= champFit.points + MARGIN;
      console.log(
        `[tune] B gap=${gap} amp=${amp}: points=${cf.points.toFixed(1)} turns=${cf.meanTurns} ${accept ? 'ACCEPT' : 'reject'} (${cf.detail})`,
      );
      if (accept) {
        champScale = { gapTurns: gap, amplitude: amp };
        champFit = cf;
      }
    }
  }
  writePassReport('B', champWeights, champFit, JSON.stringify(champScale), champScale);
  return { champScale, champFit };
}

function writePassReport(
  tag: string,
  weights: EvalWeights,
  fit: Fit,
  extra: string,
  scale?: { gapTurns: number; amplitude: number },
) {
  const path = `docs/reports/5C-tuning-pass-${tag}.md`;
  const md = [
    `# 5C Tuning — pass ${tag}`,
    ``,
    `> Champion so far. points=${fit.points.toFixed(1)}, meanTurns=${fit.meanTurns}, terminated=${fit.terminated}.`,
    `> ${fit.detail}. ${extra}.`,
    ``,
    '```json',
    JSON.stringify({ weights, scale: scale ?? SCALE_PARAMS }, null, 2),
    '```',
  ].join('\n');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, md);
}

function writeChampionReport(
  weights: EvalWeights,
  scale: { gapTurns: number; amplitude: number },
  champFit: Fit,
  champHoldout: Fit,
  incHoldout: Fit,
  confirmed: boolean,
) {
  const path = 'docs/reports/5C-tuning-champion.md';
  const md = [
    `# 5C Tuning — Champion`,
    ``,
    `> Holdout ${confirmed ? 'CONFIRMED' : 'NOT confirmed (overfit suspected — keep incumbent)'}.`,
    `> Champion holdout points=${champHoldout.points.toFixed(1)} vs incumbent ${incHoldout.points.toFixed(1)} (unseen seeds ${HOLDOUT_SEED}+).`,
    `> Tuning-seed fitness: points=${champFit.points.toFixed(1)}, meanTurns=${champFit.meanTurns}. ${champFit.detail}.`,
    ``,
    `## Champion weights + scale (commit to \`EVAL_WEIGHTS\` + \`SCALE_PARAMS\` next session)`,
    ``,
    '```json',
    JSON.stringify({ weights, scale }, null, 2),
    '```',
    ``,
    `## Acceptance parameters`,
    `- PRO_GAMES per pairing: ${PRO_GAMES}`,
    `- improvement margin: >= ${MARGIN} placement points`,
    `- F-1 guardrail: termination 100% AND mean turns <= ${MAX_TURNS}`,
    `- multipliers tried: ${JSON.stringify(MULTIPLIERS)}`,
    ``,
    confirmed
      ? 'Next: apply these to `src/oracle/ai/evaluate.ts`, re-run the benchmark, then unskip/redesign P-tests per F-2.'
      : 'WARNING: holdout did not confirm — do NOT commit. Re-tune with more seeds or a wider holdout.',
  ].join('\n');
  writeFileSync(path, md);
  console.log(`[tune] champion report -> ${path}`);
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--smoke')) {
    PRO_GAMES = 2;
    WEIGHT_KEYS = ['mass'];
    MULTIPLIERS = [0.5, 2.0];
    DO_PHASE_B = false;
    console.log('[tune] SMOKE mode: games=2, keys=[mass], mult=[0.5,2.0], no Phase B');
  }

  const incumbentWeights: EvalWeights = { ...EVAL_WEIGHTS };
  const incumbentScale = { ...SCALE_PARAMS };

  const { champWeights, champFit } = runPhaseA(incumbentWeights, incumbentScale);

  let champScale = { ...incumbentScale };
  let phaseBFit: Fit | null = null;
  if (DO_PHASE_B) {
    const b = runPhaseB(champWeights, incumbentScale);
    champScale = b.champScale;
    phaseBFit = b.champFit;
  }

  // Holdout on UNSEEN seeds: champion vs incumbent.
  applyWeights(champWeights);
  applyScale(champScale);
  const champHoldout = fitness(HOLDOUT_SEED, DO_PHASE_B ? 'B' : 'A');
  applyWeights(incumbentWeights);
  applyScale(incumbentScale);
  const incHoldout = fitness(HOLDOUT_SEED, DO_PHASE_B ? 'B' : 'A');
  const confirmed = passesGuard(champHoldout) && champHoldout.points >= incHoldout.points;

  console.log(
    `[tune] HOLDOUT: champion ${champHoldout.points.toFixed(1)} vs incumbent ${incHoldout.points.toFixed(1)} -> ${confirmed ? 'CONFIRMED' : 'NOT confirmed'}`,
  );

  writeChampionReport(
    champWeights,
    champScale,
    phaseBFit ?? champFit,
    champHoldout,
    incHoldout,
    confirmed,
  );
  console.log(`[tune] DONE. champion = ${JSON.stringify({ weights: champWeights, scale: champScale })} confirmed=${confirmed}`);
}

main();
