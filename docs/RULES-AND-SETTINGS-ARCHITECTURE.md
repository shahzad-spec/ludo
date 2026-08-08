# Rules & Settings Architecture

> Companion to `ARCHITECTURE-v3.md` and `IMPLEMENTATION-PLAN-v1.md`. This doc governs **how rules become configurable** and locks the **three contract shapes** that prevent a Director rewrite later.
>
> **Status:** Approved. All decisions in §9 resolved (see plan §8 for the recorded calls). Execution underway.

---

## 0. Purpose & Scope

This doc answers two questions raised by the v1.5/v2 feature backlog:

1. **How do ~25 rule variants become user-facing settings** without spawning a parallel subsystem?
2. **Which contract shapes must lock NOW** (before Phase 2 / 3D) so the Director never gets rewritten?

It does **not** spec individual features — those get per-feature implementation notes in v1.5. It does not mock up the Settings UI (that's Phase 4 / Stage). It is deliberately short.

**Four refinements from review, integrated:**
1. Settings is *not* a new subsystem — it's metadata + validator + persistence + UI layered on the existing `RulesConfig` in `GameState`.
2. The Director must be **data-driven** in Phase 2 (derive players/tokens from state, don't hardcode 4/16). Added to the Phase 2 gate.
3. The "challenge a missed capture" mechanic has pedigree but is a meta-phase, not a flag. Backlogged as a v2 mode bundled with Undo.
4. The **interaction matrix** is the heart — explicit rulings on every conflicting flag pair.

---

## 1. The Settings System

### 1.1 Single source of truth (do not build a parallel settings store)

`RulesConfig` already lives inside `GameState` and is threaded through `applyAction`. That is the settings system's data layer. **We do not create a second settings state object.** The flow:

```
[Settings UI] → edits a draft RulesConfig → validate → persist (localStorage)
                                                            ↓
                                              createInitialState(rules) → GameState
```

The UI edits a *draft* (so the player can fiddle before applying), validates it, persists it, and feeds it to `createInitialState` when a new game starts. Mid-game rule changes are forbidden — rules are immutable for the lifetime of a `GameState`. Changing rules = new game.

**Bonus that falls out for free:** because `RulesConfig` travels inside `GameState`, online multiplayer (v2+) gets "host chooses rules, server validates, clients receive" with zero extra plumbing.

### 1.2 Schema metadata layer (`src/oracle/config/settingsSchema.ts`)

A single declarative schema describing every rule flag, so the Settings UI **renders from data** (no hardcoded controls). The schema lives in `oracle/` because it describes `RulesConfig`, which is an oracle type.

```ts
interface SettingField {
  key: keyof RulesConfig;
  label: string;
  description: string;
  type: 'boolean' | 'enum' | 'number' | 'custom'; // 'custom' = bespoke UI control (bots multi-select, teams pair-configurator); excluded from scalar default-match
  options?: readonly string[];        // for enum
  min?: number; max?: number;         // for number
  default: boolean | string | number;
  category: 'Entry & Movement' | 'Capture & Safety' | 'Finish & Winning'
          | 'Players & Teams' | 'Dice & Turn Flow';
  since: 'v1' | 'v1.5' | 'v2';        // UI hides fields newer than current scope
}
```

The `since` field is how the Settings UI in v1 shows only v1-relevant fields, in v1.5 shows v1.5 fields, etc. No feature flags in the UI code — it filters the schema.

```ts
/** Single source of truth for which scope the running app surfaces. */
export const CURRENT_SCOPE: 'v1' | 'v1.5' | 'v2' = 'v1';

/** The v1 Settings screen calls fieldsForScope(CURRENT_SCOPE).
 *  Bumping to v1.5 later is a one-line change here, not grep-and-pray. */
export function fieldsForScope(scope: 'v1' | 'v1.5' | 'v2'): SettingField[];
```

### 1.3 The interaction validator (`src/oracle/config/validateRules.ts`)

Pure function: takes a draft `RulesConfig`, returns either `{ ok: true }` or `{ ok: false, conflicts: string[] }` with human-readable messages. **Called at settings-apply time, never mid-game.** The rulings it encodes are §3 below.

```ts
function validateRules(rules: RulesConfig): { ok: true } | { ok: false; conflicts: string[] };
```

### 1.4 Persistence (`src/store/settingsStore.ts`)

A tiny Zustand store (separate from `useGame`) holding the *draft* + *persisted* `RulesConfig`, backed by `localStorage`. Decoupled from `useGame` because settings exist between games, not during them.

```ts
type ValidationResult = { ok: true } | { ok: false; conflicts: string[] };

interface SettingsStore {
  draft: RulesConfig;
  persisted: RulesConfig;
  edit: (patch: Partial<RulesConfig>) => void;   // mutate draft
  validate: () => ValidationResult;              // hard rejects (§3.1)
  warnings: () => string[];                       // soft warns (§3.2)
  apply: () => ValidationResult;                  // validate → persist → localStorage; returns result
  reset: () => void;                              // back to V1_RULES
}
```

`apply()` returns `ValidationResult` (not `void`) so the UI can branch on rejection without a second call to `validate()`. `warnings()` is separate from `validate()` because soft warns permit `apply()` with a confirmation step, while hard rejects block it entirely — mixing them would force the UI to disambiguate return values.

---

## 2. Contract Locks (decide now, implement as Step 1)

Three shape changes to `oracle/types.ts` + `engine.ts`. Cost: ~1 day including test + harness updates. **Insurance against a Director rewrite.** None change current behavior; all widen the shape.

### 2.1 `Move.tokenIds: string[]` (replaces `tokenId: string`)

Future-proofs the Director for stacking — N tokens move as one unit. Today always single-element. The Director's `TOKEN_MOVED` event also becomes `tokenIds: string[]` so it animates every token in the move.

```ts
interface Move {
  tokenIds: string[];          // was tokenId: string
  path: Position[];
  finalProgress: number;
  isCapture: boolean;
  isEnteringHome: boolean;
  isEnteringBoard: boolean;
  isFinishing: boolean;
}
```

Affected: `legalMoves.ts` (build moves with `[tokenId]`), `engine.ts` (apply to all tokenIds, capture checks against all), `events.ts` (`TOKEN_MOVED.tokenIds`), the 2D harness, ~8 tests. Mechanical refactor.

### 2.2 `finishRule: 'exact' | 'bounce' | 'overflow'` (replaces `exactFinishRequired: boolean`)

Generalizes what's already there. Three modes:
- **`'exact'`** — current v1 behavior (must land on 56; overshoot illegal).
- **`'bounce'`** — overshoot bounces off finish (need 3, roll 5 → 56 then back 2 → rest at 54). The `path` array naturally encodes the up-then-down trajectory; the Director animates it for free.
- **`'overflow'`** — any roll that reaches/exceeds 56 finishes (need 3, roll 5 → 56, done). The casual preset.

```ts
interface RulesConfig {
  // ... was: exactFinishRequired: boolean;
  finishRule: 'exact' | 'bounce' | 'overflow';
}
```

Affected: `legalMoves.ts` (path computation branches on finishRule), `engine.ts`. `V1_RULES` sets `finishRule: 'exact'` — no behavior change.

#### 2.2.1 `entryRoll: 'six' | 'sixOrOne' | 'any'` (replaces `enterOnSix: boolean`)

Exact parallel to `finishRule` — generalizes the entry rule the same way. Three modes:
- **`'six'`** — current v1 behavior (yard token enters only on a 6).
- **`'sixOrOne'`** — enters on a 6 or a 1 (common casual variant).
- **`'any'`** — enters on any roll (very casual).

```ts
interface RulesConfig {
  // ... was: enterOnSix: boolean;
  entryRoll: 'six' | 'sixOrOne' | 'any';
}
```

Affected: `legalMoves.ts` (entry check becomes a 3-case switch). Implemented in Step 1 (all 3 cases testable now), not deferred to v1.5 — it's a rename + trivial switch, same shape as `finishRule`. `V1_RULES` sets `entryRoll: 'six'` — no behavior change.

### 2.2.2 Batch B turn-flow renames (folded into the lock batch)

Three Batch B fields are renames of existing v1 logic, implemented in Step 1 rather than deferred:

| Old | New | Treatment |
|---|---|---|
| `captureGrantsExtraTurn: boolean` | `extraTurnOnCapture: boolean` | Pure rename (logic in `turns.ts`) |
| `consecutiveSixesLimit: number` | `sixesLimit: number \| null` | Rename + null handling (`null` = ∞, no forfeit) |
| — | `extraTurnOnFinish: boolean` | Declare only (default false); engine ignores until v1.5 Batch B |

### 2.3 Pre-declared flag fields in `RulesConfig`

Add the flag fields now (defaults keep v1 behavior) so the Settings schema is stable and v1.5 logic drops into typed slots. **No logic, just declarations.**

```ts
interface RulesConfig {
  // ... existing v1 fields ...

  // --- v1.5 flags (declared now, implemented v1.5) ---
  forcedCapture: boolean;            // default false
  optionalPass: boolean;             // default false
  safeCellSet: 'starts' | 'stars' | 'both' | 'none';  // default 'both'
  firstToN: number;                  // 4 = v1 (all tokens); 2 = fast games
  playerCount: 2 | 3 | 4;            // was a fixed 4; now derives turnOrder
  turnTimerSec: number | null;       // already present, repurposed

  // --- v2 flags (declared now, implemented v2; UI hides via `since`) ---
  stacking: 'none' | 'block' | 'stack';  // already present
  blowBack: number;                  // v2: 0 = off; N = victim sent back N cells.
                                     //     Contract change is on the TOKEN_CAPTURED
                                     //     event payload (gains victimPath: Position[]
                                     //     so the Director can animate the trip back),
                                     //     NOT on Move. capture.ts computes the path.
  teams: ReadonlyArray<readonly [Color, Color]> | null;  // null = FFA; partner pairs
  challengeMode: boolean;            // default false; see §6.1
}
```

> **`teams` flattened (review nit):** was `teams: TeamMapping | null` with `TeamMapping { teams: [...] }` — that produced `rules.teams.teams`. Now `teams` is the pair array directly. One less indirection, same validator logic.

`V1_RULES` gets all v1.5 defaults (false / 'both' / 0 / 4 / etc.) and v2 stays null/false/0. The engine ignores them until their phase ships.

---

## 3. The Interaction Matrix (the heart)

Every flag pair that can produce a contradictory or ambiguous game gets an explicit ruling. The validator encodes these and rejects impossible combinations at settings-apply time with a readable message. **No flag conflict is ever discovered mid-game.**

### 3.1 Hard conflicts (validator rejects)

| Combination | Ruling | Reasoning |
|---|---|---|
| `forcedCapture: true` **AND** `optionalPass: true` | **Reject.** | Opposite pressures — one forces captures, the other permits declining moves. Mutually exclusive by definition. |
| `stacking: 'block'` **AND** `safeCellSet: 'none'` | **Reject.** | A blockade on a non-safe cell makes the game unwinnable for opponents (can't land, can't pass, can't capture). At least one safe path must exist. |
| `teams: [...]` **AND** `playerCount: 3` | **Reject.** | Teams require an even player count. |
| `challengeMode: true` **AND** `forcedCapture: true` | **Reject.** | Forced capture means there's never a "missed capture" to challenge — the mechanic has no trigger. |

### 3.2 Soft conflicts (validator warns, player may override)

| Combination | Ruling |
|---|---|
| `finishRule: 'bounce'` **AND** `forcedCapture: true` | Warn: "Bounce finish checks captures only at the final resting cell, not mid-bounce." Player accepts. |
| `blowBack: N` (N > 0) | Warn: "Blow-back capture clamps the victim to the yard if it would send them past their entry cell." Just informs — no rejection. |
| `firstToN: 1` | Warn: "First token home wins immediately — very fast games." |

### 3.3 Semantic rulings (no rejection; these define behavior)

These don't reject, but they lock the *meaning* of a combination so the engine has one correct answer:

| Question | Ruling |
|---|---|
| **stacking × blockades**: can a stack form a blockade? | **Yes.** A 2+ token stack blocks opponents from passing or landing. Same rule as two separate same-color tokens. (v2) |
| **stacking**: can a single token capture a stack? | **No.** A stack is immune to single-token capture. Requires an equal-or-larger stack to dislodge. (v2) |
| **stack-vs-stack capture**: who wins? | **Attacker wins if equal-or-larger; smaller attacker cannot move there.** (v2) |
| **blowBack × progress < 0**: where does the victim land? | **Clamp to `BASE` (yard).** No negative progress ever exists. |
| **bounceFinish capture**: check which cells? | **Final resting cell only.** A bounce passing through an opponent's cell does not capture mid-path. |
| **teams × firstToN**: how does a team win? | **Both partners must each reach N finished tokens.** Not combined. (Standard partnership rule.) |
| **turnTimer × meta-phase** (challenge/undo): timeout behavior? | **Timer pauses during CHALLENGE/undo windows.** Resumes when the meta-phase resolves. (Moot in v1; locked for v2.) |
| **own-start-cell safety**: is your entry cell always safe for you? | **Yes** — implied by `safeCellSet` including `'starts'`. |

---

## 4. Data-Driven Director Requirement (Phase 2 gate amendment)

**Refinement #2 from review.** Because 2p/3p setups are in the v1.5 shortlist, the Phase 2 Director **must not hardcode 4 players or 16 tokens**. Add to the Phase 2 gate (IMPLEMENTATION-PLAN-v1 §7.5):

- **Yards, token instances, and home-column renders derive from `state.turnOrder`, not from a hardcoded `COLORS` array.** A 2-player game renders 2 yards + 8 tokens; 3-player renders 3 yards + 12 tokens.
- **`ENTRY_OFFSET` stays the 4-color map** (the physical board is fixed). 2-player uses opposite colors (red+yellow); 3-player uses any 3 of the 4. `createInitialState(colors)` derives `turnOrder` from the passed color list.
- **The board model (boardGeometry.json, §7.3.1) supports all 4 home columns and yards regardless of how many are active.** Inactive ones simply aren't populated.

This is the *only* Director assumption the v1.5 shortlist threatens. Writing it into the gate is cheaper than retrofitting it.

---

## 5. v1.5 Feature Shortlist (implement after Phase 3, before "v2")

Structured as three batches in execution order. Each item is a `[FLAG]` — touches `legalMoves`/`turns`/`safeCells` only, no Director change beyond what §4 already requires. The Settings UI (Phase 4) renders all of them from the schema.

> **Why batches, not a flat list:** presets are incoherent without the turn-flow knobs (CASUAL needs `entryRoll:'any'`, COMPETITIVE wants `forcedCapture` + tight `sixesLimit`, FAST needs `firstToN`). Batch B's renames are mostly *done* by Step 1, so the batch ordering reflects "what's left," not "what's biggest."

### Batch A — flags (pure logic, no new Actions)

1. **2-player / 3-player setups** — `createInitialState(colorsForPlayerCount(n), rules)`. Common request; unblocks the data-driven Director gate.
2. **Configurable safe-cell set** (`safeCellSet`) — `safeCells.ts` is already data-driven; swap the set.
3. **Bounce-back finish** (`finishRule: 'bounce'` and `'overflow'`) — path array supports bounce for free; great casual preset.
4. **Forced capture** (`forcedCapture`) — one filter in `legalMoves.ts`.
5. **First-to-N tokens wins** (`firstToN`) — makes your own QA faster (full 4-token games are slow to playtest); win.ts change.

### Batch B — turn-flow flags (mostly done in Step 1)

6. **`entryRoll` modes** — already implemented in Step 1 (all 3 cases).
7. **`extraTurnOnCapture`** — already renamed in Step 1.
8. **`sixesLimit` (incl. `null` = ∞)** — already renamed in Step 1.
9. **`extraTurnOnFinish`** — implement the actual turn-branch (declare-only in Step 1; this is the only Batch B item with real v1.5 work).

### Batch C — flow options (add new Actions; do last)

10. **`optionalPass`** — adds a `{ type: 'PASS' }` action to the phase machine.
11. **`turnTimer`** — adds a `{ type: 'TIMEOUT' }` action; auto-dispatches when the timer fires.

All three batches are local logic changes. No contract change (§2 already locked the shapes). Batch C is last because it's the only one that touches the phase machine's Action union.

---

## 6. v2 Backlog

### 6.1 Challenge mode (bundled with Undo)

**Refinement #3 from review.** The "challenge a missed capture" rule has pedigree — capture-enforcement house rules exist in some traditions. But the framing (interactive challenge, dice reversal, dispute resolution) is a **meta-phase**, not a flag. It requires:

- A `CHALLENGE` state in the phase machine (or a parallel `MetaPhase` overlay).
- New actions (`REQUEST_CHALLENGE`, `RESOLVE_CHALLENGE`).
- **State snapshot machinery** for undo semantics — identical to what Undo needs.
- A dispute model that's unfair or ambiguous online without an arbiter.

**Verdict:** backlog as a v2 **experimental house-rule mode**, bundled with Undo (they share the snapshot subsystem). v1 gets `forcedCapture`, which delivers the same capture pressure with one filter and no meta-phase.

### 6.2 High-effort contract items (v2, decide shape now per §2.3)

- **Stacking implementation** (`stacking: 'stack'` + `'block'`) — `Move.tokenIds` already supports it; capture logic needs stack-vs-stack rules per §3.3.
- **Teams** (`teams` pair array) — team-level win detection, partner-capture immunity.
- **Two/three-dice mode** — reworks the roll→move cycle. **Only if core to vision; likely never.**
- **Shield power-up** — per-token state + new events.
- **Blow-back capture** (`blowBack: N`) — capture result gains a `victimDestination` field.
- **Scoring/ELO** — backend concern; v2+.

### 6.3 QoL (anytime, mostly Stage)

- Auto-roll when no legal move / auto-move when exactly one legal move — Stage-driven dispatches; Oracle already emits `NO_LEGAL_MOVE`.
- Path preview on hover — Director/Stage, Phase 3–4.

---

## 7. Execution Sequence (after this doc is approved)

| Step | What | Cost | Gate |
|---|---|---|---|
| **1** | Implement the contract locks (§2): `Move.tokenIds`, `finishRule`, `entryRoll`, Batch B renames, pre-declared flags. Update Oracle + tests + harness. | ~1 day | **Behavioral gate (see box below):** 122 existing tests pass unchanged; only construction-site syntax differs; ~5 new tests for the widened surface. |
| **2** | Implement the settings subsystem (§1): schema, validator (with §3 matrix), persistence store. No UI yet. | ~1 day | Validator rejects all §3.1 conflicts; warns on all §3.2; schema snapshot + store cycle tests green. |
| **3** | Write the Phase 2 data-driven gate (§4) into IMPLEMENTATION-PLAN-v1 §7.5. | 15 min | Doc updated. |
| **4** | **Proceed to Phase 2 (3D Director).** | — | — |

Steps 1–3 are the price of insurance. Step 4 is the milestone. **v1.5 features (§5) do not start until Phase 3 is done.**

### 7.1 Step 1 Behavioral Gate — the Stop Condition

> **If a behavioral assertion fails during the rename — not a construction-site type error, but an assertion about game outcomes — that means one of the "1:1 mappings" wasn't. Stop, don't patch the assertion, and examine which lock shifted behavior. The moment a test's meaning gets edited to make the refactor green, the gate has failed.**
>
> The diff is mechanically verifiable: every changed line in a test file should match the construction-site pattern (`\.tokenId` → `\.tokenIds\[0\]`, field renames in object literals) or be a newly-added test. A changed line that doesn't match either category is the stop signal.

### 7.2 `createInitialState` signature (locked — server-compatible)

```ts
// Oracle-owned derivation rule, pure, tested.
export function colorsForPlayerCount(n: 2 | 3 | 4): Color[] {
  switch (n) {
    case 2: return ['red', 'yellow'];        // opposite corners (standard 2p)
    case 3: return ['red', 'green', 'yellow']; // documented deterministic triple;
                                               // blue's corner is the dead one.
    case 4: return ['red', 'green', 'yellow', 'blue'];
  }
}

// Explicit colors — server-compatible. The host/server assigns seats.
export function createInitialState(colors: Color[], rules?: RulesConfig): GameState;
// Dev-only invariant: colors.length === rules.playerCount (caught early).
```

**Why explicit colors, not derived internally:** in online multiplayer the host/server assigns seats and colors. A signature that derives colors internally from `playerCount` would have to be rewritten the day the server ships. Explicit colors today is the server-compatible shape; the derivation helper keeps the rule in the Oracle where it's testable.

**3-player ruling pinned:** `red/green/yellow` (blue's corner is dead). This affects the Director's board geometry — the dead corner's yard/home-column exists in `boardGeometry.json` but is unpopulated.

---

## 8. Cross-Check vs Existing Docs

| Commitment | In ARCHITECTURE-v3 / PLAN-v1 | This doc | ✅ |
|---|---|---|---|
| Oracle is pure, single source of truth | v3 §1, §7 | §1.1 — settings extends RulesConfig, no parallel store | ✅ |
| RulesConfig threaded through engine | PLAN §6.1 | §1.1 — same object, now persistent + validated | ✅ |
| `Move` is the Director's choreography contract | PLAN §6.1.1 | §2.1 — widens to `tokenIds[]`, same role | ✅ |
| Phase machine gates actions | v3 §4 | §6.1 — challenge mode adds a state; doesn't change existing ones | ✅ |
| Position → Vector3 in Director | v3 §9 | §4 — Director data-driven from state, geometry unchanged | ✅ |
| Phase 2 gate | PLAN §7.5 | §4 — adds data-driven player/token derivation | ✅ (amendment) |

**No architectural contradictions.** Two amendments: the Phase 2 gate (§4) and the `Move` shape (§2.1). Both widen, neither breaks.

---

## 9. Decisions (all resolved — see plan §8)

1. **Three locks** — confirmed. Worth ~1 day now vs. Director rewrite risk. (§2.1, §2.2, §2.3)
2. **v1.5 shortlist** — confirmed as Batches A/B/C (§5). Settings UI surfaces these after Phase 3.
3. **Teams win condition** — **both partners each reach N** (standard partnership). Per-player completion counts stay the primitive; team win is an aggregation. Affects win.ts shape.
4. **Challenge mode** — **v2**, bundled with Undo (shared snapshot subsystem). `forcedCapture` covers v1.
5. **Two-dice** — **backlog ("likely never")**. Only overturn with explicit "core to vision"; until then it stays out.
