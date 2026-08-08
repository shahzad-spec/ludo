/**
 * engine integration tests (plan §6.7 sub-gate A).
 *
 * The reducer is the orchestrator — these verify the phase machine, the full
 * action cycle, NO_LEGAL_MOVE handling, and the win transition. Uses the
 * pinned RNG so dice outcomes are deterministic.
 */
import { describe, it, expect } from 'vitest';
import { applyAction, createInitialState } from '../engine';
import { pinnedRng } from '../rules/dice';
import { stateWithPlacements } from './helpers';
import { BASE } from '../board/track';

describe('engine — phase gating rejects out-of-phase actions', () => {
  it('REQUEST_MOVE during IDLE is rejected (no state change)', () => {
    const state = createInitialState();
    const { state: next, events } = applyAction(state, {
      type: 'REQUEST_MOVE',
      tokenId: 'red-0',
    });
    expect(next).toBe(state); // same reference — rejected
    expect(events).toEqual([]);
  });

  it('REQUEST_ROLL during SELECTING_TOKEN is rejected', () => {
    const state = stateWithPlacements(
      { 'red-0': { color: 'red', progress: 5, slot: 0 } },
      { currentPlayer: 'red', phase: 'SELECTING_TOKEN' },
    );
    const { state: next, events } = applyAction(state, { type: 'REQUEST_ROLL' });
    expect(next).toBe(state);
    expect(events).toEqual([]);
  });

  it('any action during GAME_OVER is rejected', () => {
    const state = createInitialState();
    const over = { ...state, phase: 'GAME_OVER' as const, winners: ['red'] };
    const { state: next, events } = applyAction(over, { type: 'REQUEST_ROLL' });
    expect(next).toBe(over);
    expect(events).toEqual([]);
  });
});

describe('engine — full action cycle', () => {
  it('REQUEST_ROLL → RESOLVE_ROLL → REQUEST_MOVE → RESOLVE_MOVE advances a token', () => {
    const state = stateWithPlacements(
      { 'red-0': { color: 'red', progress: 10, slot: 0 } },
      { currentPlayer: 'red' },
    );

    // 1. Roll a 3 (pinned).
    const rng = pinnedRng([3]);
    const r1 = applyAction(state, { type: 'REQUEST_ROLL' }, rng);
    expect(r1.state.phase).toBe('ROLLING');
    expect(r1.events[0]).toMatchObject({ type: 'DICE_ROLLED', value: 3 });

    // 2. Resolve → token has a legal move.
    const r2 = applyAction(r1.state, { type: 'RESOLVE_ROLL', value: 3 });
    expect(r2.state.phase).toBe('SELECTING_TOKEN');
    expect(r2.state.validMoves.some((m) => m.tokenIds[0] === 'red-0')).toBe(true);

    // 3. Player picks red-0 → REQUEST_MOVE emits TOKEN_MOVED (with path) so the
    //    Director can animate. Phase locks to ANIMATING_MOVE.
    const r3 = applyAction(r2.state, { type: 'REQUEST_MOVE', tokenId: 'red-0' });
    expect(r3.state.phase).toBe('ANIMATING_MOVE');
    const movedEvent = r3.events.find((e) => e.type === 'TOKEN_MOVED');
    expect(movedEvent).toBeDefined();

    // 4. Resolve the move → token commits to progress 13, turn passes.
    const r4 = applyAction(r3.state, { type: 'RESOLVE_MOVE' });
    expect(r4.state.tokens['red-0'].progress).toBe(13);
    expect(r4.state.phase).toBe('IDLE');
    expect(r4.state.currentPlayer).toBe('green'); // rolled 3, no six → turn passes
    const turnEvent = r4.events.find((e) => e.type === 'TURN_CHANGED');
    expect(turnEvent).toMatchObject({ type: 'TURN_CHANGED', nextPlayer: 'green' });
  });

  it('rolling a 6 keeps the turn (sixGrantsExtraTurn)', () => {
    const state = stateWithPlacements(
      { 'red-0': { color: 'red', progress: 10, slot: 0 } },
      { currentPlayer: 'red' },
    );
    const rng = pinnedRng([6]);
    const r1 = applyAction(state, { type: 'REQUEST_ROLL' }, rng);
    const r2 = applyAction(r1.state, { type: 'RESOLVE_ROLL', value: 6 });
    const r3 = applyAction(r2.state, { type: 'REQUEST_MOVE', tokenId: 'red-0' });
    const r4 = applyAction(r3.state, { type: 'RESOLVE_MOVE' });
    expect(r4.state.currentPlayer).toBe('red'); // same player
    expect(r4.state.consecutiveSixes).toBe(1);
  });

  it('REQUEST_MOVE with an illegal tokenId is rejected', () => {
    const state = stateWithPlacements(
      { 'red-0': { color: 'red', progress: 10, slot: 0 } },
      { currentPlayer: 'red' },
    );
    const rng = pinnedRng([3]);
    const r1 = applyAction(state, { type: 'REQUEST_ROLL' }, rng);
    const r2 = applyAction(r1.state, { type: 'RESOLVE_ROLL', value: 3 });
    // red-1 is in the yard and roll isn't 6 → not a legal move
    const r3 = applyAction(r2.state, { type: 'REQUEST_MOVE', tokenId: 'red-1' });
    expect(r3.state).toBe(r2.state); // rejected
    expect(r3.state.phase).toBe('SELECTING_TOKEN'); // unchanged
  });
});

describe('engine — NO_LEGAL_MOVE', () => {
  it('emits NO_LEGAL_MOVE and passes turn when roll yields no moves', () => {
    // All red tokens in yard, roll a 3 (not 6) → no entry possible.
    const state = stateWithPlacements(
      {
        'red-0': { color: 'red', progress: BASE, slot: 0 },
        'red-1': { color: 'red', progress: BASE, slot: 1 },
        'red-2': { color: 'red', progress: BASE, slot: 2 },
        'red-3': { color: 'red', progress: BASE, slot: 3 },
      },
      { currentPlayer: 'red' },
    );
    const rng = pinnedRng([3]);
    const r1 = applyAction(state, { type: 'REQUEST_ROLL' }, rng);
    const r2 = applyAction(r1.state, { type: 'RESOLVE_ROLL', value: 3 });
    expect(r2.state.phase).toBe('IDLE');
    expect(r2.state.currentPlayer).toBe('green');
    expect(r2.events).toContainEqual({
      type: 'NO_LEGAL_MOVE',
      player: 'red',
      value: 3,
    });
    expect(r2.events).toContainEqual({
      type: 'TURN_CHANGED',
      nextPlayer: 'green',
    });
  });
});

describe('engine — win transition', () => {
  it('completing the last token triggers PLAYER_WON and GAME_OVER', () => {
    const state = stateWithPlacements(
      {
        'red-0': { color: 'red', progress: 56, slot: 0 },
        'red-1': { color: 'red', progress: 56, slot: 1 },
        'red-2': { color: 'red', progress: 56, slot: 2 },
        'red-3': { color: 'red', progress: 50, slot: 3 }, // one away from finish
      },
      { currentPlayer: 'red' },
    );
    const rng = pinnedRng([6]);
    const r1 = applyAction(state, { type: 'REQUEST_ROLL' }, rng);
    const r2 = applyAction(r1.state, { type: 'RESOLVE_ROLL', value: 6 });
    const r3 = applyAction(r2.state, { type: 'REQUEST_MOVE', tokenId: 'red-3' });
    const r4 = applyAction(r3.state, { type: 'RESOLVE_MOVE' });
    expect(r4.state.tokens['red-3'].progress).toBe(56);
    expect(r4.state.phase).toBe('GAME_OVER');
    expect(r4.state.winners).toContain('red');
    expect(r4.events).toContainEqual({ type: 'PLAYER_WON', player: 'red' });
  });
});

describe('engine — capture integration', () => {
  it('RESOLVE_MOVE captures an opponent on the destination cell', () => {
    const state = stateWithPlacements(
      {
        'red-0': { color: 'red', progress: 5, slot: 0 },
        'green-0': { color: 'green', progress: 48, slot: 0 }, // cell 9
      },
      { currentPlayer: 'red' },
    );
    const rng = pinnedRng([4]);
    const r1 = applyAction(state, { type: 'REQUEST_ROLL' }, rng);
    const r2 = applyAction(r1.state, { type: 'RESOLVE_ROLL', value: 4 });
    const r3 = applyAction(r2.state, { type: 'REQUEST_MOVE', tokenId: 'red-0' });
    const r4 = applyAction(r3.state, { type: 'RESOLVE_MOVE' });
    expect(r4.state.tokens['green-0'].progress).toBe(BASE); // reset to yard
    expect(r4.events).toContainEqual({
      type: 'TOKEN_CAPTURED',
      attackerId: 'red-0',
      victimId: 'green-0',
      cell: 9,
    });
  });
});
