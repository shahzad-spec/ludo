# Token Render Issue — Complete Root-Cause Analysis

> **Status:** Analysis only. No execution. Decision pending: fix now or defer.

---

## 1. What We Observe (from screenshots)

| Observation | Which Models |
|---|---|
| Robot appears in yards but very large | Robot (smallest GLB at 392KB) |
| Robot's arms appear at board center | Robot |
| Other models (Knight, Farmer, Wizard, etc.) appear at center, not in yards | All non-robot models |
| Models at center are un-normalized (huge) | All at center |
| Color discs (pucks) appear in yards correctly | All colors |
| "Classic" (pawn) works perfectly | Pawn |

## 2. The Core Mystery

**Why does Robot partially work (appears in yards) while all other models end up at center?**

This is the key question. If the code were uniformly broken, ALL models would fail identically. The fact that Robot behaves differently tells us the bug is **data-dependent**, not code-dependent.

## 3. Root Cause: `useGLTF` Global Cache + `scene.clone(true)` + `updateMatrixWorld`

### How `useGLTF` from drei works

`useGLTF(url)` uses Three.js's `useLoader(GLTFLoader, url)` under the hood. **The THREE.Loader cache is global** — calling `useGLTF('/assets/models/tokens/knight.glb')` from 4 different Token components (red-0, red-1, red-2, red-3 all use Knight) returns the **same cached `scene` object**.

This means all 4 Knight tokens share the same `scene` reference.

### What `scene.clone(true)` does

`clone(true)` creates a new Object3D with:
- **Copied** transform (position, rotation, scale)
- **Shared** geometry and material references (NOT deep-cloned)
- **Cloned** children recursively

But critically: the clone's children have their `matrixWorld` **stale** until `updateMatrixWorld()` is called. And when we DO call `updateMatrixWorld(true)`, it updates `matrixWorld` based on the clone's current transform chain — which is correct IF the clone is detached from any parent.

### The actual bug (confirmed by code reading)

In `localBounds()`:

```typescript
function localBounds(root: THREE.Object3D): THREE.Box3 {
  const oldParent = root.parent;
  if (oldParent) oldParent.remove(root);  // ← detach
  root.position.set(0, 0, 0);
  root.scale.set(1, 1, 1);
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    tmp.copy(m.geometry.boundingBox!).applyMatrix4(m.matrixWorld);
    box.union(tmp);
  });
  return box;
}
```

This LOOKS correct — it detaches, resets, measures. But there's a subtle problem:

**`m.geometry.boundingBox` is SHARED across all clones.** When we call `m.geometry.computeBoundingBox()`, it writes to the geometry's boundingBox property. If the original cached scene's geometry has already had its boundingBox computed (by a previous token's clone), the value is correct. But if it hasn't been computed yet, the first call computes it, and subsequent calls reuse it — which is fine.

**The real problem is `m.matrixWorld`.** After `root.updateMatrixWorld(true)`, each child's `matrixWorld` reflects the clone's local transform. But the `applyMatrix4(m.matrixWorld)` transforms the geometry's boundingBox by the mesh's WORLD matrix — which includes the clone's position (0,0,0) and scale (1,1,1) at this point. That should be correct.

**BUT:** The clone was created from `scene.clone(true)`. If the original `scene` (from the drei cache) has had its `matrixWorld` updated while parented to a different token's group (at yard position -4, 0.15, -4), then `clone(true)` copies the children's `matrix` but NOT their `matrixWorld` — those are recomputed by `updateMatrixWorld(true)`. So this should be fine...

### The ACTUAL actual bug

After deeper analysis, the problem is **NOT in the bounds calculation**. The bounds calculation is correct. The problem is in **how R3F renders `<primitive object={model}>`**.

When `<primitive>` mounts, R3F takes ownership of the `model` object and adds it as a child of the parent group. But here's the critical issue:

**`<primitive>` with a `rotation-y` prop creates a conflict.**

```tsx
<primitive object={model} rotation-y={skin.rotationY} />
```

R3F's `<primitive>` applies the `rotation-y` prop by setting `model.rotation.y`. But `model` is an `Object3D` whose position was set in `useMemo` to `(-center.x, -b2.min.y, -center.z)`. When R3F applies `rotation-y`, it may overwrite the entire `rotation` object or apply it on top — and critically, R3F's reconciler may call `model.position.set(0,0,0)` as a default before applying props, **wiping out the normalization position**.

This is the bug. **R3F's `<primitive>` resets the object's position to (0,0,0) when it mounts**, undoing the normalization we set in `useMemo`.

### Why Robot partially works

Robot's GLB might have a different internal structure (e.g., origin already at feet, or smaller native scale) that makes the normalization shift smaller. The "arms at center" is the part of the robot that wasn't repositioned (its mesh local positions are offset from the skeleton root), while the body is in the yard because R3F's primitive placed the root group at the yard position.

Other models have larger normalization shifts, so when R3F resets position to (0,0,0), they end up at the group's local origin — which, combined with the group's world position, places them... actually at the yard. So why do they appear at center?

### Alternative root cause: the normalization writes position on the INNER object, but the group's position prop is separate

Wait — let me re-read Token.tsx:

```tsx
<group position={[world.x + stackOffset[0], liftY, world.z + stackOffset[1]]}>
  <TokenModel skin={skin} color={token.color} />
```

And TokenModel:
```tsx
<Suspense fallback={fallback}>
  <SkinErrorBoundary fallback={fallback}>
    <GLBSkin skin={skin} color={color} />
  </SkinErrorBoundary>
</Suspense>
```

And GLBSkin:
```tsx
return (
  <>
    <ColorBase color={color} />
    <primitive object={model} rotation-y={skin.rotationY} />
  </>
);
```

The `<primitive object={model}>` renders inside a fragment `<>`, which is inside `<GLBSkin>`, which is inside `<SkinErrorBoundary>`, which is inside `<Suspense>`, which is inside `<TokenModel>`, which is inside the `<group position={[...]}>`.

**The fragment `<>` is the problem.** R3F fragments don't create a scene-graph node — they're "transparent." So `<ColorBase>` and `<primitive>` become direct children of the `<group>`. That's correct.

But `<primitive>` mounts `model` as a child of the group. The group's position is `[world.x, liftY, world.z]`. The model's position (set in useMemo) is `(-center.x, -b2.min.y, -center.z)`. These should combine: model appears at `(world.x - center.x, liftY - b2.min.y, world.z - center.z)` — which should be in the yard.

**Unless R3F's `<primitive>` overrides the position.** Let me check: does `<primitive object={model} rotation-y={skin.rotationY}>` apply only `rotation-y`, or does it reset all other props?

R3F's `<primitive>` is special: it takes an existing object and attaches it. Props like `position`, `rotation`, `scale` ARE applied as overrides. But `rotation-y={skin.rotationY}` should only touch `rotation.y`, not `position`.

### The REAL real root cause (I think this is actually it)

After extensive analysis, I believe the issue is **`useGLTF` cache sharing combined with mutation**.

Here's the sequence:
1. Token red-0 calls `useGLTF('/assets/models/tokens/knight.glb')` → loads scene, caches it
2. Token red-0's `useMemo` clones the scene, normalizes the clone, returns it
3. Token red-1 calls `useGLTF('/assets/models/tokens/knight.glb')` → gets the SAME cached scene
4. Token red-1's `useMemo` clones the scene, normalizes the clone

But step 2's `localBounds()` calls `root.updateMatrixWorld(true)` which **mutates the clone's children's `matrixWorld`**. Since `clone(true)` shares geometry references (not deep-cloned), `computeBoundingBox()` mutates the shared geometry's `boundingBox` property. This is fine.

But there's a more subtle issue: **`clone(true)` does NOT deep-clone the `matrix` property of children.** It creates new `Object3D` instances but copies `position`, `rotation`, `scale` by value. The `matrix` is recomputed. This should be fine.

### I need to actually test this empirically

After reasoning through every possible cause, the most likely explanation is:

**R3F's `<primitive>` reconciler applies default values for unspecified props**, potentially resetting `position` to `(0,0,0)`. The fix is to NOT pass position via the model object's `.position` property, but instead wrap the model in a `<group position={...}>` inside the GLBSkin return.

---

## 4. Proposed Fix Architecture

### Principle: separate concerns — model object has NO position, wrapping group carries it

```tsx
// GLBSkin return:
return (
  <group>
    <ColorBase color={color} />
    <group position={normalizedPosition} scale={normalizedScale}>
      <primitive object={rawSceneClone} rotation-y={skin.rotationY} />
    </group>
  </group>
);
```

The `rawSceneClone` has NO position/scale modifications — it's the raw clone. All normalization is applied to the wrapping `<group>`'s `position` and `scale` props, which R3F controls declaratively and won't fight.

### TokenSkin.tsx — full rewrite

```tsx
function GLBSkin({ skin, color }: { skin: TokenSkin; color: Color }) {
  const { scene } = useGLTF(skin.url!);

  // Compute normalization values from the RAW scene (before any mutation)
  const { scale, position } = useMemo(() => {
    const clone = scene.clone(true);
    const box = new THREE.Box3().setFromObject(clone);
    const size = new THREE.Vector3();
    box.getSize(size);
    const TARGET = 0.5;
    const s = size.y > 0 ? TARGET / size.y : 1;

    // Re-measure after conceptual scaling
    const center = new THREE.Vector3();
    box.getCenter(center);

    // Position offset to center X/Z and put feet at y=0
    const pos = new THREE.Vector3(
      -center.x * s,
      -box.min.y * s,
      -center.z * s,
    );

    return { scale: s, position: pos };
  }, [scene]);

  // Clone fresh for rendering — NO position/scale mutation on the object itself
  const renderModel = useMemo(() => scene.clone(true), [scene]);

  return (
    <group>
      <ColorBase color={color} />
      <group position={position} scale={scale}>
        <primitive object={renderModel} rotation-y={skin.rotationY} />
      </group>
    </group>
  );
}
```

### Key differences from current approach:
1. Normalization values are computed but **applied declaratively** via `<group position={...} scale={...}>` — R3F owns them, no mutation fight
2. The `<primitive>` object has **NO position/scale mutations** — it's a raw clone
3. `Box3.setFromObject` on a detached clone (useMemo runs before R3F attaches to parent) is safe — the clone has no parent yet

---

## 5. Decision: Fix Now or Defer

### Option A: Fix now (~30 min)
- Apply the architecture above
- Test with one model
- If it works, lock and move on

### Option B: Defer skins, proceed to Phase 5 (Bots) — **recommended**
- Set all skin URLs to `null` (all tokens = procedural pawns)
- The cosmetics infrastructure (store, picker, catalog) stays — it's built and tested
- When we revisit skins, we have a clean architecture to implement against
- Phase 5 (Bots) delivers higher user value (solo play)

### My recommendation: **Option B.**
The skin system has consumed significant effort for marginal visual gain. The procedural pawns look clean and premium. Bots make the game actually playable solo — that's the higher-value next step. Skins can be revisited in a focused session with the new architecture.
