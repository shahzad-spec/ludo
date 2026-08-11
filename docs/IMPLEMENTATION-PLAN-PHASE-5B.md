# Phase 5B — Pro Bots Implementation Plan

> Companion to `PHASE-5B-PRO-BOTS-ARCHITECTURE.md` (the decisions). This is the
> build order: exact files, APIs, test inventories, and per-step gates.
> Where this plan and the architecture doc disagree, the **architecture doc wins**.
>
> **Status:** Draft for review. No code until approved.
> **Prerequisite:** ✅ 5B-0 passed — Medium playtest completed, bots play sensibly.
> **Amendments A-F from the third review are folded in.**

---

## 1. Locked Decisions (from architecture doc + amendments)

| # | Decision | Value |
|---|---|---|
| A | Node type is phase-aware | IDLE → chance node; SELECTING_TOKEN → max/policy node |
| B | simulate() handles null move | Returns state unchanged on NO_LEGAL_MOVE |
| C | Eval zone values strictly monotonic | Yard(0) < Track(0-64) < Home(66-98) < Finished(100) |
| D | fixedDepth for tests | budgetMs only in production; tests pin depth |
| E | Advantage-scaled risk | riskScale = 1 + 0.5·clamp(adv/150); ahead → protect, behind → gamble |
| F | Tempo terms | Emerge from search in Pro; explicit in Hard leaf eval only |
| — | Depth cap | 8 (iterative deepening stops at budget or depth, whichever first) |
| — | Opponent model | Medium policy (deterministic, collapses branching) |
| — | No ML/MCTS | Expectimax is exact for this branching factor |

---

## 2. Module Layout

```
src/oracle/ai/
├── types.ts          # Difficulty union, AiConfig, internal search types
├── evaluate.ts       # evaluate(state, me): number — full positional eval
├── threats.ts        # exposurePenalty(state, move, me): number
├── search.ts         # searchBestMove(state, moves, me, opts): Move
├── policy.ts         # chooseBotMove(state, moves, difficulty, rng) — migrated from ai.ts
├── index.ts          # barrel re-export
└── __tests__/
    ├── evaluate.test.ts
    ├── threats.test.ts
    ├── search.test.ts
    └── ladder.test.ts          # Elo self-play (5B-4)
```

`oracle/ai.ts` (the existing file) becomes a one-line re-export:
```typescript
export { chooseBotMove } from './ai/policy';
export type { BotDifficulty } from './ai/types';
```

This keeps `botDriver.ts` and all existing imports working unchanged.

---

## 3. Step 5B-1 — Evaluation Function (~half day)

### 3.1 Files

| File | Action | Responsibility |
|---|---|---|
| `oracle/ai/types.ts` | NEW | `Difficulty = 'easy' \| 'medium' \| 'hard' \| 'pro'`; `SearchOptions = { budgetMs?, fixedDepth? }` |
| `oracle/ai/evaluate.ts` | NEW | `evaluate(state, me): number` — the full positional eval |
| `oracle/ai/threats.ts` | NEW | `exposurePenalty(state, dest, me, riskScale): number` |
| `oracle/ai/__tests__/evaluate.test.ts` | NEW | Crafted-position tests |
| `oracle/ai/__tests__/threats.test.ts` | NEW | Threat detection tests |
| `oracle/ai.ts` | MODIFY | Re-export from `./ai/policy` |

### 3.2 `types.ts` API

```typescript
export type Difficulty = 'easy' | 'medium' | 'hard' | 'pro';

export interface SearchOptions {
  budgetMs?: number;       // default 80; runtime only
  fixedDepth?: number;     // for deterministic tests; overrides budgetMs
}
```

### 3.3 `evaluate.ts` — the full positional eval

```typescript
import type { GameState } from '../types';
import type { Color } from '../board/track';
import { FINISH } from '../board/track';

/**
 * Per-token value (amendment C — strictly monotonic):
 *   Yard:      0
 *   Track:     p + max(0, p - 43) * 2       (range 0..64)
 *   Home col:  66 + h * 8                    (range 66..98)
 *   Finished:  100
 */
export function tokenValue(progress: number): number {
  if (progress === -1) return 0;           // yard
  if (progress === FINISH) return 100;     // finished
  if (progress <= 50) return progress + Math.max(0, progress - 43) * 2; // track
  return 66 + (progress - 51) * 8;         // home column (51..55 → 0..4)
}

/**
 * Full board evaluation from `me`'s perspective.
 * Returns myScore − Σ(opponentScores), with advantage-scaled risk (amendment E).
 */
export function evaluate(state: GameState, me: Color): number {
  let myScore = 0;
  let oppScore = 0;
  let myMaxProgress = 0;
  let oppMaxProgress = 0;

  for (const token of Object.values(state.tokens)) {
    const val = tokenValue(token.progress);
    if (token.color === me) {
      myScore += val;
      myMaxProgress = Math.max(myMaxProgress, token.progress);
    } else {
      oppScore += val;
      oppMaxProgress = Math.max(oppMaxProgress, token.progress);
    }
  }

  // Race pressure: being ahead in max progress is valuable
  const racePressure = 2 * (myMaxProgress - oppMaxProgress);

  return myScore - oppScore + racePressure;
}

/**
 * Advantage-scaled risk multiplier (amendment E).
 * When ahead: higher (protect the lead, avoid exposure).
 * When behind: lower (take risks to catch up).
 */
export function riskScale(state: GameState, me: Color): number {
  const adv = evaluate(state, me);
  return 1 + 0.5 * Math.max(0, Math.min(1, adv / 150));
}
```

### 3.4 `threats.ts` — exposure/threat geometry

```typescript
import type { GameState, Move } from '../types';
import type { Color } from '../board/track';
import { ENTRY_OFFSET } from '../board/track';
import { SAFE_TRACK_CELLS } from '../board/safeCells';
import type { Position } from '../board/track';

/**
 * Count how many opponents can reach `destCell` with a dice roll of 1-6.
 * Returns the expected loss (sum of 1/6 × victimTokenValue for each threat).
 */
export function exposurePenalty(
  state: GameState,
  dest: Position,
  me: Color,
  scale: number = 1,
): number {
  if (dest.kind !== 'track') return 0;
  if (SAFE_TRACK_CELLS.has(dest.cell)) return 0;

  let penalty = 0;
  for (const t of Object.values(state.tokens)) {
    if (t.color === me) continue;
    if (t.progress < 0 || t.progress > 50) continue;
    const oppCell = (ENTRY_OFFSET[t.color] + t.progress) % 52;
    const behind = (dest.cell - oppCell + 52) % 52;
    if (behind >= 1 && behind <= 6) {
      // This opponent can capture us with probability 1/6
      penalty += (1 / 6) * tokenValue(/* my token at dest */);
    }
  }
  return penalty * scale;
}
```

### 3.5 Test inventory — `evaluate.test.ts`

| Test | Asserts |
|---|---|
| Yard token = 0 | `tokenValue(-1) === 0` |
| Track p=0 = 0 | `tokenValue(0) === 0` |
| Track p=43 = 43 | `tokenValue(43) === 43` (no bonus yet) |
| Track p=44 = 46 | `tokenValue(44) === 44 + 2` (bonus kicks in) |
| Track p=50 = 64 | `tokenValue(50) === 64` |
| **Monotonicity (amendment C)** | `tokenValue(50) < tokenValue(51)` (64 < 66) |
| Home h=0 = 66 | `tokenValue(51) === 66` |
| Home h=4 = 98 | `tokenValue(55) === 98` |
| Finished = 100 | `tokenValue(56) === 100` |
| Eval: my tokens ahead = positive | crafted state |
| Eval: opponent ahead = negative | crafted state |
| riskScale: ahead → >1 | crafted state |
| riskScale: behind → =1 | crafted state |

### 3.6 Test inventory — `threats.test.ts`

| Test | Asserts |
|---|---|
| No threat on safe cell | penalty = 0 |
| No threat when no opponents nearby | penalty = 0 |
| Threat from 1 cell behind | penalty > 0 |
| Threat from 6 cells behind | penalty > 0 |
| No threat from 7 cells behind | penalty = 0 |
| Penalty scales with riskScale | penalty × 1.5 when ahead |

### 3.7 Gate 5B-1

- All evaluate + threats tests green
- `oracle/ai.ts` re-export works (existing 208 tests still green)
- Lint clean (no react/three under oracle/ai/**)

---

## 4. Step 5B-2 — Expectimax Search (~1 day)

### 4.1 Files

| File | Action | Responsibility |
|---|---|---|
| `oracle/ai/search.ts` | NEW | `searchBestMove()` + `expectimax()` + `simulate()` |
| `oracle/ai/__tests__/search.test.ts` | NEW | Crafted trap tests + determinism |

### 4.2 `search.ts` API

```typescript
import type { GameState, Move } from '../types';
import type { Color } from '../board/track';
import type { SearchOptions } from './types';
import { applyAction } from '../engine';
import { evaluate } from './evaluate';
import { chooseBotMove } from './policy';
import { getLegalMoves } from '../rules/legalMoves';

/**
 * Search for the best move using iterative-deepening expectimax.
 * Uses applyAction for simulation (zero desync guarantee).
 */
export function searchBestMove(
  state: GameState,
  moves: Move[],
  me: Color,
  opts: SearchOptions = {},
): Move | null;
```

### 4.3 Core functions

**`simulate(state, move)`** — amendment B (null-safe):

```typescript
function simulate(state: GameState, move: Move | null): GameState {
  if (move === null) return state; // turn-pass (NO_LEGAL_MOVE)
  const r1 = applyAction(state, { type: 'REQUEST_MOVE', tokenId: move.tokenIds[0] });
  const r2 = applyAction(r1.state, { type: 'RESOLVE_MOVE' });
  return r2.state;
}
```

**`simulateRoll(state, roll)`**:

```typescript
function simulateRoll(state: GameState, roll: number): GameState {
  const r1 = applyAction(state, { type: 'REQUEST_ROLL' }, () => (roll - 1) / 6);
  const r2 = applyAction(r1.state, { type: 'RESOLVE_ROLL', value: roll });
  return r2.state;
}
```

Note: injectable RNG pins the roll value. `() => (roll-1)/6` maps to `Math.floor(r*6)+1 === roll`.

**`expectimax(state, depth, me)`** — amendment A (phase-aware):

```typescript
function expectimax(state: GameState, depth: number, me: Color): number {
  if (depth <= 0 || state.phase === 'GAME_OVER') {
    return evaluate(state, me);
  }

  if (state.phase === 'IDLE') {
    // Chance node: enumerate all 6 dice rolls
    let sum = 0;
    for (let roll = 1; roll <= 6; roll++) {
      const rolled = simulateRoll(state, roll);
      if (rolled.phase === 'SELECTING_TOKEN') {
        if (rolled.currentPlayer === me) {
          // Max node: my turn, pick best of my legal moves
          const myMoves = rolled.validMoves;
          if (myMoves.length > 0) {
            let best = -Infinity;
            for (const m of myMoves) {
              best = Math.max(best, expectimax(simulate(rolled, m), depth - 1, me));
            }
            sum += best;
          } else {
            sum += expectimax(rolled, depth - 1, me); // shouldn't happen
          }
        } else {
          // Policy node: opponent plays Medium
          const oppMove = chooseBotMove(rolled, rolled.validMoves, 'medium');
          sum += expectimax(simulate(rolled, oppMove), depth - 1, me);
        }
      } else {
        // NO_LEGAL_MOVE → turn passed, state is IDLE for next player
        sum += expectimax(rolled, depth - 1, me);
      }
    }
    return sum / 6;
  }

  // SELECTING_TOKEN, my turn: max node
  if (state.currentPlayer === me && state.validMoves.length > 0) {
    let best = -Infinity;
    for (const m of state.validMoves) {
      best = Math.max(best, expectimax(simulate(state, m), depth - 1, me));
    }
    return best;
  }

  return evaluate(state, me);
}
```

**`searchBestMove`** — amendment D (fixedDepth):

```typescript
export function searchBestMove(
  state: GameState,
  moves: Move[],
  me: Color,
  opts: SearchOptions = {},
): Move | null {
  if (moves.length === 0) return null;
  if (moves.length === 1) return moves[0]; // no choice to make

  const budgetMs = opts.budgetMs ?? 80;
  const maxDepth = opts.fixedDepth ?? 8;
  const useBudget = opts.fixedDepth === undefined;

  let best = moves[0];
  const t0 = useBudget ? performance.now() : 0;

  for (let depth = 1; depth <= maxDepth; depth++) {
    let bestScore = -Infinity;
    for (const m of moves) {
      const score = expectimax(simulate(state, m), depth - 1, me);
      if (score > bestScore) {
        bestScore = score;
        best = m;
      }
    }
    if (useBudget && performance.now() - t0 > budgetMs) break;
  }

  return best;
}
```

### 4.4 `policy.ts` — migrated chooseBotMove with Hard tier

The existing `chooseBotMove` from `ai.ts` migrates to `policy.ts`. Add `hard`:

```typescript
export function chooseBotMove(
  state: GameState,
  moves: Move[],
  difficulty: Difficulty,
  rng: () => number = Math.random,
): Move | null {
  if (moves.length === 0) return null;

  if (difficulty === 'pro') {
    return searchBestMove(state, moves, state.tokens[moves[0].tokenIds[0]].color);
  }

  if (difficulty === 'hard') {
    // Greedy over the FULL evaluation (all terms), no search
    const me = state.tokens[moves[0].tokenIds[0]].color;
    const scale = riskScale(state, me);
    let best = moves[0];
    let bestScore = -Infinity;
    for (const m of moves) {
      const sim = simulate(state, m);
      let score = evaluate(sim, me);
      score -= exposurePenalty(sim, m.path[m.path.length - 1], me, scale);
      if (m.isCapture) score += 20; // tempo
      if (m.isFinishing) score += 60;
      if (m.isEnteringBoard) score += 15;
      if (score > bestScore) { bestScore = score; best = m; }
    }
    return best;
  }

  // easy + medium: existing logic (unchanged)
  // ...
}
```

### 4.5 Test inventory — `search.test.ts`

| Test | Asserts |
|---|---|
| Pro captures when available (no downside) | picks isCapture move |
| Pro refuses capture that leads to recapture (trap) | picks non-capture move |
| Pro finishes when possible | picks isFinishing move |
| Pro exits yard on 6 | picks isEnteringBoard move |
| Pro prefers safe cell over exposed | picks safe-cell move |
| **Amendment C:** Pro enters home column (no hesitation) | picks isEnteringHome move |
| **Amendment B:** Pro handles stuck opponent in search | no crash, returns valid move |
| **Amendment D:** fixedDepth = deterministic | same move on repeat |
| **Amendment E:** Pro risk-averse when ahead | avoids exposed move when winning |
| **Amendment E:** Pro risk-seeking when behind | takes exposed move when losing |

### 4.6 Gate 5B-2

- All search tests green (fixedDepth pinned for determinism)
- Existing 208 + evaluate/threats tests still green
- Lint clean
- p95 search time ≤ 100ms at depth 4 (measured in test)

---

## 5. Step 5B-3 — Wiring (~half day)

### 5.1 Files

| File | Action |
|---|---|
| `oracle/ai/index.ts` | NEW — barrel: `export { chooseBotMove } from './policy'; export type { Difficulty } from './types';` |
| `oracle/ai.ts` | MODIFY — re-export from `./ai/index` |
| `store/botDriver.ts` | MODIFY — Pro gets 900-1400ms think delay |
| `App.tsx` | MODIFY — difficulty selector (Easy/Medium/Hard/Pro) |

### 5.2 botDriver changes

```typescript
// Think delay per difficulty
const THINK_DELAYS: Record<Difficulty, [number, number]> = {
  easy:   [600, 900],
  medium: [800, 1100],
  hard:   [900, 1300],
  pro:    [1000, 1400], // compute ≤80ms, rest is UX
};
```

### 5.3 UI changes

Replace the 🤖 Solo button with a small dropdown:
```
🤖 Solo: [Medium ▾]  →  Easy / Medium / Hard / Pro
```

Or two buttons: "🤖 Solo (Medium)" and "🧠 Solo (Pro)".

### 5.4 Gate 5B-3

- Solo vs Pro runs in 3D
- Bots auto-play with Pro difficulty
- Think delay feels natural (1-1.4s)
- No main-thread jank (search completes in <100ms)

---

## 6. Step 5B-4 — Elo Ladder + Tuning (~half day)

### 6.1 Files

| File | Action |
|---|---|
| `oracle/ai/__tests__/ladder.test.ts` | NEW — self-play Elo ladder |

### 6.2 Ladder structure

```typescript
describe('Elo ladder — difficulty ordering', () => {
  // Run N games per pairing, count wins
  // Pairings: Pro vs Hard, Hard vs Medium, Medium vs Easy
  // Each game: both sides use the same engine, seeded RNG

  it('Pro beats Hard ≥ 60% over 50 games', () => { ... });
  it('Hard beats Medium ≥ 60% over 50 games', () => { ... });
  it('Medium beats Easy ≥ 60% over 50 games', () => { ... });
  it('Pro beats Medium ≥ 70% over 100 games', () => { ... });
});
```

### 6.3 Self-play harness (headless)

```typescript
function playGame(diffA: Difficulty, diffB: Difficulty, seed: number): Difficulty {
  let state = createInitialState(colorsForPlayerCount(4), V1_RULES);
  const rng = seededRng(seed);
  // Override bots: player A = diffA, others = diffB
  for (let turn = 0; turn < 2000; turn++) {
    if (state.phase === 'GAME_OVER') break;
    if (state.phase === 'IDLE') {
      state = applyAction(state, { type: 'REQUEST_ROLL' }, rng).state;
    } else if (state.phase === 'SELECTING_TOKEN') {
      const diff = state.currentPlayer === 'red' ? diffA : diffB;
      const move = chooseBotMove(state, state.validMoves, diff, rng);
      state = applyAction(state, { type: 'REQUEST_MOVE', tokenId: move.tokenIds[0] }).state;
    } else if (state.phase === 'ROLLING') {
      state = applyAction(state, { type: 'RESOLVE_ROLL', value: state.dice.value! }).state;
    } else if (state.phase === 'ANIMATING_MOVE') {
      state = applyAction(state, { type: 'RESOLVE_MOVE' }).state;
    }
  }
  return state.winners[0] === 'red' ? diffA : diffB;
}
```

### 6.4 Weight tuning

If the ladder shows Pro NOT beating Medium ≥70%:
1. Increase exposure penalty weight
2. Increase capture tempo weight
3. Adjust riskScale parameters
4. Re-run ladder until ordering holds

### 6.5 Gate 5B-4

- Pro > Hard > Medium > Easy (win-rate ordering)
- Pro beats Medium ≥ 70%
- p95 search time ≤ 100ms
- All 208 + new tests green
- Manual playtest: solo vs 3 Pro bots to completion

---

## 7. Cross-Check vs Architecture Doc

| Arch doc § | Commitment | This plan | ✅ |
|---|---|---|---|
| §3.1 | 4 difficulty tiers | §4.4 policy.ts | ✅ |
| §3.2 | Eval with amendment C (66+h×8) | §3.3 evaluate.ts | ✅ |
| §3.2 | Amendment E riskScale | §3.3 riskScale() | ✅ |
| §3.3 | Expectimax, phase-aware (amendment A) | §4.3 expectimax() | ✅ |
| §3.3 | Null-safe simulate (amendment B) | §4.3 simulate() | ✅ |
| §3.3 | fixedDepth (amendment D) | §4.3 searchBestMove() | ✅ |
| §3.4 | Simulate via applyAction | §4.3 simulate/simulateRoll | ✅ |
| §4 | Elo ladder | §6 ladder.test.ts | ✅ |
| §5 | Tempo terms (amendment F) | Hard eval only, emerge from search in Pro | ✅ |
| §6 | Depth cap 8 | §4.3 maxDepth = 8 | ✅ |

**No contradictions. All 6 amendments applied.**

---

## 8. Risk Register

| Risk | Mitigation |
|---|---|
| Search too slow (depth 6+) | Iterative deepening + 80ms budget; cap 8 |
| applyAction RNG injection | `simulateRoll` uses `() => (roll-1)/6` to pin dice |
| Policy circular import (policy → search → policy) | search imports chooseBotMove from policy; policy imports searchBestMove from search. Use late binding or put search in a separate import path |
| Eval weights wrong | Ladder self-play tunes them (5B-4) |
| Main-thread jank | 80ms budget; Web Worker as v2 fallback |
| Test runtime (ladder = 300+ games) | Keep game count low (50-100); use timeouts |

### Circular dependency resolution

`policy.ts` calls `searchBestMove` for Pro. `search.ts` calls `chooseBotMove`
for opponent modeling. This is a circular import.

**Fix:** `search.ts` imports `chooseBotMove` via a function parameter, not a
direct import:

```typescript
// search.ts
export function searchBestMove(
  state: GameState,
  moves: Move[],
  me: Color,
  opts: SearchOptions = {},
  opponentPolicy?: (s: GameState, m: Move[]) => Move | null, // injected
): Move | null;
```

`policy.ts` passes itself as the opponent policy:
```typescript
// policy.ts
if (difficulty === 'pro') {
  return searchBestMove(state, moves, me, {}, (s, m) => chooseBotMove(s, m, 'medium'));
}
```

This breaks the cycle cleanly.

---

## 9. Execution Sequence

| Step | Deliverable | Est. Time | Gate |
|---|---|---|---|
| **5B-0** | ✅ Medium playtest | ✅ Done | ✅ Passed |
| **5B-1** | evaluate.ts + threats.ts + tests + ai.ts re-export | ~half day | Crafted tests green; 208 unmodified |
| **5B-2** | search.ts + policy.ts migration + tests | ~1 day | Trap tests pass; p95 ≤ 100ms |
| **5B-3** | botDriver + UI wiring (Hard/Pro selectable) | ~half day | Solo vs Pro runs in 3D |
| **5B-4** | Elo ladder + tuning + final gate | ~half day | Pro > Hard > Medium > Easy ≥ 60-70% |
