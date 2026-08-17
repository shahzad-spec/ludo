/**
 * Oracle type contracts — the API the Director (3D) and Stage (UI) consume.
 *
 * Design rules enforced here and by the ESLint guardrails:
 *  - No `state: TokenState` field on Token. Progress is the single source of
 *    truth; the readable phase label is derived via getPhase(progress) from
 *    track.ts. Storing both risks desync (v3 §5).
 *  - GameState carries the phase machine (GamePhase) and RulesConfig — these
 *    are load-bearing (v3 §4, plan §6.1) and were deliberately restored after
 *    a blueprint review tried to drop them (plan §6.8).
 *
 * This module is pure TypeScript: no React, no THREE. Enforced by ESLint.
 */

import type { Color, Position } from './board/track';

/** Re-export so consumers can import all oracle types from one place. */
export type { Color, Position } from './board/track';

/** A token. `progress` is the single source of truth for its location. */
export interface Token {
  /** Stable id, e.g. 'red-0' .. 'blue-3'. */
  id: string;
  /** Owner color. */
  color: Color;
  /**
   * Single source of truth: BASE (-1) in yard, 0..50 shared loop,
   * 51..55 home column, 56 finished. There is NO separate `state` field —
   * call getPhase(progress) for the readable label.
   */
  progress: number;
  /** Yard slot 0..3, so the Director can place 4 distinct yard positions. */
  slot: number;
}

/**
 * The phase machine (v3 §4). Gates every action; animation-completion
 * advances it. Makes double-roll / move-during-animation impossible.
 */
export type GamePhase =
  | 'IDLE' // current player may roll
  | 'ROLLING' // dice animating; no input allowed
  | 'SELECTING_TOKEN' // dice resolved; player picks a legal token
  | 'ANIMATING_MOVE' // token hopping; no input allowed
  | 'RESOLVING_MOVE' // capture/extra-turn/win checks; no input
  | 'GAME_OVER';

/**
 * House rules threaded through the engine so variants don't require rewriting
 * capture/movement/turn logic (plan §6.1, RULES-AND-SETTINGS-ARCHITECTURE §2).
 *
 * v1 locks: entryRoll 'six', finishRule 'exact', stacking 'none', etc. The v1.5
 * and v2 fields are pre-declared (defaults keep v1 behavior) so the Settings
 * schema is stable and later features drop into typed slots — no Director rewrite.
 */
export interface RulesConfig {
  /** Player count; createInitialState(colors) derives turnOrder. */
  playerCount: 2 | 3 | 4;
  /** Which seats are AI-controlled (Phase 5). Empty = all-human hot-seat. */
  bots: Color[];

  // --- Dice & Turn Flow ---
  /** Roll required to enter the board. Replaces enterOnSix (Step 1 lock). */
  entryRoll: 'six' | 'sixOrOne' | 'any';
  /**
   * Dice rolled per turn (PHASE-5D). 1 = v1 behavior (byte-identical, pinned by
   * the equivalence suite); 2+ = sequential multi-dice — the set resolves one
   * die at a time, descending (A1), with burn-and-continue for unplayable dice.
   */
  diceCount: 1 | 2 | 3 | 4;
  /** Rolling a 6 grants another turn (subject to sixesLimit). */
  sixGrantsExtraTurn: boolean;
  /** Capturing grants another turn. v1: false (simplifies turn logic). */
  extraTurnOnCapture: boolean;
  /** Declare-only (v1.5 Batch B): finishing a token grants another turn. */
  extraTurnOnFinish: boolean;
  /** Max consecutive sixes before forfeiting; null = ∞ (no forfeit). */
  sixesLimit: number | null;
  /** Turn timer in seconds, or null for untimed. */
  turnTimerSec: number | null;

  // --- Entry & Movement ---
  /**
   * Stacking behaviour. v1: 'none' (tokens co-locate freely, no barrier).
   * 'block' (two same-color form a barrier opponents can't pass) is v2.
   * 'stack' (tokens merge and move as one) is v2 — Move.tokenIds supports it.
   */
  stacking: 'none' | 'block' | 'stack';

  // --- Finish & Winning ---
  /** Finish rule. v1: 'exact'. 'bounce'/'overflow' implemented v1.5 Batch A. */
  finishRule: 'exact' | 'bounce' | 'overflow';
  /** Win when this many tokens finish. v1: 4 (all). v1.5: 2 for fast games. */
  firstToN: number;

  // --- Capture & Safety (v1.5 Batch A/B; declared now) ---
  /** If true, only capture moves are legal when any capture is possible. */
  forcedCapture: boolean;
  /** If true, player may pass (decline to move) — adds a PASS action (Batch C). */
  optionalPass: boolean;
  /** Which shared-loop cells grant safety. */
  safeCellSet: 'starts' | 'stars' | 'both' | 'none';

  // --- v2 (declared now; engine ignores; UI hides via schema `since`) ---
  /** 0 = off; N = victim sent back N cells. Contract change on TOKEN_CAPTURED. */
  blowBack: number;
  /** null = free-for-all; otherwise partner pairs. Flattened (no wrapper type). */
  teams: ReadonlyArray<readonly [Color, Color]> | null;
  /** Experimental meta-phase mode (bundled with Undo in v2). */
  challengeMode: boolean;
}

/** A single completed turn's audit record. Per-DIE in multi-dice (PHASE-5D):
 *  a 2-dice turn appends two records. `roll` = the die this record played
 *  (kept for v1 compatibility); `rolls` = the full set (added 5D, additive). */
export interface TurnRecord {
  player: Color;
  roll: number;
  /** The full rolled set for the turn this record belongs to (5D, additive). */
  rolls?: number[];
  tokenId?: string;
  capturedIds?: string[];
}

export interface GameState {
  /** O(1) lookup; narrow Zustand subscriptions (plan §6.1). */
  tokens: Record<string, Token>;
  /** Turn order; red, green, yellow, blue by default. */
  turnOrder: Color[];
  /** Whose turn it is. */
  currentPlayer: Color;
  /**
   * Dice state (PHASE-5D queue shape). The A1 COMPAT ALIAS `value` MUST always
   * equal `queue[0] ?? null` — it is what keeps every v1 reader (tests, tools,
   * UI) source-compatible. Invariants are pinned by diceQueue.test.ts.
   */
  dice: {
    /** Remaining dice this turn, DESCENDING (A1 Decision 14). v1: length ≤ 1. */
    queue: number[];
    /** The full set as rolled (pre-sort), for UI display + history. */
    rolledSet: number[];
    /** A1 COMPAT ALIAS === queue[0] ?? null. Never let it drift. */
    value: number | null;
    rolled: boolean;
    /** A2.1: any die in this set captured (Decision 6); cleared at roll + set end. */
    capturedInSet: boolean;
    /** A3.1: the die consumed by the pending REQUEST_MOVE (entry moves cannot
     *  be re-inferred at RESOLVE_MOVE); null outside ANIMATING_MOVE. */
    activeDie: number | null;
  };
  /** Current phase — gates every action. */
  phase: GamePhase;
  /** Legal moves for the current player after a roll (plan §6.1.1). */
  validMoves: Move[];
  /** Consecutive sixes rolled by current player (for forfeit rule). */
  consecutiveSixes: number;
  /** Players who have finished all 4 tokens, in finish order. */
  winners: Color[];
  /** Locked house rules for this game. */
  rules: RulesConfig;
  /** Audit log. */
  turnHistory: TurnRecord[];
}

/**
 * Intents dispatched by the Director/Stage. The store phase-gates these before
 * the reducer runs them. The client never mutates state directly.
 */
export type Action =
  | { type: 'REQUEST_ROLL' }
  | { type: 'RESOLVE_ROLL'; value: number } // Director, after dice animation
  | {
      type: 'REQUEST_MOVE';
      tokenId: string;
      /** A3.1: which remaining die plays this token. Omitted at diceCount 1
       *  (the single die); at k>1 REQUIRED when two dice could move the token
       *  (the engine rejects rather than guess). Same-value dice (e.g. {6,6})
       *  are interchangeable, so omission stays valid when unambiguous. */
      dieValue?: number;
    }
  | { type: 'RESOLVE_MOVE' }; // Director, after hop animation

/**
 * The choreography contract for the 3D layer (plan §6.1.1).
 *
 * `path` gives the Director the exact sequence of cells to hop tile-by-tile,
 * time safe-zone particles at precise moments, and place the camera. Returning
 * bare token IDs (the original plan) would force the Director to recompute the
 * path — this way the Oracle is the single source of "where the token goes."
 */
export interface Move {
  /** Tokens moved by this move. Single-element in v1; multi-element in v2 stacking. */
  tokenIds: string[];
  /** Ordered cells traversed (incl. destination, excl. source). */
  path: Position[];
  /** The token's resulting progress after this move. */
  finalProgress: number;
  /** Lands on an opponent on a non-safe cell. */
  isCapture: boolean;
  /** Crosses from the shared loop into the home column. */
  isEnteringHome: boolean;
  /** Leaves the yard (BASE → progress 0). */
  isEnteringBoard: boolean;
  /** finalProgress === FINISH. */
  isFinishing: boolean;
}
