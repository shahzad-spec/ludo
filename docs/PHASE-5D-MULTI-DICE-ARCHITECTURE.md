# Phase 5D — Multi-Dice Mode Architecture & Plan

> **Status:** Draft for review. No code until approved.
> **Origin:** user feature request (playtest, 2026-08-14): *"increase number of
> dice to speed up the game and make it more interesting — 2 dice, 2 numbers,
> both can be given to the same token or different tokens… with higher numbers
> hunting can be more aggressive, like sniping from far behind."*
> **Precedent:** this **overturns** R&S §6.2 *"Two/three-dice mode — likely
> never"* per its own overturn condition (*"only if core to vision"*). The
> overturn is recorded here so the decision trail stays append-only.
> **Companion docs:** `ARCHITECTURE-v3.md` (boundaries), `RULES-AND-SETTINGS-ARCHITECTURE.md`
> (interaction-matrix discipline), `PHASE-5C-COMPETITIVE-BOT.md` (the bot
> machinery this extends — anticipation band, ETF, paranoid model).
>
> **Amendment A1 (code-level verification pass, 2026-08-16):** three gaps found
> and fixed pre-approval — (1) queue order locked **descending** (new Decision
> 14), (2) `dice.value` kept as a compat alias so the unmodified-tests gate
> holds as written, (3) threat model corrected from dice-sum to the
> **prefix-landing distribution**. Architecture unchanged; amendments marked A1.
>
> **Amendment A3 (user playtest rulings, 2026-08-17):** two decisions overturned
> by the designer after hands-on play — **A3.1:** players now **choose which
> die to play next** (Decision 14 revised: descending survives as bot default /
> tie-break only; `REQUEST_MOVE` gains additive optional `dieValue`);
> **A3.2:** an extra turn requires **ALL dice to show six** (Decision 5
> revised: `rolledSet.every(d => d === 6)`; any-six snowballed at ~31% of
> 2-dice rolls). Both are equivalence-safe at `diceCount: 1` (single-die
> behavior byte-identical). Implemented as step 5D-7 before sign-off.

---

## 0. What the user asked for — verbatim intent

1. **Speed:** games run faster than single-dice v1.
2. **Choice:** a roll yields N numbers; the player assigns each to the same
   token or spreads them across tokens.
3. **Aggression:** with more numbers available, hunting becomes richer —
   *"sniping from far behind"* must become a real behavior, not an accident.
4. **Safety instinct:** a token not on a safe cell should actively consider
   reaching one (already partially delivered by 5C-6/5C-7; multi-dice widens
   the threat geometry it must react to).

---

## 1. The load-bearing decision: SEQUENTIAL dice

Two architectures exist for multi-dice Ludo:

| | **Simultaneous allocation** | **Sequential resolution (CHOSEN)** |
|---|---|---|
| Model | Roll N dice; player plans an allocation of all N across tokens at once | Roll N dice; player makes N consecutive single-die decisions, each with full knowledge of the remaining dice |
| Engine | New compound-Move type; allocation search space (combinatorial) | `dice` becomes a **queue**; the existing REQUEST/RESOLVE cycle repeats per die |
| Bot search | Allocation branching explodes (moves^N per roll) | Chance node widens once (6^N outcomes at the roll), then the familiar per-die tree |
| Player clarity | Must reason about combinations | One decision at a time — identical UX rhythm to v1 |
| Expressiveness | Same reachable positions | Same reachable positions (assigning dice one-by-one spans every allocation) |

**Decision: sequential.** It reuses the phase machine, keeps the zero-desync
guarantee trivially, and — critically — gives the user's "same token or
different tokens" choice for free: playing die 1 on token A then die 2 on
token A = both to one token; die 2 on token B = spread. No new Move shape.

**Consequence worth stating plainly:** "sniping from far behind" emerges from
*stacking dice onto one chaser* (2 dice → up to 12 cells in one turn; 3 → 18;
4 → 24) and from *splitting* (two chasers advance in the same turn). The bot
gets this behavior by searching the sequential tree; humans get it by clicking
twice.

---

## 2. Locked decisions

| # | Decision | Value | Rationale |
|---|---|---|---|
| 1 | Resolution model | **Sequential** (§1) | Reuses phase machine; zero new Move shape; spans all allocations |
| 2 | Dice counts | `diceCount: 1 \| 2 \| 3 \| 4` in `RulesConfig` | User asked 2–4; 1 stays the default and the v1-preservation mode |
| 3 | Default for v1.1 ship | `diceCount: 1` unchanged; 2-dice available as an explicit preset/setting | v1 behavior must remain byte-identical unless the player opts in |
| 4 | Unplayable die | **Burn and continue** — if no legal move exists for the current die, it is discarded and the next die is played; the turn ends only when the queue empties | Standard casual-Ludo ruling; keeps tempo high (user goal #1) |
| 5 | Sixes & extra turns **(A3.2 — revised by user playtest)** | An extra turn requires **ALL dice in the set to show six** (`rolledSet.every(d => d === 6)` when `sixGrantsExtraTurn`); `sixesLimit` counts all-six turns. Any-six snowballed (~31% of 2-dice rolls); all-six ≈ 3% restores restraint. Byte-identical at diceCount 1 (`every` ≡ `includes` for one die) | User ruling, 2026-08-17 playtest |
| 6 | Capture-grants-extra-turn | Evaluated once, at **end of set**, using whether any die-move captured | One extra-turn decision per turn, not per die |
| 7 | Win during a set | Game ends immediately when the winning token finishes (v1 rule, unchanged — engine already terminates at first winner) | R&S consistency; no zombie dice |
| 8 | Yard entry | A die of the required entry value (per `entryRoll`) frees one yard token; other dice in the same set remain playable | Follows from sequential resolution automatically |
| 9 | Threat geometry | Reach of an opponent with k dice remaining = any value k..6k on ONE token (all dice stacked) or split pressure across tokens; exposure/anticipation bands become **dice-aware** (§5) | The user's "sniping" request, formalized |
| 10 | ETF model | `MEAN_STEP` → `3.5 × diceCount`; `YARD_EXIT_TURNS` → `1 / (1 − (5/6)^diceCount)` | Games genuinely faster; bots' race judgment stays calibrated |
| 11 | Bot search budget | Unchanged 120 ms cap; chance node branches over **unordered** dice multisets with probability weights (21 outcomes for 2 dice, not 36) | Keeps Pro responsive; unordered weighting is exact for uniform dice |
| 12 | Scope gating | New `SettingField` with `since: 'v1.1'`; `CURRENT_SCOPE` bumps when the Setup UI (WS-2) or the interim selector ships | R&S schema discipline — UI renders from data |
| 13 | Anti-stall | The F-1 stall-guard (100% termination, mean turns ≤ 2500) runs per diceCount at the 5D gate | Multi-dice must not reintroduce camping/stall classes |
| 14 | Queue order **(A3.1 — revised by user playtest)** | **Player chooses the next die** from the remaining queue: `SELECTING_TOKEN` presents legal moves across all remaining dice; `REQUEST_MOVE` gains additive optional `dieValue` and the engine resolves by (tokenId, dieValue). Descending order survives as the **bot default and tie-break** (unspecified `dieValue` at diceCount 1 → queue head; the 5B-2 ambiguity stays dead because the pair is unique). No new phases | User ruling, 2026-08-17: "I can't choose which dice I use first". Original descending-lock trade-off rejected after hands-on play |

---

## 3. Engine contract changes (Oracle)

### 3.1 State shape

```ts
// types.ts — the state change, with the A1 compat alias
interface GameState {
  // ... unchanged ...
  dice: {
    queue: number[];      // remaining dice to play this turn (v1: length ≤ 1)
    rolledSet: number[];  // the full rolled set, for UI display + history
    value: number | null; // A1 COMPAT ALIAS === queue[0] ?? null — v1 readers
                          // keep working untouched (see blast radius below)
    rolled: boolean;
  };
}
```

`dice.value` (v1 scalar) survives as a **derived alias of `queue[0]`** (A1).
**Compatibility rule:** every v1 behavior is recovered exactly at
`diceCount: 1` — pinned by tests.

**Blast radius (A1):** `dice.value` is read by `ladder.test.ts`,
`useGame.fullgame.test.ts`, `tools/game-runner.ts` (feeds bench + tune + the
F-1 stall guard), `App.tsx`, `Dice.tsx`, and `DebugHarness.tsx`. The alias
keeps all of them untouched — without it the 5D-1 "prior tests unmodified"
gate could not hold and the 5D-3 stall gate could not even run.

`TurnRecord` gains `rolls: number[]` (was `roll: number`) — history is
append-only data; the audit trail keeps both shapes readable.

### 3.2 Phase machine — no new phases

```
REQUEST_ROLL (IDLE)      → roll diceCount dice; phase=ROLLING; emit DICE_ROLLED{values[]}
RESOLVE_ROLL (ROLLING)   → queue = roll sorted DESCENDING (A3.1: bots' play
                           order / tie-break; humans choose per A3.1);
                           compute legal moves across ALL remaining dice
                           → SELECTING_TOKEN, or burn-loop (§3.3) if none
REQUEST_MOVE             → additive optional `dieValue` (A3.1): resolves by
                           (tokenId, dieValue); omitted → queue head (v1 path)
RESOLVE_MOVE             → commit move; captures resolved per-die (v1 logic)
                           → queue.shift()
                           → queue non-empty: legal moves for next die → SELECTING_TOKEN
                                                   (or burn-loop if none)
                           → queue empty: turn resolution (sixes/extra-turn/win per
                                          Decisions 5/6/7) → IDLE or GAME_OVER
```

**The phase enum is untouched.** Multi-dice is a queue inside the existing
handshake — this is the architectural payoff of Decision 1.

### 3.3 The burn-loop

When `RESOLVE_ROLL` or a post-move step finds **no legal move** for
`queue[0]`: emit `DIE_BURNED { value }` (new event — Stage/audio hook), shift
the queue, repeat. If the queue empties without any move played: emit
`NO_LEGAL_MOVE` and resolve the turn exactly as v1 does.

### 3.4 Events (bus/) — two widenings, one addition

```ts
| { type: 'DICE_ROLLED'; player: Color; values: number[] }   // was value: number
| { type: 'DIE_BURNED'; player: Color; value: number }       // NEW
| { type: 'TURN_CHANGED'; nextPlayer: Color; extraTurn: boolean } // extraTurn flag added
```

`TOKEN_MOVED` / `TOKEN_CAPTURED` unchanged — they already fire per individual
move, which is per die. **Director and Stage stay event-driven; they get
multi-dice behavior by listening, not by knowing.**

### 3.5 legalMoves / rules

- `getLegalMoves(state, dieValue)` — signature unchanged; called per die.
- `dice.ts`: `rollSet(rng, count): number[]` added; `roll(rng)` stays for v1.
- Interaction matrix additions (R&S §3 discipline):

| Combination | Ruling |
|---|---|
| `diceCount > 1` + `optionalPass` (v1.5 Batch C) | Pass applies to the *whole remaining set*, not one die |
| `diceCount > 1` + `turnTimer` | Timer covers the whole set; pause rules unchanged |
| `diceCount > 1` + `forcedCapture` | If any die can capture, the set's legal moves restrict to capture moves for that die only (per-die check) |
| `diceCount > 1` + `finishRule: 'exact'` | Unchanged per die — overshoot illegal for each individual die |

### 3.6 Settings schema

```ts
{ key: 'diceCount', label: 'Dice per turn', type: 'enum',
  options: ['1','2','3','4'], default: '1',
  category: 'Dice & Turn Flow', since: 'v1.1' }
```

`validateRules`: no new hard conflicts; soft warning for `diceCount: 4` +
`turnTimerSec` ("very fast sets may expire mid-choice").

**A1 scope note:** `'v1.1'` is a **new scope level** added to the
`SettingField.since` union (`'v1' | 'v1.1' | 'v1.5' | 'v2'`) so 5D's setting
ships contained — bumping `CURRENT_SCOPE` to `'v1.1'` exposes `diceCount`
without exposing the unfinished v1.5 batch flags.

---

## 4. Director (rendering & animation)

| Component | Change |
|---|---|
| `Dice.tsx` | Renders `diceCount` dice; tumble animation plays the set; settle shows all faces; **queued dice dim as each is played** |
| Dice tint (4E) | Unchanged — tints per turn, not per die |
| `Token.tsx` / hops | Unchanged — one `TOKEN_MOVED` per die means one hop sequence per die; back-to-back sets of hops are the natural rhythm |
| `AudioBus` | `DICE_ROLLED` → single roll sound regardless of count (no N× spam); `DIE_BURNED` → subtle error blip (reuse `ui.mp3` variant) |
| HUD (interim) | Remaining-dice pips readout next to the roll button; the full HUD (WS-2) inherits it |
| Camera | Follows each die-move as today — no change |

**Pacing rule (UX):** hop cadence stays ~180 ms/cell; with stacked dice the
same token hops twice back-to-back — a short 150 ms beat between dice keeps
the two moves readable. No new animation systems.

---

## 5. Bot adaptation (the "sniping from far behind" request)

This is where the 5C machinery pays its migration dividend.

### 5.1 Threat geometry becomes dice-aware

```ts
// features.ts / threats.ts — constants the design promised would be the
// whole bot-side migration:
export const IMMEDIATE_BAND_MAX = 6;        // v1 = one die
// With k opponent dice remaining (read from state.dice.queue mid-set,
// from rules.diceCount between turns):
export function reachBandMax(k: number): number { return 6 * k; }
```

- **Exposure** (`threats.ts`): an opponent holding k dice threatens my cell at
  any distance 1..6k with stacked play. Probability model (A1 — **prefix
  landings, not sums**): a token playing all k dice lands on EVERY prefix sum
  of the descending-sorted dice — {6,2} lands 6, then 8 — and a capture
  happens on **any** landing. So P(threat at d) = P(d is a prefix landing),
  which strictly CONTAINS the plain dice-sum distribution ({6,2} threatens 6
  even though its sum is 8 — the sum-only model would call it unreachable,
  wrong exactly where sniping lives). At k=1 the two coincide, which is why v1
  was correct. Table-cached. Invariants: (a) reduces exactly to flat 1/6 at
  k=1; (b) pointwise superset of the sum distribution; (c) entries are per-d
  marginal probabilities — they do NOT sum to 1 over d, and the sum-only
  symmetry P(d)=P(7k−d) must never be applied here. Split-play pressure (two
  tokens advancing) is conservatively ignored in v5D — noted as a tuning lever,
  not a launch gate.
- **Anticipation band** (`ANTICIPATION_BAND_MIN/MAX`): widen dynamically —
  immediate zone 1..6k, anticipation zone (6k+1)..(12k). At diceCount 2, the
  user's "sniping from far behind" is literally the 7–12 zone becoming
  *immediate* reach. The 5C-7 one-roll haven rule (≤ 6) generalizes to
  ≤ 6k — **the user's own rule scales: a threat that can't materialize with
  the dice in hand must never outbid a real capture.**
- **shotPressure / ambushPressure**: geometry functions take `k` (opponent or
  own dice remaining); structure unchanged.

### 5.2 Race model

`MEAN_STEP → 3.5 × diceCount` and `YARD_EXIT_TURNS → 1/(1−(5/6)^diceCount)`
become functions of `state.rules.diceCount` (2 dice: exit ≈ 3.3 turns; step
7/turn). ETF keeps its monotone shape — the frozen monotonicity tests extend,
not break.

### 5.3 Search

- Chance node: unordered multisets of `diceCount` dice with exact probability
  weights (2 dice: 21 outcomes — e.g. {3,5} weighs 2/36). Then the queue
  resolves sequentially — **no allocation explosion** (Decision 1's dividend).
- Budget unchanged (120 ms); the wider chance node costs depth — expected
  Pro depth drops ~1 ply at 2 dice. Accepted; TT mitigates.
- Paranoid model unchanged — opponent best-response now sequences their dice
  too (they get the same sniping power; the fear is *correct*).

### 5.4 Weights

`EVAL_WEIGHTS` are NOT re-tuned at launch. The band/ETF changes are
structural; if playtesting shows over/under-aggression at 2 dice, that is a
targeted tuning run on the existing harness (`tune-bot.ts` accepts a rules
override — small extension), not a launch blocker.

---

## 6. Steps & gates

| Step | Deliverable | Gate |
|---|---|---|
| **5D-1** | Engine queue contract (§3.1–3.3): state shape **incl. the `value` compat alias (A1)**, rollSet, burn-loop, per-die RESOLVE_MOVE; `diceCount: 1` equivalence suite | New tests green + **all 315 prior tests unmodified & green** (v1 equivalence is the gate; the alias is what makes this hold) |
| **5D-2** | Interaction rulings (§3.5) + schema field + validator rows; events widened (§3.4) | Validator tests; event consumers compile; frozen gate green |
| **5D-3** | Bot adaptation (§5): dice-aware bands, prefix-landing threat tables (A1), ETF functions, unordered chance node | Feature tests (band geometry at k=2, threat-table invariants per A1 — k=1 reduction + superset-of-sums + per-d marginals; sum-table invariants pinned separately, ETF monotonicity per diceCount) + depth-4 perf ≤ 120 ms + stall-guard per diceCount |
| **5D-4** | Director: multi-dice roll animation, queue pips, dim-on-play, burn blip, pacing beat | Manual visual gate; no Oracle changes |
| **5D-5** | Entry point: interim ControlBar selector now; Setup screen inherits when WS-2 lands; `CURRENT_SCOPE` bump | A 2-dice hotseat game and a 2-dice solo-vs-Pro game both playable end-to-end |
| **5D-6** | Playtest + benchmark sanity (bench run at diceCount 2 — regression-only, no ladder claims per F-3) | User sign-off checklist: faster games ✓, same/different-token choice ✓, sniping visible ✓, no stall ✓ |

**Stop conditions (project discipline):** any prior test broken by 5D-1 is a
contract violation — fix the change, never the test. Behavioral assertions are
frozen; v1 at `diceCount: 1` must remain byte-identical in behavior.

---

## 7. Explicitly OUT of 5D

- Simultaneous-allocation UI ("plan all dice at once" planner) — sequential
  spans the same moves with simpler UX; revisit only on user demand.
- Split-play threat modeling for exposure (two-token coordinated pressure) —
  noted lever, not launch scope.
- Per-diceCount weight tuning — only if playtest evidence demands it.
- Networked multi-dice sync — Phase 6 concern; the queue is plain state, so
  it inherits the server story unchanged.
- Asymmetric dice counts per player — never, without a new vision statement.

---

## 8. Risk register

| Risk | Mitigation |
|---|---|
| Chance-node blowup degrades Pro below usefulness | Unordered multisets (21 not 36); TT; accept ~1 ply less depth — verified by the perf gate, not assumed |
| Burn-loop edge cases (queue + six + capture + finish in one set) | 5D-1's equivalence suite includes crafted set-sequences; phase machine untouched, so v1 reasoning applies |
| Games become TOO fast / feel shallow at 3–4 dice | Default stays 1; 2 ships as the promoted preset; 3–4 are opt-in experiments |
| Threat probability table bugs (D-3 bug class) | Prefix-landing table (A1) with its OWN invariants: k=1 reduction to flat 1/6, pointwise superset of sums, per-d marginals. Sum-only invariants (rows-sum-to-1, symmetry) are pinned for the sum table and explicitly forbidden on the threat table |
| Director pacing confusion (whose die is this?) | Queue pips + dim-on-play; hops are per-die so ownership is visible |
| 5C camping/hunting balance shifts under wider bands | Stall-guard per diceCount (Decision 13) + the 5C-7 invariant re-pinned at ≤ 6k |
| WS-2 (Setup UI) not built yet | Interim ControlBar selector (5D-5); the schema field is ready so WS-2 renders it for free |

---

## 9. Cross-check vs existing docs

| Commitment | Source | 5D stance | ✅ |
|---|---|---|---|
| Phase machine gates everything | v3 §4 | Untouched — multi-dice is a queue inside the existing handshake | ✅ |
| Oracle pure / no rendering | v3 §1/§14 | All engine changes in `oracle/`; Director only listens | ✅ |
| RulesConfig = settings data layer | R&S §1.1 | `diceCount` lives there; schema + validator rows; no parallel store | ✅ |
| Interaction matrix discipline | R&S §3 | §3.5 rulings recorded before implementation | ✅ |
| Two-dice "likely never" | R&S §6.2 | Overturned per its own condition ("core to vision" — user, 2026-08-14); overturn recorded in header | ✅ (procedure) |
| Zero-desync simulation | 5B arch | Sequential queue replays through `applyAction` exactly | ✅ |
| Anticipation-band migration promise | 5C-6 doc | §5.1 is that migration; band constants go dice-aware | ✅ |
| One-roll rule ("needs 7+ can't outbid a capture") | 5C-7 (user rule) | Generalized to ≤ 6k — the rule scales with the dice in hand | ✅ |
| F-3 statistical discipline | 5C doc | Bench regression-only; no ladder claims at launch | ✅ |

---

## 10. Definition of Done — Phase 5D

- [ ] 2-dice hotseat and 2-dice solo-vs-Pro playable end-to-end.
- [ ] `diceCount: 1` provably identical to v1 behavior (equivalence suite).
- [ ] All 315 prior tests green unmodified; new suites green; lint + build clean.
- [ ] Sniping is observable: a 2-dice set captures a token 7–12 ahead in a
      real game (playtest evidence, recorded).
- [ ] Games measurably faster: bench mean turns at diceCount 2 < diceCount 1.
- [ ] Stall-guard green per diceCount (no F-1 recurrence).
- [ ] User sign-off on the 5D-6 checklist. — **✅ SIGNED OFF 2026-08-18**; merged to `main` (`6c067a9`); PD-1 logged as dice-2 tuning backlog

---

## 11. Playtest finding PD-1 — dice-2 capture judgment (2026-08-18)

**Observation (user, x2 game):** "a confirmed token capture was ignored — one
token could easily capture the opponent's token, but they could not see it or
ignored it."

**Diagnosis — JUDGMENT, not vision (fixture-verified):** the committed vision
check (`dice2Capture.test.ts`, `5512943`) proves the union menu presents the
capture and Medium/Hard/Pro all take a capture with zero retaliation risk.
What the playtest saw was the dice-2 *threat geometry* doing its job: every
opponent now threatens up to 12 cells with prefix-landing odds, and Pro's
paranoid model + exposure weighting declines captures whose landing it prices
as recapturable. When that price is wrong, it is a weights problem, not a
mechanism problem.

**Disposition:** dice-2 weight tuning — backlog with evidence (the design's
own trigger: "tune only if playtest evidence demands it"; the evidence now
exists). Harness supports `--dice 2`. Not merge-blocking: the mechanism is
proven sound and the fixture guards it permanently.
