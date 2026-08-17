# Implementation Plan — Phase 5D (Multi-Dice Mode)

> **Status:** Ready for execution. Design approved (`PHASE-5D-MULTI-DICE-ARCHITECTURE.md`,
> Amendment A1 @ `8673c74`). This doc is the build order — file-by-file, test-first,
> gated. No code has been written.
>
> **Companions:** the design doc (decisions — read §2 first), `PHASE-5C-COMPETITIVE-BOT.md`
> (the bot machinery being extended), `ARCHITECTURE-v3.md` (layer rules).
>
> **Baseline:** `main` @ `8673c74` · 312 passed + 3 documented skips (315 total) ·
> lint ✅ · build ✅ · clean tree.

---

## 0. Ground rules (carried from 5C, binding on every step)

1. **TDD**: every behavioral change lands as RED → GREEN in the same commit.
2. **Frozen gate**: all **315 prior tests pass unmodified** at every step. A prior
   test breaking = contract violation → fix the change, never the test.
3. **The alias is sacred**: `dice.value === dice.queue[0] ?? null` at all times.
   It is what keeps `ladder.test.ts:46`, `useGame.fullgame.test.ts:69`,
   `game-runner.ts`, `App.tsx`, `Dice.tsx`, `DebugHarness` source-compatible.
4. **Additive-only public surfaces**: events gain fields (`DICE_ROLLED.values`,
   `TURN_CHANGED.extraTurn`, `TurnRecord.rolls`); existing fields (`value`,
   `roll`) are never removed in 5D. Removal is a v2 cleanup, not now.
5. **One commit per sub-step**, gates re-run per commit (`test` + `lint` + `build`).
6. **F-3 discipline**: benchmark numbers are regression-only. No ladder-adoption
   claims anywhere in 5D.
7. **Threat-table standing instruction**: the prefix-landing threat table gets its
   OWN invariants from day one. Sum-table invariants (rows-sum-to-1, symmetry)
   are pinned for the sum table only and are **forbidden** on the threat table.

---

## 1. Two plan-level amendments to the design doc (A2 — flag for reviewer, small)

Both are implementation realities the design doc doesn't state. They stay inside
its decisions; they just need recording:

- **A2.1 — `dice.capturedInSet: boolean`** (inside the `dice` object). Decision 6
  (capture extra-turn evaluated once, at end of set, on "any die captured")
  requires carrying capture info across the per-die `RESOLVE_MOVE` calls. The
  flag resets at `REQUEST_ROLL` and ORs per die. Without it, end-of-set would
  have to scan `turnHistory` backwards (fragile). Kept inside `dice` so §3.1's
  "the only state change is the dice object" remains true.
- **A2.2 — `getLegalMoves(state, dieValue)` stays**; callers pass
  `state.dice.queue[0]`. No signature change anywhere in `rules/`.

---

## 2. Branch & sequencing

Branch `phase-5d-multi-dice` off `main`. Sub-steps commit in order; each has its
own gate. 5D-1 is the heart (engine); 5D-3 is the second-largest (bots). 5D-4/5
are Director/Stage. 5D-6 is playtest.

```
5D-1a types+rules ─► 5D-1b roll ─► 5D-1c resolve-roll+burn ─► 5D-1d per-die move
     ─► 5D-1e equivalence battery ─► 5D-2 schema/events ─► 5D-3a dice-math
     ─► 5D-3b bands ─► 5D-3c search+stall ─► 5D-4 Director ─► 5D-5 selector
     ─► 5D-6 playtest
```

---

## 3. Step 5D-1 — Engine queue contract (Oracle)

### 5D-1a — Types & rules field (RED→GREEN, ~8 tests)

**Files:** `src/oracle/types.ts`, `src/oracle/config/rulesPreset.ts`, new
`src/oracle/__tests__/diceQueue.test.ts`.

- `RulesConfig` gains `diceCount: 1 | 2 | 3 | 4` (Dice & Turn Flow block, after
  `entryRoll`). `V1_RULES` and `soloRules()` set `diceCount: 1`.
- `GameState.dice` becomes the A1 shape:

```ts
dice: {
  queue: number[];        // remaining dice, DESCENDING (A1 Decision 14)
  rolledSet: number[];    // full set as rolled (pre-sort), for UI + history
  value: number | null;   // A1 COMPAT ALIAS === queue[0] ?? null — invariant-tested
  rolled: boolean;
  capturedInSet: boolean; // A2.1 — reset at REQUEST_ROLL, ORed per die
};
```

- `TurnRecord` gains `rolls?: number[]` (additive; `roll` stays = first die played).
- `createInitialState` builds the new shape (queue `[]`, all zeros/nulls).
- **Tests (RED first)**: alias invariant helper `expectAlias(state)` used
  everywhere later; shape at init; `diceCount` default 1 in both presets;
  `RulesConfig` type-level presence. Gate: 315 + new green (all existing tests
  construct `dice` via `createInitialState`/`stateWithPlacements` — verify none
  hand-write `dice: {value…}`; `grep "dice: {" src --include="*.test.ts"` first
  and patch the *helper* if needed, never the tests).

### 5D-1b — Roll the set (RED→GREEN, ~6 tests)

**Files:** `src/oracle/rules/dice.ts`, `src/oracle/engine.ts` (`handleRequestRoll`), `src/bus/events.ts`.

- `dice.ts`: `rollSet(rng, count): number[]` (calls `rollDice` count times).
  `rollDice` and `pinnedRng` unchanged — a pinned `[6,3]` sequence scripts a
  2-dice set exactly (search/tools keep working).
- `handleRequestRoll`: `const set = rollSet(rng, rules.diceCount)`; store
  `rolledSet = set`, `queue = [...set].sort((a,b) => b-a)` (descending, A1),
  `value = queue[0]`, `capturedInSet = false`; phase `ROLLING`; emit
  `DICE_ROLLED { player, values: set, value: set[0] }` — **additive** (A1/rule 4).
- **Tests**: 2-dice pinned `[3,6]` → queue `[6,3]`, value 6, rolledSet `[3,6]`;
  1-dice pinned → queue length 1, value === rolledSet[0] (equivalence anchor);
  `capturedInSet` false at roll; event carries both fields; out-of-phase reject
  unchanged.

### 5D-1c — Resolve roll + burn-loop entry (RED→GREEN, ~7 tests)

**Files:** `src/oracle/engine.ts` (`handleResolveRoll`).

- Compute moves for `state.dice.queue[0]` (A2.2 — `action.value` no longer drives
  move computation; keep it in the `Action` type untouched for contract stability,
  DEV-only `console.warn` if it disagrees with `queue[0]`).
- Moves exist → `SELECTING_TOKEN` (unchanged shape).
- **No moves for `queue[0]`** → burn-loop: emit `DIE_BURNED { player, value }`,
  `queue.shift()`, update `value` alias, repeat while queue non-empty:
  - moves appear → `SELECTING_TOKEN` for the next die;
  - queue empties with **zero moves played** → v1 `NO_LEGAL_MOVE` path exactly:
    `resolveTurn(state, setHasSix, false, setHasSix ? consecutiveSixes+1 : 0)`,
    turn pass, `dice` cleared. (`setHasSix = rolledSet.includes(6)` — Decision 5.)
- `DIE_BURNED` added to `GameEvent` (new event — no consumer breaks).
- **Tests**: burn-first-die-play-second (pinned `[3,6]`, no legal 3-use, legal
  6-use → SELECTING for 6); burn-all → NO_LEGAL_MOVE + turn pass; six in a fully
  burned set still counts toward extra-turn/consecutive logic; 1-dice no-move →
  byte-identical v1 path (equivalence).

### 5D-1d — Per-die RESOLVE_MOVE + end-of-set (RED→GREEN, ~10 tests)

**Files:** `src/oracle/engine.ts` (`handleResolveMove`).

- Steps 1–3 (commit move, captures, **win check**) run per die exactly as v1 —
  win mid-set → `GAME_OVER` immediately, dice cleared (Decision 7). Capture sets
  `capturedInSet = true` and appends `TurnRecord { roll: dieValue, rolls: rolledSet }`.
- After a non-winning move: `queue.shift()`, alias update.
  - Queue non-empty → burn-loop check (§5D-1c) for the next die → `SELECTING_TOKEN`
    or continue burning; **stay in the set** (no turn resolution yet).
  - Queue empty → **end-of-set resolution, once**: `rolledSix = rolledSet.includes(6)`
    (Decision 5 — a double-6 set increments `consecutiveSixes` by exactly 1);
    `captured = dice.capturedInSet` (Decision 6); `resolveTurn(...)` as v1; clear
    dice; `TURN_CHANGED { nextPlayer, extraTurn: !turn.advanced }` (additive flag).
- **Tests**: both dice same token (pinned `[6,3]`: token hops 6 then 3 — two
  TOKEN_MOVED, two TurnRecords, one turn); split tokens; 6-entry then 3-advance
  (Decision 8 — second die playable after yard entry); double-6 = ONE extra turn
  and consecutiveSixes +1 not +2; capture on die 1 + finish-adjacent play on die 2
  → single end-of-set resolution; win mid-set discards remaining queue; extra-turn
  flag on TURN_CHANGED; `consecutiveSixes` forfeit path at sixesLimit with a set.

### 5D-1e — Equivalence battery + hard gate (~6 tests)

- New `diceEquivalence.test.ts`: seeded 200-turn diceCount:1 games driven through
  `applyAction` with pinned RNG — assert queue length ≤ 1, alias holds, events
  carry `value === values[0]`, `TurnRecord.roll === rolls[0]`, no `DIE_BURNED`
  ever fires, game terminates.
- **HARD GATE**: full suite — **all 315 prior tests unmodified & green** + all new
  5D-1 tests + lint + build. `tools/game-runner.ts` must run unchanged (alias).
  This is the step's exit; do not proceed on anything less.

---

## 4. Step 5D-2 — Schema, validator, event consumers

**Files:** `settingsSchema.ts`, `validateRules.ts` (+ tests), `AudioBus.tsx`
(`DIE_BURNED` blip variant — reuse `ui.mp3`), event type consumers compile-check.

- `SettingField` for `diceCount`: enum `['1','2','3','4']`, default `'1'`,
  category "Dice & Turn Flow", `since: 'v1.1'` — **new scope level added to the
  `since` union and the `CURRENT_SCOPE` type** (A1); `CURRENT_SCOPE` itself stays
  `'v1'` until 5D-5.
- `validateRules`: no new hard conflicts; soft warning `diceCount ≥ 3 &&
  turnTimerSec !== null` ("sets may expire mid-choice"). Matrix rows for the four
  §3.5 rulings (documented in test comments; `forcedCapture`/`optionalPass` are
  off in all presets — ruling tests are validator-level, not engine-level).
- **Gate**: schema/validator tests green (every key exactly one field — the
  invariant test extends to `diceCount`), 315+new green, build clean.

---

## 5. Step 5D-3 — Bot adaptation (the migration promise)

### 5D-3a — Dice math module (RED→GREEN, ~10 tests) — the standing instruction lives here

**New file:** `src/oracle/ai/diceMath.ts` (pure, Oracle).

```ts
export function meanStep(diceCount: number): number;        // 3.5 * n
export function yardExitTurns(diceCount: number): number;   // 1/(1-(5/6)^n)
/** P(an opponent holding k dice lands EXACTLY on distance d this turn) —
 *  prefix-landing: capture fires on ANY per-die landing (descending prefix
 *  sums), NOT only the final sum (A1). */
export function threatProb(k: number, d: number): number;
export const THREAT_REACH: (k: number) => number;           // 6k
```

- `threatProb` derives from the unordered-multiset table (21 at k=2):
  P(d) = P(max die = d) + P(sum = d) for k=2 (disjoint events), generalized to
  prefix sums for k=3..4.
- **Invariants (pinned, per the standing instruction)**:
  - k=1: flat 1/6 for d∈1..6, 0 beyond — reduction to v1;
  - pointwise ≥ the plain sum-table (superset property);
  - per-d marginals do **not** sum to 1 (a set threatens multiple distances);
  - exact k=2 values pinned: P(1)=1/36, P(2)=4/36, P(6)=16/36, P(7)=6/36,
    P(12)=1/36, P(13)=0;
  - the SUM table (built for ETF/search weighting) separately pinned: rows sum
    to 1, symmetry P(d)=P(7k−d) — and a comment forbidding these on `threatProb`.
- `meanStep(2)=7`, `yardExitTurns(2)=36/11≈3.27` pinned.

### 5D-3b — Bands & ETF go dice-aware (RED→GREEN, ~10 tests)

**Files:** `features.ts`, `threats.ts` (+ tests).

- `tokenETF(progress, diceCount = 1)` — **default param keeps every frozen call
  site/test unmodified**. Internals use `meanStep`/`yardExitTurns`. `colorETF`/
  `raceLeader`/`raceLead` pass `state.rules.diceCount` through.
- `exposurePenalty`/`totalExposure`: the flat 1/6 per threatening opponent
  becomes `threatProb(rules.diceCount, behind)` for `behind ≤ 6·diceCount`
  (immediate zone widens; per-d weighting exact).
- `ANTICIPATION_BAND_MIN/MAX` constants become functions
  `anticipationBand(diceCount)` = `(6n+1, 12n)`; `captureShots`, `ambushPressure`,
  `safeHaven`, `anticipationDanger` take the immediate zone 1..6n with
  `threatProb` weighting; the 5C-7 one-roll haven rule generalizes to ≤ 6n.
- **Tests**: band edges at n=1 (7..12 — pin v1 behavior), n=2 (immediate 1..12,
  anticipation 13..24); ETF monotonicity per diceCount (extend the frozen
  monotonicity test *pattern* in new tests — the frozen file is untouched);
  haven hot at 7 behind when n=2, cold at 13; exposure weight at d=6, n=2 equals
  16/36 × tokenValue.

### 5D-3c — Search chance node + stall-guard (RED→GREEN + perf)

**Files:** `search.ts`, `policy.ts` (chance enumeration), `tools/game-runner.ts`
(+ `--dice N` flag: rules override `diceCount`), `tools/bot-benchmark.ts` (flag
pass-through).

- Chance node at `IDLE`: enumerate **unordered multisets** of
  `rules.diceCount` dice with exact weights (21 at 2), resolve the queue
  sequentially (descending) — no allocation branching. `simulateRoll` pins the
  RNG per die of the multiset.
- Paranoid model unchanged (it replays through `applyAction`, which now
  understands sets — zero policy change).
- **Gate**: new search tests (multiset weights sum to 1 at k=2; depth-4
  fixedDepth perf ≤ 120 ms **at diceCount 2**; determinism holds); full suite
  green; **stall-guard**: `game-runner` at `--dice 2`, 30 Pro games — 100%
  termination, mean turns ≤ 2500 AND **< the diceCount-1 mean** (games must be
  faster — that's the user's speed goal, made mechanical). Regression-only
  reporting, no claims.

---

## 6. Step 5D-4 — Director (no Oracle changes)

**Files:** `Dice.tsx`, `dicePips.ts`/`diceRoll.ts` (set tumble), `AudioBus.tsx`,
ControlBar (queue pips), `botDriver.ts` (optional: shorter think-delay for
non-first dice in a set — polish, not gate).

- Render `diceCount` dice; tumble plays the set; **dim played/burned dice**
  (queue is the source of truth); `DIE_BURNED` → subtle blip; single roll sound
  per set; 150 ms beat between same-token hops (pacing rule §4).
- **Gate**: manual visual check at 2 dice (roll → dim → burn blip → extra-turn
  flow); lint + build + suite green.

## 7. Step 5D-5 — Entry point & scope bump

**Files:** `App.tsx` ControlBar (dice selector, cycle 1→2→3→4, mirroring the
difficulty-button pattern), `settingsSchema.ts` (`CURRENT_SCOPE = 'v1.1'`).

- Selector applies via `useGame.reset({ ...rules, diceCount })` — new game
  required (rules immutable per game, R&S §1.1).
- **Gate**: 2-dice hotseat AND 2-dice solo-vs-Pro playable end-to-end (manual);
  `fieldsForScope('v1.1')` returns v1 fields + diceCount only (v1.5 still
  hidden); suite green.

## 8. Step 5D-6 — Playtest + bench sanity

- User checklist (DoD in the design doc §10): faster games, same/different-token
  assignment works, **sniping visible** (a 7–12 distance capture in a real game —
  record the clip/description), no stalls, v1 mode still feels identical.
- Bench at dice 1 vs 2 committed as regression-only numbers.

---

## 8.1 Step 5D-7 — Amendment A3 (user playtest rulings, BEFORE sign-off)

First playtest overturned two decisions (design doc Amendment A3). Both fixes
are equivalence-safe at `diceCount: 1` and land before merge.

### 5D-7a — All-six extra turn (A3.2, RED→GREEN, small)

**Files:** `engine.ts` (`endOfSet` + fully-burned path), `diceQueue.test.ts`
additions.

- `rolledSix = rolledSet.every(d => d === 6)` everywhere the set's six-ness is
  read (end-of-set AND the fully-burned NO_LEGAL_MOVE path — keep them
  consistent or the announce/silence asymmetry returns).
- **Tests**: 2-dice `[6,4]` → NO extra turn (the playtest case); `[6,6]` →
  exactly ONE extra turn + consecutiveSixes +1; `[6,6,6]`/`[6,6,6,6]` same
  ruling; diceCount-1 `[6]` → extra turn (equivalence anchor, `every` ≡
  `includes` for one die). Gate: full suite green, 315-prior rule holds.

### 5D-7b — Player-chosen die order (A3.1, RED→GREEN, the larger half)

**Files:** `types.ts` (`REQUEST_MOVE` gains `dieValue?: number`), `engine.ts`
(`handleResolveRoll` computes moves across ALL remaining dice — burn-loop
removes only dice with zero moves of their own; `pickMove` resolves by
(tokenId, dieValue), omitted → queue head), `legalMoves.ts` (per-die move
production tagged with the die), `botDriver.ts` + `policy.ts`/`search.ts`
(pass/choose `dieValue`; descending stays the bot default).

- **Contract guard:** at `diceCount: 1` every code path is byte-identical
  (omitted `dieValue` → queue head); the (tokenId, dieValue) pair is unique,
  so the 5B-2 ambiguity stays dead — pin it: two same-value dice `{6,6}`
  moving one token are interchangeable (either resolves identically).
- **Tests**: `{3,6}` set, victim at distance 6 → human plays 6 first and
  captures (the playtest case); same set, 3 first → different landing;
  ambiguous tokenId without `dieValue` at k=2 → engine rejects (no guessing);
  burn-loop with mixed playability per die; bots still terminate (stall-guard);
  equivalence battery re-run (the hard gate).

### 5D-7c — Director affordance (manual gate)

- SELECTING_TOKEN with k>1: remaining-pips readout is the die chooser —
  highlight legal targets per die; when one token is movable by two different
  dice, pip selection disambiguates (tap pip → tap token). Bots unaffected.
- **Gate**: human plays `{3,6}` both orders in a real game; dim-on-play and
  the announce flow still correct; 5D-4 visual items re-checked.

### 5D-7d — Re-playtest (5D-6 checklist + the two A3 cases)

- Same/different-token assignment **with free order**, all-six extra turns,
  sniping, no stalls, v1 identical. Then sign-off → merge.

---

## 9. Risk register (execution-level, beyond the design doc's)

| Risk | Mitigation |
|---|---|
| A test hand-writes `dice: {value…}` and breaks on the shape change | 5D-1a greps first; patch the *helper*, never tests; alias carries the rest |
| `handleResolveRoll` silently uses stale `action.value` somewhere | Move computation to `queue[0]` + DEV warn on disagreement; equivalence battery catches drift |
| Double-counted extra turns (six per die instead of per set) | Decision-5 test pins consecutiveSixes +1 for a double-6 set |
| `threatProb` accidentally built as sum-table (the D-3 class) | Standing instruction: its OWN invariants from 5D-3a's first commit; reviewer checks the exact-value pins (16/36 at d=6,k=2) |
| Search blows the budget at k=2 (36-child chance node sneaks in) | Multiset enumeration test (21 children) + perf gate at diceCount 2, not 1 |
| Director races ahead of engine between dice | No Director change drives sets — engine remains the only sequencer; dim-on-play reads queue |
| Scope union change ripples into Stage | `since: 'v1.1'` added to the union; `CURRENT_SCOPE` bump deferred to 5D-5 so UI surfaces nothing early |

---

## 10. Definition of Done (mirrors design §10, made checkable)

- [ ] 5D-1e hard gate: 315 prior unmodified + ~37 new engine tests green.
- [ ] 2-dice hotseat + solo-vs-Pro end-to-end (5D-5 manual).
- [ ] `diceCount: 1` equivalence suite green (queue ≤ 1, alias, no DIE_BURNED).
- [ ] Threat table invariants green (incl. exact k=2 pins; sum-invariants only
      on the sum table).
- [ ] Depth-4 ≤ 120 ms at diceCount 2; stall-guard green at 1 and 2; mean turns
      at 2 < at 1.
- [ ] Sniping observed in a real game (playtest evidence recorded).
- [ ] User sign-off on the 5D-6 checklist.

---

## 11. Cross-check

| Commitment | Source | This plan |
|---|---|---|
| Sequential queue, descending (A1) | design §1/§2.14 | 5D-1b/c/d |
| `value` alias keeps 315 tests unmodified (A1) | design §3.1 | rule 3 + 5D-1e gate |
| Prefix-landing threat model (A1) | design §5.1 | 5D-3a invariants (standing instruction) |
| Band constants were the whole bot migration (5C-6 promise) | 5C-6 §step1 | 5D-3b — verified: only the constants + a `diceCount` parameter |
| Oracle pure / Director listens | v3 §1/§14 | 5D-4 touches no Oracle file |
| Rules immutable per game | R&S §1.1 | 5D-5 selector → `reset()` |
| F-3 no ladder claims | 5C F-3 | rule 6; 5D-3c/5D-6 regression-only |
