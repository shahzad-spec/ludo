# Phase 5C — Competitive Bot ("Predator Brain") Architecture & Plan

> **Status:** Draft for review. No code until approved.
> **Scope:** Replaces the Pro/Hard *brain* — evaluation, opponent model, and
> search internals. **Zero changes** to the Oracle engine, rules, events,
> Director, Stage, or `chooseBotMove`'s public signature.
> **Relationship to other work:** does not block the v1 polish/ship pass.
> Absorbs audit task **T-1** (offline Elo benchmark + weight tuning) as steps
> 5C-3/5C-4. Companion docs: `PHASE-5B-PRO-BOTS-ARCHITECTURE.md` (what exists),
> `PROJECT-AUDIT-AND-IMPROVEMENT-PLAN.md` (T-1, G-11).

---

## 0. Problem Statement (evidence-based)

### 0.1 Playtest complaint (human, vs Pro)

> "Every house just unlocks one token and guides it to the winning spot.
> It doesn't set traps, doesn't prioritize captures, doesn't stop the player
> who is winning fast. Medium felt more interesting."

### 0.2 Verified causes (code audit)

| Observation | Cause | Location |
|---|---|---|
| Single-token racing | Eval is ~95% race value; home-column jump (64→66→…→100) makes "push the leader home" the dominant gradient | `evaluate.ts` |
| No capture *hunting* | Captures only register when already inside the search horizon; no feature rewards "I have a live shot" or "I moved into striking range" | `evaluate.ts`, `search.ts` |
| Doesn't target the winner | All opponents are summed into one number; leader pressure is a single weak `2 × (myMax − oppMax)` term | `evaluate.ts` §racePressure |
| No traps | Traps are 6+ ply ideas; no bait/counter-shot features, horizon too shallow, no transposition table | `search.ts` |
| Timid when ahead | `riskScale` scales danger-avoidance ×1.5 when leading — coded timidity | `evaluate.ts` §riskScale |
| Hard < Medium (18%, below the 25% baseline) | Eval weights are guesses, never tuned against data | audit §2 (5B-4), G-11 |

### 0.2.1 Why racing dominates — a worked example

The single-token-racing gradient isn't subtle; it is arithmetic. Mid-game
choice: **race** your leader p40→p46, or **capture** a young opponent token at
p5. (Per `evaluate.ts:21` `tokenValue`, plus `racePressure = 2·myMaxProgress`.)

| Move | Δ tokenValue | Δ racePressure | Δ eval |
|---|---|---|---|
| Race leader p40→p46 | +12 (40→52) | +12 (myMax 40→46) | **+24** |
| Capture opponent at p5 | +5 (opp loses `tokenValue(5)`) | ~0 | **+5** |

Racing wins by **~19 points.** Given today's objective the bot is *correct* to
ignore the capture — so this is a fixed-objective problem, not a search problem.
Fixing the evaluation (§3) is therefore >80% of the work; the search engine
(§5) is already sound.

### 0.3 Goal

A Pro bot whose **behavior** a human can describe as competitive:

1. **Fights** — takes captures and *moves into position* to capture.
2. **Oversees** — knows which opponent is winning fastest and weights them.
3. **Sabotages** — preferentially captures/blocks the leader's advanced tokens.
4. **Defends** — parks safely when ahead, gambles when behind (already partially
   there; must not dominate the personality).
5. **Traps** — holds positions that punish predictable opponent replies
   (emerges from paranoid modeling + deeper search; seeded by features).

And whose **strength** is measurable: placement-based ladder ordering with
tuned weights (5C-4), replacing the unproven 5B-4 win-rate claim.

### 0.4 Honest ceiling (locked framing)

Ludo is dice-dominated. In a 4-player game even a perfect player wins roughly
35–45% of games. Success is therefore defined as **placement superiority**
(finishing ahead of each tier consistently) and **visible behavior**, never
win-rate dominance. Anyone promising more is selling noise.

### 0.5 Complaint → fix traceability

Every line of the player's feedback is owned by a specific part of 5C. Causes
live in §0.2 above; this table points to where each complaint is **fixed**.

| Player complaint | Fixed in 5C by |
|---|---|
| "Not prioritizing captures" | §3.3 `shotPressure` feature + §3.6 weighted eval; §4 paranoid model (it respects that opponents capture) |
| "Not setting traps" | §3.3 live shots + §4 paranoid modeling + §5.2 capture extensions — traps *emerge*, not hand-coded (§3.5 honesty clause) |
| "Not stopping the player winning fast" | §3.4 leader taxation (`LEADER_TAX`) + §3.5 `finishGap` + §3.2 `raceLeader` |
| "Not ganging up on the leader" | §3.4 `opponentMass` weights the leader's tokens ×`LEADER_TAX` |
| "Just unlocks one token and races it" | §3.2 ETF race model replaces `racePressure`'s `myMaxProgress` bribe; §3.6 weights `raceLead`, not "furthest token" |
| "Walks into recaptures / feels reckless" | §3.5 `totalExposure` + §3.6 `exposure` weight + §4 paranoid (fears the recapture) |
| "Doesn't learn / doesn't oversee" | §3.2 ETF/`raceLeader` (oversee) + 5C-3/5C-4 offline tuning loop (learn); Decision 7 |

---

## 1. Locked Decisions

| # | Decision | Value | Rationale |
|---|---|---|---|
| 1 | Upgrade tiers **in place** | Easy/Medium unchanged; **Hard stays on the v1 `scoreMove` heuristic + ETF-anchored scales** (empirical finding **F-1**: greedy-over-competitive-eval stalls games — the eval is a search eval by construction); Pro gets new eval + paranoid model + search upgrades | Tier story: Easy=random, Medium=greedy heuristic, Hard=stronger heuristic, Pro=search + competitive eval. Competitive Hard moves to backlog (F-1). No new UI |
| 2 | Eval = **weighted feature vector** | `evaluate(state, me) = w · features(state, me)` with weights as a committed `const` | Makes tuning (5C-4) a data operation, not a code rewrite |
| 3 | Opponent model | **Paranoid 1-ply best-response**, deterministic, replacing Medium as the default opponent model inside Pro's search | Medium-assumption is why Pro never respects/sets traps. Deterministic keeps tests pinned |
| 4 | Transposition table | Bounded `Map`, **cleared per root search** | Doubles effective depth in budget; no cross-move staleness |
| 5 | Search extensions | Capture moves extend depth by +1, max 2 extensions per path | Forced/tactical lines are where fights live |
| 6 | Strength metric | **Placement score** (did A finish ahead of B in the same game), not just winner-count | 4-player winner counts need ~500 games to separate tiers; placement needs far fewer |
| 7 | Learning | Offline self-play weight tuning (coordinate ascent), seeded, committed weights. **No runtime learning, no neural nets, no MCTS** | Keeps the Oracle pure, deterministic, and testable; ML is v2-research at best |
| 8 | Personality scales | `riskScale`/`captureTempoScale` kept but **re-anchored to ETF gap** instead of raw eval score | Raw eval drifts as features are added; ETF gap is a stable "am I winning the race" signal |
| 9 | Perf budget | p95 root decision ≤ 120 ms desktop / ≤ 250 ms mobile; think-delay (1000–1400 ms) absorbs it | Player never waits beyond the UX delay |
| 10 | Contract freeze | `chooseBotMove(state, moves, difficulty, rng)` signature unchanged; `botDriver`, UI, engine untouched | Layer discipline; Director/Stage never notice |

### Finding F-1 — "Hard = greedy over the competitive eval" is non-viable (5C-2d, rejected)

**Evidence:** seed-311 Hard-vs-Hard ladder game did not terminate in 3000 turns.
Trace: 0 captures (no capture-cycle) — bots simply **stalled**, ~1 token finished
per 1000 turns.

**Root cause:** the competitive eval is a **search eval by construction** (§3.5
trap honesty clause): `shotPressure` *seeds* lines that multi-ply search then
*converts*. Used at 1-ply greedy (Hard), it rewards hovering behind opponents
for shots that never fire, while the large `opponentMass` term drowns the race
signal. Result: no forward pressure, no termination.

**Rejected alternative:** Hard-with-search terminates and plays well, but the
ladder runs ~60 Hard games; even a 20 ms budget per turn blows the suite
(Pro is deliberately capped at 3 games for this reason).

**Resolution:** Hard stays on `scoreMove` (benefiting from the re-anchored
ETF scales). Competitive eval is **Pro-only**. **Backlog — "competitive
Hard":** either a greedy-safe eval subset (drop/attenuate `shotPressure` and
`opponentMass`, keep raceLead/exposure/finishGap) or an offline fast-mode
search budget. Not scheduled; revisit only if playtests demand a stronger
non-Pro tier.

**Early human signal (pre-tuning):** the user playtested Pro on this branch
(paranoid model + TT + capture extensions, initial-guess weights) and rated it
*"quite acceptable"* — positive data for the 5C-5 gate before any tuning.

### Finding F-2 — the weight-sensitive P-tests are calibration-gated, not code-gated (5C-2e)

**Evidence:** P-3 (refuse bait) fails at the initial weights — Pro takes an
*unfavorable* capture (wins victim value 33, loses its own token value 43 to
the paranoid recapture). Fixture contract verified (both moves in
`validMoves`); the paranoid model sees the recapture; `opponentMass` at −1.0
(with leader tax) outweighs the race/spread damage. The eval rates a losing
trade as winning. P-2/P-4/P-5 are expected to fail for the same class of reason.

**Consequence — ordering corrected:** the weight-sensitive P-tests cannot gate
*before* tuning; they are the validation gate *after* it. Execution order is
now **5C-3 (benchmark) → 5C-4 (tune, esp. `mass` vs `raceLead`) → activate the
remaining P-tests**. Structural P-tests (hunt, spread, endgame) still ship in
5C-2 — they validate machinery now and catch non-weight bugs early.

**Skip policy (hard rule):** every `it.skip` carries an inline expiry reason
naming its gate. The 5C-4 gate explicitly requires **all skipped P-tests
unskipped and green** — a permanent skip is a gate failure, not a resolution.

---

## 2. Current Brain Anatomy (the baseline being replaced)

```
chooseBotMove (policy.ts)
  ├─ easy:   weighted-random over scoreMove()            [unchanged by 5C]
  ├─ medium: greedy scoreMove() − exposurePenaltyMedium  [unchanged by 5C]
  ├─ hard:   greedy over evaluate() + exposurePenalty()  ← gets NEW eval
  └─ pro:    searchBestMove (expectimax)                 ← gets NEW eval +
                ├─ chance nodes: all 6 rolls via applyAction    paranoid model
                ├─ opponent nodes: Medium policy (INJECTED)  →  + TT
                └─ leaves: evaluate()                      →  + extensions
```

What the leaf eval sees today: `Σ tokenValue(mine) − Σ tokenValue(theirs) +
2×(myMaxProgress − oppMaxProgress)`. That's the whole personality. Everything
below rebuilds it.

---

## 3. The New Evaluation — Feature Architecture

### 3.1 Module layout

```
src/oracle/ai/
├── types.ts        # + EvalFeatures interface, EvalWeights interface
├── features.ts     # NEW — pure feature extractors (ETF, shots, leader, spread)
├── evaluate.ts     # REWRITTEN — weighted dot product + re-anchored scales
├── threats.ts      # EXTENDED — totalExposure(state, me) alongside exposurePenalty
├── search.ts       # EXTENDED — transposition table, capture extensions,
│                   #            paranoid-model support
├── policy.ts       # EXTENDED — paranoidPolicy factory; Hard unchanged shape
└── __tests__/
    ├── features.test.ts    # NEW — geometry & monotonicity
    ├── personality.test.ts # NEW — behavioral crafted-position tests (§8)
    └── (existing suites unmodified)
tools/
└── bot-benchmark.mjs       # NEW — offline placement ladder + tuning loop (5C-3/4)
```

All of it Oracle-layer: no React/three/zustand (ESLint already enforces).

### 3.2 Expected Turns to Finish (ETF) — the race model

The single most important new concept. Every "who is winning" judgment derives
from it.

```ts
// features.ts
export const MEAN_STEP = 3.5;        // expected dice value
export const YARD_EXIT_TURNS = 6;    // E[rolls until a 6] (geometric, p = 1/6)

/** Expected turns for ONE token to finish, given current progress. */
export function tokenETF(progress: number): number {
  if (progress === BASE)   return YARD_EXIT_TURNS + FINISH / MEAN_STEP; // ≈ 22
  if (progress === FINISH) return 0;
  return (FINISH - progress) / MEAN_STEP;   // monotone decreasing ✓
}

/**
 * Expected turns for a COLOR to finish all tokens.
 * Sum-of-work model: one token moves per turn, so remaining work adds up.
 * Crude but monotone — the tuning loop (5C-4) absorbs the model error.
 */
export function colorETF(state: GameState, color: Color): number;

/** The opponent currently winning the race. null if only I remain. */
export function raceLeader(state: GameState, me: Color): Color | null;

/** Positive when I'm racing ahead of the fastest opponent. */
export function raceLead(state: GameState, me: Color): number; // = leaderETF − myETF
```

**Properties enforced by tests:** `tokenETF` strictly decreases with progress;
yard tokens cost the most; finished tokens cost 0; `raceLeader` picks the
lowest-ETF opponent and ignores me.

### 3.3 Capture opportunity — "live shots"

The missing hunting instinct. A *shot* exists when an opponent token sits
1–6 cells ahead of one of mine on the shared loop (a single dice value captures
it), on a non-safe cell.

```ts
// features.ts
export interface CaptureShot {
  tokenId: string;      // my token that could capture
  victimId: string;     // opponent token in range
  neededRoll: number;   // 1..6 — the exact roll that lands the capture
  victimValue: number;  // tokenValue(victim.progress) — prefer rich targets
}

export function captureShots(state: GameState, me: Color): CaptureShot[];

/** Feature value: expected-value-weighted shot count, leader victims ×LEADER_TAX. */
export function shotPressure(state: GameState, me: Color): number;
```

Direction note (avoids the 5B-1 threat-direction bug class): shots look at
opponents **ahead** of me (`(oppCell − myCell + 52) % 52 ∈ 1..6`); exposure
(threats.ts) looks at opponents **behind** me. Dedicated tests pin both
directions — geometry mix-ups are the #1 historical bug class in this codebase.

### 3.4 Leader taxation — "stop whoever is winning"

```ts
// features.ts / evaluate.ts
export const LEADER_TAX = 1.6;   // initial guess; tuned in 5C-4

/**
 * Opponent token mass, with the race leader's tokens weighted ×LEADER_TAX.
 * Subtracting this from my score makes the search *feel* leader captures
 * and leader blocks as ~1.6× more valuable than hitting a straggler.
 */
export function opponentMass(state: GameState, me: Color): number;
```

### 3.5 Defensive + structural features

| Feature | Definition | Sign |
|---|---|---|
| `totalExposure` | Σ over my track tokens of expected-loss (reuse `exposurePenalty` geometry per token, safe cells = 0) | negative |
| `spread` | my active tokens (progress ≥ 0) − finished, small bonus for 2–3 active | positive |
| `homeLoaded` | my tokens in home column (safe + close) | positive, small |
| `finishGap` | my finished count − leader's finished count | positive |
| `yardSixPressure` | my yard tokens × probability context (cheap term; discourages sitting forever) | positive, tiny |

**Trap honesty clause:** no handcrafted "trap bonus" in v5C. Trap behavior is
the *emergent* product of paranoid modeling (§4) + capture extensions (§5.2) +
shot-pressure (§3.3). A hardcoded trap heuristic would encode our guesses;
the search discovers the real thing. If playtesting (5C-5) still finds no trap
behavior, the remedy is depth/budget, not a fake feature.

### 3.6 The new `evaluate`

```ts
// evaluate.ts
export interface EvalWeights {
  raceLead: number;       //  4.0
  shotPressure: number;   //  0.9
  exposure: number;       // −1.0  (applied to totalExposure)
  mass: number;           // −1.0  (applied to opponentMass, leader-taxed)
  spread: number;         //  3.0
  homeLoaded: number;     //  2.0
  finishGap: number;      // 12.0
}
export const EVAL_WEIGHTS: EvalWeights = { /* initial guesses above */ };

export function evaluate(
  state: GameState,
  me: Color,
  weights: EvalWeights = EVAL_WEIGHTS,
): number;
```

**Monotonicity invariant (amendment C, preserved):** finished tokens must
always dominate home-column, home-column must dominate track, track must
dominate yard — for *my* tokens. Enforced by crafted tests for every weight
set that ships (initial and tuned). If tuning breaks monotonicity, the tuning
run is rejected, not the test.

**Personality scales, re-anchored (Decision 8):**

```ts
// gap ∈ roughly [-30, +30] turns; ahead → risk-averse, behind → gambler
export function riskScale(state, me): number {
  const lead = raceLead(state, me);
  return 1 + 0.5 * clamp(lead / 15, 0, 1);
}
export function captureTempoScale(state, me): number {
  const lead = raceLead(state, me);
  return 1 + 0.5 * clamp(-lead / 15, 0, 1);
}
```

---

## 4. Paranoid Opponent Model (Decision 3)

Today Pro assumes opponents play Medium — a tame, predictable roommate. The
search therefore never sees a reason to fear, bait, or pre-empt.

**New default for Pro:** at opponent policy nodes, the opponent picks the move
that minimizes *my* evaluation one ply later (best-response against me):

```ts
// policy.ts — factory keeps the injected-policy architecture (no circular dep)
export function paranoidPolicy(
  me: Color,
  simulateMove: (state: GameState, move: Move | null) => GameState,
): OpponentPolicy {
  return (state, moves) => {
    if (moves.length === 0) return null;
    let worst = moves[0];
    let worstScore = Infinity;
    for (const m of moves) {
      const after = simulateMove(state, m);
      const s = evaluate(after, me);          // from MY perspective
      if (s < worstScore) { worstScore = s; worst = m; }
    }
    return worst;
  };
}
```

- `search.ts` exports `simulateMove` (the existing private `simulate`, made
  public — it is the same zero-desync engine replay).
- `policy.ts` passes `paranoidPolicy(me, simulateMove)` as the injected
  opponent model for `pro`. Hard keeps its no-search shape; Easy/Medium
  untouched.
- **Deterministic** — tie-break by move order; tests pin exact choices.
- **Cost:** N eval calls per opponent node (N ≈ 1–3 legal moves). Covered by
  the budget gate (§9); depth is what we trade, and the TT (§5.1) pays it back.

**Optional mix (declared, off by default):** `opponentBlend: 'paranoid' |
'medium' | 'mixed'` config for experiments during 5C-4. Default ships paranoid.

---

## 5. Search Upgrades

### 5.1 Transposition table (Decision 4)

```ts
// search.ts
// Key: progress vector (16 tokens × 57 values packed to a string) + currentPlayer + phase.
// Bounded Map; CLEARED at every searchBestMove root call.
const tt = new Map<string, number>();   // module-scoped, cap ~50_000 entries
```

- Lookups at expectimax entry; stores at computed nodes.
- Per-root clearing means zero staleness across turns and zero memory growth
  between moves. No cross-game leakage.
- Test: a position reached via two move orders returns identical scores with
  the TT on, and the TT-hit count > 0 for a depth-4 search on the standard
  benchmark position.

### 5.2 Capture extensions (Decision 5)

When a simulated move `isCapture`, the child node is evaluated at `depth`
instead of `depth − 1` (the fight deserves one extra look). Hard cap: 2
extensions per path — prevents explosion under capture chains.

### 5.3 What is NOT changing

- Expectimax structure and phase-aware node typing (amendment A) — untouched.
- Null-safe simulate (amendment B) — untouched.
- `fixedDepth` for deterministic tests (amendment D) — untouched.
- Iterative deepening + 80 ms budget (raised to 120 ms cap per Decision 9) —
  untouched.
- Zero-desync guarantee: every simulation still goes through `applyAction`.

---

## 6. Behavioral Test Inventory — personality made verifiable (Step 5C-2 gate)

Crafted positions, `fixedDepth` pinned, all deterministic. These are the
acceptance tests for "is it actually competitive?" — if a behavior can't be
pinned by a test, it doesn't count.

| # | Test | Asserts |
|---|---|---|
| P-1 | **Hunts** | Two advances equal in race value; one moves into capture range of an opponent token. Pro picks the one that creates a shot |
| P-2 | **Targets the leader** | Opponent A has 3 tokens near home; opponent B is in the yard. A capture of A's token and an equal-value capture of B's both available → Pro takes A's |
| P-3 | **Refuses bait** (kept from 5B-2, extended) | Capture available, but paranoid reply recaptures next turn → Pro declines |
| P-4 | **Defends a lead** | Pro ahead in ETF; choice between exposed +2 progress and safe-cell +1 → Pro parks safe |
| P-5 | **Gambles when behind** | Same geometry, Pro far behind → Pro takes the exposed line (captureTempoScale) |
| P-6 | **Spreads** | Early game, two tokens movable: advance the leader vs. activate a second token on a safe entry → prefers spread when race-safe |
| P-7 | **Endgame focus** | 3 tokens finished, last token needs exact roll; rival closing fast → no wasteful moves; exact-finish awareness holds |
| P-8 | **Trap hold** | Pro on cell X, opponent 4 cells behind must pass X's neighborhood; Pro has safe cell within 6 ahead. Pro stays (holds the dangerous square) rather than wandering off |

Unit tests (5C-1 gate):

| Suite | Cases |
|---|---|
| `features.test.ts` | ETF monotonicity (6), yard cost > track cost, finished = 0, raceLeader picks min-ETF opponent (4-player crafted), shot geometry both directions (4), no shot on safe cells, leader-tax weighting, totalExposure aggregates per-token |
| `evaluate.test.ts` (extended) | monotonicity zones hold with new weights, evaluate deterministic, weights injectable (tuning seam) |
| `search.test.ts` (extended) | TT correctness across move orders, extension cap respected, paranoid policy picks argmin-of-my-eval (crafted), determinism with paranoid model |

---

## 7. Steps, Gates & Estimates

| Step | Deliverable | Est. | Gate |
|---|---|---|---|
| **5C-1** | `features.ts` + rewritten `evaluate.ts` (weighted) + re-anchored scales | ~1 d | Feature unit tests green · monotonicity invariant holds · **all prior tests unmodified & green** (frozen: 16 `evaluate.test.ts`) · Medium behavior unchanged. ✅ Shipped (`6cc5cba`, `cedaec1`, `62244dc`, 278 tests); includes a correctness fix making `searchBestMove` honor its budget *inside* the recursion (leaf-fallback on deadline). Hard eval-inheritance **moved to 5C-2** after code audit disproved automatic inheritance |
| **5C-2** | Paranoid model + TT + capture extensions; P-1…P-8 behavioral tests | ~1 d | Existing search tests green · perf: p95 ≤ 120 ms desktop on benchmark position · lint + build clean · structural P-tests green · weight-sensitive P-tests committed as documented `it.skip` (F-2). **Progress:** 2a/2b/2c shipped (`490bf2a`, `2665c6f`, `895b859` + audit fix `0ae4c3c`); P-3 fixture + weight-coupling finding committed (`166070c`). Hard full-eval wiring rejected (F-1). **Remaining:** structural P-tests (hunt, spread, endgame) |
| **5C-3** | `tools/bot-benchmark.ts` — placement ladder via vite-node (`.mjs` replaced: plain Node can't import TS; vite-node is headless, no browser/R3F, outside vitest CI), seeded, placement proxy (v1 ends at first winner — documented), mean turns-to-finish stall early-warning | ~0.5 d | ✅ Shipped (`9a70473`): `npm run bench` + committed baseline `docs/reports/5C-baseline.md` (seed 42). Headline: **Pro 40% vs Medium at pre-tuning weights** — but n=10 (CI ≈ [12%, 74%]); direction matches F-2, number not yet tunable. Hard 51% vs Medium (anomaly improved from 18%, not closed) |
| **5C-4** | **Prerequisite step:** wire advantage-scaling into `evaluate()` — exposure term × `riskScale`, shotPressure term × `captureTempoScale` (enables P-4/P-5; re-run frozen gate — the two sign-test fixtures have zero exposure, so they must stay green). Regenerate baseline post-wiring (Pro rows ≥ 30 games — n=10 is noise for hill-climbing). Then offline weight tuning (coordinate ascent on `EVAL_WEIGHTS`; Hard's lever is the shared ETF-anchored scale constants, not `EVAL_WEIGHTS` — F-1), seeded tournaments, champion weights committed | ~1 d + overnight runs | **Placement ordering holds:** Pro > Hard > Medium > Easy · Hard placement-beats Medium ≥ 55% (explicit demotion to ≥ 52% + backlog if unreachable — never silent) · Pro placement-beats Medium ≥ 65% at ≥ 30 games · monotonicity invariant still holds for champion weights · **all skipped P-tests unskipped and green** (F-2 skip policy) |
| **5C-5** | Human playtest + feel pass | ~0.5 d | Playtest checklist: bot visibly hunts / targets leader / traps at least once per game vs Pro · **user sign-off** |

**Stop conditions (project discipline):**
- If a 5C-1/5C-2 gate fails on a *prior* test, the change is wrong — prior
  assertions are never edited to make 5C green (R&S §7.1 applies verbatim).
- If tuning (5C-4) cannot reach ordering after 3 weight iterations, stop and
  re-examine features — do not loosen the metric.

---

## 8. The Benchmark & Tuning Loop (5C-3 / 5C-4 detail)

### 8.1 Placement metric (Decision 6)

Winner-count needs ~500 games to separate tiers in a 4-player dice game;
*finishing order* carries far more signal per game.

```
Per game: record finish order [1st, 2nd, 3rd, 4th].
Pairing (A vs B): A "placement-beats" B iff rank(A) < rank(B)
                  (both bots also race two filler opponents — fixed Easy×2 or
                   mirror pairing, documented in the report).
Report: placement-beat rate per pairing + mean rank per tier.
```

### 8.2 Harness shape

```
tools/bot-benchmark.mjs
  --pairings hard:medium,pro:hard,pro:medium,...
  --games 200 --seed 42 --weights <optional path>
  → prints placement table + writes docs/reports/*.md
```

Headless: drives `applyAction` directly (same loop as `ladder.test.ts`),
seeded RNG, runs under plain Node — no browser, no R3F. CI keeps only the fast
integrity ladder; the benchmark is a local/overnight tool.

### 8.3 Tuning loop

1. Freeze candidate features list (§3).
2. Coordinate ascent: for each weight, try {×0.5, ×0.75, ×1.5, ×2} around the
   current champion; run 100-game placement tournaments vs the previous
   champion; keep improvements.
3. 3 passes max per session; seeds rotate per pass; a **holdout seed set**
   validates the final champion (guards seed-overfitting).
4. Champion weights committed to `EVAL_WEIGHTS` with the report linked in the
   commit message. The previous champion stays in git history — always
   revertible.

---

## 9. Performance Budget (Decision 9)

| Constraint | Value | Enforced by |
|---|---|---|
| Pro root decision p95 (desktop) | ≤ 120 ms | perf test in search.test.ts (budget mode) |
| Pro root decision p95 (mobile) | ≤ 250 ms | manual profile at 5C-5; think-delay absorbs |
| TT memory | ≤ 50k entries, cleared per search | size guard in search.ts |
| Extension explosion | ≤ 2 per path | hard cap, tested |
| Ladder CI time | unchanged (~20 s) | benchmark lives outside CI |

---

## 10. Explicitly OUT of 5C

- Neural nets / MCTS / reinforcement learning with function approximation —
  research-grade, and dice cap the ceiling anyway (v2-research at best).
- Runtime learning or per-player adaptation — weights freeze at build time.
- Easy/Medium personality changes — they exist to be beaten.
- New difficulty tiers or UI changes — in-place upgrade (Decision 1).
- Engine/rules/events changes — contract freeze (Decision 10).
- 2-player-specific bot tactics — 4-player placement metric covers v1.

---

## 11. Risk Register

| Risk | Mitigation |
|---|---|
| Paranoid model makes Pro *too* defensive (never leaves safe cells) | P-1/P-5 tests pin aggression when ahead/behind; `opponentBlend` experiment hook; shot-pressure term pulls toward fights |
| Feature interactions destabilize Hard (which shares `evaluate`) | Ladder placement gate (5C-4) explicitly requires Hard > Medium; regression = gate fail, not "expected drift" |
| TT bugs return stale/wrong scores | Per-root clearing; move-order equivalence test; TT disabled via option for bisecting |
| Tuning overfits seeds | Rotating seeds + holdout validation before champion commit |
| Perf regression on mid-range phones | Budget gate in 5C-2; think-delay hides ≤1.4 s; TT can be gated off on `low` tier if ever needed |
| Monotonicity broken by tuned weights (bot resists entering home column — the amendment-C bug class) | Invariant test runs against every shipped weight set; rejected run ≠ edited test |
| Scope creep into engine changes ("just one small rule hook") | Contract freeze (Decision 10); ESLint layer rules unchanged |
| Benchmark runtime balloons | Games capped per session; harness headless; CI untouched |

---

## 12. Cross-Check vs Existing Docs

| Commitment | Source | 5C stance | ✅ |
|---|---|---|---|
| Zero desync — simulate via `applyAction` | 5B arch §3.4 | Preserved; paranoid model reuses the same simulate | ✅ |
| Amendments A/B/D (phase-aware, null-safe, fixedDepth) | 5B plan §1 | Untouched | ✅ |
| Circular-dep break via injected opponent policy | 5B plan §8 | Preserved — paranoid is an injected policy | ✅ |
| Oracle purity (no react/three) | v3 §1/§14 | All new files in `oracle/ai/` + `tools/` | ✅ |
| `Move.tokenIds[]` contract | R&S §2.1 | All new code uses `tokenIds` | ✅ |
| T-1 (offline benchmark + tuning) | Audit §2/§4 | Absorbed as 5C-3/5C-4 with a stronger metric (placement) | ✅ (upgrade) |
| Hard < Medium anomaly must be fixed with data, not assertion edits | Audit 5B-4 row | 5C-4 gate requires Hard placement ≥ 55% vs Medium | ✅ |
| GSAP/Director/Stage untouched | v3 §2 | No rendering-layer files in this plan | ✅ |

**No architectural contradictions.** 5C is a brain transplant behind a frozen
interface: `chooseBotMove` in, better Ludo player out.

---

## 13. Definition of Done — Phase 5C

- [ ] New eval live for **Pro** — Hard stays on the v1 heuristic (Finding F-1); Easy/Medium byte-identical behavior.
- [ ] P-1…P-8 behavioral tests green (personality is *proven*, not vibes).
- [ ] Paranoid model + TT + extensions shipped within perf budget.
- [ ] Benchmark report committed: placement ordering Pro > Hard > Medium > Easy.
- [ ] Hard placement-beats Medium ≥ 55% (18% anomaly closed).
- [ ] Champion weights committed with their report; monotonicity invariant green.
- [ ] All 249 prior tests green **unmodified**; lint + build clean.
- [ ] Human playtest: "it fights back" — user sign-off.
