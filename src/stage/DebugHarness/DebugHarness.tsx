/**
 * DebugHarness — 2D playtest surface for the Oracle (plan §6.6, sub-gate B).
 *
 * Purpose: prove the state machine is correct BEFORE any 3D exists. Mounted
 * only at /?debug (gated in App.tsx). This is Stage layer: reads from the
 * store, dispatches intents, never calls the Oracle directly.
 *
 * Rules (reviewed & locked):
 *  - NO animation. State updates teleport instantly. GSAP hop animation is a
 *    Phase 2 Director concern driven by the TOKEN_MOVED.path payload.
 *  - Bus logging is opt-in via ?bus=1 so the console stays readable.
 *  - Expected event sequence: DICE_ROLLED → TOKEN_MOVED → (TOKEN_CAPTURED)
 *    → TURN_CHANGED. (Note: TOKEN_MOVED, not TOKEN_HOP — see plan §6.8.)
 */

import { useEffect, useMemo, useRef } from 'react';
import { useGame } from '../../store/useGame';
import { bus } from '../../bus/events';
import type { GameEvent } from '../../bus/events';
import {
  BASE,
  ENTRY_OFFSET,
  progressToPosition,
} from '../../oracle/board/track';
import type { Color } from '../../oracle/board/track';
import type { Token } from '../../oracle/types';
import {
  LOOP_CELLS,
  homeCells,
  yardCells,
  tokenDisplayKey,
} from './layout';

const COLORS: Color[] = ['red', 'green', 'yellow', 'blue'];

/** Inline styles only — this is a throwaway debug tool, no Tailwind needed. */
const styles = {
  board: {
    display: 'grid',
    gridTemplateColumns: 'repeat(13, 40px)',
    gap: '2px',
    fontFamily: 'monospace',
    fontSize: '11px',
  } as const,
  cell: (tint?: Color, safe?: boolean) => ({
    width: 40,
    height: 32,
    background: tint ? colorHex(tint, 0.3) : '#222',
    border: safe ? '2px solid gold' : '1px solid #555',
    borderRadius: 4,
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#eee',
    position: 'relative' as const,
    padding: 1,
  }),
  token: (color: Color, movable: boolean) => ({
    width: 14,
    height: 14,
    borderRadius: '50%',
    background: colorHex(color, 1),
    border: movable ? '2px solid white' : '1px solid black',
    cursor: movable ? 'pointer' : 'default',
    margin: 1,
  }),
  panel: {
    background: '#111',
    color: '#eee',
    padding: 16,
    fontFamily: 'monospace',
  } as const,
  button: {
    padding: '8px 16px',
    fontSize: 14,
    cursor: 'pointer',
    background: '#444',
    color: 'white',
    border: '1px solid #777',
    borderRadius: 4,
  } as const,
};

function colorHex(color: Color, alpha: number): string {
  const map: Record<Color, [number, number, number]> = {
    red: [220, 60, 60],
    green: [60, 180, 80],
    yellow: [230, 200, 50],
    blue: [60, 120, 220],
  };
  const [r, g, b] = map[color];
  return `rgba(${r},${g},${b},${alpha})`;
}

export function DebugHarness() {
  const state = useGame((s) => s.state);
  const dispatch = useGame((s) => s.dispatch);
  const reset = useGame((s) => s.reset);

  // Opt-in bus logging via ?bus=1
  useBusLogger();

  const tokensByCell = useMemo(() => {
    // Map displayKey → tokens occupying it.
    const map = new Map<string, Token[]>();
    for (const token of Object.values(state.tokens)) {
      const pos = progressToPosition(token.color, token.progress);
      const key = tokenDisplayKey(token.color, pos, token.slot);
      if (key) {
        const arr = map.get(key) ?? [];
        arr.push(token);
        map.set(key, arr);
      }
    }
    return map;
  }, [state.tokens]);

  const movableIds = new Set(state.validMoves.flatMap((m) => m.tokenIds));
  const canRoll = state.phase === 'IDLE';
  const canMove = state.phase === 'SELECTING_TOKEN';

  function handleTokenClick(tokenId: string) {
    if (canMove && movableIds.has(tokenId)) {
      dispatch({ type: 'REQUEST_MOVE', tokenId });
    }
  }

  return (
    <div style={styles.panel}>
      <h1 style={{ marginTop: 0 }}>ludo-3d · DebugHarness</h1>

      <div style={{ marginBottom: 12 }}>
        <strong>Phase:</strong> {state.phase} &nbsp;|&nbsp;
        <strong>Turn:</strong>{' '}
        <span style={{ color: colorHex(state.currentPlayer, 1) }}>
          {state.currentPlayer}
        </span>{' '}
        &nbsp;|&nbsp;
        <strong>Dice:</strong> {state.dice.value ?? '—'} &nbsp;|&nbsp;
        <strong>Consecutive 6s:</strong> {state.consecutiveSixes} &nbsp;|&nbsp;
        <strong>Winners:</strong> {state.winners.join(', ') || 'none'}
      </div>

      <div style={{ marginBottom: 12 }}>
        <button
          style={{ ...styles.button, opacity: canRoll ? 1 : 0.4 }}
          disabled={!canRoll}
          onClick={() => dispatch({ type: 'REQUEST_ROLL' })}
        >
          Roll Dice (REQUEST_ROLL)
        </button>{' '}
        {state.phase === 'ROLLING' && (
          <button style={styles.button} onClick={() => dispatch({ type: 'RESOLVE_ROLL', value: state.dice.value ?? 1 })}>
            Resolve Roll (after dice anim)
          </button>
        )}{' '}
        {state.phase === 'ANIMATING_MOVE' && (
          <button style={styles.button} onClick={() => dispatch({ type: 'RESOLVE_MOVE' })}>
            Resolve Move (after hop anim)
          </button>
        )}{' '}
        <button style={styles.button} onClick={() => reset()}>
          Reset
        </button>
        <span style={{ marginLeft: 12, color: '#888' }}>
          (In 2D, you manually click Resolve to simulate the Director's GSAP onComplete.)
        </span>
      </div>

      {/* Yards */}
      <div style={{ display: 'flex', gap: 24, marginBottom: 16 }}>
        {COLORS.map((color) => (
          <div key={color}>
            <div style={{ color: colorHex(color, 1), fontWeight: 'bold' }}>
              {color} yard
            </div>
            <div style={{ display: 'flex', gap: 2 }}>
              {yardCells(color).map((cell) => (
                <CellBox
                  key={cell.key}
                  cell={cell}
                  tokens={tokensByCell.get(cell.key) ?? []}
                  movableIds={movableIds}
                  onTokenClick={handleTokenClick}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Shared loop */}
      <div style={styles.board}>
        {LOOP_CELLS.map((cell) => (
          <CellBox
            key={cell.key}
            cell={cell}
            tokens={tokensByCell.get(cell.key) ?? []}
            movableIds={movableIds}
            onTokenClick={handleTokenClick}
          />
        ))}
      </div>

      {/* Home columns */}
      <div style={{ display: 'flex', gap: 24, marginTop: 16 }}>
        {COLORS.map((color) => (
          <div key={color}>
            <div style={{ color: colorHex(color, 1), fontWeight: 'bold' }}>
              {color} home → finish
            </div>
            <div style={{ display: 'flex', gap: 2 }}>
              {homeCells(color).map((cell) => (
                <CellBox
                  key={cell.key}
                  cell={cell}
                  tokens={tokensByCell.get(cell.key) ?? []}
                  movableIds={movableIds}
                  onTokenClick={handleTokenClick}
                />
              ))}
              {/* Finish area */}
              <FinishBox color={color} tokens={tokensByCell} state={state} />
            </div>
          </div>
        ))}
      </div>

      {state.phase === 'GAME_OVER' && (
        <div style={{ fontSize: 24, marginTop: 16 }}>
          🏆 Winner: {state.winners.join(', ')}
        </div>
      )}

      <div style={{ marginTop: 16, color: '#888', fontSize: 12 }}>
        Add <code>?bus=1</code> to the URL to see event-bus logging.
        Legal tokens are outlined in white when it's their turn.
      </div>
    </div>
  );
}

// ---------- Sub-components ----------

function CellBox({
  cell,
  tokens,
  movableIds,
  onTokenClick,
}: {
  cell: { key: string; label: string; tint?: Color; safe?: boolean };
  tokens: Token[];
  movableIds: Set<string>;
  onTokenClick: (id: string) => void;
}) {
  return (
    <div style={styles.cell(cell.tint, cell.safe)} title={cell.label}>
      <span style={{ position: 'absolute', top: 0, left: 2, fontSize: 8, color: '#aaa' }}>
        {cell.label}
      </span>
      {tokens.map((t) => (
        <div
          key={t.id}
          style={styles.token(t.color, movableIds.has(t.id))}
          onClick={() => onTokenClick(t.id)}
          title={t.id}
        />
      ))}
    </div>
  );
}

function FinishBox({
  color,
  state,
}: {
  color: Color;
  tokens: Map<string, Token[]>;
  state: ReturnType<typeof useGame.getState>['state'];
}) {
  const finished = Object.values(state.tokens).filter(
    (t) => t.color === color && t.progress === 56,
  );
  return (
    <div
      style={{
        width: 40,
        height: 32,
        background: colorHex(color, 0.6),
        border: '2px solid gold',
        borderRadius: 4,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      title="finish"
    >
      {finished.map((t) => (
        <div key={t.id} style={styles.token(t.color, false)} />
      ))}
    </div>
  );
}

/** Subscribe to the bus and log every event with a [BUS] prefix, if ?bus=1. */
function useBusLogger() {
  const enabled = useRef(
    typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).has('bus'),
  );

  useEffect(() => {
    if (!enabled.current) return;

    const log = (e: GameEvent) => console.log('[BUS]', e.type, e);
    const types: GameEvent['type'][] = [
      'DICE_ROLLED',
      'TOKEN_MOVED',
      'TOKEN_CAPTURED',
      'TURN_CHANGED',
      'PLAYER_WON',
      'NO_LEGAL_MOVE',
    ];
    const unsubs = types.map((t) => bus.on(t, log as never));
    return () => unsubs.forEach((u) => u());
  }, []);
}

// Re-export BASE so callers don't need a separate import path.
export { BASE, ENTRY_OFFSET };
