# Phase 4 — Juice & Cosmetics Architecture

> Companion to `ARCHITECTURE-v3.md` and `IMPLEMENTATION-PLAN-v1.md`. Governs
> Phase 4 (juice: animation, audio, particles) and the cosmetics (token skins)
> subsystem. No code until approved.
>
> **Status:** Draft for review.

---

## 0. Scope

Phase 4 adds the "juice" — the audiovisual feedback that separates a working
game from one that *feels* premium. Every trigger maps to an **existing event
or Move flag** locked in Phase 1; zero Oracle changes.

This doc also covers **token cosmetics** (skins/statues), which overturn one
locked decision (§1) and require a separate persistence ruling.

---

## 1. Animation Catalog (Phase 4 scope)

### 1.1 Tier 1 — Feel-critical (ship first)

These are the animations that make the game *readable* and *satisfying*. Every
player will notice their absence.

| Trigger | Source | Animation | SFX |
|---|---|---|---|
| Yard entry (`isEnteringBoard`) | `TOKEN_MOVED` flag | Spawn pop: scale 0→1 elastic overshoot + dust ring | `pile_move.mp3` |
| Cell landing (each hop) | `TOKEN_MOVED` path iteration | Squash Y / stretch X on land + dust puff (exists) | `collide.mp3` (subtle) |
| Capture (`isCapture`) | `TOKEN_MOVED` flag + `TOKEN_CAPTURED` | **Victim fly-back arc + spin into yard**, attacker victory-bounce, 0.3s slow-mo, spark burst, player-color flash, "Capture!" popup | `collide.mp3` (loud) + `cheer.mp3` |
| Token finishes (`isFinishing`) | `TOKEN_MOVED` flag | Victory spin + confetti burst at center | `home_win.mp3` |
| Player wins (`PLAYER_WON`) | `PLAYER_WON` event | Confetti cannons, camera orbit, winner's tokens dance, trophy overlay | `cheer.mp3` + `home_win.mp3` |
| Dice rolled | `DICE_ROLLED` event | (exists) tumble + settle on correct face | `dice_roll.mp3` |
| Safe cell landing | Director-side check | Shield-shimmer ring pulse (gold) | `safe_spot.mp3` |
| Turn changes | `TURN_CHANGED` event | Dice color morph to player color + panel highlight | UI ping (`ui.mp3`) |

### 1.2 Tier 2 — Polish (if time permits, else Phase 4.5)

| Trigger | Animation | SFX |
|---|---|---|
| Dice rolls a 6 | Die glow pulse + panel pulse | Sting |
| No legal move (`NO_LEGAL_MOVE`) | Tokens "shrug" wobble, die grays out | Error blip |
| Invalid click (non-movable token) | Token wobbles "no" | Buzz |
| Home entry (`isEnteringHome`) | Trail sparkles up the home column + plate glow | Rising chime |
| Camera on turn change | Gentle orbit to active player's quadrant | — |
| Opponent near winning (3/4 finished) | Subtle heartbeat vignette + music intensity up | — |

**Rationale for the split:** Tier 1 covers the emotional peaks (capture, finish,
win) and readability (yard entry, safe cell, turn dice color). Tier 2 is
atmospheric polish. Shipping Tier 1 first prevents another regression-risk from
attempting 12 complex animations in one pass.

---

## 2. Dice Color Per Turn

Trivial but high-visibility polish. The die's body material tints to the current
player's color (pastel — lerp ~60% toward white so black pips keep contrast).
The dice pad's rim light matches.

**Implementation:** Dice.tsx subscribes to `state.currentPlayer`. On
`TURN_CHANGED`, a GSAP color tween (through the funnel) morphs the body material
color. The 6 pip-face textures stay black-on-white; only the *base* material
(between pips) tints.

Wait — the die uses 6 textured materials (pip faces), not a single base. The
tint must be applied to the pip-face textures' background color, not a separate
base material. Options:
- **(A) Regenerate textures per turn** (expensive, stutter risk).
- **(B) Tint via `material.color`** — `MeshStandardMaterial.color` multiplies
  the texture map. Set each face material's `.color` to the player pastel. The
  white background tints; black pips stay black (black × any color = black).

**Decision: (B).** One line per material, no texture regeneration.

---

## 3. Audio Architecture (`src/audio/AudioBus.ts`)

Howler.js + the 9 SFX files already copied to `public/assets/audio/`. The
AudioBus subscribes to the event bus and plays sounds on:

| Event | Sound |
|---|---|
| `DICE_ROLLED` | `dice_roll.mp3` |
| `TOKEN_MOVED` (first waypoint = yard entry) | `pile_move.mp3` |
| `TOKEN_CAPTURED` | `collide.mp3` + `cheer.mp3` |
| `PLAYER_WON` | `home_win.mp3` + `cheer.mp3` |
| `NO_LEGAL_MOVE` | `ui.mp3` (error variant) |

**Volume + mute** controlled by a `useSettings`-adjacent audio-level store
(localStorage). The AudioBus is Stage-layer (DOM audio, not 3D), but subscribes
to the same bus as the Director.

---

## 4. Particle System

R3F's `<Points>` or drei's `<Sparkles>` for lightweight particle effects:

| Effect | Trigger | Implementation |
|---|---|---|
| Dust puff on land | Each hop landing | Short-lived `<Points>` burst at landing position |
| Spark burst on capture | `TOKEN_CAPTURED` | Radial particle explosion at capture cell |
| Confetti on finish/win | `isFinishing` / `PLAYER_WON` | Gravity-affected confetti rectangles |
| Shield shimmer on safe | Safe cell landing | Gold ring pulse (existing ring, scaled up) |

All particles are **Director-layer** components, spawned on events, auto-cleaned
via GSAP `onComplete`. No new Oracle state.

---

## 5. Cosmetics Architecture (token skins)

### 5.1 The decision that overturns §1

`IMPLEMENTATION-PLAN-v1 §1` locked "1 mesh × 16 instances, material color-swap."
Token skins change this to **1 model per skin-set × N instances**. This is a
locked-decision change → recorded here.

**Impact:** Token.tsx gains a conditional GLB branch. The procedural pawn
becomes the fallback. Animation code (`tokenHop.ts`, selection logic) operates
on the token *group*, not the mesh — so skins swap in without touching `anim/`.

### 5.2 Where skin choices live: `useCosmetics`, NOT `RulesConfig`

**Critical ruling.** `RulesConfig` travels inside `GameState` and gets
server-validated in multiplayer. Cosmetics are per-device preferences — they
must NOT leak into the rules layer. Skins live in a separate persisted store:

```ts
// src/store/cosmeticsStore.ts
interface CosmeticsStore {
  skins: Partial<Record<Color, string>>;  // color → skin id (e.g. 'lion')
  setSkin: (color: Color, skinId: string) => void;
}
// Persisted to localStorage; consumed only by the Director.
```

### 5.3 Skin definition format

```ts
// src/director/config/tokenSkins.ts
interface TokenSkin {
  id: string;              // 'lion', 'eagle', etc.
  label: string;           // "Lion"
  url: string;             // '/assets/models/tokens/lion.glb'
  scale: number;           // uniform scale factor
  rotationY: number;       // base facing adjustment (radians)
  yOffset: number;         // base height offset
}
export const TOKEN_SKINS: Record<string, TokenSkin> = { ... };
```

### 5.4 Token.tsx GLB integration

```tsx
// Token.tsx (sketch)
const skinId = useCosmetics(s => s.skins[token.color]);
const skin = skinId ? TOKEN_SKINS[skinId] : null;

{skin ? (
  <Suspense fallback={<ProceduralPawn color={token.color} />}>
    <GLBSkin url={skin.url} scale={skin.scale} rotationY={skin.rotationY} />
  </Suspense>
) : (
  <ProceduralPawn color={token.color} />
)}
```

`useGLTF` from drei loads the model; `<Suspense>` falls back to the procedural
pawn during loading so dev is never blocked on art. The group (position,
animation, click-handling) wraps both branches identically.

### 5.5 Asset pipeline

1. **Source:** CC0 low-poly models (Poly Pizza, Kenney, Sketchfab-CC) or AI-generate (Meshy/Tripo).
2. **Blender cleanup pass:** origin at base, Y-up, facing +Z, uniform scale, ≤10k tris, single matte material.
3. **Export:** Draco-compressed GLB to `public/assets/models/tokens/`.
4. **Art-direction ruling:** stylized low-poly matte — "chess pieces with animal heads." A realistic lion clashes with the polished-wood board. The premium-minimalist aesthetic survives the theme injection.

### 5.6 Execution sequence for skins

After Phase 4 core gate:
1. Write `cosmeticsStore.ts` + `tokenSkins.ts`.
2. Source/clean 4 statue GLBs (lion, eagle, elephant, cheetah — one per color).
3. Add GLB branch to Token.tsx with Suspense fallback.
4. Add a simple skin-picker UI (Stage, settings panel).

---

## 6. Capture Drama — the centerpiece

Capture is Ludo's biggest emotional moment. It deserves the most juice.

**Sequence on `TOKEN_CAPTURED`:**
1. **Freeze:** `gsap.globalTimeline.timeScale(0.3)` for 0.3s (slow-mo).
2. **Attacker:** victory bounce (scale up 1.2×, back to 1.0, elastic).
3. **Victim:** fly-back arc — GSAP bezier from capture cell to yard slot, with
   360° spin on Y axis. Duration ~0.8s (slow due to timeScale).
4. **Spark burst:** radial particle explosion at the capture cell.
5. **Screen flash:** full-screen player-color overlay, opacity 0→0.3→0 over 0.2s.
6. **"Capture!" popup:** DOM overlay (Stage), animated scale-in + fade-out.
7. **Camera:** subtle shake (position jitter, 3 cycles, damped).

All through the GSAP funnel (`playOneShot` + `gsap.context`). The slow-mo
affects *all* timelines globally; restored to 1.0 on sequence complete.

---

## 7. Phase 4 Gate

| Criterion | Status |
|---|---|
| Fresh game: yard entry pops with dust + sound | |
| Token hops have audible tap per cell | |
| Capture triggers full drama (slow-mo, spark, fly-back, flash, popup) | |
| Token finish triggers spin + confetti | |
| Player win triggers celebration (confetti, camera, trophy overlay) | |
| Dice color matches current player's color | |
| Safe cell landing triggers shield shimmer | |
| AudioBus plays SFX for all Tier 1 events | |
| 197 Oracle+geometry tests green **unmodified** | |
| Lint clean (gsap funnel + layer boundaries) | |

---

## 8. Execution Order

| Step | What | Gate |
|---|---|---|
| **4A** | AudioBus (Howler) + Tier 1 SFX wiring | Every event has a sound |
| **4B** | Particle system (dust, sparks, confetti) | Effects fire on triggers |
| **4C** | Capture drama (slow-mo, fly-back, flash, popup) | Capture feels dramatic |
| **4D** | Yard-entry pop + finish/win celebration | Milestone moments land |
| **4E** | Dice color per turn | Die tints to player color |
| **4F** | Cosmetics note integration (skins) | After 4A–4E gate passes |

Tier 2 polish (§1.2) lands opportunistically within 4A–4E or as a fast-follow.

---

## 9. Cross-Check vs Existing Docs

| Commitment | Source | This doc | ✅ |
|---|---|---|---|
| Juice is Phase 4 | PLAN §3, §9 | §1 catalog | ✅ |
| Events drive animation | v3 §8 | §1 (every row maps to existing event/flag) | ✅ |
| GSAP funnel | PLAN §8.1.1 | §6 (all through playOneShot + context) | ✅ |
| Oracle untouched | v3 §1 | §7 gate (197 unmodified) | ✅ |
| Audio via Howler | PLAN §9.1 | §3 | ✅ |
| Mobile discipline | PLAN §12 | Particle counts modest; no DoF/SSAO | ✅ |
| 1 mesh × 16 instances | PLAN §1 | **Overtuned by §5.1** — recorded, justified | ⚠️ (amendment) |

**One amendment:** §5.1 overturns the "1 mesh × 16 instances" lock from PLAN §1.
This is intentional (skins require per-color models) and recorded here for
audit. The procedural pawn remains the fallback.

---

## 10. Open Decisions

1. **Tier 1 vs Tier 2 split** — confirm the 8-row Tier 1 ships first, 6-row Tier 2 defers.
2. **Skin art direction** — confirm "stylized low-poly matte" (not realistic).
3. **Default skin set** — lion/eagle/elephant/cheetah (one per color)? Or a free choice per color?
4. **Skin sourcing** — CC0 library hunt vs AI generation vs commission?
5. **Music** — background loop in Phase 4, or defer to Phase 4.5? (SFX only in the 4A step.)
