# Phase 5B — Pro Bots Architecture

> **Status:** Plan only. No execution until current Medium bots are verified
> in a full playtest.
>
> **Prerequisite:** Play one complete solo game vs Medium bots and confirm
> they make sensible moves (capture, exit yard, advance). The Phase 5 gate
> (Step 4) must pass before Pro work begins.

---

## 0. What I Understood

You want a **solo match against the highest-difficulty bots** — professional-grade
AI that plays near-optimally. The current Medium bot (greedy heuristic, no
lookahead) is decent but predictable. You want bots that:

- Don't take bait (refuse a capture if they'll get captured back next turn)
- Race when behind (prioritize finishing over capturing when losing)
- Punish your mistakes (capture your exposed tokens)
- Feel like real opponents, not pattern-matching scripts

The correct tool is **expectimax search over the real `applyAction` engine** —
not hand-tuned heuristics, not ML, not MCTS. Expectimax is exact for Ludo's
branching factor (6 dice outcomes × ~2 avg legal moves = ~12 children per ply),
making depth 3-4 searchable in under 100ms.

---

## 1. Current State

| Component | Status |
|---|---|
| `oracle/ai.ts` | Easy (weighted-random) + Medium (greedy + exposure penalty) |
| `oracle/__tests__/ai.test.ts` | 7 tests, all green |
| `store/botDriver.ts` | Auto-dispatches for bot seats (800ms roll, 1000ms move) |
| App.tsx | 🤖 Solo button (3 medium bots, human=red) |
| **NOT verified** | Full solo game to completion (Phase 5 gate Step 4) |

**Total tests:** 208 (201 base + 7 AI)

---

## 2. Both Reviews — My Assessment

### Review 1 (the architecture doc)
**Strong agreement on:**
- Expectimax over `applyAction` — the bot simulates using the real engine, so rule changes can never desync it. This is the single most important design decision.
- Policy-collapsed opponent model (opponents modeled as Medium) — keeps branching factor low (6 dice × 1 policy move = 6 children per chance node, not 6 × N legal moves)
- Iterative deepening with 80ms time budget — prevents main-thread jank
- Elo ladder for verification (Pro > Hard > Medium > Easy)

**Where I'd refine:**
- The module layout (`oracle/ai/` with 5 files) is over-structured for v1. Start with `search.ts` + `evaluate.ts` added to the existing single `ai.ts`. Refactor to a folder only when the file exceeds ~300 lines.
- The evaluation function weights are good initial guesses but will need tuning. The ladder self-play is the right way to tune, but it's a Phase 5B-5 step, not 5B-2.

### Review 2 (the plain-English explanation)
**Strong agreement on:**
- Clear explanation of expectimax (Max → Chance → Min → repeat)
- Time-bounding explanation (iterative deepening)
- The "Zero Desync Guarantee" (using `applyAction` for simulation)

**Where I'd refine:**
- The `Move` interface shows `tokenId: string` but we renamed to `tokenIds: string[]` in Phase 1's contract lock. Minor but would cause confusion during implementation.
- The evaluation table is simpler than Review 1's (missing race pressure and tempo terms). Review 1's is more complete.

### My verdict: Review 1 is the blueprint; Review 2 is the documentation.

---

## 2B. Third Review — Mandatory Amendments (verified correct)

The third review found 4 correctness bugs in the plan + 2 recommended
improvements. Each verified against our actual code:

### Mandatory (must fix in implementation)

**A. Node type must be phase-aware, not player-aware.**
The plan's pseudocode assumes `dice.value` is rolled at the max node. But
after an extra turn (6 → REQUEST_ROLL → IDLE), dice is null and
`getLegalMoves(state, null)` is empty. Correct typing:
- `phase === 'IDLE'` → **chance node** over rolls 1-6 (for ALL turns including own extra turns)
- `phase === 'SELECTING_TOKEN'` → **max node** if `currentPlayer === me`, **policy node** otherwise

**Verified:** Our engine confirms — after REQUEST_ROLL, phase goes to ROLLING
(then SELECTING_TOKEN after RESOLVE_ROLL). The search must simulate the full
REQUEST_ROLL → RESOLVE_ROLL{1..6} → SELECTING_TOKEN sequence, not assume
the dice is already rolled.

**B. `simulate` must handle the null-move (turn-pass) case.**
`chooseBotMove` returns null on `NO_LEGAL_MOVE`. `simulate(state, null)`
must return the state after the engine's turn-pass, not crash.

**Verified:** Engine's `handleResolveRoll` already handles `moves.length === 0`
by passing the turn and emitting NO_LEGAL_MOVE. The search's simulate function
must handle this path.

**C. Evaluation monotonicity across zones (confirmed bug).**
Track p=50: value = 50 + max(0, 50-43)×2 = **64**
Home h=0: value = 60 + 0×8 = **60**
**64 → 60 = loses 4 points.** The bot would resist entering the home column!

Fix: Home h → `66 + h×8` (range 66-98), ensuring strict monotonic increase:
yard(0) < track(0-64) < home(66-98) < finished(100).

**D. Pin depth in tests; budget only in production.**
`searchBestMove` must support `{ fixedDepth }` for deterministic tests.
The 80ms budget makes reached depth machine-dependent (different on CI vs
phone). Pro's search uses no RNG (chance nodes enumerate all 6 rolls), so
determinism holds only if depth is pinned.

### Recommended

**E. Advantage-scaled risk shaping.**
A linear eval is risk-neutral — the "risk-averse when ahead, risk-seeking
when behind" promise doesn't emerge from a flat eval. Fix: scale exposure
weight by advantage. When ahead: ×1.5 exposure penalty (protect lead).
When behind: ×0.5 exposure penalty (take risks to catch up).

**F. Tempo terms.**
§7 lists wasted-turn −10/-20 and extra-turn +20, but §3.2 has neither.
In Pro these emerge from search (extra turn = extra max node).
Either implement only in Hard/leaf eval or delete the claim from §7.

### Ceiling analysis (confirmed correct)

With `stacking: 'none'`, the only deep strategic axis (blockades) is removed
by rule. The remaining skill axes (capture timing, exposure management, race
pacing, yard-exit timing) are all visible to depth 3-4 + tuned eval.
**Expectimax depth 4-8 with a ladder-tuned eval IS the practical difficulty
ceiling for v1 Ludo.** The binding constraint is eval quality, not depth.

Increase depth cap from 5 to 8 — let iterative deepening exceed 4 if budget
allows (6⁶ ≈ 46k sims, still < 80ms).

---

## 3. The Plan — Merged and Simplified (with amendments applied)

### 3.1 Difficulty tiers

| Tier | Mechanism | When to use |
|---|---|---|
| Easy | Weighted-random over scored moves | Already built |
| Medium | Greedy score + exposure penalty | Already built |
| Hard | Greedy over the **full evaluation function** (all terms from §3.2) | New — strong without search |
| **Pro** | **Expectimax, depth 3-4, time-bounded 80ms** | New — near-optimal |

### 3.2 Evaluation function (amendment C applied — strict monotonic)

```
eval(state, me) = myScore − ΣopponentsScore
```

Per-token value (strictly increasing along every legal move):

| Zone | Value | Range |
|---|---|---|
| Yard | 0 | 0 |
| Track (progress p, 0-50) | p + max(0, p−43)×2 | 0-64 |
| Home column (cell h, 0-4) | 66 + h×8 | 66-98 |
| Finished | 100 | 100 |

**Monotonicity check:** yard(0) < track(0→64) < home(66→98) < finished(100). ✓

Positional terms:

| Term | Weight | Applied when |
|---|---|---|
| Capture gain | victim token value + 20 tempo | Move.isCapture |
| Exposure risk | −Σ(1/6 × myLossIfCaptured) × riskScale | non-safe dest |
| Safe-cell parking | +6 | dest is SAFE_TRACK_CELLS |
| Yard exit | +15 | Move.isEnteringBoard |
| Finish | +60 | Move.isFinishing |
| Race pressure | 2 × (myMaxProgress − oppMaxProgress) | global |

**Amendment E — advantage-scaled risk:**
```typescript
const adv = eval(state, me);
const riskScale = 1 + 0.5 * Math.max(0, Math.min(1, adv / 150)); // ahead → 1.5×
const captureTempoScale = 1 + 0.5 * Math.max(0, Math.min(1, -adv / 150)); // behind → 1.5×
```
When ahead: exposure penalty ×1.5 (protect the lead). When behind: capture
tempo ×1.5 (take risks to catch up).

### 3.3 Expectimax search (amendments A, B, D applied)

**Amendment A:** Node type is PHASE-aware, not player-aware:
- `phase === 'IDLE'` → chance node (enumerate rolls 1-6, for ALL players including own extra turns)
- `phase === 'SELECTING_TOKEN'` → max node if `currentPlayer === me`, policy node otherwise

**Amendment B:** `simulate()` handles null move (turn-pass when no legal moves).

**Amendment D:** `searchBestMove` supports `{ fixedDepth }` for deterministic tests.

```typescript
function searchBestMove(
  state: GameState,
  moves: Move[],
  me: Color,
  budgetMs = 80,
  fixedDepth?: number, // amendment D: pin depth for tests
): Move {
  let best = moves[0];
  const maxDepth = fixedDepth ?? 8; // ceiling: allow up to 8 if budget allows
  for (let depth = 1; depth <= maxDepth; depth++) {
    if (!fixedDepth && elapsed > budgetMs) break; // budget only in production
    best = argmax(moves, m => expectimax(simulate(state, m), depth - 1, me));
  }
  return best;
}

// Phase-aware node typing (amendment A)
function expectimax(state: GameState, depth: number, me: Color): number {
  if (depth === 0 || isTerminal(state)) return evaluate(state, me);

  if (state.phase === 'IDLE') {
    // Chance node: enumerate all 6 dice rolls
    let sum = 0;
    for (let roll = 1; roll <= 6; roll++) {
      const rolled = simulateRoll(state, roll); // REQUEST_ROLL → RESOLVE_ROLL{roll}
      if (rolled.phase === 'SELECTING_TOKEN') {
        if (rolled.currentPlayer === me) {
          // My turn: max node over my legal moves
          const myMoves = rolled.validMoves;
          sum += Math.max(...myMoves.map(m => expectimax(simulate(rolled, m), depth - 1, me)));
        } else {
          // Opponent: policy node (Medium model)
          const oppMove = chooseBotMove(rolled, rolled.validMoves, 'medium');
          sum += expectimax(simulate(rolled, oppMove), depth - 1, me); // amendment B: null handled
        }
      } else {
        // No legal move (NO_LEGAL_MOVE) → turn passes, continue
        sum += expectimax(rolled, depth - 1, me);
      }
    }
    return sum / 6;
  }
  // Should not reach here in normal flow (search starts at SELECTING_TOKEN)
  return evaluate(state, me);
}

// Amendment B: handles null move (turn-pass)
function simulate(state: GameState, move: Move | null): GameState {
  if (move === null) {
    // No legal move — engine already passed the turn via NO_LEGAL_MOVE path
    return state;
  }
  const { state: afterMove } = applyAction(state, { type: 'REQUEST_MOVE', tokenId: move.tokenIds[0] });
  const { state: resolved } = applyAction(afterMove, { type: 'RESOLVE_MOVE' });
  return resolved;
}
```

### 3.4 Simulation via applyAction (Zero Desync Guarantee)

```typescript
function simulate(state: GameState, move: Move): GameState {
  const { state: afterMove } = applyAction(state, { type: 'REQUEST_MOVE', tokenId: move.tokenIds[0] });
  const { state: resolved } = applyAction(afterMove, { type: 'RESOLVE_MOVE' });
  return resolved;
}

function simulateRoll(state: GameState, roll: number): GameState {
  const { state: afterReq } = applyAction(state, { type: 'REQUEST_ROLL' });
  const { state: afterRes } = applyAction(afterReq, { type: 'RESOLVE_ROLL', value: roll });
  return afterRes;
}
```

The bot NEVER re-implements Ludo rules. It uses the exact same `applyAction`
function the game uses. If we change a rule, the bot automatically plays
correctly under the new rule. This is architecturally bulletproof.

### 3.5 Files to add

| File | Responsibility |
|---|---|
| `oracle/ai/evaluate.ts` | `evaluate(state, me): number` — full evaluation function |
| `oracle/ai/search.ts` | `searchBestMove(state, moves, me, budgetMs): Move` — expectimax |
| `oracle/ai/__tests__/evaluate.test.ts` | Crafted position tests |
| `oracle/ai/__tests__/search.test.ts` | Crafted trap tests (Pro refuses bait) |

`oracle/ai.ts` becomes a barrel re-export. `botDriver.ts` passes the difficulty
through unchanged. App.tsx adds Hard/Pro to the Solo button options.

### 3.6 Wiring

- `botDriver.ts`: Pro gets 900-1400ms think delay (compute ≤80ms, rest is UX)
- Stage: difficulty selector (Easy/Medium/Hard/Pro) on the Solo button
- HUD: "🤖 Pro thinking…" indicator

---

## 4. Verification — The Professional Bar (amendments added)

1. **Unit (crafted positions):**
   - Pro captures when available (no downside)
   - Pro refuses a capture that leads to immediate recapture (trap)
   - Pro finishes when possible
   - Pro exits yard on 6
   - Pro prefers safe parking over exposed parking
   - **NEW (amendment C):** Pro enters home column (doesn't hesitate at the 64→66 boundary)
   - **NEW (amendment B):** Pro handles stuck-opponent turn-pass inside search
   - **NEW (amendment E):** Pro is risk-averse when ahead, risk-seeking when behind (test crafted ahead/behind states)

2. **Elo ladder (headless, seeded):**
   - Win-rate ordering: Pro > Hard > Medium > Easy
   - Pro beats Medium ≥ 70% over 100 games
   - **NEW (amendment D):** Deterministic via `fixedDepth` option (no wall-clock)

3. **Performance:**
   - p95 decision time ≤ 100ms headless
   - No main-thread jank in 3D (budget 80ms)
   - Depth cap increased to 8 (let iterative deepening go deeper if budget allows)

4. **Regression:**
   - 208 existing tests green unmodified
   - Lint clean (no react/three under oracle/ai/**)

5. **Manual gate:**
   - Solo match vs 3 Pro bots to completion
   - Bots feel sharp: punish hangs, race when behind, don't donate tokens

---

## 5. Execution Order (amended)

| Step | Deliverable | Gate |
|---|---|---|
| **5B-0** | **✅ DONE** — Medium playtest completed, user won, bots play sensibly | ✅ Passed |
| 5B-1 | `evaluate.ts` with amended zone values (66+h×8) + riskScale + unit tests | Crafted-position tests green |
| 5B-2 | `search.ts` expectimax (phase-aware, null-safe, fixedDepth) + tests | Search picks correct move on crafted traps |
| 5B-3 | Driver/config/UI wiring (Hard + Pro selectable) | Solo vs Pro runs in 3D |
| 5B-4 | Elo ladder + weight tuning (amendment E riskScale) + perf gate | Pro > Hard > Medium > Easy; p95 ≤ 100ms |

---

## 6. Risk Register

| Risk | Mitigation |
|---|---|
| Search explosion | Policy-collapsed chance nodes (6 children/ply); iterative deepening + 80ms budget |
| Main-thread jank | 80ms hard cap; Web Worker only as v2 fallback |
| Eval weight overfitting | Seeded ladder across 100+ games, not hand-tuned vibes |
| Rule drift between AI and game | AI simulates via `applyAction` only — single source of truth |
| Scope creep (ML/MCTS) | Explicitly out; expectimax is exact for this branching factor |
| Premature optimization | Build Hard first (no search, just better eval), then Pro (search) |
| Phase mismatch in search (amendment A) | Search uses phase-aware node typing (IDLE → chance, SELECTING_TOKEN → max/policy) |
| Null move crash (amendment B) | simulate() handles null (turn-pass) |
| Eval non-monotonicity (amendment C) | Home column values fixed to 66+h×8 (strict increase from track) |
| Non-deterministic tests (amendment D) | fixedDepth option pins depth; budget only in production |
| Flat risk profile (amendment E) | Advantage-scaled riskScale (×1.5 ahead, ×0.5 behind) |

---

## 7. What Makes a Pro Bot "Professional"

A professional Ludo bot does these things that Medium doesn't:

1. **Doesn't take bait:** If capturing an opponent token would leave the bot's
   token exposed to recapture (within 1-6 of another opponent), and the net
   value is negative, it refuses the capture.

2. **Races when behind:** If the bot is significantly behind (lower total
   progress), it shifts from capture-seeking to race-seeking (prioritize
   advancing the furthest token toward home).

3. **Blocks when ahead:** If the bot is ahead, it parks tokens on safe cells
   to maintain the lead rather than risking exposure for marginal gains.

4. **Counts tempo:** Each turn has value. Wasting a turn (no legal move) is
   worth −10 to −20 in the evaluation. Getting an extra turn (rolling a 6)
   is worth +20.

5. **Sees traps 3 turns deep:** "If I move here, opponent rolls X, captures
   my token, then I'm behind" — the expectimax tree naturally evaluates this.

---

## 8. Cross-Check

| Commitment | Source | This plan |
|---|---|---|
| Expectimax over applyAction | Review 1 §4 | §3.3 + §3.4 |
| Policy-collapsed opponents | Review 1 §4 | §3.3 |
| Iterative deepening 80ms | Review 1 §4 | §3.3 |
| Evaluation per-token value | Review 1 §3 | §3.2 |
| Exposure/threat geometry | Review 1 §3 + Review 2 Step 2 | §3.2 |
| Zero Desync Guarantee | Review 2 Step 5 | §3.4 |
| Elo ladder verification | Review 1 §6 | §4 |
| No ML/MCTS | Review 1 §1 | §6 |
| Phase-gated by construction | ARCHITECTURE-v3 | botDriver unchanged |

**No contradictions. Full agreement with both reviews.**
