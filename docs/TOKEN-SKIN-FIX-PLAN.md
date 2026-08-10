# Token Skin Rendering — Complete Implementation Plan

> Fixes the "models at center, wrong size" bug via per-skin tuning constants
> and the wrapping-group architecture. Timeboxed to 45 minutes with a kill
> switch: if it doesn't work, all URLs go to `null` and we proceed to Phase 5.

---

## 1. Confirmed Root Cause

### Empirical evidence (from GLB binary inspection)

**ALL 8 models use SkinnedMesh.** Binary GLB header analysis confirms:

| Model | Meshes | Skins | Skinned Nodes | Animations |
|---|---|---|---|---|
| Knight | 1 | 1 | 1 | 0 |
| Farmer | 4 | 4 | 4 | 24 |
| Wizard | 1 | 1 | 1 | 0 |
| Astronaut | 4 | 4 | 4 | 24 |
| Human | 1 | 1 | 1 | 11 |
| Robot | 14 | 2 | 2 | 14 |
| Skeleton | 2 | 1 | 1 | 15 |
| Zombie | 1 | 1 | 1 | 13 |

### Why this breaks auto-normalization

`Box3.setFromObject()` on a `SkinnedMesh` reads `geometry.boundingBox`,
which reflects the **bind pose** (T-pose with arms outstretched), NOT the
rendered pose. For a humanoid character in T-pose:
- Width (X) is ~1.8 units (armspan)
- Height (Y) is ~0.06 units (compressed flat)
- Depth (Z) is ~0.12 units

The auto-normalizer computes `targetHeight / boundsHeight` = `0.5 / 0.06` =
a scale of **8.3×**, making the model enormous. Then the position shift to
"put feet at y=0" moves it by a huge offset because the bind-pose min.y is
wrong. The result: model flung to a random position, usually near origin.

**No coordinate-space fix can repair a fundamentally wrong measurement.**
The reviewer's diagnosis is confirmed: "auto-normalization built on
`geometry.boundingBox` for `SkinnedMesh` is unreliable by construction."

### Why Robot partially works

Robot has 14 meshes but only 2 skinned — the other 12 are static meshes
attached to bones. Static meshes have correct bounding boxes. The 2 skinned
meshes (probably the body) have wrong bounds, causing the "arms at center"
effect (the static meshes render at the group position; the skinned meshes
render with wrong bounds/position offset).

---

## 2. The Fix: Per-Skin Constants + Wrapping Group

### Principle
Delete auto-normalization entirely. Replace with **manually tuned constants**
per skin: `{ scale, offsetY, rotationY }`. Apply these declaratively on a
wrapping `<group>` that R3F owns. The `<primitive>` inside carries a raw
clone with no mutations.

### Why per-skin constants
- Immune to SkinnedMesh bounds bugs
- Immune to cache-sharing contamination
- Immune to R3F reconciler fights
- How shipped games actually do it
- Tunable with a slider in 2 minutes per model

---

## 3. Concrete Changes

### 3.1 `tokenSkins.ts` — add tuning constants per skin

Extract real heights from GLB accessor data (from binary inspection):

| Model | Accessor hint | Estimated height | scale for 0.5 target | offsetY |
|---|---|---|---|---|
| Knight | min.y=-0.064, max.y=0.064 | ~0.13 (bind) → ~1.7 (posed) | ~0.29 | 0 |
| Farmer | max=[1.04] | ~1.7 | ~0.29 | 0 |
| Wizard | min.y=-0.011, max.y=1.94 | ~1.95 | ~0.26 | 0 |
| Astronaut | max=[1.04] | ~1.7 | ~0.29 | 0 |
| Human | max=[1.67] | ~1.67 | ~0.30 | 0 |
| Robot | max=[3.33] | ~1.5 (t-pose tall) | ~0.33 | 0 |
| Skeleton | max=[0.75] | ~1.7 | ~0.29 | 0 |
| Zombie | max=[2.63] | ~1.75 | ~0.29 | 0 |

These are starting guesses. Each model will need visual tuning, but starting
from the accessor data gets us in the right ballpark.

```typescript
export interface TokenSkin {
  id: string;
  label: string;
  url: string | null;
  scale: number;        // manual tuning constant
  rotationY: number;
  offsetY: number;      // manual vertical offset
}

export const TOKEN_SKINS: Record<string, TokenSkin> = {
  pawn:     { id: 'pawn',     label: 'Classic',   url: null, scale: 1, rotationY: 0, offsetY: 0 },
  knight:   { id: 'knight',   label: 'Knight',    url: '/assets/models/tokens/knight.glb',   scale: 0.29, rotationY: 0, offsetY: 0 },
  farmer:   { id: 'farmer',   label: 'Farmer',    url: '/assets/models/tokens/farmer.glb',   scale: 0.29, rotationY: 0, offsetY: 0 },
  wizard:   { id: 'wizard',   label: 'Wizard',    url: '/assets/models/tokens/wizard.glb',   scale: 0.26, rotationY: 0, offsetY: 0 },
  astronaut:{ id: 'astronaut',label: 'Astronaut', url: '/assets/models/tokens/astronaut.glb',scale: 0.29, rotationY: 0, offsetY: 0 },
  human:    { id: 'human',    label: 'Human',     url: '/assets/models/tokens/human.glb',    scale: 0.30, rotationY: 0, offsetY: 0 },
  robot:    { id: 'robot',    label: 'Robot',     url: '/assets/models/tokens/robot.glb',    scale: 0.15, rotationY: 0, offsetY: 0 },
  skeleton: { id: 'skeleton', label: 'Skeleton',  url: '/assets/models/tokens/skeleton.glb', scale: 0.29, rotationY: 0, offsetY: 0 },
  zombie:   { id: 'zombie',   label: 'Zombie',    url: '/assets/models/tokens/zombie.glb',   scale: 0.17, rotationY: 0, offsetY: 0 },
};
```

Note: Robot (accessor max=3.33) and Zombie (max=2.63) have unusually tall
T-poses, so their scale constants are smaller. These will need the most
visual tuning.

### 3.2 `TokenSkin.tsx` — wrapping-group architecture, no auto-normalization

Full rewrite of the GLBSkin component:

```tsx
function GLBSkin({ skin, color }: { skin: TokenSkin; color: Color }) {
  const { scene } = useGLTF(skin.url!);

  // Raw clone — NO position/scale mutations on the object itself.
  const model = useMemo(() => scene.clone(true), [scene]);

  return (
    <group>
      <ColorBase color={color} />
      {/* Wrapping group carries ALL normalization declaratively.
          R3F owns these props; <primitive> below is a raw child. */}
      <group
        position={[0, skin.offsetY, 0]}
        scale={skin.scale}
        rotation-y={skin.rotationY}
      >
        <primitive object={model} />
      </group>
    </group>
  );
}
```

**What changed:**
- Deleted `localBounds()` function entirely
- Deleted all `Box3`, `computeBoundingBox`, `setFromObject`, `applyMatrix4` code
- The clone has NO position/scale mutations — it's raw
- Wrapping `<group>` carries scale, position offset, rotation — declaratively
- `<primitive>` inside has NO extra props (just `object={model}`)

### 3.3 Delete dead code

Remove from TokenSkin.tsx:
- `localBounds()` function
- All `THREE.Box3` / `THREE.Vector3` import usage for bounds
- `useEffect` debug probe (already removed)
- The `import * as THREE` can stay for `ColorBase` if needed, otherwise remove

### 3.4 Token.tsx — no changes needed

The Token.tsx return block is already correct:
```tsx
<group position={[world.x + stackOffset[0], liftY, world.z + stackOffset[1]]}>
  <TokenModel skin={skin} color={token.color} />
</group>
```

The position is on the outer group. TokenModel → GLBSkin renders inside it.
No competing position logic.

---

## 4. Tuning Protocol (after the code change)

1. Hard refresh, clear localStorage
2. Default skins: red=Knight, green=Farmer, yellow=Wizard, blue=Astronaut
3. Check: are they visible in yards? Are they roughly the right size?
4. Open 🎨 Skins picker
5. For each model that looks wrong, adjust `scale` and `offsetY` in `tokenSkins.ts`
6. HMR will hot-reload the change — iterate live
7. Target: each character ~0.5 units tall, feet on the disc, standing upright

### Likely tuning needs
- **Robot** (accessor max=3.33): scale 0.15 might be too small — try 0.12–0.18
- **Zombie** (accessor max=2.63): scale 0.17 might need adjustment
- **Wizard** (accessor max=1.94): tallest humanoid, scale 0.26 is a guess
- Some models may need `offsetY` to lift their feet to the disc surface

---

## 5. Kill Switch

If after 45 minutes of tuning the models are NOT standing on discs in the
yards:

1. Set all skin URLs to `null` in `tokenSkins.ts`
2. Commit: "Skins deferred — per-skin tuning needs dedicated session"
3. Proceed immediately to Phase 5 (Bots)
4. The cosmetics infrastructure (store, picker, catalog) stays — it works

---

## 6. Comparison with Reviewer's Proposal

| Reviewer says | Our plan | Agreement |
|---|---|---|
| "SkinnedMesh bounds unreliable" | ✅ Confirmed empirically — all 8 models are skinned | ✅ Strong agree |
| "Per-skin tuning constants" | ✅ Exactly our approach — scale/offsetY/rotationY per skin | ✅ Strong agree |
| "Wrapping-group pattern" | ✅ `<group scale position rotation>` wraps raw `<primitive>` | ✅ Strong agree |
| "Delete auto-normalization from runtime" | ✅ localBounds deleted entirely | ✅ Strong agree |
| "45-minute timebox with kill switch" | ✅ Same structure | ✅ Strong agree |
| "Keep auto-bounds as dev-time printer" | Not implementing — accessor data already gives us initial constants | Minor divergence |

**Full agreement on architecture and approach.** The reviewer's diagnosis
(SkinnedMesh bounds) was the missing piece — confirmed by binary GLB inspection
showing all 8 models have `skins` in their JSON chunk.

---

## 7. Risk Assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| Tuning constants wrong | High (initial guesses) | HMR lets us iterate live; 2 min per model |
| Models face wrong direction | Medium | rotationY adjustable per model |
| Models float / sink | Medium | offsetY adjustable per model |
| Still broken after wrapping-group fix | Low (this is the standard pattern) | Kill switch → null URLs → Phase 5 |
| useGLTF cache sharing causes mutation | Eliminated — raw clone, no mutation | N/A |

---

## 8. Execution Sequence

1. Update `tokenSkins.ts` with tuning constants (scale/offsetY per skin)
2. Rewrite `GLBSkin` in `TokenSkin.tsx` (wrapping-group, no auto-norm)
3. Verify: tsc + lint + 201 tests
4. Browser test: hard refresh, clear localStorage
5. Visual tuning: iterate scale/offsetY via HMR
6. Commit: "Fix skins: per-skin constants + wrapping-group (SkinnedMesh-safe)"
7. **Decision point**: if working → proceed to Phase 5; if not → kill switch
