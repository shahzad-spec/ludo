/**
 * App root — composes the Canvas (Director) and a minimal Stage overlay.
 *
 * The DebugHarness mounts at /?debug (Phase 1). Otherwise we render the 3D scene
 * with a minimal control bar so the game is playable. The full HUD arrives in
 * Phase 4; this bar exists so Phase 2's gate (click token → teleport) is testable.
 */
import { CanvasWrapper } from './director/CanvasWrapper';
import { DebugHarness } from './stage/DebugHarness/DebugHarness';
import { useGame } from './store/useGame';

function isDebug(): boolean {
  return (
    import.meta.env.DEV &&
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('debug')
  );
}

/** Minimal 3D control bar — roll/resolve buttons + phase indicator. Replaced by HUD in Phase 4. */
function ControlBar() {
  const phase = useGame((s) => s.state.phase);
  const currentPlayer = useGame((s) => s.state.currentPlayer);
  const diceValue = useGame((s) => s.state.dice.value);
  const dispatch = useGame((s) => s.dispatch);

  const canRoll = phase === 'IDLE';
  const showResolveRoll = phase === 'ROLLING';
  const showResolveMove = phase === 'ANIMATING_MOVE';

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        background: 'rgba(20,20,20,0.85)',
        color: 'white',
        padding: '10px 16px',
        borderRadius: 12,
        fontFamily: 'system-ui',
        pointerEvents: 'auto',
      }}
    >
      <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{currentPlayer}</span>
      <span style={{ opacity: 0.6 }}>{phase}</span>
      {diceValue !== null && <span style={{ fontWeight: 700 }}>🎲 {diceValue}</span>}
      <button
        disabled={!canRoll}
        onClick={() => dispatch({ type: 'REQUEST_ROLL' })}
        style={btn(canRoll)}
      >
        Roll
      </button>
      {showResolveRoll && (
        <button onClick={() => dispatch({ type: 'RESOLVE_ROLL', value: diceValue ?? 1 })} style={btn(true)}>
          ✓ Roll
        </button>
      )}
      {showResolveMove && (
        <button onClick={() => dispatch({ type: 'RESOLVE_MOVE' })} style={btn(true)}>
          ✓ Move
        </button>
      )}
    </div>
  );
}

function btn(enabled: boolean): React.CSSProperties {
  return {
    padding: '6px 14px',
    border: 'none',
    borderRadius: 8,
    background: enabled ? '#4a9' : '#555',
    color: 'white',
    cursor: enabled ? 'pointer' : 'default',
    opacity: enabled ? 1 : 0.5,
    fontWeight: 600,
  };
}

export default function App() {
  if (isDebug()) return <DebugHarness />;

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#1a1a1a' }}>
      <CanvasWrapper />
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <ControlBar />
      </div>
    </div>
  );
}
