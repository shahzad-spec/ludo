# Phase 4 — Implementation Plan (Juice & Cosmetics)

> Companion to `PHASE-4-JUICE-AND-COSMETICS.md` (the architecture/decision doc).
> Where this plan and the architecture doc disagree, the **architecture doc wins**
> (it is the decision artifact; this is the build order).
>
> **Status:** Draft for review. No code until approved.
> **Pre-approval:** All five §10 decisions from the architecture doc are locked
> (Tier split, stylized low-poly matte, curated+free skins, CC0-first sourcing,
> music deferred to 4.5).

---

## 1. Locked Decisions (from architecture doc §10)

| # | Decision | Value |
|---|---|---|
| 1 | Tier split | Tier 1 (8 rows) ships first; Tier 2 defers |
| 2 | Art direction | Stylized low-poly matte |
| 3 | Default skins | red=lion, green=eagle, yellow=elephant, blue=cheetah; all 6 models (add dinosaur + human) in catalog; free choice per color |
| 4 | Sourcing | CC0 library first (Poly Pizza/Kenney/Sketchfab-CC), AI fallback, commission last; Blender cleanup mandatory regardless |
| 5 | Music | Defer to Phase 4.5; SFX-only in Phase 4 |
| 6 | cosmeticsStore tests | 3–4 unit tests added to the 4F gate (setSkin persists, null → pawn fallback) |

---

## 2. Step Map

| Step | Name | Exit gate |
|---|---|---|
| 4A | AudioBus (Howler) + Tier 1 SFX wiring | Every Tier 1 event has a sound; 197 tests green |
| 4B | Particle system (dust, sparks, confetti) | Effects fire on triggers; auto-clean; 197 tests green |
| 4C | Capture drama (slow-mo, fly-back, flash, popup) | Capture feels dramatic; spam-safe; 197 tests green |
| 4D | Yard-entry pop + finish/win celebration | Milestone moments land; 197 tests green |
| 4E | Dice color per turn | Die tints to player color on TURN_CHANGED |
| **—** | **Tier 1 gate (mandatory stop)** | Capture, yard-entry, win on screen; 197 tests unmodified; lint+funnel clean |
| 4F | Cosmetics (skins: store + config + GLB branch + picker) | cosmeticsStore tests green; GLB loads with fallback |

Each step has a gate. Step N+1 does not start until N's gate passes.
**Tier 2 polish is NOT in this plan** — it lands opportunistically after the Tier 1 gate.

---

## 3. Step 4A — AudioBus (~half day)

### 3.1 Files

| File | Action | Responsibility |
|---|---|---|
| `src/audio/AudioBus.ts` | NEW | Howler setup; subscribes to bus events; plays SFX |
| `src/audio/sfx.ts` | NEW | SFX sprite map (file → Howl), volume/mute state |
| `src/store/audioStore.ts` | NEW | Volume + mute persisted to localStorage (Zustand) |
| `src/App.tsx` | MODIFY | Mount `<AudioBus/>` once (it's a non-rendering subscriber) |

### 3.2 API

```ts
// src/audio/sfx.ts
import { Howl } from 'howler';

/** Map of sound id → Howl instance. Preloaded on mount. */
export const SFX: Record<string, Howl> = {
  diceRoll:  new Howl({ src: ['/assets/audio/dice_roll.mp3'] }),
  collide:   new Howl({ src: ['/assets/audio/collide.mp3'] }),
  pileMove:  new Howl({ src: ['/assets/audio/pile_move.mp3'] }),
  safeSpot:  new Howl({ src: ['/assets/audio/safe_spot.mp3'] }),
  homeWin:   new Howl({ src: ['/assets/audio/home_win.mp3'] }),
  cheer:     new Howl({ src: ['/assets/audio/cheer.mp3'] }),
  ui:        new Howl({ src: ['/assets/audio/ui.mp3'] }),
  gameStart: new Howl({ src: ['/assets/audio/game_start.mp3'] }),
};
```

```ts
// src/audio/AudioBus.ts
// Subscribes to the event bus; plays SFX on:
//   DICE_ROLLED → diceRoll
//   TOKEN_MOVED (isEnteringBoard via first path cell) → pileMove
//   TOKEN_CAPTURED → collide + cheer
//   PLAYER_WON → homeWin + cheer
//   NO_LEGAL_MOVE → ui (error variant)
// Also subscribes to safe-cell landing (Director-side check) → safeSpot.
// Volume/mute from audioStore.
```

```ts
// src/store/audioStore.ts
interface AudioStore {
  volume: number;     // 0..1
  muted: boolean;
  setVolume: (v: number) => void;
  toggleMute: () => void;
}
// Persisted to localStorage key 'ludo-3d:audio'.
```

### 3.3 Event → Sound mapping

| Event | Sound(s) | Condition |
|---|---|---|
| `DICE_ROLLED` | `diceRoll` | always |
| `TOKEN_MOVED` | `pileMove` | `path[0].kind === 'base'` (yard entry) |
| `TOKEN_CAPTURED` | `collide` then `cheer` (200ms delay) | always |
| `PLAYER_WON` | `homeWin` then `cheer` (overlap) | always |
| `NO_LEGAL_MOVE` | `ui` (lower volume) | always |
| Safe cell landing | `safeSpot` | Director detects via `isSafeTrackCell` |

### 3.4 Gate

- Every Tier 1 event produces a sound at the right moment.
- Mute toggle works (localStorage persists).
- 197 Oracle+geometry tests green unmodified.
- Lint clean.

### 3.5 Risks

| Risk | Mitigation |
|---|---|
| Browser autoplay policy blocks audio before user interaction | Howler handles this; first sound plays after the Roll click (a user gesture) |
| SFX overlap sounds muddy | Howler's `rate()` + volume control; limit `cheer` to not re-trigger within 500ms |

---

## 4. Step 4B — Particle System (~half day)

### 4.1 Files

| File | Action | Responsibility |
|---|---|---|
| `src/director/effects/Particles.tsx` | NEW | Particle effect components (dust, sparks, confetti) |
| `src/director/effects/EffectManager.tsx` | NEW | Spawns one-shot effects on bus events; auto-cleans |
| `src/director/Scene.tsx` | MODIFY | Mount `<EffectManager/>` |

### 4.2 Particle effects

| Effect | Trigger | Implementation |
|---|---|---|
| Dust puff | Each hop landing (per-cell) | 5–8 small grey `<Points>`, upward velocity, gravity, 300ms life |
| Spark burst | `TOKEN_CAPTURED` | 12–16 radial sparks at capture cell, player-colored, 500ms |
| Confetti | `isFinishing` / `PLAYER_WON` | 20–30 colored rectangles, gravity, 1.5s life |
| Shield shimmer | Safe cell landing | Gold ring scale-up pulse (reuse ring geometry), 400ms |

### 4.3 EffectManager pattern

```tsx
// EffectManager maintains a list of active effects. On a bus event, it pushes
// a new effect (with a unique key + position + type). Each effect component
// self-removes via GSAP onComplete → onComplete removes itself from the list.
interface ActiveEffect {
  id: string;
  type: 'dust' | 'sparks' | 'confetti' | 'shimmer';
  position: [number, number, number];
  color?: string;
}
```

### 4.4 Gate

- Dust puffs appear on every cell landing during hops.
- Spark burst fires on capture.
- Confetti fires on token finish + player win.
- Shield shimmer fires on safe cell landing.
- All effects auto-clean (no memory leak; verify by playing 20 turns).
- 197 tests green.

---

## 5. Step 4C — Capture Drama (~1 day, the centerpiece)

### 5.1 Files

| File | Action | Responsibility |
|---|---|---|
| `src/director/anim/captureSequence.ts` | NEW | The 7-step capture drama timeline |
| `src/director/Token.tsx` | MODIFY | On `TOKEN_CAPTURED` (victim), play fly-back arc |
| `src/stage/CapturePopup.tsx` | NEW | DOM "Capture!" popup overlay (Stage layer) |
| `src/director/effects/ScreenFlash.tsx` | NEW | Full-screen player-color flash overlay |

### 5.2 The 7-step sequence (architecture doc §6)

On `TOKEN_CAPTURED`:
1. **Slow-mo:** `gsap.globalTimeline.timeScale(0.3)` for the duration.
2. **Attacker bounce:** scale 1.0→1.2→1.0, elastic, 300ms.
3. **Victim fly-back:** bezier arc from capture cell → yard slot, 360° Y-spin, 800ms.
4. **Spark burst:** (from 4B, already wired to this event).
5. **Screen flash:** player-color overlay, opacity 0→0.3→0, 200ms.
6. **"Capture!" popup:** DOM overlay, scale-in + fade-out, 600ms.
7. **Camera shake:** position jitter, 3 cycles, damped sine, 200ms.

### 5.3 Victim fly-back challenge

The victim token's progress is already reset to BASE by the engine (on
RESOLVE_MOVE). But the fly-back animation needs to start from the capture cell
and arc to the yard. The `TOKEN_CAPTURED` event carries the `cell` (capture
location). The victim's yard position comes from `YARD_COORDS[color][slot]`.

**Sequence:** TOKEN_CAPTURED fires → victim animates fly-back → on complete,
slow-mo restores. The victim's state is already BASE (reset by engine), so the
visual position must be overridden during the fly-back, then snap to yard on
completion.

### 5.4 Gate

- Capture triggers all 7 steps in sequence.
- Slow-mo restores to 1.0 after the sequence.
- No stacked timelines under spam (phase machine prevents double-capture).
- 197 tests green.

---

## 6. Step 4D — Yard-Entry Pop + Finish/Win Celebration (~half day)

### 6.1 Yard-entry pop

On `TOKEN_MOVED` where `path[0].kind === 'base'` (yard entry):
- Token scales 0→1.15→1.0 (elastic overshoot), 400ms.
- Dust ring expands from entry cell (particle effect).
- Yard plate flashes (opacity pulse).

### 6.2 Finish celebration

On `TOKEN_MOVED` where `isFinishing === true`:
- Token does a victory spin (360° Y rotation), 500ms.
- Confetti burst at center (from 4B).
- `homeWin.mp3` (from 4A).

### 6.3 Win celebration

On `PLAYER_WON`:
- All 4 of the winner's tokens dance in sync (bounce up/down, staggered).
- Confetti cannons (sustained 2s burst).
- Camera orbit shot (gentle 360° around board, 3s).
- Trophy overlay (DOM, Stage layer) — simple emoji or SVG.
- `cheer.mp3` + `homeWin.mp3` (from 4A).

### 6.4 Files

| File | Action |
|---|---|
| `src/director/anim/celebrationSequence.ts` | NEW — finish spin + win dance + camera orbit |
| `src/director/Token.tsx` | MODIFY — yard-entry pop + finish spin |
| `src/stage/VictoryOverlay.tsx` | NEW — trophy + winner name (DOM, Stage) |
| `src/director/Scene.tsx` | MODIFY — mount VictoryOverlay trigger |

### 6.5 Gate

- Yard entry: token pops in with elastic + dust ring.
- Finish: token spins + confetti + sound.
- Win: all tokens dance + confetti + camera orbit + trophy overlay.
- 197 tests green.

---

## 7. Step 4E — Dice Color Per Turn (~1 hour)

### 7.1 Implementation

Dice.tsx subscribes to `state.currentPlayer`. On `TURN_CHANGED` (or initial
mount), GSAP tweens each face material's `.color` from current to the player's
pastel color (lerp player hex 60% toward white). Black pips stay black
(black × any = black); the white background tints.

```tsx
// In Dice.tsx, on currentPlayer change:
const targetColor = pastelColor(currentPlayer); // lerp 60% toward white
materials.forEach((mat) => {
  gsap.to(mat.color, { r: targetColor.r, g: targetColor.g, b: targetColor.b, duration: 0.4 });
});
```

### 7.2 Pastel helper

```ts
function pastelColor(color: Color): THREE.Color {
  const base = new THREE.Color(COLOR_HEX[color]);
  const white = new THREE.Color('#ffffff');
  return base.lerp(white, 0.6); // 60% toward white
}
```

### 7.3 Gate

- Die body tints to player color on every turn change.
- Pips remain readable (black on pastel).
- 197 tests green.

---

## 8. Tier 1 Gate (mandatory stop after 4A–4E)

| Criterion | How verified |
|---|---|
| Fresh game: yard entry pops with dust + sound | Manual playtest |
| Token hops have audible tap per cell | Manual playtest |
| Capture triggers full drama (slow-mo, spark, fly-back, flash, popup) | Manual playtest |
| Token finish triggers spin + confetti | Manual playtest |
| Player win triggers celebration (confetti, camera, trophy) | Manual playtest |
| Dice color matches current player's color | Manual playtest |
| Safe cell landing triggers shield shimmer + sound | Manual playtest |
| AudioBus plays SFX for all Tier 1 events | Manual playtest |
| 197 Oracle+geometry tests green **unmodified** | `npm run test` |
| Lint clean (gsap funnel + layer boundaries) | `npm run lint` |
| `/?debug` harness still playable | Manual |

**This gate is visual/feel — there are no new Oracle unit tests because Phase 4
changes no Oracle contracts.** The 197 tests staying green unmodified IS the
proof the juice layer is choreographing, not ruling.

---

## 9. Step 4F — Cosmetics (skins, after Tier 1 gate)

### 9.1 Files

| File | Action | Responsibility |
|---|---|---|
| `src/store/cosmeticsStore.ts` | NEW | Persisted Zustand store: color → skinId |
| `src/director/config/tokenSkins.ts` | NEW | Skin catalog (id, label, url, scale, rotationY, yOffset) |
| `src/director/TokenSkin.tsx` | NEW | GLB loader + Suspense fallback to procedural pawn |
| `src/director/Token.tsx` | MODIFY | Conditional: skin ? <TokenSkin/> : <ProceduralPawn/> |
| `src/stage/SkinPicker.tsx` | NEW | Simple settings UI for choosing skins (Stage, Phase 4 minimal) |

### 9.2 tokenSkins.ts catalog

```ts
export interface TokenSkin {
  id: string;
  label: string;
  url: string;           // null-safe: if file missing, fallback to pawn
  scale: number;
  rotationY: number;
  yOffset: number;
}

export const TOKEN_SKINS: Record<string, TokenSkin> = {
  lion:      { id: 'lion',      label: 'Lion',      url: '/assets/models/tokens/lion.glb',      scale: 1.0, rotationY: 0, yOffset: 0 },
  eagle:     { id: 'eagle',     label: 'Eagle',     url: '/assets/models/tokens/eagle.glb',     scale: 1.0, rotationY: 0, yOffset: 0 },
  elephant:  { id: 'elephant',  label: 'Elephant',  url: '/assets/models/tokens/elephant.glb',  scale: 0.9, rotationY: 0, yOffset: 0 },
  cheetah:   { id: 'cheetah',   label: 'Cheetah',   url: '/assets/models/tokens/cheetah.glb',   scale: 1.0, rotationY: 0, yOffset: 0 },
  dinosaur:  { id: 'dinosaur',  label: 'Dinosaur',  url: '/assets/models/tokens/dinosaur.glb',  scale: 1.0, rotationY: 0, yOffset: 0 },
  human:     { id: 'human',     label: 'Human',     url: '/assets/models/tokens/human.glb',     scale: 1.0, rotationY: 0, yOffset: 0 },
};

export const DEFAULT_SKINS: Record<Color, string> = {
  red: 'lion',
  green: 'eagle',
  yellow: 'elephant',
  blue: 'cheetah',
};
```

### 9.3 cosmeticsStore tests (added per review)

```ts
// src/store/__tests__/cosmeticsStore.test.ts
describe('cosmeticsStore', () => {
  it('setSkin persists to the adapter', () => { ... });
  it('boots with default skins from an empty adapter', () => { ... });
  it('boots with saved skins from a pre-populated adapter', () => { ... });
  it('null/undefined skin → pawn fallback (TokenSkin handles)', () => { ... });
});
```

### 9.4 Token.tsx GLB branch

```tsx
const skinId = useCosmetics(s => s.skins[token.color]);
const skin = skinId ? TOKEN_SKINS[skinId] : null;

// Inside the group (position/animation/click unchanged):
{skin ? (
  <Suspense fallback={<ProceduralPawn color={token.color} />}>
    <TokenSkin url={skin.url} scale={skin.scale} rotationY={skin.rotationY} />
  </Suspense>
) : (
  <ProceduralPawn color={token.color} />
)}
```

### 9.5 Asset pipeline (Blender cleanup pass, mandatory)

Regardless of source (CC0 / AI / commission):
1. Open in Blender.
2. Set origin at the base (bottom-center).
3. Orient Y-up, facing +Z.
4. Uniform scale to fit within ~0.6 unit bounding box.
5. Decimate to ≤10k tris.
6. Single matte material (roughness 0.4, metalness 0.1).
7. Export Draco-compressed GLB.

### 9.6 4F Gate

| Criterion | Status |
|---|---|
| cosmeticsStore: 4 unit tests green | |
| GLB loads with Suspense fallback to pawn | |
| Missing GLB → pawn fallback (no crash) | |
| Skin picker UI changes the visible model | |
| Default skins (lion/eagle/elephant/cheetah) assigned on fresh boot | |
| 197 Oracle+geometry tests green unmodified | |
| Lint clean | |

---

## 10. Cross-Check vs `PHASE-4-JUICE-AND-COSMETICS.md`

| Arch doc § | Commitment | This plan | ✅ |
|---|---|---|---|
| §1.1 | Tier 1 (8 rows) first | §2 step map; §8 Tier 1 gate | ✅ |
| §1.2 | Tier 2 defers | Not in this plan (opportunistic) | ✅ |
| §2 | Dice tint via material.color (option B) | §7 | ✅ |
| §3 | AudioBus + Howler + 9 SFX | §3 (4A) | ✅ |
| §4 | Particles (dust/sparks/confetti/shimmer) | §4 (4B) | ✅ |
| §5 | Cosmetics: useCosmetics ≠ RulesConfig | §9 (4F) | ✅ |
| §5.1 | §1 lock overturn recorded | §9.2 (DEFAULT_SKINS, per-color models) | ✅ |
| §6 | Capture drama 7-step | §5 (4C) | ✅ |
| §7 | Phase 4 gate | §8 (Tier 1 gate) | ✅ |
| §8 | Execution 4A→4F | §2 step map | ✅ |
| §10 | Five decisions locked | §1 of this plan | ✅ |

**No contradictions.** One addition: cosmeticsStore tests (§9.3) per the review's
gate addition.

---

## 11. Risk Register

| Risk | Mitigation |
|---|---|
| Slow-mo (`globalTimeline.timeScale`) affects all tweens including UI | Restore to 1.0 immediately after capture sequence; scope slow-mo tightly (300ms) |
| Particle memory leak | Each effect self-removes via GSAP onComplete; EffectManager caps active effects at 50 |
| GLB loading stalls the game | Suspense fallback to procedural pawn; game never blocks on art |
| Audio autoplay blocked | First sound is triggered by Roll click (user gesture); Howler handles unlock |
| Capture fly-back fights with state-derived position | Victim uses same isAnimating suppression pattern as hop; snaps to yard on complete |
| Dice color tween fights with pip textures | Tween `material.color` (multiply), not texture; pips are black (unaffected) |
| Tier 2 scope creep | Tier 2 is explicitly out of this plan; only added post-gate if time permits |

---

## 12. Next Action (after approval)

1. Execute Step 4A (AudioBus) → report at 4A gate.
2. Execute Step 4B (Particles) → report at 4B gate.
3. Execute Step 4C (Capture drama) → report at 4C gate.
4. Execute Step 4D (Pop + Celebration) → report at 4D gate.
5. Execute Step 4E (Dice color) → report at 4E gate.
6. **Tier 1 gate stop** — full playtest verification.
7. Execute Step 4F (Cosmetics) → report at 4F gate.
8. Source/clean GLB models (parallel with 4F).
