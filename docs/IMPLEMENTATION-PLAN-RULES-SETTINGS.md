# Rules & Settings — Implementation Plan

> Companion to `RULES-AND-SETTINGS-ARCHITECTURE.md`. Executes Steps 1–3 from that doc (the insurance work before Phase 2 / 3D). Where this plan and the architecture doc disagree, the **architecture doc wins** (it is the decision artifact; this is the build order).
>
> **Status:** Draft for review. No code until approved.
> **Pre-approval note:** This plan assumes the 5 architecture-doc corrections listed in Step 0 are applied first — they were approved in conversation and keep the source-of-truth coherent.

---

## 1. Locked Decisions (approved calls)

| # | Decision | Value |
|---|---|---|
| 1 | Three locks | `Move.tokenIds[]`, `finishRule` enum, `entryRoll` enum (+ Batch B pre-declarations) |
| 2 | Step 1 gate | **Behavioral assertions unchanged** — 122 tests pass with only construction-site syntax differences (`tokenId`→`tokenIds[0]`, `exactFinishRequired`→`finishRule:'exact'`, etc.) |
| 3 | Step 1 scope | Renames + trivial implementations (`entryRoll` 3-case switch, `sixesLimit` null handling) are fully implemented & tested now; `extraTurnOnFinish` + `'bounce'`/`'overflow'` finish modes are declare-only (v1.5 Batch A) |
| 4 | v1.5 shortlist | Batches A → B → C (§5 of arch doc, expanded) |
| 5 | Teams win | Both partners each reach N (standard partnership) |
| 6 | Challenge mode | v2, bundled with Undo |
| 7 | Two-dice | Backlog ("likely never") — only overturn with explicit "core to vision" |
| 8 | blowBack | Declared now (default 0); implementation is v2; contract change is on the `TOKEN_CAPTURED` event payload (`victimPath`), not `Move` |

---

## 2. Phase / Step Map

| Step | Name | Exit gate |
|---|---|---|
| 0 | Architecture-doc corrections | 5 edits applied; doc internally consistent |
| 1 | Contract locks | 122 behavioral tests green with only construction-site diffs; ~5 new tests for widened surface (`entryRoll` cases, `sixesLimit: null`); lint clean |
| 2 | Settings subsystem | `validateRules` rejects all 4 §3.1 hard conflicts; `getWarnings` returns all 3 §3.2 soft warns; schema snapshot test green; settingsStore cycle test green |
| 3 | Phase 2 data-driven gate | IMPLEMENTATION-PLAN-v1 §7.5 amended |

Each step has a hard gate. Step N+1 does not start until Step N's gate passes. **No v1.5 feature logic (Batch A/B/C) is written in this workstream** — Steps 1–3 are shape locks + the settings *system* only. Feature logic comes after Phase 3.

---

## 3. Step 0 — Architecture-Doc Corrections (prerequisite, no code)

Five edits to `RULES-AND-SETTINGS-ARCHITECTURE.md`, all approved in conversation:

| # | Edit | Why |
|---|---|---|
| 0.1 | Fix §2.3 blowBack comment → move to v2 group; note contract change is on the `TOKEN_CAPTURED` event payload (`victimPath: Position[]`), not `Move` | Resolves the §2.3/§6.2 inconsistency |
| 0.2 | Add `entryRoll` to §2.2 as a fourth lock (parallel to `finishRule`) | It's a rename + 3-case switch, fits the lock batch |
| 0.3 | Add Batch B's `extraTurnOnCapture`, `sixesLimit`, `extraTurnOnFinish` to §2.3 pre-declarations | Presets need them |
| 0.4 | Add Batch B/C structure to §5 (v1.5 shortlist becomes A/B/C) | Scoping clarity |
| 0.5 | Record the Step 1 behavioral gate ("only construction-site syntax may differ") in §7 | Sharpens the gate |

**Gate:** Doc reads coherently end-to-end; blowBack appears once (v2 group); `entryRoll` appears in §2.2; batches appear in §5.

---

## 4. Step 1 — Contract Locks (~1 day)

### 4.1 Scope: what's a rename vs implement vs declare-only

| Field | Old | New | Treatment |
|---|---|---|---|
| `enterOnSix: boolean` | on `RulesConfig` | `entryRoll: 'six' \| 'sixOrOne' \| 'any'` | **Rename + implement** all 3 cases in `legalMoves.ts` |
| `captureGrantsExtraTurn: boolean` | on `RulesConfig` | `extraTurnOnCapture: boolean` | **Pure rename** (logic exists in `turns.ts`) |
| `consecutiveSixesLimit: number` | on `RulesConfig` | `sixesLimit: number \| null` | **Rename + null handling** (`null` = ∞) in `turns.ts` |
| `exactFinishRequired: boolean` | on `RulesConfig` | `finishRule: 'exact' \| 'bounce' \| 'overflow'` | **Rename + implement `'exact'` only**; `'bounce'`/`'overflow'` declare-only (v1.5 Batch A) |
| `extraTurnOnFinish` | — | `boolean` | **Declare only**; engine ignores until v1.5 |
| `Move.tokenId: string` | on `Move` | `tokenIds: string[]` | **Shape change**; always single-element in v1 |

### 4.2 Files touched & exact API

#### `src/oracle/types.ts`

```ts
export interface Move {
  tokenIds: string[];          // was tokenId: string
  path: Position[];
  finalProgress: number;
  isCapture: boolean;
  isEnteringHome: boolean;
  isEnteringBoard: boolean;
  isFinishing: boolean;
}

export interface RulesConfig {
  playerCount: 2 | 3 | 4;                          // was fixed 4
  bots: Color[];
  // --- was enterOnSix, captureGrantsExtraTurn, consecutiveSixesLimit, exactFinishRequired ---
  entryRoll: 'six' | 'sixOrOne' | 'any';
  extraTurnOnCapture: boolean;
  sixesLimit: number | null;                       // null = ∞
  finishRule: 'exact' | 'bounce' | 'overflow';
  extraTurnOnFinish: boolean;                      // declare only; v1.5

  stacking: 'none' | 'block' | 'stack';
  turnTimerSec: number | null;

  // --- v1.5 flags (declared now, implemented v1.5 Batch A/B) ---
  forcedCapture: boolean;
  optionalPass: boolean;
  safeCellSet: 'starts' | 'stars' | 'both' | 'none';
  blowBack: number;                                // v2 actually (Step 0.1 corrects the comment)
  firstToN: number;

  // --- v2 flags (declared now, implemented v2; UI hides via `since`) ---
  teams: ReadonlyArray<readonly [Color, Color]> | null;  // flattened; no wrapper type
  challengeMode: boolean;
}
```

#### `src/oracle/config/rulesPreset.ts`

Update `V1_RULES` to use new field names with v1-behavior-preserving defaults:

```ts
export const V1_RULES: RulesConfig = {
  playerCount: 4,
  bots: [],
  entryRoll: 'six',                    // was enterOnSix: true
  extraTurnOnCapture: false,           // was captureGrantsExtraTurn: false
  sixesLimit: 3,                       // was consecutiveSixesLimit: 3
  finishRule: 'exact',                 // was exactFinishRequired: true
  extraTurnOnFinish: false,            // declare only
  stacking: 'none',
  turnTimerSec: null,
  // v1.5 Batch A/B defaults
  forcedCapture: false,
  optionalPass: false,
  safeCellSet: 'both',
  blowBack: 0,                         // off
  firstToN: 4,
  // v2 defaults
  teams: null,
  challengeMode: false,
};
```

#### `src/oracle/rules/legalMoves.ts`

**Entry logic** — replace the `enterOnSix` check with an `entryRoll` switch:

```ts
function canEnter(roll: number, mode: RulesConfig['entryRoll']): boolean {
  switch (mode) {
    case 'six':        return roll === 6;
    case 'sixOrOne':   return roll === 6 || roll === 1;
    case 'any':        return true;
  }
}
// in getLegalMoves: if (canEnter(roll, state.rules.entryRoll)) moves.push(entryMove(...));
```

**Finish logic** — replace `exactFinishRequired` with `finishRule` (only `'exact'` implemented now):

```ts
// in advanceMove:
if (state.rules.finishRule === 'exact' && finalProgress > FINISH) return null;
// 'bounce' and 'overflow' branches: TODO v1.5 Batch A
```

**Move construction** — every `tokenId: id` becomes `tokenIds: [id]`.

#### `src/oracle/rules/turns.ts`

**Six-limit null handling:**

```ts
const forfeited =
  rolledSix &&
  rules.sixesLimit !== null &&
  consecutiveSixes >= rules.sixesLimit;
```

**Capture rename:** `rules.captureGrantsExtraTurn` → `rules.extraTurnOnCapture`.

#### `src/oracle/engine.ts`

- `handleRequestMove`: `pickMove` finds by `move.tokenIds.includes(tokenId)` (single-element in v1, but the check is future-proof for stacking).
- `handleResolveMove`: `const moverId = move.tokenIds[0]` (v1 single-element; v2 loops).
- Capture/event code unchanged beyond reading `moverId`.
- **`extraTurnOnFinish` is NOT read yet** — declare-only. No new branch in `handleResolveMove` for Step 1.

#### `src/bus/events.ts`

```ts
| { type: 'TOKEN_MOVED'; tokenIds: string[]; path: Position[]; finalProgress: number }
// was tokenId: string
```

#### `src/stage/DebugHarness/DebugHarness.tsx`

- `movableIds = new Set(state.validMoves.flatMap(m => m.tokenIds))` (was `m.tokenId`).
- `handleTokenClick` unchanged (still receives a single `tokenId`).

### 4.3 Test inventory for Step 1

**Existing 122 tests — construction-site updates only:**

| Suite | Updates needed |
|---|---|
| `track.test.ts` | None (no Move/RulesConfig refs) |
| `capture.test.ts` | None (no Move/rule refs) |
| `legalMoves.test.ts` | `move.tokenId` → `move.tokenIds[0]` in assertions (~4 sites) |
| `turns.test.ts` | None (uses V1_RULES via helpers; resolveTurn reads renamed fields automatically) |
| `engine.test.ts` | `m.tokenId` → `m.tokenIds[0]` in validMoves assertions (~3 sites) |
| `fullgame.test.ts` | `move.tokenId` → `move.tokenIds[0]` (1 site) |
| `helpers.ts` | None (uses V1_RULES) |

**New tests for the widened surface (Step 1 gate):**

| Test | Suite | Asserts |
|---|---|---|
| `entryRoll: 'six'` blocks non-6 entry | legalMoves.test | roll 4 → no entry move (existing behavior, made explicit) |
| `entryRoll: 'sixOrOne'` allows roll-1 entry | legalMoves.test (NEW) | roll 1 → entry move exists |
| `entryRoll: 'any'` allows any roll entry | legalMoves.test (NEW) | roll 3 → entry move exists |
| `sixesLimit: null` never forfeits | turns.test (NEW) | 5 consecutive sixes → still keeps turn |
| `sixesLimit: 2` forfeits at 2 | turns.test (NEW) | 2nd six → pass turn |
| `finishRule: 'exact'` rejects overshoot | legalMoves.test | existing, kept explicit |

**Step 1 gate:**
```bash
npm run test   # 122 existing + ~5 new = ~127 green; lint clean
```
**The behavioral proof:** diff the test file changes — every edit is construction-site (`x.tokenId` → `x.tokenIds[0]`) or a new test. Zero existing assertion changes meaning.

### 4.4 Step 1 risks

| Risk | Mitigation |
|---|---|
| `entryRoll` switch mistypes a case | TypeScript exhaustiveness check on the union (3 cases) |
| `sixesLimit: null` forgotten in turns.ts | New test `null → no forfeit ever` |
| `Move.tokenIds[0]` indexing error in engine | The `pickMove` uses `.includes()`, not `[0]`, for selection; `[0]` only in resolve (single-element invariant documented) |
| A rename missed somewhere | `tsc --noEmit` catches type errors; ESLint catches layer violations |

---

## 5. Step 2 — Settings Subsystem (~1 day)

### 5.1 Files & API

#### `src/oracle/config/settingsSchema.ts` (NEW)

Declarative schema; the Settings UI renders from this, never from hardcoded controls.

```ts
export interface SettingField {
  key: keyof RulesConfig;
  label: string;
  description: string;
  type: 'boolean' | 'enum' | 'number' | 'custom'; // 'custom' = bespoke UI control; excluded from scalar default-match
  options?: readonly string[];
  min?: number; max?: number;
  default: boolean | string | number;
  category: 'Entry & Movement' | 'Capture & Safety' | 'Finish & Winning'
          | 'Players & Teams' | 'Dice & Turn Flow';
  since: 'v1' | 'v1.5' | 'v2';
}

export const SETTING_FIELDS: readonly SettingField[] = [ /* one per RulesConfig key */ ];

/** Fields the UI should show, filtered by the current scope. */
export function fieldsForScope(scope: 'v1' | 'v1.5' | 'v2'): SettingField[] {
  const order = { v1: 0, v1.5: 1, v2: 2 };
  return SETTING_FIELDS.filter((f) => order[f.since] <= order[scope]);
}

/**
 * Single source of truth for which scope the running app surfaces.
 * The v1 Settings screen calls fieldsForScope(CURRENT_SCOPE).
 * Bumping to v1.5 later is a one-line change here, not grep-and-pray across Stage.
 */
export const CURRENT_SCOPE: 'v1' | 'v1.5' | 'v2' = 'v1';
```

The schema must cover **every** `RulesConfig` key — the snapshot test (§5.3) enforces this.

#### `src/oracle/config/validateRules.ts` (NEW)

Two pure functions: hard rejects (blocks apply) and soft warns (informs UI).

```ts
export type ValidationResult = { ok: true } | { ok: false; conflicts: string[] };

/** Hard rejects — the settings UI may not apply these. Encodes §3.1. */
export function validateRules(rules: RulesConfig): ValidationResult;

/** Soft warnings — UI shows these; player may override. Encodes §3.2. */
export function getWarnings(rules: RulesConfig): string[];
```

**§3.1 hard rejects encoded:**
1. `forcedCapture && optionalPass` → "Forced capture and optional pass are mutually exclusive."
2. `stacking === 'block' && safeCellSet === 'none'` → "Blockades with no safe cells make the game unwinnable."
3. `teams !== null && playerCount === 3` → "Teams require an even player count."
4. `challengeMode && forcedCapture` → "Challenge mode has no trigger when capture is forced."

**§3.2 soft warns encoded:**
1. `finishRule === 'bounce' && forcedCapture` → "Bounce finish checks captures only at the resting cell."
2. `blowBack > 0` → "Blow-back clamps the victim to the yard if sent past entry."
3. `firstToN === 1` → "First token home wins — very fast games."

#### `src/store/settingsStore.ts` (NEW)

Draft + persisted state, decoupled from `useGame` (settings exist *between* games).

```ts
interface StorageAdapter {
  load(): RulesConfig | null;
  save(rules: RulesConfig): void;
}

interface SettingsStore {
  draft: RulesConfig;
  persisted: RulesConfig;
  edit: (patch: Partial<RulesConfig>) => void;
  validate: () => ValidationResult;
  warnings: () => string[];
  apply: () => ValidationResult;   // validate → persist → localStorage; returns result
  reset: () => void;               // back to V1_RULES
}

export function createSettingsStore(storage?: StorageAdapter): UseBoundStore<...>;
export const useSettings = createSettingsStore(localStorageAdapter);
```

`StorageAdapter` is injectable so tests use an in-memory map (node env has no `localStorage`). The default adapter checks `typeof localStorage !== 'undefined'` and no-ops in node.

### 5.2 Why validateRules and getWarnings are separate

Hard rejects block `apply()`; soft warns allow `apply()` with a confirmation step in the UI. Mixing them would force the UI to disambiguate return values. Two functions, one responsibility each.

### 5.3 Test inventory for Step 2

**`validateRules.test.ts` (NEW):**

| Test | Asserts |
|---|---|
| `forcedCapture && optionalPass` → rejected | `ok: false`, conflict mentions both flags |
| `stacking:'block' && safeCellSet:'none'` → rejected | `ok: false` |
| `teams !== null && playerCount === 3` → rejected | `ok: false` |
| `challengeMode && forcedCapture` → rejected | `ok: false` |
| V1_RULES (valid) → accepted | `ok: true` |
| Each reject's message is human-readable | message includes a word like "exclusive"/"unwinnable"/"even"/"trigger" |

**`getWarnings.test.ts` (NEW):**

| Test | Asserts |
|---|---|
| `finishRule:'bounce' && forcedCapture` → 1 warning | mentions "resting cell" |
| `blowBack > 0` → 1 warning | mentions "yard" |
| `firstToN === 1` → 1 warning | mentions "fast" |
| V1_RULES → 0 warnings | `[]` |

**`settingsSchema.test.ts` (NEW):**

| Test | Asserts |
|---|---|
| Schema covers every `RulesConfig` key | `Object.keys(V1_RULES)` ⊆ `SETTING_FIELDS.map(f => f.key)` |
| Each field's default matches `V1_RULES` | per-key equality |
| `fieldsForScope('v1')` excludes v1.5/v2 fields | no `forcedCapture`, `teams`, etc. |

**`settingsStore.test.ts` (NEW):**

| Test | Asserts |
|---|---|
| edit mutates draft, not persisted | `draft !== persisted` after edit |
| apply with invalid config returns rejection and does not persist | persisted unchanged |
| apply with valid config persists (via in-memory adapter) | adapter round-trips |
| reset returns to V1_RULES | deep equality |

**Step 2 gate:**
```bash
npm run test   # all Step 2 tests green; the 4 hard rejects demonstrably fire
```
**The proof you asked for:** running `validateRules` against each §3.1 combination returns `ok: false` with a readable conflict string. Demonstrated in the test output, not just asserted present.

---

## 6. Step 3 — Phase 2 Data-Driven Gate (doc edit, ~15 min)

Amend `IMPLEMENTATION-PLAN-v1.md §7.5` to add the data-driven requirement (arch doc §4):

> **Phase 2 Director must be data-driven.** Yards, token instances, and home-column renders derive from `state.turnOrder`, not a hardcoded `COLORS` array. A 2-player game renders 2 yards + 8 tokens; 3-player renders 3 yards + 12 tokens. `ENTRY_OFFSET` stays the 4-color map (the physical board is fixed). `createInitialState(colors)` derives `turnOrder` from the passed color list. The board model supports all 4 home columns/yards regardless of how many are active.

Also update `createInitialState` signature note in §6.3 to reflect the locked `createInitialState(colors: Color[], rules?)` signature (§8.1), with the Oracle-owned `colorsForPlayerCount(n)` helper (`2→red+yellow`, `3→red/green/yellow`, `4→all`) and the dev-only invariant `colors.length === rules.playerCount`.

**Gate:** §7.5 amended; doc cross-check (§8 of arch doc) still holds.

---

## 7. v1.5 Batch Structure (after Phase 3, not in this workstream)

Recorded here so the shape locks in Step 1 are validated against the right future scope.

| Batch | Features | Why this order |
|---|---|---|
| **A** | 2p/3p setups, `safeCellSet`, `finishRule: 'bounce'`/`'overflow'`, `forcedCapture`, `firstToN` | The doc's original 5; pure flags, no new Actions |
| **B** | `entryRoll` modes (already implemented Step 1), `extraTurnOnCapture` (already renamed), `sixesLimit` (already renamed), `extraTurnOnFinish` (implement the branch) | Turn-flow flags; presets need them; mostly already done in Step 1 |
| **C** | `optionalPass` (PASS action), `turnTimer` (TIMEOUT action) | Add new Actions to the phase machine; do last |

Note: Batch B is mostly *already implemented* by Step 1's "rename + implement" treatment. The only v1.5 work in Batch B is `extraTurnOnFinish`'s actual logic branch.

---

## 8. Open Decisions (all resolved — locked from review)

1. **`createInitialState` signature** → **`createInitialState(colors: Color[], rules?)`**, explicit. With an Oracle-owned `colorsForPlayerCount(n)` helper (`2→red+yellow`, `3→red/green/yellow`, `4→all`). Dev-only invariant `colors.length === rules.playerCount`. *Deciding argument: a server assigns seats/colors in multiplayer — explicit today is the server-compatible shape; deriving internally would force a rewrite the day the server ships.*
2. **`PASS` action pre-declaration** → **wait for Batch C.** The Action union is not part of the settings schema; pre-declaring an unused variant adds dead surface to the phase machine's exhaustiveness checks. Declare when Batch C ships.
3. **Settings UI scope filtering** → `fieldsForScope(CURRENT_SCOPE)` where `CURRENT_SCOPE: 'v1' | 'v1.5' | 'v2'` is a single exported constant from the schema module. Bumping scope later is a one-line change, not grep-and-pray.

---

## 9. Cross-Check vs `RULES-AND-SETTINGS-ARCHITECTURE.md`

| Arch doc § | Commitment | This plan | ✅ |
|---|---|---|---|
| §1.1 | Single source of truth (RulesConfig in GameState) | Step 2 settingsStore extends, doesn't parallel | ✅ |
| §1.2 | Schema-driven UI | Step 2 `settingsSchema.ts` | ✅ |
| §1.3 | Validator rejects at settings-apply time | Step 2 `validateRules` (hard) + `getWarnings` (soft) | ✅ |
| §2.1 | `Move.tokenIds[]` | Step 1 §4.2 | ✅ |
| §2.2 | `finishRule` enum | Step 1 §4.2 (rename + `'exact'` only) | ✅ |
| §2.2 (Step 0.2) | `entryRoll` enum (4th lock) | Step 1 §4.2 (rename + all 3 cases) | ✅ |
| §2.3 | Pre-declared v1.5/v2 flags | Step 1 §4.2 RulesConfig | ✅ |
| §3.1 | 4 hard rejects | Step 2 §5.3 validateRules tests | ✅ |
| §3.2 | 3 soft warns | Step 2 §5.3 getWarnings tests | ✅ |
| §3.3 | Semantic rulings | Encoded in engine logic v1.5/v2; documented in arch doc | ✅ |
| §4 | Data-driven Director | Step 3 (PLAN §7.5 amendment) | ✅ |
| §6.1 | Challenge mode v2 | Not in this workstream | ✅ |
| §7 | Execution sequence Steps 1→3 | This plan §2, §4–6 | ✅ |

**No contradictions.** Two scope clarifications: Step 1 implements `entryRoll`/`sixesLimit` now (not v1.5) because they're trivial; `extraTurnOnFinish` and the `'bounce'`/`'overflow'` finish modes remain v1.5 Batch A/B. Both are widenings within the approved envelope.

---

## 10. Risk Register

| Risk | Mitigation |
|---|---|
| A rename missed → type error | `tsc --noEmit` after each file; 122-test behavioral gate catches semantic drift |
| `Move.tokenIds[0]` indexing bug | `pickMove` uses `.includes()` for selection (not `[0]`); `[0]` only at resolve with documented single-element invariant |
| `sixesLimit: null` regression (forfeit fires when it shouldn't) | Dedicated `null` test in turns.test.ts |
| Settings store parallels useGame state | settingsStore holds draft only; `createInitialState(persisted)` feeds useGame — no overlap |
| localStorage absent in node tests | `StorageAdapter` injection; default adapter no-ops when `typeof localStorage === 'undefined'` |
| Schema drifts from RulesConfig | Snapshot test: `Object.keys(V1_RULES)` ⊆ schema keys |
| Validator and engine disagree on a ruling | Validator rulings are the source of truth; engine implements them; both tested against the same §3 table |

---

## 11. Next Action (after approval)

1. Execute Step 0 (5 architecture-doc edits).
2. Execute Step 1 (contract locks) → report at the **122-unchanged + ~5-new gate**.
3. Execute Step 2 (settings subsystem) → report at the **validator-rejects-all-4 gate**.
4. Execute Step 3 (PLAN §7.5 amendment).
5. Proceed to Phase 2 (3D Director).

Steps 1–3 are ~2 days of insurance. Phase 2 is the milestone.
