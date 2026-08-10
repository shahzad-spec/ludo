# Token Render Pipeline — Architecture Fix Plan

> Fixes the "models at center + coins in yards" bug. One targeted rewrite,
> not a full re-architecture — the existing structure is 90% correct.

## 1. Root Cause Analysis (from code audit)

### What the reviewer got wrong
The reviewer hypothesized "two code paths rendering models." The audit proves
this is **false** — there is exactly one `<primitive>` (TokenSkin.tsx:91) and
one `useGLTF` call (TokenSkin.tsx:66). No stray renderer exists.

### What's actually broken

The real problem is a **Suspense + React reconciliation conflict** between
the declarative `position` prop and the imperative `useEffect` position sync.

**The timing sequence that causes the bug:**

1. Token.tsx renders `<group ref={ref} position={[world.x, liftY, world.z]}>`.
   ✅ Group is at the correct yard position.
2. Inside the group: `<TokenModel>` → `<Suspense fallback={<ProceduralPawn/>}>`
3. Suspense renders the pawn fallback **while the GLB loads**.
4. GLB loads → Suspense resolves → React unmounts the fallback, mounts `<GLBSkin>`.
5. **Here's the bug:** The `useMemo` in GLBSkin normalizes the model's internal
   position (sets `clone.position.y -= scaledBox.min.y`). This internal position
   is **relative to the group**, but the Box3 calculation operates on world-space
   coordinates. When the group is at a yard position (e.g. -4, 0.15, -4), the
   Box3 returns coordinates offset by the group's world position, producing
   incorrect normalization. The model's internal position gets shifted by a
   large world-space amount, effectively pushing it to center.

**Why the coins appear:** The `ColorBase` cylinder renders correctly (no
rotation), but when a GLB model is present, the normalized model's incorrect
position makes the ColorBase (at local 0,0,0) appear displaced relative to the
model. Combined with the model being at the wrong position, the visual reads
as "coins lying in the yards, models at center."

### The secondary issue
The `position` prop on `<group>` is set to `[world.x + stackOffset[0], liftY, ...]`
AND the `useEffect` also sets `ref.current.position.set(...)`. When GSAP
animates (isAnimating/isFlyingBack), the useEffect is suppressed, but React's
declarative `position` prop still fires on re-render, fighting GSAP.

## 2. The Fix — Principles

1. **Position is declarative only.** Remove the `useEffect` position sync entirely.
   Use the `position` prop. When GSAP needs control, it mutates `ref.current.position`
   directly (imperative), and React's declarative prop is only set from state —
   GSAP overrides happen via direct mutation between renders.
2. **Normalization uses LOCAL coordinates.** The Box3 must be calculated on
   the model **before** it's parented to the group, or the calculation must
   reset the model's position to origin first, THEN measure, THEN normalize.
3. **One group, one position source.** No competing useEffect.

## 3. Concrete Changes

### 3.1 TokenSkin.tsx — fix normalization to use local coordinates

The `useMemo` must:
1. Clone the scene
2. **Reset clone position to (0,0,0) before measuring**
3. Scale to target height
4. Re-measure and shift so feet are at y=0
5. Center horizontally

This eliminates the world-space contamination from the parent group's position.

### 3.2 Token.tsx — remove imperative position useEffect

Remove the `useEffect` that syncs position (lines 84-95). Keep the `position`
prop on the `<group>`. GSAP animations already use `ref.current.position`
directly (via `gsap.to(ref.current.position, ...)`), which overrides the
React prop between renders without fighting it.

When GSAP's animation completes and React re-renders, the declarative `position`
prop takes over again (the state has advanced to the new position by then, via
RESOLVE_MOVE). This is the standard R3F + GSAP pattern.

The `scale.set(1,1,1)` / `rotation.set(0,0,0)` normalization should move to
the GSAP `onComplete` callbacks (already done for capture fly-back).

### 3.3 ColorBase — confirmed correct (no rotation)

The cylinder already has no rotation. The "coins lying down" symptom is a
consequence of the model displacement — once the model position is fixed,
the ColorBase will appear correctly under the character.

## 4. Comparison with Reviewer's Proposal

| Reviewer says | Our finding | Agreement |
|---|---|---|
| "Two code paths render models" | False — exactly one `<primitive>` and one `useGLTF` | ❌ Reviewer wrong |
| "Single source of truth for position" | Correct — must be declarative only | ✅ Agree |
| "Normalization in useMemo, not useEffect" | Already in useMemo; bug is world-space contamination | ✅ Agree (we already do this) |
| "Remove position prop, use ref" | Opposite — keep position prop, remove useEffect | ❌ Disagree |
| "BaseDisc needs no rotation" | Correct (already fixed) | ✅ Agree |
| "Single group wrapping both branches" | Already the structure | ✅ Agree |

### Key disagreement
The reviewer says "no `useEffect` position sync, use `<group position={...}>`."
We AGREE on the conclusion but the reviewer says to remove the position prop
and use a ref — we're keeping the position prop and removing the useEffect.
Both achieve "one source of truth"; ours is simpler because R3F's reconciler
handles the position prop correctly.

### The reviewer's NormalizedModel code
Their code resets `model.position.set(-c.x, -b2.min.y, -c.z)` — this is
**correct** and is the fix we need. Our current code only does
`clone.position.y -= scaledBox.min.y` which doesn't center X/Z and doesn't
account for the parent group's world position offset.

## 5. Risk

| Risk | Mitigation |
|---|---|
| GSAP fights declarative position prop | GSAP mutates `ref.current.position` imperatively; React's prop only fires on re-render; GSAP overrides between renders. When RESOLVE_MOVE commits new state, React re-renders with the new position — no fight. |
| Removing useEffect normalization lets captured tokens stay deformed | GSAP onComplete already resets scale/rotation; add position reset there too. |

## 6. Execution

1. Rewrite `TokenSkin.tsx` GLBSkin useMemo to use local-space normalization
2. Remove the imperative position useEffect from Token.tsx
3. Verify: 201 tests green, lint clean
4. Browser test: characters in yards, not center
