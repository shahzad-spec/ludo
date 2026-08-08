/**
 * The event bus — typed broadcast channel for side-effects (v3 §8).
 *
 * The phase machine (GamePhase) handles *sequencing* ("when can X happen?");
 * events handle *broadcast* ("what just happened?"). They are complementary.
 *
 * When TOKEN_CAPTURED fires, four independent systems react — particles,
 * audio, camera slow-mo, the "Capture!" popup — none of which know about each
 * other. That's the payoff over 4 separate useEffects each diffing state.
 *
 * This module is dependency-free (no React/three) so the Oracle can import the
 * event types without violating the layer boundary.
 */

import type { Color, Position } from '../oracle/board/track';

/** Every event the Oracle can emit. Strictly typed. */
export type GameEvent =
  | { type: 'DICE_ROLLED'; player: Color; value: number }
  | { type: 'NO_LEGAL_MOVE'; player: Color; value: number }
  | {
      type: 'TOKEN_MOVED';
      tokenIds: string[]; // v1: single-element; v2 stacking: multi-element
      path: Position[]; // exact cells the Director hops through
      finalProgress: number;
    }
  | {
      type: 'TOKEN_CAPTURED';
      attackerId: string; // both IDs — Director needs both for the beating anim
      victimId: string;
      cell: number; // shared-loop cell where the capture occurred
    }
  | { type: 'TURN_CHANGED'; nextPlayer: Color }
  | { type: 'PLAYER_WON'; player: Color };

/** Listener type keyed by event type. */
type Listener<E extends GameEvent> = (event: E) => void;

/**
 * Minimal typed emitter. The Zustand store will own an instance and fan out
 * events emitted by the reducer. Subscribers (audio, particles, camera, UI)
 * register once and react independently.
 *
 * Intentionally tiny — no async, no buffering. If we later need replay/debug
 * logging, add an emit-interceptor, not a second bus.
 */
export class Emitter {
  private readonly listeners: {
    [K in GameEvent['type']]?: Set<Listener<Extract<GameEvent, { type: K }>>>;
  } = {};

  on<K extends GameEvent['type']>(
    type: K,
    fn: Listener<Extract<GameEvent, { type: K }>>,
  ): () => void {
    const set = (this.listeners[type] ??= new Set());
    set.add(fn);
    return () => set.delete(fn); // unsubscribe handle
  }

  emit(event: GameEvent): void {
    const set = this.listeners[event.type];
    if (!set) return;
    // Clone before iterating: a listener might (un)subscribe during dispatch.
    for (const fn of [...set]) fn(event as never);
  }

  /** Remove all listeners. Used by the DebugHarness on full reset. */
  clear(): void {
    for (const k of Object.keys(this.listeners) as GameEvent['type'][]) {
      this.listeners[k]?.clear();
    }
  }
}

/** Shared singleton. Imported by the store and by every Director/Stage subscriber. */
export const bus = new Emitter();
