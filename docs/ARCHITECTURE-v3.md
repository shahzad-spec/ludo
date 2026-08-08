# 3D Ludo — Architecture (v3, Merged)

> Single source of truth for structure, data flow, and boundaries.
> Built from v1 (event-driven + rules config + tests) merged with v2 (explicit phase machine + Record token shape + mobile discipline).

---

## 0. TL;DR

A pure, testable **Oracle** (rules engine) holds all game state behind an explicit **phase machine**. It emits typed **events** for side-effect broadcast. The **Director** (R3F + GSAP) renders and animates; the **Stage** (React + Tailwind) shows the UI. Both subscribe to the Oracle and **never mutate state directly** — they only dispatch intents. Layers are isolated by an ESLint rule, not just discipline. All animation is deterministic (GSAP timelines, never physics).

**Stack:** Vite · TypeScript · React 18 · Tailwind · React Three Fiber + drei · Zustand · GSAP · Howler.js · Vitest.

---

## 1. Non-Negotiable Principles

1. **One-way data flow.** State flows Oracle → (Director | Stage). Intents flow (Director | Stage) → Oracle.
2. **The Oracle knows nothing about rendering.** No `THREE`, no DOM, no React. Pure TS, unit-testable in Node. **The boundary is enforced by ESLint, not goodwill.**
3. **The Director never mutates game state.** Not even mid-animation. The Oracle is the only writer.
4. **Phases gate everything.** Actions are legal only in specific phases. Animation-completion advances the phase.
5. **Animation is deterministic.** Dice and tokens are choreographed with GSAP. No physics simulation.
6. **Position is pure; coordinates are derived.** The Oracle reasons about logical `Position` only. World-space `Vector3` lives in the Director.

---

## 2. Three Layers

| Layer | Role | Tech | May import |
|---|---|---|---|
| **Oracle** | Rules, state, validation, win logic | Pure TS + Zustand | itself + `bus/` only |
| **Director** | 3D scene, camera, deterministic animation | R3F + drei + GSAP | Oracle, bus |
| **Stage** | UI overlays, input capture | React + Tailwind | Oracle, bus |
| **bus** | typed event emitter (cross-layer broadcast) | tiny lib | nothing |

**Director and Stage never import each other.** They communicate only through the store and the event bus. This is enforced by `no-restricted-imports`.

---

## 3. Directory Structure

```
ludo-3d/
├── docs/                    # this file + future design notes
├── public/assets/
│   ├── models/              # board.glb, token.glb, dice.glb (Draco)
│   ├── textures/            # KTX2, board_ao baked
│   ├── audio/               # sfx_sprite.mp3, music.ogg
│   └── hdri/                # environment.exr
├── src/
│   ├── main.tsx
│   ├── App.tsx              # <CanvasWrapper/> + <Stage/> overlay
│   │
│   ├── oracle/              # === LAYER 1: RULES (no rendering) ===
│   │   ├── types.ts         # Color, Token, Position, GameState, Action
│   │   ├── board/
│   │   │   ├── track.ts     # progressToPosition, ENTRY_OFFSET, etc.
│   │   │   └── safeCells.ts
│   │   ├── rules/
│   │   │   ├── dice.ts
│   │   │   ├── legalMoves.ts
│   │   │   ├── movement.ts
│   │   │   ├── capture.ts
│   │   │   ├── turns.ts
│   │   │   └── win.ts
│   │   ├── config/
│   │   │   └── rulesPreset.ts   # RulesConfig defaults + presets
│   │   ├── engine.ts        # applyAction(state, action) -> {state, events}
│   │   ├── selectors.ts     # pure read helpers
│   │   └── __tests__/       # Vitest suite
│   │
│   ├── bus/
│   │   └── events.ts        # typed GameEvent union + Emitter
│   │
│   ├── store/
│   │   └── useGame.ts       # Zustand: holds GameState, dispatch(), phase gating
│   │
│   ├── director/            # === LAYER 2: 3D (R3F) ===
│   │   ├── CanvasWrapper.tsx
│   │   ├── Scene.tsx        # lights, env, board, tokens, dice
│   │   ├── Board.tsx
│   │   ├── Token.tsx        # subscribes to one token; reacts to events
│   │   ├── Dice.tsx         # phase-gated; 24 pre-baked landing animations
│   │   ├── CameraRig.tsx
│   │   ├── config/
│   │   │   └── boardGeometry.ts   # Position -> Vector3 (Director owns this!)
│   │   ├── anim/
│   │   │   ├── gsap.ts      # GSAP context + timeline helpers
│   │   │   ├── diceRoll.ts  # 24 landing timelines, face-guaranteed
│   │   │   └── tokenHop.ts  # bezier-arc hop per cell
│   │   └── effects/
│   │       ├── Particles.tsx
│   │       └── PostFX.tsx   # Bloom only on safe/finish tiles
│   │
│   ├── stage/               # === LAYER 3: UI (React + Tailwind) ===
│   │   ├── HUD.tsx
│   │   ├── PlayerPanel.tsx
│   │   ├── DiceButton.tsx
│   │   ├── TurnIndicator.tsx
│   │   ├── Menu/
│   │   │   ├── MainMenu.tsx
│   │   │   ├── Setup.tsx
│   │   │   └── Settings.tsx
│   │   └── VictoryOverlay.tsx
│   │
│   ├── audio/
│   │   └── AudioBus.ts      # subscribes to events; Howler sprites
│   │
│   ├── theme/
│   │   ├── colors.ts
│   │   └── materials.ts
│   │
│   └── lint-rules/          # documentation of the ESLint layer rule
│       └── README.md
│
├── .eslintrc.cjs            # no-restricted-imports enforcing layers
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.js
├── package.json
└── README.md
```

**Folder boundaries:**
- `oracle/` imports from `oracle/` + `bus/` only. Any `import ... from 'three'` or `react` inside it → lint error.
- `director/` imports from `oracle/`, `bus/`, `store/`. Never `stage/`.
- `stage/` imports from `oracle/`, `bus/`, `store/`. Never `director/`.
- `director` and `stage` cannot import each other.

---

## 4. The Phase Machine (the load-bearing concept)

A strict enum gates every action. Animation-completion advances it.

```ts
type GamePhase =
  | 'IDLE'                 // current player can roll
  | 'ROLLING'              // dice animating; no input allowed
  | 'SELECTING_TOKEN'      // dice resolved; player picks a legal token
  | 'ANIMATING_MOVE'       // token hopping; no input allowed
  | 'RESOLVING_MOVE'       // capture/extra-turn checks; no input
  | 'GAME_OVER';
```

**Gate rules (enforced in the store's `dispatch`):**

| Action | Legal in phases |
|---|---|
| `requestDiceRoll()` | `IDLE` |
| `resolveDiceRoll(value)` | `ROLLING` (Director calls after dice animation) |
| `requestTokenMove(id)` | `SELECTING_TOKEN` |
| `resolveTokenMove()` | `ANIMATING_MOVE` (Director calls after hop) |
| anything | rejected if `phase === 'GAME_OVER'` |

**Why this matters:** It is impossible for a double-roll, double-move, or move-during-animation bug to exist. The phase enum makes them compile/runtime errors instead of heisenbugs.

---

## 5. The Track Data Model (the foundation)

Single source of truth per token: `progress`. No separate `state` field that can desync.

```
progress: BASE ─ 0 ───────────── 50 │ 51 52 53 54 55 ─ 56
           │     <─ shared loop ─►   <─ home column ─►  FINISH
         (yard)
```

- `BASE` (sentinel, e.g. `-1`) → token in yard.
- `0..50` → on the 52-cell shared loop (51 steps before diverting).
- `51..55` → the color's private 5-cell home column.
- `56` → finished.

```ts
const ENTRY_OFFSET: Record<Color, number> = { red: 0, green: 13, yellow: 26, blue: 39 };

type Position =
  | { kind: 'base' }
  | { kind: 'track'; cell: number }     // 0..51
  | { kind: 'home'; cell: number }       // 0..4
  | { kind: 'finished' };

function progressToPosition(color: Color, p: number): Position { /* ... */ }
function getPhase(progress: number): 'yard' | 'track' | 'home' | 'finished' { /* derived */ }
```

**Why this beats a `state` enum + `relativePosition`:** one writable number. A bug where `state='TRACK'` but `relativePosition=55` cannot exist. Consumers that want the readable enum call the derived `getPhase()`.

**This is the highest-leverage hour of the project.** Write 50+ unit tests tracing all four colors through entry, loop, home-column entry, exact-finish, and capture before writing any other rule.

---

## 6. Rules Configuration (decide early, never leave undefined)

```ts
interface RulesConfig {
  playerCount: 2 | 3 | 4;
  bots: Color[];                      // seats controlled by AI
  enterOnSix: boolean;                // token leaves yard only on a 6
  sixGrantsExtraTurn: boolean;
  captureGrantsExtraTurn: boolean;
  consecutiveSixesLimit: number;      // typically 3 → forfeit turn
  stacking: 'none' | 'block' | 'stack';
  captureOnSafeTiles: boolean;
  exactFinishRequired: boolean;
  turnTimerSec: number | null;
}
```

Threaded through `applyAction`. v1 ships one preset; the Settings screen swaps presets later. **Never refactor capture/movement/turn logic because of a rule change** — that's the whole point.

---

## 7. The Oracle: Types & Reducer

```ts
interface Token {
  id: string;            // 'red-0'
  color: Color;
  progress: number;      // BASE | 0..56
  slot: number;          // 0..3, index within color (for yard slot)
}

interface GameState {
  tokens: Record<string, Token>;   // O(1) lookup, narrow subscriptions
  turnOrder: Color[];
  currentPlayer: Color;
  dice: { value: number | null; rolled: boolean };
  phase: GamePhase;
  validMoveTokenIds: string[];     // populated after a roll
  consecutiveSixes: number;
  winners: Color[];
  rules: RulesConfig;
  turnHistory: TurnRecord[];
}

type Action =
  | { type: 'REQUEST_ROLL' }
  | { type: 'RESOLVE_ROLL'; value: number }     // Director, post-animation
  | { type: 'REQUEST_MOVE'; tokenId: string }
  | { type: 'RESOLVE_MOVE' }                     // Director, post-hop
  | { type: 'ACK_EVENT'; eventId: string };

// Pure reducer. Returns new state + side-effect events.
function applyAction(state: GameState, action: Action): { state: GameState; events: GameEvent[] };
```

The store wraps this: it validates phase-gating, runs the reducer, commits the new state to Zustand, and fans emitted events out to the bus.

---

## 8. The Event Bus (for broadcast side-effects)

The phase machine handles **sequencing**; events handle **broadcast**. They are complementary.

```ts
type GameEvent =
  | { type: 'DICE_ROLLED'; player: Color; value: number }
  | { type: 'TOKEN_LIFTED'; tokenId: string }
  | { type: 'TOKEN_HOP'; tokenId: string; fromCell: number; toCell: number }
  | { type: 'TOKEN_CAPTURED'; victimId: string; byId: string; cell: number }
  | { type: 'TOKEN_HOME'; tokenId: string }
  | { type: 'TURN_CHANGED'; player: Color }
  | { type: 'PLAYER_WON'; player: Color }
  | { type: 'NO_LEGAL_MOVE'; player: Color };
```

Each event is **one → many**. When `TOKEN_CAPTURED` fires:
- **Particles** spawn a burst on the victim.
- **AudioBus** plays capture.wav.
- **CameraRig** cuts to a 0.3s slow-mo.
- **Stage** shows the "Capture!" popup.

None of these know about each other. They each subscribe to `TOKEN_CAPTURED` once. Compare this to 4 separate `useEffect`s each diffing state to *infer* a capture — fragile and verbose.

**When to use which:**
- **Phase machine** = "when can X happen?" (sequencing).
- **Events** = "what just happened?" (broadcast).

---

## 9. The Position → Vector3 Boundary (the fix both prior plans got wrong)

The Oracle emits **logical Position only**. World coordinates are the Director's job.

```
Oracle: Token.progress = 14
   └─► progressToPosition() → { kind:'track', cell:27 }
            (no THREE imported here)

Director: positionToVector3({ kind:'track', cell:27 }) → Vector3(1.2, 0, -0.4)
   └─► GSAP animates the mesh to that coordinate
```

`director/config/boardGeometry.ts` owns the 52-entry `SHARED_TRACK_COORDS: Vector3[]`, the per-color home-column arrays, and the yard-slot coordinates. **`oracle/` has no `import type ... from 'three'` anywhere.** That's what makes "the Oracle knows nothing about rendering" literally true, and what lets the same engine run unchanged on a server in v6.

---

## 10. Data Flow — Anatomy of a Turn

```
Player clicks "Roll"
  │  [Stage] dispatch REQUEST_ROLL  (legal only in IDLE)
  ▼
[Oracle] roll=6, phase=ROLLING; emit DICE_ROLLED{6}
  │
  ├─► [Director: Dice]    plays "lands on 6" timeline (~1.2s)
  ├─► [Audio]             roll.wav → clatter.wav
  ├─► [Stage: HUD]        shows "6"
  ▼
Dice onComplete → dispatch RESOLVE_ROLL{6}
  │
[Oracle] compute legal moves → ['red-1']; phase=SELECTING_TOKEN
  │
  ├─► [Director: Token]   glowing ring under red-1
  ├─► [Stage]             highlights red-1 button
  ▼
Player clicks red-1
  │  [Director: onClick] dispatch REQUEST_MOVE{red-1}
  ▼
[Oracle] compute path; phase=ANIMATING_MOVE; emit TOKEN_HOP×N
  │
  ├─► [Director: Token]   N sequential bezier-arc hops (~180ms each)
  ├─► [Audio]             hop.wav × N
  ├─► [CameraRig]         follows the moving token
  ▼
Token onComplete → dispatch RESOLVE_MOVE
  │
[Oracle] capture check (none); extra-turn (yes, rolled 6); phase=IDLE
  │
  └─► (next roll, same player)
```

Every layer reacts to the same events. Swap audio off, swap 3D for 2D, run headless tests — the Oracle doesn't care. That's the payoff for the separation.

---

## 11. Animation: Deterministic, Never Physics

### Dice
24 pre-baked GSAP timelines (4 orientations × 6 faces). On `DICE_ROLLED{value}`, pick the timeline guaranteed to land face-up on `value`. Each ~1.2s with bounce + settle. No physics engine. No desync between players in multiplayer.

### Tokens
Per-cell GSAP timeline:
1. **Lift** — `position.y` up.
2. **Translate** — bezier arc across the cell gap.
3. **Land** — squash Y / stretch X (weight).
4. **Recover** — ease back to identity scale.

~180ms per cell. A 6-step move = 6 sequential timelines. GSAP context per component ensures cleanup on unmount (prevents "token drifts away" bugs).

### Camera
`CameraRig` subscribes to `TURN_CHANGED` (orbit to active player's base) and to the moving token's events (follow during hops). Always GSAP-eased, never instant.

---

## 12. Mobile-First Performance Discipline

Locked decisions for v1:

| Decision | Rationale |
|---|---|
| **Bloom only** on safe-zone + finish tiles | Cheap, high impact. No SSAO, no DoF in v1. |
| **`<ContactShadows/>`** instead of real-time shadows | Static soft blobs under tokens; no shadow-map cost. |
| **Baked AO** in board texture | Adds corner depth without runtime cost. |
| **Draco meshes + KTX2 textures** | ~80% smaller assets. |
| **Single HDRI** for PBR reflections | One image, no per-light fiddling. |
| **Audio sprites** (one mp3 + JSON timecodes) | Avoids 20 separate sound requests. |
| **Instancing** for repeated tiles | One draw call for the path. |
| **Quality tiers** auto-detected at startup | `low|med|high` toggles shadow/bloom/particle counts. Never hot-swap. |

A desktop-first "premium" tier (SSAO, DoF, real shadows) is a v2 concern gated behind a `graphics === 'high' && !isMobile` check — not the MVP baseline.

---

## 13. Testing Strategy

The Oracle is pure → test it mercilessly. This is where the architecture pays off.

- **Phase 0.5 (before any rule):** 50+ tests on `progressToPosition` for all 4 colors: yard, entry, loop, home-column entry, exact-finish, overshoot-illegal.
- **Phase 1:** full rules coverage — captures (safe vs unsafe), extra-turn on 6, consecutive-sixes forfeit, stacking-block, win detection, turn skipping for finished players.
- **Determinism:** RNG is injectable (`rollDice(rng: () => number)`), so tests pin specific rolls. No flaky tests.
- **Scope:** Director and Stage are *not* unit-tested in v1. They're verified by manual playtests. Only the Oracle is unit-tested.

---

## 14. Layer Enforcement (ESLint, not goodwill)

`.eslintrc.cjs` uses `no-restricted-imports` to make boundaries into compile errors:

```js
// pseudo — see lint-rules/README.md for the exact config
oracle/**   →  forbidden: 'react', 'three', '@react-three/*', DOM types
director/** →  forbidden: import from 'src/stage/**'
stage/**    →  forbidden: import from 'src/director/**'
```

This is what separates an architecture that survives a real codebase from one that rots in a month. A developer who tries to `import { useGame } from '../store'` inside `oracle/engine.ts` gets a lint error, not a working app that quietly violates the boundary.

---

## 15. Multiplayer-Ready (v6, pre-wired)

Because the Oracle is a pure reducer and the client only dispatches intents, moving to an authoritative server later is structural, not a rewrite:

1. Extract `oracle/` to a shared package (client + server import it).
2. Server runs `applyAction` as the source of truth; client becomes "dumb."
3. Client `REQUEST_ROLL` becomes a network message, not a local call.
4. Server validates, broadcasts the resulting state + events.
5. **Director and Stage code does not change.** They were already event-driven.

v1 ships local hot-seat; the architecture is pre-wired so v6 is a deployment change, not an architectural one.

---

## 16. Build Phases (mapped to folders)

| Phase | Deliverable | Folders touched |
|---|---|---|
| **0.5 — Track** | `track.ts` + 50 unit tests | `oracle/board/`, `oracle/__tests__/` |
| **1 — Brain** | Full Oracle, playable in 2D DOM harness | `oracle/`, `store/`, throwaway `stage/` |
| **2 — Skeleton** | R3F canvas, static board, instant token moves on click | `director/Scene,Board,Token`, `stage/HUD` |
| **3 — Puppeteer** | GSAP dice + hop timelines, phase machine live | `director/anim/`, `director/Dice` |
| **4 — Juice** | SFX + particles + selective bloom + camera follow | `director/effects/`, `audio/` |
| **5 — Bots** | Heuristic AI seats | new `oracle/ai.ts` (selectors only) |
| **6 — Network** | Authoritative server (Colyseus/PartyKit) | extract `oracle/` to shared pkg |

---

## 17. Changelog (v1 → v2 → v3)

This doc supersedes both prior plans. What each contributed:

**From v1 (kept):**
- Event-driven architecture for broadcast side-effects
- `RulesConfig` threaded through the engine
- Phase 0.5 testing strategy
- ESLint layer enforcement

**From v2 (kept):**
- Explicit phase machine as the load-bearing sequencing concept
- `Record<string, Token>` store shape
- Mobile-first post-processing discipline (Bloom-only, `ContactShadows`, baked AO)
- The `request → resolve` handshake pattern for animation gating

**New in v3 (the fix):**
- The Position → Vector3 boundary is now in the **Director**, not the Oracle. The Oracle emits logical Position only; `oracle/` has zero `three` imports. This makes "the Oracle knows nothing about rendering" literally true and server-portable.
- Phase machine + event bus are presented as **complementary**, not competing: phase = sequencing, events = broadcast.
- Single `progress` field + derived `getPhase()`, eliminating the `state`/`relativePosition` desync risk.

---

## 18. Open Questions (decide before Phase 0.5)

1. **Art direction:** cartoon / neon / royal / minimalist? Determines asset pipeline and how much personality tokens get in v1.
2. **Token count in v1:** 16 characterful models is a multi-week art job. Default to **abstract geometric tokens** in v1, character art in v2.
3. **Rules preset:** lock the v1 default (`enterOnSix: true`, `sixGrantsExtraTurn: true`, `captureGrantsExtraTurn: false`, `stacking: 'block'`, `exactFinishRequired: true`). Confirm or override.
4. **Player count:** 4-player only in v1? Or include 2-player variant?
5. **Target devices:** mobile-only, desktop-only, or both? This locks the performance budget (§12).
