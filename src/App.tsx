/**
 * App root — composes the Canvas (Director) and a minimal Stage overlay.
 *
 * The DebugHarness mounts at /?debug (Phase 1). Otherwise we render the 3D scene
 * with a minimal control bar so the game is playable. The full HUD arrives in
 * Phase 4; this bar exists so Phase 2's gate (click token → teleport) is testable.
 */
import { useState } from 'react';
import { CanvasWrapper } from './director/CanvasWrapper';
import { DebugHarness } from './stage/DebugHarness/DebugHarness';
import { CaptureDrama } from './stage/CaptureDrama';
import { VictoryOverlay } from './stage/VictoryOverlay';
import { SkinPicker } from './stage/SkinPicker';
import { AudioBus } from './audio/AudioBus';
import { BotDriver, setBotDifficulty } from './store/botDriver';
import { useGame } from './store/useGame';
import { soloRules } from './oracle/config/rulesPreset';
import { useAudio } from './store/audioStore';

function isDebug(): boolean {
  return (
    import.meta.env.DEV &&
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('debug')
  );
}

/** Minimal 3D control bar — roll/resolve buttons + phase indicator. Replaced by HUD in Phase 4. */
const DIFFICULTIES = ['easy', 'medium', 'hard', 'pro'] as const;
const DIFF_LABELS: Record<string, string> = {
  easy: '🟢 Easy', medium: '🟡 Med', hard: '🟠 Hard', pro: '🔴 Pro',
};

function ControlBar() {
  const phase = useGame((s) => s.state.phase);
  const currentPlayer = useGame((s) => s.state.currentPlayer);
  const diceValue = useGame((s) => s.state.dice.value);
  const rolledSet = useGame((s) => s.state.dice.rolledSet);
  const queueLength = useGame((s) => s.state.dice.queue.length);
  const diceCount = useGame((s) => s.state.rules.diceCount);
  const dispatch = useGame((s) => s.dispatch);
  const reset = useGame((s) => s.reset);
  const rules = useGame((s) => s.state.rules);
  const muted = useAudio((s) => s.muted);
  const toggleMute = useAudio((s) => s.toggleMute);

  // Difficulty is module-level in botDriver — track it in local state for display
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard' | 'pro'>('medium');

  function cycleDifficulty() {
    const idx = DIFFICULTIES.indexOf(difficulty);
    const next = DIFFICULTIES[(idx + 1) % DIFFICULTIES.length];
    setDifficulty(next);
    setBotDifficulty(next);
  }

  function startSolo() {
    setBotDifficulty(difficulty);
    reset({ ...soloRules(), diceCount });
  }

  // PHASE-5D 5D-5: dice-per-turn selector. Rules are immutable per game
  // (R&S §1.1) — switching restarts the game with everything else preserved.
  function cycleDice() {
    const next = ((diceCount % 4) + 1) as 1 | 2 | 3 | 4; // 1→2→3→4→1
    reset({ ...rules, diceCount: next });
  }

  // Remaining-dice pips: the set in descending play order; consumed dice dim.
  const pips = [...rolledSet].sort((a, b) => b - a);
  const playedCount = rolledSet.length > 0 ? rolledSet.length - queueLength : 0;

  const isBotTurn = rules.bots.includes(currentPlayer);
  const canRoll = phase === 'IDLE' && !isBotTurn;

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
      {rolledSet.length > 0 ? (
        <span title="Remaining dice this set (dimmed = played/burned)" style={{ fontWeight: 700 }}>
          🎲{' '}
          {pips.map((v, i) => (
            <span key={i} style={{ opacity: i < playedCount ? 0.3 : 1 }}>
              {i > 0 ? ' ' : ''}{v}
            </span>
          ))}
        </span>
      ) : (
        diceValue !== null && <span style={{ fontWeight: 700 }}>🎲 {diceValue}</span>
      )}
      <button
        disabled={!canRoll}
        onClick={() => dispatch({ type: 'REQUEST_ROLL' })}
        style={btn(canRoll)}
      >
        {isBotTurn ? '🤖 Bot...' : 'Roll'}
      </button>
      <button
        onClick={toggleMute}
        style={{ ...btn(true), background: '#555', width: 36 }}
        title={muted ? 'Unmute' : 'Mute'}
      >
        {muted ? '🔇' : '🔊'}
      </button>
      <SkinPicker />
      {/* Difficulty selector — click to cycle, shows current level */}
      <button
        onClick={cycleDifficulty}
        style={{ ...btn(true), background: '#555', minWidth: 80 }}
        title="Click to cycle difficulty (changes for next bot turn — live during game)"
      >
        {DIFF_LABELS[difficulty]}
      </button>
      <button
        onClick={startSolo}
        style={{ ...btn(true), background: '#4a6' }}
        title={`Start solo vs 3 ${difficulty} bots`}
      >
        🤖 Solo
      </button>
      {/* Dice-per-turn selector (PHASE-5D) — restarts the game at the new count */}
      <button
        onClick={cycleDice}
        style={{ ...btn(true), background: '#555', minWidth: 64 }}
        title="Dice per turn — click to cycle 1→2→3→4 (restarts the game; rules are immutable per game)"
      >
        🎲 ×{diceCount}
      </button>
      {/* RESOLVE_ROLL and RESOLVE_MOVE are now fired ONLY by GSAP onComplete.
          No manual resolve buttons — the dice tumbles and auto-resolves,
          tokens hop and auto-resolve. The UI is inert during animation. */}
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
      <AudioBus /> {/* Non-rendering subscriber; renders null */}
      <BotDriver /> {/* Auto-plays for bot seats */}
      <CaptureDrama /> {/* DOM overlays: screen flash + "Capture!" popup */}
      <VictoryOverlay /> {/* DOM overlay: trophy + "Play Again" on PLAYER_WON */}
      <CanvasWrapper />
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <ControlBar />
      </div>
    </div>
  );
}
