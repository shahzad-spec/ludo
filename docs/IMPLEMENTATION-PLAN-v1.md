# 3D Ludo — Implementation Plan v1

> Companion to `ARCHITECTURE-v3.md`. Where this doc and v3 disagree, **v3 wins** (v3 is the architecture; this is the build order). A cross-check table appears at the end (§15).
>
> **Status:** All §1 decisions are locked. Stacking = `'none'` (v2 flips to `'block'`).

---

## 1. Locked v1 Decisions

| Decision | Value | Rationale |
|---|---|---|
| Art direction | Minimalist / premium abstract | Polished wood + matte plastic + HDRI studio light. Zero character rigging. |
| Token models | 1 mesh × 16 instances, material color-swap | Perfect one rig; zero modeling weeks. |
| `stacking` | **`'none'`** | Removes pass-through-block edge cases (~2× legalMoves test surface). v2 → `'block'`. |
| Other rules | `enterOnSix:true`, `sixGrantsExtraTurn:true`, `captureGrantsExtraTurn:false`, `exactFinishRequired:true` | Standard casual Ludo. |
| Player count | 4 only | Symmetric board; avoids 2/3-player geometric edge cases. |
| Target | Both devices, responsive | `OrbitControls` with `enablePan=false`, polar clamp `[0.3, π/2.2]`, zoom clamp, `enableDamping`. |

---

## 2. Stack & Versions (pinned)

| Tool | Package | Why pinned |
|---|---|---|
| Build | `vite ^5` + `@vitejs/plugin-react` | Fast HMR, GLB handling |
| Language | `typescript ^5` (strict) | Oracle correctness |
| UI | `react ^18`, `tailwindcss ^3` | Stage overlays |
| 3D | `three ^0.160`, `@react-three/fiber ^8`, `@react-three/drei ^9` | Director |
| State | `zustand ^4` | Oracle store |
| Animation | `gsap ^3` | Deterministic timelines |
| Audio | `howler ^2` | Sprites |
| Test | `vitest ^1`, `@types/three`, `jsdom` (later) | Oracle unit tests |

Exact versions resolved at install time; `package-lock.json` is the real pin.

---

## 3. Phase Map

| Phase | Name | Exit criterion (gate) |
|---|---|---|
| 0 | Bootstrap + guardrails | `npm run lint` and `npm run test` both run (even if 0 tests). |
| 0.5 | Track foundation | **50+ track tests green.** Hard gate — nothing else starts. |
| 1 | Oracle (brain) | Full rules engine green; playable end-to-end in 2D DOM harness. |
| 2 | Skeleton (R3F) | Static board + 16 instanced tokens; click token → instant position update. |
| 3 | Puppeteer (GSAP) | Dice + hop timelines live; phase machine enforces sequencing. |
| 4 | Juice | SFX + particles + selective bloom + camera follow. |
| 5 | Bots | Heuristic AI seats; solo play works without 4 humans. |

Each phase has an explicit gate. **Do not start phase N+1 until phase N's gate passes.**

---

## 4. Phase 0 — Bootstrap + Guardrails

### 4.1 Scaffold

```bash
cd C:\Users\Muham\ZCodeProject\ludo-3d
npm create vite@latest . -- --template react-ts
# (if prompted: select "Ignore files and continue" since docs/ exists)
```

### 4.2 Dependencies (one shot)

```bash
npm install three @react-three/fiber @react-three/drei zustand gsap howler
npm install -D typescript vitest @types/three @types/howler \
  eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin \
  tailwindcss postcss autoprefixer
```

### 4.3 Folder tree (empty `.gitkeep` placeholders)

Create every directory from `ARCHITECTURE-v3.md §3` *before* any code:

```
src/oracle/{board,rules,config,__tests__}
src/bus
src/store
src/director/{config,anim,effects}
src/stage/Menu
src/audio
src/theme
src/lint-rules
public/assets/{models,textures,audio,hdri}
```

### 4.4 The guardrails (`.eslintrc.cjs`) — THE most important Day-1 artifact

```js
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  settings: { 'import/resolver': { typescript: {} } },
  rules: {
    'no-restricted-imports': ['error', {
      paths: [
        // Oracle is pure. No rendering deps, ever.
        { name: 'react', message: 'Oracle must not import React.' },
        { name: 'react-dom', message: 'Oracle must not import react-dom.' },
        { name: 'three', message: 'Oracle must not import three.' },
      ],
      patterns: [
        { group: ['@react-three/*'], message: 'Oracle must not import R3F.' },
        { group: ['./*.css', '../*.css', '*.css'], message: 'Oracle must not import CSS.' },
      ],
    }],
  },
  overrides: [
    {
      files: ['src/director/**/*'],
      rules: {
        'no-restricted-imports': ['error', {
          patterns: [{ group: ['../stage/*', '../../stage/*', '**/stage/**'], message: 'Director must not import Stage.' }],
        }],
      },
    },
    {
      files: ['src/stage/**/*'],
      rules: {
        'no-restricted-imports': ['error', {
          patterns: [{ group: ['../director/*', '../../director/*', '**/director/**'], message: 'Stage must not import Director.' }],
        }],
      },
    },
  ],
};
```

### 4.5 Verify the guardrail works (don't skip)

Write a throwaway `src/oracle/_guardrail_test.ts` containing `import { Vector3 } from 'three';`, run `npm run lint`, confirm it errors, then delete the file. **A guardrail you never tested is wishful thinking.**

### 4.6 Phase 0 gate

- `npm run lint` → clean.
- `npm run test` → runs (0 tests OK).
- `index.html` loads; blank canvas.

---

## 5. Phase 0.5 — Track Foundation (the hard gate)

### 5.1 Lock the numeric conventions (the contract)

```
SHARED_LOOP: cells 0..51 (52 total)
ENTRY_OFFSET: red=0, green=13, yellow=26, blue=39

progress (single source of truth per token):
  BASE = -1
  0..50  → shared loop; cell = (ENTRY_OFFSET[color] + progress) % 52
  51..55 → home column; cell = progress - 51  (0..4)
  56     → finished

Exact finish: progress + roll === 56 → legal
              progress + roll  >  56 → illegal (overshoot)

Home entry geometry (verify by trace):
  color C enters loop at ENTRY_OFFSET[C],
  travels 51 steps (progress 0→50),
  at progress 50 is on cell (ENTRY_OFFSET[C]+50) % 52,
  at progress 51 diverts into home cell 0.
```

Trace example (green, offset 13): progress 50 → cell `(13+50)%52 = 11`. Next would be its own start (12) — instead it diverts. ✓ Correct Ludo semantics.

### 5.2 `src/oracle/board/track.ts` — public API

```ts
export type Color = 'red' | 'green' | 'yellow' | 'blue';
export const BASE = -1;
export const FINISH = 56;
export const SHARED_LOOP_LENGTH = 52;
export const HOME_COLUMN_LENGTH = 5;
export const ENTRY_OFFSET: Record<Color, number> = { red:0, green:13, yellow:26, blue:39 };

export type Position =
  | { kind: 'base' }
  | { kind: 'track'; cell: number }   // 0..51
  | { kind: 'home';  cell: number }   // 0..4
  | { kind: 'finished' };

export function progressToPosition(color: Color, progress: number): Position;
export function getPhase(progress: number): 'yard' | 'track' | 'home' | 'finished';
export function isExactFinishReachable(progress: number, roll: number): boolean;
// Returns the logical cells a token passes over for a given roll (for capture/safe checks).
// Does NOT include the starting cell; DOES include the destination.
export function cellsTraversed(color: Color, fromProgress: number, roll: number): Position[];
```

### 5.3 `src/oracle/board/safeCells.ts`

```ts
// Standard Ludo safe cells: 4 colored starts + 4 midpoint stars.
export const SAFE_TRACK_CELLS: ReadonlySet<number> =
  new Set([0, 8, 13, 21, 26, 34, 39, 47]); // red, gap, green, gap, yellow, gap, blue, gap
export function isSafeTrackCell(cell: number): boolean;
```

### 5.4 `src/oracle/__tests__/track.test.ts` — test inventory (target ≥ 50)

| Group | Count | Cases |
|---|---|---|
| Base | 4 | each color, `BASE` → `{kind:'base'}` |
| Entry cells | 4 | each color, progress 0 → correct entry cell |
| Red linear | 6 | progress 1,2,5,25,49,50 → expected cells |
| **Wrap-around** | 8 | green/yellow/blue where `offset+progress ≥ 52` (the #1 bug source) |
| Home-entry boundary | 8 | each color: progress 50 = last loop cell; 51 = home cell 0 |
| Home column walk | 8 | progress 51,52,53,54,55 → home cells 0,1,2,3,4 for each color |
| Finish | 4 | progress 56 → `{kind:'finished'}` |
| `getPhase` | 4 | transitions yard/track/home/finished |
| Exact-finish legality | 4 | `roll` landing on 56 legal; overshoot illegal; finish→no moves |
| `cellsTraversed` | 4 | 6-move returns 6 positions; include destination; skip source |
| Out-of-range safety | 3 | negative progress, progress > 56, NaN → no crash |
| **Total** | **57** | exceeds the 50 target |

### 5.5 Phase 0.5 gate

```bash
npm run test
# ALL 57 green. No skip, no todo.
```

**Nothing in Phase 1 begins until this is green.** This is non-negotiable.

---

## 6. Phase 1 — Oracle (the brain)

### 6.1 Types (`src/oracle/types.ts`)

```ts
import type { Color, Position } from './board/track';

export interface Token {
  id: string;            // 'red-0'..'blue-3'
  color: Color;
  progress: number;      // BASE..56
  slot: number;          // 0..3 within color (yard slot)
}

export type GamePhase =
  | 'IDLE' | 'ROLLING' | 'SELECTING_TOKEN'
  | 'ANIMATING_MOVE' | 'RESOLVING_MOVE' | 'GAME_OVER';

export interface RulesConfig {
  playerCount: 4;
  bots: Color[];
  enterOnSix: true;
  sixGrantsExtraTurn: true;
  captureGrantsExtraTurn: false;
  stacking: 'none';      // v1 locked
  exactFinishRequired: true;
  turnTimerSec: number | null;
}

export interface GameState {
  tokens: Record<string, Token>;
  turnOrder: Color[];
  currentPlayer: Color;
  dice: { value: number | null; rolled: boolean };
  phase: GamePhase;
  validMoves: Move[];           // populated after RESOLVE_ROLL (see §6.1.1)
  consecutiveSixes: number;
  winners: Color[];
  rules: RulesConfig;
  turnHistory: TurnRecord[];
}

export type Action =
  | { type: 'REQUEST_ROLL' }
  | { type: 'RESOLVE_ROLL'; value: number }
  | { type: 'REQUEST_MOVE'; tokenId: string }
  | { type: 'RESOLVE_MOVE' };
```

> **Note on `Token`:** the token has a `progress` field (single source of truth) and a `slot` field (yard slot 0–3, needed so the Director can place 4 distinct yard positions per color). There is **no `state: TokenState` field** — the readable phase label is derived via `getPhase(progress)` (v3 §5). Storing both would risk desync (e.g. `state='track'` but `progress=55`); the derived getter is free and can't drift.

#### 6.1.1 The `Move` abstraction (the Director's choreography contract)

`legalMoves.ts` does **not** return bare token IDs — it returns `Move[]`. The `path` array gives the Director the exact progress integers to hop tile-by-tile, time safe-zone particles at precise moments, and place the camera. This is the API the 3D layer consumes.

```ts
export interface Move {
  tokenId: string;
  path: Position[];        // ordered cells the token will traverse (incl. destination, excl. source)
  finalProgress: number;   // the token's resulting progress after this move
  isCapture: boolean;      // lands on an opponent on a non-safe cell
  isEnteringHome: boolean; // crosses from the shared loop into the home column
  isEnteringBoard: boolean;// leaves the yard (BASE → progress 0)
  isFinishing: boolean;    // finalProgress === FINISH
}
```

### 6.2 Rules modules (`src/oracle/rules/`)

All pure, no React/three. RNG is **injectable** (`roll(rng)`, reducer takes `rng`) so tests pin specific dice values — no flaky tests.

| File | Responsibility | Key fn |
|---|---|---|
| `dice.ts` | injectable RNG, 1–6 | `roll(rng: () => number): number` |
| `legalMoves.ts` | given state+roll → **`Move[]`** (not bare IDs; see §6.1.1). Filters: enterOnSix, exactFinish overshoot rejection, no-op-when-stuck. | `getLegalMoves(state, roll): Move[]` |
| `movement.ts` | apply a `Move` to a token → new progress | `applyMove(token, move): Token` |
| `capture.ts` | detect landed opponents (non-safe cell); reset victim to **`BASE` (not 0!)** | `getCaptures(state, mover, destPos): Token[]` (victims to reset) |
| `turns.ts` | next player, skip finished players, six-cap (3× six → forfeit) | `nextTurn(state, rolledSix, captured): Color` |
| `win.ts` | all 4 tokens finished → player wins | `checkWin(state, color): boolean` |

> **Capture reset gotcha:** a captured token's progress resets to **`BASE` (the yard, `-1`)**, NOT `0`. `progress 0` is the entry cell on the shared loop — i.e. back in play. The capture test must assert `progress === BASE`.

### 6.3 The reducer (`src/oracle/engine.ts`)

```ts
export function applyAction(
  state: GameState,
  action: Action,
  rng: () => number = Math.random
): { state: GameState; events: GameEvent[] };
```

Pure. No Zustand, no React. Phase-gated inside. Emits events.

**`createInitialState` signature (locked — server-compatible, RULES-AND-SETTINGS-ARCHITECTURE §7.2):**

```ts
export function colorsForPlayerCount(n: 2 | 3 | 4): Color[];
//   2 → ['red', 'yellow']         (opposite corners — standard 2p)
//   3 → ['red', 'green', 'yellow'] (blue's corner is the dead one)
//   4 → ['red', 'green', 'yellow', 'blue']

export function createInitialState(
  colors: Color[] = colorsForPlayerCount(V1_RULES.playerCount),
  rules: RulesConfig = V1_RULES,
): GameState;
// Dev-only invariant: colors.length === rules.playerCount (warns on mismatch).
```

Explicit colors — server-compatible. In online multiplayer the host/server assigns seats; a signature deriving colors internally from `playerCount` would have to be rewritten the day the server ships. The derivation rule lives in `colorsForPlayerCount` (testable, Oracle-owned), not inside `createInitialState`.

### 6.4 Event bus (`src/bus/events.ts`)

Typed `GameEvent` union (DICE_ROLLED, TOKEN_HOP, TOKEN_CAPTURED, TURN_CHANGED, PLAYER_WON, NO_LEGAL_MOVE, etc.) + tiny `Emitter` with `on/off/emit`.

### 6.5 Store (`src/store/useGame.ts`)

Zustand store wrapping `applyAction`:
- holds `GameState`
- `dispatch(action)` → phase-gate → reducer → commit state → emit events to bus
- selectors via `useGame(s => …)` (always narrow)

### 6.6 Phase 1 verification harness (`<DebugHarness/>`)

A 2D React component, **not a standalone HTML file**, so it keeps full HMR, TypeScript path aliases (`@/oracle`), and Fast Refresh. Mounted conditionally in `App.tsx`:

```tsx
// App.tsx
if (import.meta.env.DEV && new URLSearchParams(location.search).has('debug')) {
  return <DebugHarness />;   // 2D grid board, no Canvas
}
return <><CanvasWrapper/><Stage/></>;
```

- Open `localhost:5173/?debug` to play the Oracle end-to-end: roll, click token, see captures, see winner.
- `import.meta.env.DEV` is `false` in `npm run build`, so the component is **tree-shaken out of production** automatically — no manual exclusion, no router needed.
- This harness is also how bots get stress-tested in Phase 5 (run 1 human + 3 bots to completion here before any 3D exists).
- **If you can't finish a game here, the 3D won't save you.**

> **Trap avoided (Trap 2):** A standalone `/scratch/2d-harness.html` outside `src/` would lose HMR, TS aliases, and fast refresh. The `?debug` + `import.meta.env.DEV` pattern is idiomatic Vite, needs zero extra deps (no React Router), and is verifiably absent from prod builds.

### 6.7 Phase 1 gate

**Sub-gate A (1.1 + 1.2 — contracts + pure logic, before Zustand/harness):**
- `legalMoves` tests: blocked/overshoot moves filtered; enterOnSix gating; exact-finish overshoot rejection; `Move[]` shape (path/finalProgress/flags correct).
- `capture` tests: safe cells prevent capture; non-safe captures reset victim to **`BASE`** (not 0!); multiple opponents on one cell (v1: stacking `'none'` → at most one occupant, but still tested); `TOKEN_CAPTURED` event includes both IDs.
- `turns` tests: six-grants-extra-turn (rules flag on); capture-no-extra-turn (rules flag off); consecutive-sixes forfeit (3× six → skip turn); turn-skip for finished players.
- `win` tests: all 4 tokens finished → player wins; 3-of-4 is not a win.
- `engine` integration tests: phase-gating rejects out-of-phase actions (e.g. `REQUEST_MOVE` during `IDLE`); full `REQUEST_ROLL → RESOLVE_ROLL → REQUEST_MOVE → RESOLVE_MOVE` cycle advances state correctly; `NO_LEGAL_MOVE` emitted when roll yields no moves and turn passes.
- All tests green; RNG is injected so dice are deterministic.

**Sub-gate B (1.3 — Zustand store + `<DebugHarness/>`):**
- A full 4-player game completable in the 2D harness (manual playtest).
- All tests still green.

### 6.8 Changelog (Phase 1 revision)

This section was revised after reviewing an external Phase 1 blueprint. The blueprint had one excellent idea and several silent contradictions with the approved architecture. Changes recorded so the gap can't creep back during execution:

**Adopted from the blueprint:**
- **The `Move` abstraction** (§6.1.1) — `legalMoves.ts` now returns `Move[]` (with `path: Position[]`, `finalProgress`, capture/home/finish flags) instead of bare token IDs. This is the choreography contract the Director consumes for tile-by-tile hops and timed particles. Best idea in the blueprint.

**Restored against the blueprint (it had dropped these):**
- **Phase machine** (`GamePhase` enum, `Action` union, phase-gated `dispatch`) — v3 §4. The blueprint's `dice.isRolling` boolean is not a substitute.
- **`RulesConfig`** threaded through the engine — plan §6.1. The blueprint hardcoded "6 grants extra turn."
- **Single-`progress` `Token`** with derived `getPhase()` — v3 §5. The blueprint re-added a `state: TokenState` field, reintroducing the desync risk the foundation was designed to eliminate.
- **The reducer** `engine.ts` (`applyAction`) — plan §6.3. The blueprint listed loose functions with no orchestrator.
- **Injectable RNG** (`roll(rng)`, reducer takes `rng`) — plan §6.2/§6.3, for deterministic tests.
- **`consecutiveSixes` counter + 3×-forfeit, turn-skip for finished, `NO_LEGAL_MOVE` handling** — plan §6.7 gate.
- **`win.ts`** — plan §6.2. Missing entirely from the blueprint.

**Corrected:**
- **Capture reset target is `BASE` (`-1`), not `0`.** `progress 0` is the entry cell (back in play). A test asserting "reset to 0" would encode a bug where captured tokens instantly re-enter the board. The capture test asserts `progress === BASE`.
- **Naming aligned to the foundation:** `Color` (not `PlayerColor`, which `track.ts` already exports and tests); `Token` includes `slot`; event names match §6.4 (`TOKEN_HOP`/`PLAYER_WON`/`NO_LEGAL_MOVE`, not `TOKEN_MOVED`/`GAME_WON`).
- **Gate scope** hardened to plan §6.7's full list (the blueprint's gate was a strict subset missing consecutive-sixes, turn-skip, win, no-move).

---

## 7. Phase 2 — Skeleton (R3F)

### 7.1 Minimal 3D scene

- `director/CanvasWrapper.tsx`: `<Canvas dpr={[1,2]} shadows={false}>` (shadows off; using ContactShadows).
- `director/Scene.tsx`: lights + HDRI + board + tokens + dice.
- Lighting: 1 key directional + low ambient + HDRI env. Baked AO on board texture.
- `director/Board.tsx`: static GLB, `ContactShadows` underneath.

### 7.2 Instanced tokens

- `director/Token.tsx`: subscribes to its token via `useGame(s => s.tokens[id])`.
- On click: `dispatch(REQUEST_MOVE)` — instant teleport first (no animation yet).
- 16 instances of one mesh, color via material.

### 7.3 Position → Vector3 boundary (the v3 fix)

`director/config/boardGeometry.ts` owns:
- `boardGeometry.json` — the exported coordinate data (see §7.3.1)
- typed accessors: `SHARED_TRACK_COORDS: Vector3[52]`, per-color home-column `Vector3[5]`, yard-slot `Vector3[4]` per color
- `positionToVector3(color, position, slot): Vector3`

**`oracle/` has zero `three` imports.** Verified by ESLint (Phase 0).

#### 7.3.1 Authoring the 88 coordinates (avoiding the hand-typing trap)

Hand-typing 88 `Vector3` values from Blender is error-prone (transposed digits, sign flips) and unverifiable until Phase 2. Instead:

**Step 1 — Paper sketch first.** Before opening Blender, lay out all 88 coordinates on graph paper / Figma relative to board dimensions. You verify in Blender, you don't discover there.

**Step 2 — Systematic Empties in Blender.** Place a Blender `Empty` on every cell and name it systematically:
- `track_0` … `track_51` (shared loop)
- `home_red_0` … `home_red_4`, `home_green_0` …, etc. (home columns)
- `yard_red_0` … `yard_red_3`, etc. (yard slots)

**Step 3 — Export script (`tools/export_board_coords.py`, ~15 lines).** Iterates Empties, writes `src/director/config/boardGeometry.json`:
```json
{
  "track":  [[x,y,z], … 52],
  "home":   { "red": [[…5]], "green": […], "yellow": […], "blue": […] },
  "yard":   { "red": [[…4]], "green": […], "yellow": […], "blue": […] }
}
```

**Step 4 — Validation test (`director/config/__tests__/boardGeometry.test.ts`)** runs at import time and fails the build on:
- Exact counts: 52 track, 5×4 home, 4×4 yard (= 88).
- No duplicates, no `NaN`, no `Infinity`.
- Consecutive track cells within a min/max distance band (catches a misplaced Empty).
- Each color's 5 home cells roughly collinear.
- **Parity with the track model:** cross-check a few sample `track_N` indices against `progressToPosition(color, N − ENTRY_OFFSET[color])` so a Blender mislabel can't desync from the logic.

> **Trap avoided (Trap 3):** This turns a miserable weekend of coordinate typing into a 30-minute Blender session + an automated test that catches placement errors at build time, not play time.

### 7.4 Stage (minimal)

- `stage/HUD.tsx`, `stage/DiceButton.tsx`, `stage/PlayerPanel.tsx` — read-only initially.
- `pointer-events-none` on overlay container; `pointer-events-auto` on controls only.

### 7.5 Phase 2 gate

- Static board renders, looks premium.
- Clicking a 2D "Move token" button teleports the 3D token to the new position.
- OrbitControls configured for both devices.
- **No animation yet** — that's Phase 3.
- **Data-driven rendering (RULES-AND-SETTINGS-ARCHITECTURE §4).** Yards, token instances, and home-column renders derive from `state.turnOrder`, not a hardcoded `COLORS` array. A 2-player game renders 2 yards + 8 tokens; 3-player renders 3 yards + 12 tokens; 4-player renders all 4. `ENTRY_OFFSET` stays the 4-color map (the physical board is fixed). `createInitialState(colors, rules?)` takes explicit colors; the Oracle-owned `colorsForPlayerCount(n)` helper maps `2→red+yellow` (opposite corners), `3→red/green/yellow` (blue's corner is dead), `4→all`. The board model (`boardGeometry.json`) supports all 4 home columns/yards regardless of how many are active — inactive ones are simply unpopulated. **Rationale:** this is the only Director assumption the v1.5 2p/3p shortlist threatens; locking it into the gate now is cheaper than retrofitting it after building 4 hardcoded yards.

---

## 8. Phase 3 — Puppeteer (GSAP + phase machine live)

### 8.1 Phase machine enforcement

Store's `dispatch` rejects out-of-phase actions (e.g. `REQUEST_ROLL` during `ANIMATING_MOVE`). Director calls `RESOLVE_*` only from GSAP `onComplete`.

### 8.1.1 GSAP × React 18 Strict Mode (the `useGsapTimeline` contract)

React 18 Strict Mode double-invokes effects in dev (`mount → unmount → remount`). A GSAP timeline that isn't properly scoped and reverted will stack on itself (2× speed), animate against stale refs, or drift. **This is the #1 source of "token drifting away" bugs.** The fix is mandatory across all Director animation:

- **`gsap.context()`** scopes every selector/tween to the component. No global selectors.
- **Cleanup returns `ctx.revert()`** — kills the timeline *and* reverts inline styles to pre-tween state, so the remount starts clean.
- **`useLayoutEffect` for state-setting tweens** (token resting position, dice resting orientation). Runs before paint → no one-frame flash of wrong state.
- **`useEffect` for event-triggered tweens** (a hop that starts when `TOKEN_HOP` fires). Runs after paint → fine, no initial visual state to set.
- SSR/Canvas-safe: the R3F reconciler renders canvas children, where the double-mount manifests — the pattern applies there too.

Reference implementation (lives in `director/anim/gsap.ts`, all animation goes through it):

```ts
// Contract: every timeline must go through this hook.
function useGsapTimeline(setup: () => gsap.core.Timeline, deps: any[]) {
  const ref = useRef<gsap.core.Timeline | null>(null);
  useLayoutEffect(() => {
    const ctx = gsap.context(() => { ref.current = setup(); });
    return () => ctx.revert();   // kills timeline + reverts inline styles
  }, deps);
  return ref;
}
```

> **Trap avoided (Trap 1):** No raw `gsap.to(...)` calls anywhere in `director/`. The lint rule can additionally grep for direct `gsap.` usage outside `anim/` to enforce funneling through this hook.

### 8.2 Dice (`director/anim/diceRoll.ts`)

24 pre-baked GSAP timelines (4 orientations × 6 faces). On `DICE_ROLLED{value}`, pick the one guaranteed to land on `value`. ~1.2s each. No physics.

### 8.3 Token hop (`director/anim/tokenHop.ts`)

Per-cell timeline:
1. lift (y up)
2. translate (bezier arc)
3. land (squash Y, stretch X)
4. recover

~180ms/cell. Multi-step = N sequential timelines. GSAP context per component → cleanup on unmount.

### 8.4 Camera (`director/CameraRig.tsx`)

- Subscribes `TURN_CHANGED` → ease-orbit to active player's base.
- Subscribes moving-token events → follow during hops.
- `OrbitControls`: `enablePan={false}`, polar `[0.3, π/2.2]`, zoom clamp, `enableDamping`.

### 8.5 Phase 3 gate

- Dice rolls with animation landing on the correct face.
- Tokens hop cell-by-cell with squash/stretch.
- Camera follows action.
- No double-roll/double-move bugs (phase machine holds).
- Still no sound/particles — that's Phase 4.

---

## 9. Phase 4 — Juice

### 9.1 Audio (`src/audio/AudioBus.ts`)

Howler + single sprite sheet. Subscribes to bus events:
- `DICE_ROLLED` → roll.wav → clatter.wav
- `TOKEN_HOP` → hop.wav
- `TOKEN_CAPTURED` → capture.wav
- `TURN_CHANGED` → turn.wav
- `PLAYER_WON` → fanfare.wav

### 9.2 Particles (`director/effects/Particles.tsx`)

- dust puff on token land
- spark burst on capture
- confetti on win / token-home

### 9.3 Post-FX (`director/effects/PostFX.tsx`)

- **Bloom only**, applied to safe-zone + finish emissive materials.
- No SSAO, no DoF in v1. (Baked AO covers depth.)

### 9.4 Capture drama

- victim fly-back arc + spin
- 0.3s slow-mo via `gsap.globalTimeline.timeScale`
- screen flash of player color
- "Capture!" popup (Stage)

### 9.5 Phase 4 gate

- Roll, hop, capture, win all have audio + visual feedback.
- Runs at 60fps on a mid-range laptop, 30+fps on a mid-range phone (quality tier auto-selected).

---

## 10. Phase 5 — Bots

Bots are **in v1 scope** (solo play must work without 4 humans). Because AI reads selectors only and never imports React/three, it can be developed **immediately after Phase 1** (in parallel with Phases 2–4). Recommended sequencing: build the bot in Phase 1 alongside the rules so the 2D harness can stress-test it before any 3D exists.

`src/oracle/ai.ts` — reads selectors only, never imports React/three. Heuristic priority:
1. Capture if available.
2. Move token closest to finish.
3. Move token out of yard on 6.
4. Random valid.

Pluggable via `RulesConfig.bots: Color[]`. When `currentPlayer ∈ bots`, the store auto-dispatches on `TURN_CHANGED` after a configurable think delay (e.g. 600–1200ms) so the player can follow the bot's move.

**Difficulty tiers** (config flag, ship Easy + Medium in v1):
- Easy: weighted-random over the priority list.
- Medium: always-pick by priority, slight forward-looking risk avoidance (don't park next to an opponent).
- Hard: v2 (proper board evaluation).

**Phase 5 gate:** a 1-human + 3-bot game plays to completion in the 2D harness; bots make sensible moves (capture when available, don't forfeit legal moves); no bot ever dispatches an illegal action.

---

## 11. Performance Budget (mobile)

| Setting | Low (mobile) | Med | High (desktop) |
|---|---|---|---|
| DPR cap | 1 | 1.5 | 2 |
| Particles | ¼ count | ½ | full |
| Bloom | off | on | on |
| AA | off | on | on |

Detected once at startup via `navigator.hardwareConcurrency` + UA + a 100ms GPU probe. **Never hot-swap mid-game.**

---

## 12. Definition of Done — v1

- [ ] 4-player hot-seat Ludo playable end-to-end.
- [ ] **Solo mode: 1 human + 3 bots playable end-to-end** (Easy + Medium difficulty).
- [ ] All Oracle unit tests green (track + rules).
- [ ] ESLint layer rules clean.
- [ ] Dice deterministic, lands on correct face.
- [ ] Tokens hop with squash/stretch.
- [ ] Captures have audio + particles + slow-mo.
- [ ] Win triggers confetti + fanfare + overlay.
- [ ] 60fps desktop / 30+fps mobile mid-range.
- [ ] No phase-machine race conditions (manually verified by spam-clicking).
- [ ] Premium minimalist aesthetic (wood + matte + soft light).

---

## 13. Explicitly OUT of v1

Skins, emotes, power-ups, online multiplayer, accounts, leaderboards, 2/3-player modes, character rigs, announcer voice, battle pass, seasonal events, haptics, spectator mode, Hard-difficulty bots. **All of these are v2+.** (Easy + Medium bots are in v1.)

---

## 14. Risk Register

| Risk | Mitigation |
|---|---|
| Track wrap-around bug | 8 dedicated wrap tests in Phase 0.5 (the #1 bug source). |
| Layer violation creep | ESLint guardrail verified Day 1; CI runs lint. |
| Vector3 leak into Oracle | `track.ts` returns `Position` only; geometry is in `director/`. |
| Stacking regret | `'none'` removes the class entirely; `'block'` is additive in v2. |
| Mobile perf | Bloom-only, ContactShadows, quality tiers, instanced tokens. |
| GSAP orphan tweens ("drifting tokens") | **Mandatory `useGsapTimeline` hook** (§8.1.1): `gsap.context()` + `ctx.revert()` cleanup + `useLayoutEffect` for state-setting tweens. Handles React 18 Strict Mode double-mount. |
| Art scope creep | 1 token mesh × 16 instances. No character rigs. |
| Phase race conditions | explicit `GamePhase` enum gates every action. |

---

## 15. Cross-Check vs `ARCHITECTURE-v3.md`

| v3 § | v3 says | This plan | ✅ |
|---|---|---|---|
| §1 Principles | One-way flow, Oracle pure, deterministic | §4 guardrails, §5 track, §8 deterministic | ✅ |
| §2 Layers | Oracle/Director/Stage + bus | §4.3 folders, §4.4 ESLint | ✅ |
| §3 Structure | Full tree | §4.3 reproduces it exactly | ✅ |
| §4 Phase machine | 6 phases, gate table | §6.1 same enum, §8.1 enforced | ✅ |
| §5 Track model | single `progress`, derived `getPhase` | §5.1–5.2 identical | ✅ |
| §6 RulesConfig | full flags | §6.1 same, `stacking:'none'` (downgraded per §1) | ✅ |
| §7 Reducer | `applyAction(state, action, rng)` | §6.3 same signature incl. injectable rng | ✅ |
| §8 Event bus | typed union + broadcast | §6.4 same | ✅ |
| §9 Position→Vector3 | Director owns geometry | §7.3 explicit | ✅ |
| §10 Turn anatomy | request→resolve handshake | §8.1 + §10 dataflow | ✅ |
| §11 Deterministic anim | 24 dice timelines, bezier hops | §8.2, §8.3 | ✅ |
| §12 Mobile discipline | Bloom-only, ContactShadows, baked AO | §9.3, §11 | ✅ |
| §13 Testing | 50+ track tests, injectable rng | §5.4 = 57 tests, §6.3 rng | ✅ |
| §14 ESLint | `no-restricted-imports` | §4.4 full config | ✅ |
| §15 Multiplayer-ready | pure reducer, intent-only client | §6.3 reducer (server-portable) | ✅ |
| §16 Build phases | 0.5 → 6 | §3 map + §5–§10 detail | ✅ |

**Deviations (both intentional, both called out):**
1. `stacking: 'none'` instead of `'block'` — per discussion; v3 §6 listed `'block'` as example, this plan locks `'none'` for v1. Documented in §1 and §14.
2. v3 §16 Phase 6 = Network. This plan drops Network from v1 scope entirely. Bots (v3 Phase 5) are **kept in v1** and can be developed in parallel with Phases 2–4 since they depend only on the Oracle.

**No architectural contradictions found.** The plan is a strict subset of v3 with two scope decisions made explicit.

---

## 16. Next Action

Once this plan is approved:
1. Execute Phase 0 (scaffold + ESLint + folder tree + guardrail verification).
2. Execute Phase 0.5 (track.ts + 57 tests, green gate).
3. Report back with the green `vitest` output before touching Phase 1.
